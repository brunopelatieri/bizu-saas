import { describe, expect, it } from "vitest";
import type { SubscriptionStatus } from "@/db/schema/billing";
import {
  type AdminEditCurrent,
  type AdminEditInput,
  type AdminEditResult,
  adminStatusChange,
  allowedTargets,
  keptTrialNotices,
} from "@/lib/billing/admin-edit-rules";
import { DAY_MS } from "@/lib/billing/trial";

const NOW = new Date("2026-11-10T12:00:00Z");
const PAST = new Date(NOW.getTime() - 5 * DAY_MS);
const FUTURE = new Date(NOW.getTime() + 20 * DAY_MS);
const START = new Date(NOW.getTime() - 25 * DAY_MS);
const GRACE_DAYS = 5;
const ALL: SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
  "canceled",
  "expired",
];

function current(
  status: SubscriptionStatus,
  overrides: Partial<AdminEditCurrent> = {},
): AdminEditCurrent {
  return {
    status,
    trialEndsAt: status === "trialing" ? new Date(NOW.getTime() + 2 * DAY_MS) : null,
    currentPeriodStart: START,
    currentPeriodEnd: new Date(NOW.getTime() + 5 * DAY_MS),
    graceUntil: status === "past_due" ? new Date(NOW.getTime() + DAY_MS) : null,
    providerManaged: false,
    planIsFree: false,
    paidThrough: null,
    ...overrides,
  };
}

const run = (from: AdminEditCurrent, input: AdminEditInput) =>
  adminStatusChange(from, input, { now: NOW, graceDays: GRACE_DAYS });

function planOf(result: AdminEditResult) {
  if (!result.ok) throw new Error(`esperava aplicar, veio ${result.error.code}`);
  return result.plan;
}

const codeOf = (result: AdminEditResult) => (result.ok ? null : result.error.code);

