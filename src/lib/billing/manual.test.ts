import { describe, expect, it } from "vitest";
import type { SubscriptionStatus } from "@/db/schema/billing";
import { addInterval, manualPeriod, unpaidPeriod } from "@/lib/billing/manual";
import {
  type Decision,
  isProviderManaged,
  type SubscriptionSnapshot,
  transition,
} from "@/lib/billing/state-machine";
import { DAY_MS } from "@/lib/billing/trial";

const NOW = new Date("2026-11-10T12:00:00Z");
const PERIOD_END = new Date("2026-11-05T12:00:00Z");

function manual(
  status: SubscriptionStatus,
  overrides: Partial<SubscriptionSnapshot> = {},
): SubscriptionSnapshot {
  return {
    status,
    cancelAtPeriodEnd: false,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    graceUntil: null,
    pendingPlanId: null,
    providerSubscriptionRef: null,
    lastProviderEventAt: null,
    ...overrides,
  };
}

function applied(decision: Decision) {
  if (decision.outcome !== "applied") {
    throw new Error(`esperava aplicar, veio ignored: ${decision.reason}`);
  }
  return decision;
}

const reasonOf = (decision: Decision) =>
  decision.outcome === "ignored" ? decision.reason : null;

describe("addInterval", () => {
  it("soma um mês de calendário, sem pular para o mês seguinte", () => {
    expect(addInterval(new Date("2026-01-31T10:00:00Z"), "month").toISOString()).toBe(
      "2026-02-28T10:00:00.000Z",
    );
    expect(addInterval(new Date("2028-01-31T10:00:00Z"), "month").toISOString()).toBe(
      "2028-02-29T10:00:00.000Z",
    );
    expect(addInterval(new Date("2026-12-15T00:00:00Z"), "month").toISOString()).toBe(
      "2027-01-15T00:00:00.000Z",
    );
  });

  it("soma um ano, ajustando 29 de fevereiro", () => {
    expect(addInterval(new Date("2028-02-29T00:00:00Z"), "year").toISOString()).toBe(
      "2029-02-28T00:00:00.000Z",
    );
  });
});

describe("manualPeriod", () => {
  it("em dia ou em atraso, o período novo começa no vencimento", () => {
    for (const status of ["active", "past_due"] as const) {
      const period = manualPeriod({ status, currentPeriodEnd: PERIOD_END }, "month", NOW);

      expect(period.periodStart).toEqual(PERIOD_END);
      expect(period.periodEnd).toEqual(new Date("2026-12-05T12:00:00Z"));
    }
  });

  it("trial, vencida ou sem período começam agora", () => {
    for (const status of ["trialing", "unpaid", "expired", "canceled"] as const) {
      const period = manualPeriod({ status, currentPeriodEnd: PERIOD_END }, "year", NOW);

      expect(period.periodStart).toEqual(NOW);
    }
    expect(
      manualPeriod({ status: "active", currentPeriodEnd: null }, "month", NOW).periodStart,
    ).toEqual(NOW);
  });
});

describe("manualPeriod: casos de borda", () => {
  it("a fatura em aberto define o início em dia ou em atraso", () => {
    const due = new Date("2026-11-08T00:00:00Z");
    const period = manualPeriod({ status: "past_due", currentPeriodEnd: PERIOD_END }, "month", NOW, due);

    expect(period.periodStart).toEqual(due);
  });

  it("nunca termina no passado: período devido inteiro já vencido começa agora", () => {
    const longAgo = new Date("2026-08-01T00:00:00Z");
    const period = manualPeriod({ status: "past_due", currentPeriodEnd: longAgo }, "month", NOW);

    expect(period.periodStart).toEqual(NOW);
  });

  it("em somente leitura ignora a fatura antiga", () => {
    const period = manualPeriod(
      { status: "unpaid", currentPeriodEnd: PERIOD_END },
      "month",
      NOW,
      new Date("2026-08-01T00:00:00Z"),
    );

    expect(period.periodStart).toEqual(NOW);
  });
});

describe("unpaidPeriod", () => {
  it("com o período correndo, a falta é do período corrente", () => {
    const start = new Date("2026-10-20T00:00:00Z");
    const end = new Date("2026-11-20T00:00:00Z");

    expect(unpaidPeriod({ currentPeriodStart: start, currentPeriodEnd: end }, "month", NOW).periodStart).toEqual(start);
  });

  it("vencido, a falta é do período devido, que começa no vencimento", () => {
    expect(
      unpaidPeriod({ currentPeriodStart: null, currentPeriodEnd: PERIOD_END }, "month", NOW).periodStart,
    ).toEqual(PERIOD_END);
  });
});

describe("isProviderManaged", () => {
  it("só a assinatura viva no provedor (inclusive unpaid) é dele", () => {
    expect(isProviderManaged({ status: "active", providerSubscriptionRef: "sub_1" })).toBe(true);
    expect(isProviderManaged({ status: "unpaid", providerSubscriptionRef: "sub_1" })).toBe(true);
    expect(isProviderManaged({ status: "canceled", providerSubscriptionRef: "sub_1" })).toBe(false);
    expect(isProviderManaged({ status: "active", providerSubscriptionRef: null })).toBe(false);
  });
});

