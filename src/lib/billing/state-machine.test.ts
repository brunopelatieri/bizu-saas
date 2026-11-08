import { describe, expect, it } from "vitest";
import type { SubscriptionStatus } from "@/db/schema/billing";
import {
  type BillingEvent,
  canStartCheckout,
  type Decision,
  isLiveStatus,
  nextInvoiceStatus,
  type SubscriptionSnapshot,
  transition,
} from "@/lib/billing/state-machine";
import { DAY_MS } from "@/lib/billing/trial";

const NOW = new Date("2026-11-10T12:00:00Z");
const EARLIER = new Date("2026-11-09T12:00:00Z");
const LATER = new Date("2026-12-10T12:00:00Z");
const FREE = "plano-gratuito";

function snapshot(
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
    providerSubscriptionRef: "sub_1",
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

const paid = (extra: Partial<Extract<BillingEvent, { type: "invoice.paid" }>> = {}) =>
  ({ type: "invoice.paid", subscriptionRef: "sub_1", ...extra }) as const;

describe("invoice.paid", () => {
  it("trialing → active", () => {
    const decision = applied(transition(snapshot("trialing"), paid(), NOW));

    expect(decision.status).toBe("active");
    expect(decision.reason).toBe("activated");
    expect(decision.accessMode).toBe("full");
  });

  it("past_due → active limpa a carência e os avisos", () => {
    const decision = applied(
      transition(snapshot("past_due", { graceUntil: LATER }), paid(), NOW),
    );

    expect(decision.status).toBe("active");
    expect(decision.patch.graceUntil).toBeNull();
    expect(decision.clearDunningNotices).toBe(true);
  });

  it.each(["unpaid", "expired"] as const)(
    "%s → active é reativação e devolve o acesso",
    (status) => {
      const decision = applied(transition(snapshot(status), paid(), NOW));

      expect(decision.status).toBe("active");
      expect(decision.reason).toBe("reactivated");
      expect(decision.accessMode).toBe("full");
    },
  );

  it("canceled → active com assinatura nova (novo checkout)", () => {
    const decision = applied(
      transition(snapshot("canceled"), paid({ subscriptionRef: "sub_2" }), NOW),
    );

    expect(decision.status).toBe("active");
    expect(decision.patch.providerSubscriptionRef).toBe("sub_2");
  });

  it("fatura antiga paga depois do cancelamento não reativa", () => {
    expect(reasonOf(transition(snapshot("canceled"), paid(), NOW))).toBe(
      "late_invoice_after_cancel",
    );
  });

  it("segundo checkout pago com assinatura viva vira ignored, sem trocar a referência", () => {
    expect(
      reasonOf(
        transition(snapshot("active"), paid({ subscriptionRef: "sub_2" }), NOW),
      ),
    ).toBe("duplicate_subscription");
  });

  it("renovação mantém active e avança o período", () => {
    const decision = applied(
      transition(
        snapshot("active", { currentPeriodEnd: NOW }),
        paid({ periodStart: NOW, periodEnd: LATER }),
        NOW,
      ),
    );

    expect(decision.reason).toBe("renewed");
    expect(decision.patch.currentPeriodEnd).toEqual(LATER);
  });

  it("período que avança aplica o downgrade agendado", () => {
    const decision = applied(
      transition(
        snapshot("active", { currentPeriodEnd: NOW, pendingPlanId: "barato" }),
        paid({ periodEnd: LATER }),
        NOW,
      ),
    );

    expect(decision.patch.planId).toBe("barato");
    expect(decision.patch.pendingPlanId).toBeNull();
    expect(decision.applyPendingPrice).toBe(true);
  });
});

describe("invoice.payment_failed", () => {
  const failed = { type: "invoice.payment_failed", graceDays: 7 } as const;

  it("active → past_due com grace_until = agora + grace_days", () => {
    const decision = applied(transition(snapshot("active"), failed, NOW));

    expect(decision.status).toBe("past_due");
    expect(decision.patch.graceUntil).toEqual(
      new Date(NOW.getTime() + 7 * DAY_MS),
    );
    // Na carência o acesso segue total.
    expect(decision.accessMode).toBeUndefined();
  });

  it("trial nativo que falhou na primeira cobrança vai a past_due", () => {
    expect(applied(transition(snapshot("trialing"), failed, NOW)).status).toBe(
      "past_due",
    );
  });

  it("trial sem assinatura no provedor não é afetado", () => {
    expect(
      reasonOf(
        transition(
          snapshot("trialing", { providerSubscriptionRef: null }),
          failed,
          NOW,
        ),
      ),
    ).toBe("not_applicable");
  });

  it("repetida em past_due não estende a carência", () => {
    expect(
      reasonOf(transition(snapshot("past_due", { graceUntil: LATER }), failed, NOW)),
    ).toBe("already_past_due");
  });
});

describe("dunning.expired", () => {
  const event = { type: "dunning.expired" } as const;

  it("past_due → unpaid + read_only depois de grace_until", () => {
    const decision = applied(
      transition(snapshot("past_due", { graceUntil: EARLIER }), event, NOW),
    );

    expect(decision.status).toBe("unpaid");
    expect(decision.accessMode).toBe("read_only");
  });

  it("carência em curso não muda nada", () => {
    expect(
      reasonOf(transition(snapshot("past_due", { graceUntil: LATER }), event, NOW)),
    ).toBe("grace_running");
  });

  it("fora de past_due é ignorado", () => {
    expect(reasonOf(transition(snapshot("active"), event, NOW))).toBe(
      "not_past_due",
    );
  });
});

describe("trial.expired", () => {
  it("trialing → expired + read_only", () => {
    const decision = applied(
      transition(snapshot("trialing"), { type: "trial.expired" }, NOW),
    );

    expect(decision.status).toBe("expired");
    expect(decision.accessMode).toBe("read_only");
  });

  it("quem já pagou não expira", () => {
    expect(
      reasonOf(transition(snapshot("active"), { type: "trial.expired" }, NOW)),
    ).toBe("not_trialing");
  });
});

describe("cancelamento do owner", () => {
  it("agenda no fim do período, sem mudar o status", () => {
    const decision = applied(
      transition(snapshot("active"), { type: "cancel.requested" }, NOW),
    );

    expect(decision.status).toBe("active");
    expect(decision.patch.cancelAtPeriodEnd).toBe(true);
  });

  it("repetir não grava de novo", () => {
    expect(
      reasonOf(
        transition(
          snapshot("active", { cancelAtPeriodEnd: true }),
          { type: "cancel.requested" },
          NOW,
        ),
      ),
    ).toBe("already_scheduled");
  });

  it("pausada também agenda, para o provedor e aqui ficarem iguais", () => {
    const decision = applied(
      transition(snapshot("paused"), { type: "cancel.requested" }, NOW),
    );

    expect(decision.status).toBe("paused");
    expect(decision.patch.cancelAtPeriodEnd).toBe(true);
  });

  it.each(["unpaid", "expired", "canceled"] as const)(
    "%s não cancela",
    (status) => {
      expect(
        reasonOf(transition(snapshot(status), { type: "cancel.requested" }, NOW)),
      ).toBe("not_cancelable");
    },
  );

  it("resume desfaz o agendamento", () => {
    const decision = applied(
      transition(
        snapshot("active", { cancelAtPeriodEnd: true }),
        { type: "resume.requested" },
        NOW,
      ),
    );

    expect(decision.patch.cancelAtPeriodEnd).toBe(false);
  });

  it("resume sem nada a retomar é ignorado", () => {
    expect(
      reasonOf(transition(snapshot("active"), { type: "resume.requested" }, NOW)),
    ).toBe("nothing_to_resume");
  });
});

describe("period.ended", () => {
  const scheduled = snapshot("active", {
    cancelAtPeriodEnd: true,
    currentPeriodEnd: EARLIER,
  });

  it("com plano gratuito, migra para ele e segue ativo", () => {
    const decision = applied(
      transition(scheduled, { type: "period.ended", freePlanId: FREE }, NOW),
    );

    expect(decision.status).toBe("active");
    expect(decision.patch.planId).toBe(FREE);
    expect(decision.patch.planPriceId).toBeNull();
    expect(decision.patch.providerSubscriptionRef).toBeNull();
    expect(decision.accessMode).toBe("full");
  });

  it("sem plano gratuito, cancela e fica só leitura", () => {
    const decision = applied(
      transition(scheduled, { type: "period.ended", freePlanId: null }, NOW),
    );

    expect(decision.status).toBe("canceled");
    expect(decision.accessMode).toBe("read_only");
    expect(decision.patch.canceledAt).toEqual(NOW);
  });

  it("período em curso espera", () => {
    expect(
      reasonOf(
        transition(
          snapshot("active", { cancelAtPeriodEnd: true, currentPeriodEnd: LATER }),
          { type: "period.ended", freePlanId: null },
          NOW,
        ),
      ),
    ).toBe("period_running");
  });

  it("sem agendamento é ignorado", () => {
    expect(
      reasonOf(
        transition(snapshot("active"), { type: "period.ended", freePlanId: null }, NOW),
      ),
    ).toBe("not_scheduled");
  });
});

describe("downgrade.due", () => {
  it("aplica o plano agendado no fim do período", () => {
    const decision = applied(
      transition(
        snapshot("active", { pendingPlanId: "barato", currentPeriodEnd: EARLIER }),
        { type: "downgrade.due" },
        NOW,
      ),
    );

    expect(decision.reason).toBe("plan_downgraded");
    expect(decision.patch.planId).toBe("barato");
    expect(decision.applyPendingPrice).toBe(true);
  });

  it("não antecipa", () => {
    expect(
      reasonOf(
        transition(
          snapshot("active", { pendingPlanId: "barato", currentPeriodEnd: LATER }),
          { type: "downgrade.due" },
          NOW,
        ),
      ),
    ).toBe("period_running");
  });
});

describe("pausa", () => {
  it("active → paused corta o acesso: sem cobrança, sem serviço", () => {
    const decision = applied(
      transition(
        snapshot("active"),
        { type: "pause.requested", supported: true },
        NOW,
      ),
    );

    expect(decision.status).toBe("paused");
    expect(decision.accessMode).toBe("read_only");
  });

  it("sem capabilities.pause é recusada", () => {
    expect(
      reasonOf(
        transition(
          snapshot("active"),
          { type: "pause.requested", supported: false },
          NOW,
        ),
      ),
    ).toBe("pause_not_supported");
  });

  it("paused → active ao retomar", () => {
    expect(
      applied(transition(snapshot("paused"), { type: "resume.requested" }, NOW)).status,
    ).toBe("active");
  });
});

describe("admin.canceled", () => {
  it.each([
    "trialing",
    "active",
    "past_due",
    "unpaid",
    "paused",
    "expired",
  ] as const)("%s → canceled imediato e só leitura", (status) => {
    const decision = applied(
      transition(snapshot(status), { type: "admin.canceled" }, NOW),
    );

    expect(decision.status).toBe("canceled");
    expect(decision.accessMode).toBe("read_only");
    expect(decision.patch.canceledAt).toEqual(NOW);
  });

  it("já cancelada é ignorada", () => {
    expect(
      reasonOf(transition(snapshot("canceled"), { type: "admin.canceled" }, NOW)),
    ).toBe("already_ended");
  });
});

describe("eventos do provedor sobre a assinatura", () => {
  const updated = (
    extra: Partial<Extract<BillingEvent, { type: "subscription.updated" }>> = {},
  ) =>
    ({
      type: "subscription.updated",
      subscriptionRef: "sub_1",
      status: "active",
      graceDays: 7,
      freePlanId: null,
      ...extra,
    }) as const;

  it("sem novidade é no-op", () => {
    expect(reasonOf(transition(snapshot("active"), updated(), NOW))).toBe(
      "no_change",
    );
  });

  it("atualiza o período e o agendamento", () => {
    const decision = applied(
      transition(
        snapshot("active"),
        updated({ periodEnd: LATER, cancelAtPeriodEnd: true }),
        NOW,
      ),
    );

    expect(decision.status).toBe("active");
    expect(decision.patch.currentPeriodEnd).toEqual(LATER);
    expect(decision.patch.cancelAtPeriodEnd).toBe(true);
  });

  it("trialing → active espera o pagamento", () => {
    expect(reasonOf(transition(snapshot("trialing"), updated(), NOW))).toBe(
      "no_change",
    );
  });

  it("past_due → active espera o pagamento", () => {
    expect(reasonOf(transition(snapshot("past_due"), updated(), NOW))).toBe(
      "no_change",
    );
  });

  it("trial nativo liga a referência da assinatura nova", () => {
    const decision = applied(
      transition(
        snapshot("trialing", { providerSubscriptionRef: null }),
        updated({ subscriptionRef: "sub_9", status: "trialing" }),
        NOW,
      ),
    );

    expect(decision.patch.providerSubscriptionRef).toBe("sub_9");
  });

  it("evento de outra assinatura não mexe nesta", () => {
    expect(
      reasonOf(
        transition(snapshot("active"), updated({ subscriptionRef: "sub_2" }), NOW),
      ),
    ).toBe("other_subscription");
  });

  it("evento antigo depois de voltar ao plano gratuito não religa a referência", () => {
    expect(
      reasonOf(
        transition(
          snapshot("active", { providerSubscriptionRef: null }),
          updated({ subscriptionRef: "sub_1" }),
          NOW,
        ),
      ),
    ).toBe("other_subscription");
  });

  it("active → paused e paused → active", () => {
    const paused = applied(
      transition(snapshot("active"), updated({ status: "paused" }), NOW),
    );

    expect(paused.status).toBe("paused");
    expect(paused.accessMode).toBe("read_only");
    expect(applied(transition(snapshot("paused"), updated(), NOW)).status).toBe(
      "active",
    );
  });

  it("subscription.canceled encerra e, sem plano gratuito, fica só leitura", () => {
    const decision = applied(
      transition(
        snapshot("active"),
        { type: "subscription.canceled", subscriptionRef: "sub_1", freePlanId: null },
        NOW,
      ),
    );

    expect(decision.status).toBe("canceled");
    expect(decision.accessMode).toBe("read_only");
  });

  it("subscription.canceled de assinatura substituída não encerra a nova", () => {
    expect(
      reasonOf(
        transition(
          snapshot("active"),
          { type: "subscription.canceled", subscriptionRef: "sub_0", freePlanId: FREE },
          NOW,
        ),
      ),
    ).toBe("other_subscription");
  });

  it("encerrar duas vezes é ignorado", () => {
    expect(
      reasonOf(
        transition(
          snapshot("canceled"),
          { type: "subscription.canceled", subscriptionRef: "sub_1", freePlanId: null },
          NOW,
        ),
      ),
    ).toBe("already_ended");
  });
});

describe("ordem dos eventos", () => {
  const seen = snapshot("active", { lastProviderEventAt: NOW });

  it("evento anterior ao último aplicado é ignorado", () => {
    expect(
      reasonOf(
        transition(
          seen,
          { type: "invoice.payment_failed", occurredAt: EARLIER, graceDays: 7 },
          NOW,
        ),
      ),
    ).toBe("out_of_order");
  });

  it("evento do mesmo instante passa: o provedor só tem segundos", () => {
    expect(
      applied(
        transition(
          seen,
          { type: "invoice.payment_failed", occurredAt: NOW, graceDays: 7 },
          NOW,
        ),
      ).status,
    ).toBe("past_due");
  });

  it("evento sem data não participa da ordem", () => {
    expect(
      applied(
        transition(seen, { type: "invoice.payment_failed", graceDays: 7 }, NOW)
      ).status,
    ).toBe("past_due");
  });
});

describe("provider.synced", () => {
  const synced = (
    status: Extract<BillingEvent, { type: "provider.synced" }>["status"],
    extra: Partial<Extract<BillingEvent, { type: "provider.synced" }>> = {},
  ) =>
    ({
      type: "provider.synced",
      status,
      cancelAtPeriodEnd: false,
      graceDays: 7,
      freePlanId: null,
      ...extra,
    }) as const;

  it("igual ao provedor não muda nada", () => {
    expect(reasonOf(transition(snapshot("active"), synced("active"), NOW))).toBe(
      "no_change",
    );
  });

  it("período igual não é divergência", () => {
    expect(
      reasonOf(
        transition(
          snapshot("active", { currentPeriodStart: NOW, currentPeriodEnd: LATER }),
          synced("active", { periodStart: NOW, periodEnd: LATER }),
          NOW,
        ),
      ),
    ).toBe("no_change");
  });

  it("webhook perdido de pagamento: past_due volta a active", () => {
    expect(
      applied(transition(snapshot("past_due"), synced("active"), NOW)).status,
    ).toBe("active");
  });

  it("webhook perdido de falha: active vai a past_due", () => {
    expect(
      applied(transition(snapshot("active"), synced("past_due"), NOW)).status,
    ).toBe("past_due");
  });

  it.each(["past_due", "paused"] as const)(
    "%s com período novo leva junto o preço do downgrade",
    (status) => {
      const decision = applied(
        transition(
          snapshot("active", { currentPeriodEnd: NOW, pendingPlanId: "barato" }),
          synced(status, { periodEnd: LATER }),
          NOW,
        ),
      );

      expect(decision.patch.planId).toBe("barato");
      expect(decision.applyPendingPrice).toBe(true);
    },
  );

  it("cancelada no provedor encerra aqui", () => {
    expect(
      applied(transition(snapshot("active"), synced("canceled"), NOW)).status,
    ).toBe("canceled");
  });

  it("encerrada aqui e viva lá não reabre sozinha", () => {
    expect(reasonOf(transition(snapshot("canceled"), synced("active"), NOW))).toBe(
      "subscription_ended",
    );
  });
});

describe("isLiveStatus", () => {
  it.each(["active", "trialing", "past_due", "paused"] as const)("%s é viva", (status) => {
    expect(isLiveStatus(status)).toBe(true);
  });

  it.each(["unpaid", "canceled", "expired"] as const)("%s não é", (status) => {
    expect(isLiveStatus(status)).toBe(false);
  });
});

describe("canStartCheckout", () => {
  const base = { providerSubscriptionRef: null, planIsFree: false };

  it.each(["expired", "canceled", "unpaid"] as const)("%s pode", (status) => {
    expect(canStartCheckout({ ...base, status })).toBe(true);
  });

  it("trial sem assinatura no provedor pode", () => {
    expect(canStartCheckout({ ...base, status: "trialing" })).toBe(true);
  });

  it("trial nativo já assinado não pode", () => {
    expect(
      canStartCheckout({
        ...base,
        status: "trialing",
        providerSubscriptionRef: "sub_1",
      }),
    ).toBe(false);
  });

  it("plano gratuito pode; plano pago ativo no provedor troca de plano", () => {
    const linked = { ...base, providerSubscriptionRef: "sub_1" };

    expect(canStartCheckout({ ...linked, status: "active", planIsFree: true })).toBe(true);
    expect(canStartCheckout({ ...linked, status: "active" })).toBe(false);
  });

  it.each(["active", "past_due"] as const)(
    "%s na cobrança manual pode migrar para o provedor",
    (status) => {
      expect(canStartCheckout({ ...base, status })).toBe(true);
    },
  );

  it("past_due no provedor e paused não podem", () => {
    expect(
      canStartCheckout({ ...base, status: "past_due", providerSubscriptionRef: "sub_1" }),
    ).toBe(false);
    expect(canStartCheckout({ ...base, status: "paused" })).toBe(false);
  });
});

describe("nextInvoiceStatus", () => {
  it("paga não volta a aberta nem falha", () => {
    expect(nextInvoiceStatus("paid", "open")).toBe("paid");
    expect(nextInvoiceStatus("paid", "failed")).toBe("paid");
  });

  it("falha pode ser paga na retentativa", () => {
    expect(nextInvoiceStatus("failed", "paid")).toBe("paid");
  });

  it("reembolsada é final", () => {
    expect(nextInvoiceStatus("refunded", "paid")).toBe("refunded");
  });

  it("paga pode ser reembolsada", () => {
    expect(nextInvoiceStatus("paid", "refunded")).toBe("refunded");
  });

  it("cancelada só muda se foi paga mesmo assim", () => {
    expect(nextInvoiceStatus("void", "open")).toBe("void");
    expect(nextInvoiceStatus("void", "paid")).toBe("paid");
  });
});