describe("status (assinatura manual), linha a linha", () => {
  it("trialing ← active, past_due, unpaid, expired: exige fim futuro, acesso total, avisos zerados", () => {
    for (const from of ["active", "past_due", "unpaid", "expired"] as const) {
      const plan = planOf(run(current(from), { status: "trialing", trialEndsAt: FUTURE }));

      expect(plan.to).toBe("trialing");
      expect(plan.patch.trialEndsAt).toEqual(FUTURE);
      expect(plan.organizationTrialEndsAt).toEqual(FUTURE);
      expect(plan.accessMode).toBe("full");
      expect(plan.trialNotices).toBe("reset");
      expect(plan.patch.graceUntil).toBeNull();
    }

    expect(codeOf(run(current("active"), { status: "trialing" }))).toBe("INVALID_DATE");
    expect(
      codeOf(run(current("active"), { status: "trialing", trialEndsAt: PAST })),
    ).toBe("INVALID_DATE");
    for (const from of ["paused", "canceled"] as const) {
      expect(codeOf(run(current(from), { status: "trialing", trialEndsAt: FUTURE }))).toBe(
        "STATUS_NOT_ALLOWED",
      );
    }
  });

  it("trialing ← expired volta a ser só manual: sem referência antiga nem cancelamento", () => {
    const plan = planOf(run(current("expired"), { status: "trialing", trialEndsAt: FUTURE }));

    expect(plan.patch).toMatchObject({
      providerSubscriptionRef: null,
      provider: null,
      canceledAt: null,
      cancelAtPeriodEnd: false,
    });
  });

  it("active ← qualquer: acesso total, sem carência, avisos de cobrança limpos", () => {
    for (const from of ["trialing", "past_due", "unpaid", "paused", "canceled", "expired"] as const) {
      const plan = planOf(run(current(from), { status: "active", currentPeriodEnd: FUTURE }));

      expect(plan.to).toBe("active");
      expect(plan.patch.currentPeriodEnd).toEqual(FUTURE);
      expect(plan.patch.graceUntil).toBeNull();
      expect(plan.accessMode).toBe("full");
      expect(plan.clearDunningNotices).toBe(true);
    }
  });

  it("active usa o vencimento que já existe se ainda estiver no futuro", () => {
    const plan = planOf(run(current("unpaid"), { status: "active" }));

    expect(plan.patch.currentPeriodEnd).toBeUndefined();
    expect(plan.accessMode).toBe("full");
  });

  it("active exige vencimento futuro se não houver um", () => {
    expect(
      codeOf(run(current("trialing", { currentPeriodEnd: null }), { status: "active" })),
    ).toBe("INVALID_DATE");
    expect(
      codeOf(run(current("unpaid", { currentPeriodEnd: PAST }), { status: "active" })),
    ).toBe("INVALID_DATE");
    expect(
      codeOf(run(current("unpaid"), { status: "active", currentPeriodEnd: PAST })),
    ).toBe("INVALID_DATE");
  });

  it("active sem início de período começa agora", () => {
    const plan = planOf(
      run(current("trialing", { currentPeriodStart: null, currentPeriodEnd: null }), {
        status: "active",
        currentPeriodEnd: FUTURE,
      }),
    );

    expect(plan.patch.currentPeriodStart).toEqual(NOW);
  });

  it("past_due ← active, trialing: carência de grace_days ou a enviada", () => {
    for (const from of ["active", "trialing"] as const) {
      const plan = planOf(run(current(from), { status: "past_due" }));

      expect(plan.to).toBe("past_due");
      expect(plan.patch.graceUntil).toEqual(new Date(NOW.getTime() + GRACE_DAYS * DAY_MS));
      expect(plan.accessMode).toBeUndefined();
    }

    const sent = planOf(run(current("active"), { status: "past_due", graceUntil: FUTURE }));
    expect(sent.patch.graceUntil).toEqual(FUTURE);

    for (const from of ["unpaid", "paused", "canceled", "expired"] as const) {
      expect(codeOf(run(current(from), { status: "past_due" }))).toBe("STATUS_NOT_ALLOWED");
    }
  });

  it("unpaid ← active, past_due, trialing: somente leitura", () => {
    for (const from of ["active", "past_due", "trialing"] as const) {
      const plan = planOf(run(current(from), { status: "unpaid" }));

      expect(plan.to).toBe("unpaid");
      expect(plan.accessMode).toBe("read_only");
    }
    for (const from of ["paused", "canceled", "expired"] as const) {
      expect(codeOf(run(current(from), { status: "unpaid" }))).toBe("STATUS_NOT_ALLOWED");
    }
  });

  it("paused ← active: guarda até quando estava pago e passa a somente leitura", () => {
    const from = current("active");
    const plan = planOf(run(from, { status: "paused" }));

    expect(plan.accessMode).toBe("read_only");
    expect(plan.paidThrough).toEqual(from.currentPeriodEnd);

    for (const other of ["trialing", "past_due", "unpaid", "canceled", "expired"] as const) {
      expect(codeOf(run(current(other), { status: "paused" }))).toBe("STATUS_NOT_ALLOWED");
    }
  });

  it("expired ← trialing, unpaid, past_due: somente leitura", () => {
    for (const from of ["trialing", "unpaid", "past_due"] as const) {
      const plan = planOf(run(current(from), { status: "expired" }));

      expect(plan.to).toBe("expired");
      expect(plan.accessMode).toBe("read_only");
    }
    for (const from of ["active", "paused", "canceled"] as const) {
      expect(codeOf(run(current(from), { status: "expired" }))).toBe("STATUS_NOT_ALLOWED");
    }
  });

  it("canceled nunca: o caminho é Excluir", () => {
    for (const from of ALL.filter((status) => status !== "canceled")) {
      expect(codeOf(run(current(from), { status: "canceled" }))).toBe("STATUS_NOT_ALLOWED");
    }
  });

  it("plano gratuito não tem cobrança para editar", () => {
    expect(
      codeOf(run(current("active", { planIsFree: true }), { currentPeriodEnd: FUTURE })),
    ).toBe("FREE_PLAN");
  });
});