describe("manual.paid", () => {
  const period = { periodStart: PERIOD_END, periodEnd: new Date("2026-12-05T12:00:00Z") };

  it.each([
    ["past_due", "manual_payment_recovered"],
    ["active", "manual_renewed"],
    ["trialing", "manual_activated"],
    ["unpaid", "manual_reactivated"],
    ["expired", "manual_reactivated"],
    ["canceled", "manual_reactivated"],
  ] as const)("%s volta a active (%s), com acesso total e período novo", (status, reason) => {
    const decision = applied(
      transition(
        manual(status, { graceUntil: NOW, cancelAtPeriodEnd: status === "canceled" }),
        { type: "manual.paid", ...period },
        NOW,
      ),
    );

    expect(decision.status).toBe("active");
    expect(decision.reason).toBe(reason);
    expect(decision.accessMode).toBe("full");
    expect(decision.clearDunningNotices).toBe(true);
    expect(decision.patch).toMatchObject({
      graceUntil: null,
      currentPeriodStart: period.periodStart,
      currentPeriodEnd: period.periodEnd,
      providerSubscriptionRef: null,
    });
    if (status === "canceled") expect(decision.patch.cancelAtPeriodEnd).toBe(false);
  });

  it("assinatura viva no provedor não é marcada à mão", () => {
    const decision = transition(
      manual("past_due", { providerSubscriptionRef: "sub_1" }),
      { type: "manual.paid", ...period },
      NOW,
    );

    expect(reasonOf(decision)).toBe("provider_managed");
  });

  it("encerrada no provedor pode ser reativada à mão, e larga a referência", () => {
    const decision = applied(
      transition(
        manual("canceled", { providerSubscriptionRef: "sub_velha" }),
        { type: "manual.paid", ...period },
        NOW,
      ),
    );

    expect(decision.patch.providerSubscriptionRef).toBeNull();
  });
});

describe("manual.unpaid", () => {
  it("ativa ou em trial vai a past_due com carência a partir de agora", () => {
    for (const status of ["active", "trialing"] as const) {
      const decision = applied(
        transition(manual(status), { type: "manual.unpaid", graceDays: 7, immediate: false }, NOW),
      );

      expect(decision.status).toBe("past_due");
      expect(decision.reason).toBe("manual_unpaid");
      expect(decision.patch.graceUntil).toEqual(new Date(NOW.getTime() + 7 * DAY_MS));
      expect(decision.accessMode).toBeUndefined();
    }
  });

  it("sem carência, vai direto a unpaid + read_only", () => {
    for (const status of ["active", "past_due"] as const) {
      const decision = applied(
        transition(manual(status), { type: "manual.unpaid", graceDays: 7, immediate: true }, NOW),
      );

      expect(decision.status).toBe("unpaid");
      expect(decision.accessMode).toBe("read_only");
    }
  });

  it("já pendente, sem bloqueio imediato, não muda", () => {
    const decision = transition(
      manual("past_due"),
      { type: "manual.unpaid", graceDays: 7, immediate: false },
      NOW,
    );

    expect(reasonOf(decision)).toBe("already_past_due");
  });

  it("vencida ou cancelada não tem o que marcar", () => {
    for (const status of ["unpaid", "expired", "canceled"] as const) {
      const decision = transition(
        manual(status),
        { type: "manual.unpaid", graceDays: 7, immediate: true },
        NOW,
      );
      expect(reasonOf(decision)).toBe("not_applicable");
    }
  });
});

describe("manual.due", () => {
  const due = { type: "manual.due", graceDays: 7, planIsFree: false } as const;

  it("período vencido vai a past_due, com a carência contada do vencimento", () => {
    const decision = applied(
      transition(manual("active", { currentPeriodEnd: PERIOD_END }), due, NOW),
    );

    expect(decision.status).toBe("past_due");
    expect(decision.reason).toBe("manual_due");
    expect(decision.patch.graceUntil).toEqual(new Date(PERIOD_END.getTime() + 7 * DAY_MS));
  });

  it("não vence antes da hora, nem plano gratuito, nem cancelamento agendado", () => {
    const later = new Date(NOW.getTime() + DAY_MS);

    expect(
      reasonOf(transition(manual("active", { currentPeriodEnd: later }), due, NOW)),
    ).toBe("period_running");
    expect(
      reasonOf(
        transition(manual("active", { currentPeriodEnd: PERIOD_END }), { ...due, planIsFree: true }, NOW),
      ),
    ).toBe("free_plan");
    expect(
      reasonOf(
        transition(
          manual("active", { currentPeriodEnd: PERIOD_END, cancelAtPeriodEnd: true }),
          due,
          NOW,
        ),
      ),
    ).toBe("cancel_scheduled");
    expect(reasonOf(transition(manual("active"), due, NOW))).toBe("no_period");
    expect(
      reasonOf(transition(manual("past_due", { currentPeriodEnd: PERIOD_END }), due, NOW)),
    ).toBe("not_active");
  });

  it("assinatura do provedor fica com o provedor", () => {
    const decision = transition(
      manual("active", { currentPeriodEnd: PERIOD_END, providerSubscriptionRef: "sub_1" }),
      due,
      NOW,
    );

    expect(reasonOf(decision)).toBe("provider_managed");
  });
});