describe("datas, linha a linha", () => {
  it("trialing: fim do teste, copiado no tenant, e os avisos voltam a ser devidos", () => {
    const plan = planOf(run(current("trialing"), { trialEndsAt: FUTURE }));

    expect(plan.to).toBe("trialing");
    expect(plan.patch.trialEndsAt).toEqual(FUTURE);
    expect(plan.organizationTrialEndsAt).toEqual(FUTURE);
    expect(plan.trialNotices).toBe("reopen");
    expect(plan.accessMode).toBeUndefined();
    expect(codeOf(run(current("trialing"), { trialEndsAt: PAST }))).toBe("INVALID_DATE");
  });

  it("active: vencimento depois do início; no passado vale (vence na próxima rodada)", () => {
    expect(planOf(run(current("active"), { currentPeriodEnd: FUTURE })).patch).toEqual({
      currentPeriodEnd: FUTURE,
    });
    expect(planOf(run(current("active"), { currentPeriodEnd: PAST })).patch).toEqual({
      currentPeriodEnd: PAST,
    });
    expect(
      codeOf(
        run(current("active"), { currentPeriodEnd: new Date(START.getTime() - DAY_MS) }),
      ),
    ).toBe("INVALID_DATE");
  });

  it("past_due: carência futura", () => {
    expect(planOf(run(current("past_due"), { graceUntil: FUTURE })).patch).toEqual({
      graceUntil: FUTURE,
    });
    expect(codeOf(run(current("past_due"), { graceUntil: PAST }))).toBe("INVALID_DATE");
  });

  it("unpaid e paused: só a data, o acesso não muda", () => {
    for (const status of ["unpaid", "paused"] as const) {
      const plan = planOf(run(current(status), { currentPeriodEnd: FUTURE }));

      expect(plan.patch).toEqual({ currentPeriodEnd: FUTURE });
      expect(plan.accessMode).toBeUndefined();
      expect(codeOf(run(current(status), { currentPeriodEnd: PAST }))).toBe("INVALID_DATE");
    }
    expect(planOf(run(current("paused"), { currentPeriodEnd: FUTURE })).paidThrough).toEqual(
      FUTURE,
    );
  });

  it("canceled e expired: encerrada", () => {
    for (const status of ["canceled", "expired"] as const) {
      expect(codeOf(run(current(status), { currentPeriodEnd: FUTURE }))).toBe(
        "SUBSCRIPTION_CLOSED",
      );
    }
  });

  it("data a mais de 5 anos é erro de digitação", () => {
    const far = new Date(NOW.getTime() + 6 * 366 * DAY_MS);

    expect(codeOf(run(current("active"), { currentPeriodEnd: far }))).toBe("INVALID_DATE");
    expect(codeOf(run(current("trialing", { providerManaged: true }), { trialEndsAt: far }))).toBe(
      "INVALID_DATE",
    );
  });

  it("campo fora do status", () => {
    expect(codeOf(run(current("active"), { trialEndsAt: FUTURE }))).toBe(
      "FIELD_NOT_APPLICABLE",
    );
    expect(codeOf(run(current("trialing"), { currentPeriodEnd: FUTURE }))).toBe(
      "FIELD_NOT_APPLICABLE",
    );
    expect(codeOf(run(current("active"), { graceUntil: FUTURE }))).toBe(
      "FIELD_NOT_APPLICABLE",
    );
    // Mudando o status, vale o campo do destino.
    expect(
      codeOf(run(current("active"), { status: "unpaid", graceUntil: FUTURE })),
    ).toBe("FIELD_NOT_APPLICABLE");
  });
});

describe("com provedor", () => {
  const live = (status: SubscriptionStatus, overrides: Partial<AdminEditCurrent> = {}) =>
    current(status, { providerManaged: true, ...overrides });

  it("datas vão ao provedor: fim do trial e próxima cobrança", () => {
    expect(planOf(run(live("trialing"), { trialEndsAt: FUTURE })).provider).toEqual({
      kind: "schedule",
      trialEnd: FUTURE,
    });
    expect(planOf(run(live("active"), { currentPeriodEnd: FUTURE })).provider).toEqual({
      kind: "schedule",
      nextBillingAt: FUTURE,
    });
    expect(codeOf(run(live("active"), { currentPeriodEnd: PAST }))).toBe("INVALID_DATE");
  });

  it("carência é só local", () => {
    const plan = planOf(run(live("past_due"), { graceUntil: FUTURE }));

    expect(plan.provider).toEqual({ kind: "local" });
    expect(plan.patch.graceUntil).toEqual(FUTURE);
  });

  it("pausa e retomada pelos métodos do provedor; retomar depois do pago cobra na hora", () => {
    expect(planOf(run(live("active"), { status: "paused" })).provider).toEqual({
      kind: "pause",
    });
    expect(
      planOf(run(live("paused", { paidThrough: FUTURE }), { status: "active" })).provider,
    ).toEqual({ kind: "resume", chargeNow: false });
    expect(
      planOf(
        run(live("paused", { paidThrough: PAST, currentPeriodEnd: PAST }), { status: "active" }),
      ).provider,
    ).toEqual({ kind: "resume", chargeNow: true });
  });

  it("outro status vem dos pagamentos: 409 PROVIDER_STATUS_MANAGED", () => {
    expect(codeOf(run(live("active"), { status: "unpaid" }))).toBe("PROVIDER_STATUS_MANAGED");
    expect(codeOf(run(live("past_due"), { status: "active" }))).toBe(
      "PROVIDER_STATUS_MANAGED",
    );
    expect(codeOf(run(live("unpaid"), { status: "active" }))).toBe("PROVIDER_STATUS_MANAGED");
    expect(codeOf(run(live("active"), { status: "canceled" }))).toBe("STATUS_NOT_ALLOWED");
  });

  it("pausar com data junto não passa", () => {
    expect(
      codeOf(run(live("active"), { status: "paused", currentPeriodEnd: FUTURE })),
    ).toBe("FIELD_NOT_APPLICABLE");
  });
});

describe("allowedTargets", () => {
  it("manual segue a tabela; com provedor, só pausa e retomada", () => {
    expect(allowedTargets("active", false)).toEqual([
      "trialing",
      "past_due",
      "unpaid",
      "paused",
    ]);
    expect(allowedTargets("past_due", false)).toEqual([
      "trialing",
      "active",
      "unpaid",
      "expired",
    ]);
    expect(allowedTargets("expired", false)).toEqual(["trialing", "active"]);
    expect(allowedTargets("canceled", false)).toEqual(["active"]);
    expect(allowedTargets("active", true)).toEqual(["paused"]);
    expect(allowedTargets("paused", true)).toEqual(["active"]);
    expect(allowedTargets("past_due", true)).toEqual([]);
  });

  it("todo destino oferecido é aceito pela regra", () => {
    for (const from of ALL) {
      for (const to of allowedTargets(from, false)) {
        const input: AdminEditInput = { status: to };
        if (to === "trialing") input.trialEndsAt = FUTURE;
        if (to === "active") input.currentPeriodEnd = FUTURE;

        expect(run(current(from), input).ok, `${from} → ${to}`).toBe(true);
      }
    }
  });
});

describe("keptTrialNotices", () => {
  const sent = { t3: "2026-11-08T00:00:00Z", t1: "2026-11-10T00:00:00Z" };

  it("trial estendido: os avisos que ficaram para o futuro saem e voltam a ser enviados", () => {
    expect(
      keptTrialNotices(sent, { now: NOW, trialEndsAt: FUTURE, graceDays: GRACE_DAYS }),
    ).toEqual({});
  });

  it("trial ainda perto do fim: o que já seria devido fica", () => {
    expect(
      keptTrialNotices(sent, {
        now: NOW,
        trialEndsAt: new Date(NOW.getTime() + 2 * DAY_MS),
        graceDays: GRACE_DAYS,
      }),
    ).toEqual({ t3: sent.t3 });
  });
});
