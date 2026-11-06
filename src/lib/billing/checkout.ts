import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { logError } from "@/api/log";
import { getDb } from "@/db";
import { withPlatformScope, withTenant } from "@/db/rls";
import {
  billingProfile,
  invoice,
  plan,
  planPrice,
  subscription,
} from "@/db/schema";
import { audit, type AuditEntry } from "@/lib/audit";
import { appLink } from "@/lib/auth/links";
import {
  applyDecision,
  lockSubscription,
  snapshotOf,
  type SubscriptionRow,
} from "@/lib/billing/apply";
import type { PaymentMethod } from "@/lib/billing/constants";
import { notifyCanceled } from "@/lib/billing/notify";
import { prorationCents } from "@/lib/billing/proration";
import {
  type BillingEvent,
  canStartCheckout,
  transition,
} from "@/lib/billing/state-machine";
import { loadTenantPlan } from "@/lib/billing/subscription";
import { getProvider, getProviders, platformContext } from "@/lib/payments/registry";
import type {
  Capabilities,
  PaymentProvider,
  PlanPrice,
} from "@/lib/payments/types";
import type { BillingProfileInput } from "@/lib/schemas/billing";
import { notFound, TenantRuleError } from "@/lib/tenant/errors";

/**
 * O que o owner faz com a assinatura. Falar com o provedor vem sempre antes da transação
 * local: sem resposta dele nada muda aqui, e se a gravação falhar depois, o webhook e a
 * reconciliação trazem o estado de volta.
 */

const REFUSED = {
  noProvider: new TenantRuleError(
    409,
    "PROVIDER_UNAVAILABLE",
    "Este meio de pagamento não está disponível.",
  ),
  noSubscription: new TenantRuleError(
    409,
    "NO_ACTIVE_SUBSCRIPTION",
    "Não há assinatura paga para alterar.",
  ),
} as const;

/** Nada do provedor chega ao cliente: o erro real fica no log, sem dado pessoal. */
async function callProvider<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof TenantRuleError) throw error;

    logError("Falha no provedor de pagamento", error);
    throw new TenantRuleError(
      502,
      "PROVIDER_ERROR",
      "Não foi possível falar com o provedor de pagamento. Tente novamente.",
    );
  }
}

/** Assinatura em que se paga por recorrência: Pix só onde há Pix recorrente. */
export function recurringMethods(capabilities: Capabilities): PaymentMethod[] {
  return [
    ...(capabilities.card ? (["card"] as const) : []),
    ...(capabilities.boleto ? (["boleto"] as const) : []),
    ...(capabilities.recurringPix ? (["pix"] as const) : []),
  ];
}

/** Planos ativos e o que cada provedor ativo oferece. Sem provedor, só os planos. */
export async function listBillingPlans() {
  const providers = getProviders();
  const plans = await getDb()
    .select()
    .from(plan)
    .where(eq(plan.active, true))
    .orderBy(asc(plan.sortOrder), asc(plan.name));
  const prices = await getDb()
    .select()
    .from(planPrice)
    .where(eq(planPrice.active, true));

  const usable = (price: (typeof prices)[number]) => {
    const provider = providers.find(({ id }) => id === price.provider);
    return (
      provider !== undefined &&
      (!provider.requiresPriceRef || price.providerPriceRef !== null)
    );
  };

  return {
    plans: plans.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      isFree: row.isFree,
      limits: row.limits,
      features: row.features,
      prices: row.isFree
        ? []
        : prices
            .filter((price) => price.planId === row.id && usable(price))
            .map((price) => ({
              id: price.id,
              provider: price.provider,
              interval: price.interval,
              amountCents: price.amountCents,
              currency: price.currency,
            })),
    })),
    providers: providers.map(({ id, capabilities }) => ({
      id,
      methods: recurringMethods(capabilities),
      customerPortal: capabilities.customerPortal,
      pause: capabilities.pause,
    })),
  };
}

export async function getBillingProfile(tenantId: string) {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        legalName: billingProfile.legalName,
        document: billingProfile.document,
        documentType: billingProfile.documentType,
        email: billingProfile.email,
        address: billingProfile.address,
      })
      .from(billingProfile)
      .where(eq(billingProfile.tenantId, tenantId)),
  );

  return row ?? null;
}

export async function saveBillingProfile(
  tenantId: string,
  input: BillingProfileInput,
) {
  await withTenant(tenantId, (tx) =>
    tx
      .insert(billingProfile)
      .values({ tenantId, ...input })
      .onConflictDoUpdate({
        target: billingProfile.tenantId,
        set: input,
      }),
  );

  return getBillingProfile(tenantId);
}

/** O que `/app/assinatura` mostra. Sem referências do provedor. */
export async function getSubscriptionView(tenantId: string) {
  const current = await loadTenantPlan(tenantId);
  const profile = await getBillingProfile(tenantId);
  if (!current) return { subscription: null, profile };

  const { subscription: row, plan: currentPlan } = current;
  const [pending] = row.pendingPlanId
    ? await getDb()
        .select({ id: plan.id, name: plan.name })
        .from(plan)
        .where(eq(plan.id, row.pendingPlanId))
    : [];

  return {
    subscription: {
      status: row.status,
      plan: {
        id: currentPlan.id,
        name: currentPlan.name,
        isFree: currentPlan.isFree,
      },
      planPriceId: row.planPriceId,
      provider: row.provider,
      paid: row.providerSubscriptionRef !== null && !currentPlan.isFree,
      trialEndsAt: row.trialEndsAt,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      graceUntil: row.graceUntil,
      pendingPlan: pending ?? null,
    },
    profile,
  };
}

type PriceRow = { price: typeof planPrice.$inferSelect; plan: typeof plan.$inferSelect };

async function loadPrice(planPriceId: string): Promise<PriceRow> {
  const [row] = await getDb()
    .select({ price: planPrice, plan })
    .from(planPrice)
    .innerJoin(plan, eq(planPrice.planId, plan.id))
    .where(
      and(
        eq(planPrice.id, planPriceId),
        eq(planPrice.active, true),
        eq(plan.active, true),
      ),
    );

  if (!row || row.plan.isFree) throw notFound("Preço não encontrado.");

  return row;
}

function usableProvider({ price }: PriceRow) {
  const provider = getProvider(price.provider);
  if (!provider) throw REFUSED.noProvider;

  if (provider.requiresPriceRef && !price.providerPriceRef) {
    throw new TenantRuleError(
      409,
      "PRICE_NOT_CONFIGURED",
      "Este preço ainda não foi configurado.",
    );
  }

  return provider;
}

const toPlanPrice = (price: PriceRow["price"]): PlanPrice => ({
  id: price.id,
  planId: price.planId,
  provider: price.provider,
  interval: price.interval,
  amountCents: price.amountCents,
  currency: price.currency,
  providerPriceRef: price.providerPriceRef,
});

/**
 * Sem assinatura (tenant sem plano utilizável no onboarding) o checkout ainda precisa de
 * uma linha para os metadados. `expired`: nada foi pago e o plano só vale ao pagar.
 */
async function ensureSubscription(tenantId: string, planId: string) {
  const current = await loadTenantPlan(tenantId);
  if (current) return current;

  await withTenant(tenantId, (tx) =>
    tx
      .insert(subscription)
      .values({ tenantId, planId, status: "expired" })
      .onConflictDoNothing({ target: subscription.tenantId }),
  );

  const created = await loadTenantPlan(tenantId);
  if (!created) throw new Error("assinatura não criada");

  return created;
}

/** Mesma escolha em 10 minutos é o mesmo checkout: duplo clique não abre dois. */
function checkoutKey(subscriptionId: string, planPriceId: string, method: string, now: Date) {
  const bucket = Math.floor(now.getTime() / (10 * 60_000));

  return createHash("sha256")
    .update(`${subscriptionId}:${planPriceId}:${method}:${bucket}`)
    .digest("hex");
}

type Actor = { userId: string; ip?: string | null };

const actorEntry = (actor: Actor): Pick<AuditEntry, "actor" | "ip"> => ({
  actor: { type: "user", id: actor.userId },
  ip: actor.ip,
});

export type CheckoutResponse =
  | { kind: "redirect"; url: string }
  | {
      kind: "inline";
      invoiceId: string;
      pixPayload?: string;
      boletoUrl?: string;
      boletoLine?: string;
      expiresAt: string;
    };

export async function startCheckout(
  tenantId: string,
  input: { planPriceId: string; method: PaymentMethod },
  actor: Actor,
  now = new Date(),
): Promise<CheckoutResponse> {
  const chosen = await loadPrice(input.planPriceId);
  const provider = usableProvider(chosen);

  if (!recurringMethods(provider.capabilities).includes(input.method)) {
    throw new TenantRuleError(
      409,
      "METHOD_NOT_AVAILABLE",
      "Esta forma de pagamento não está disponível para este plano.",
    );
  }

  const profile = await getBillingProfile(tenantId);
  if (!profile) {
    throw new TenantRuleError(
      409,
      "BILLING_PROFILE_REQUIRED",
      "Preencha os dados de faturamento antes de assinar.",
    );
  }

  const { subscription: row, plan: currentPlan } = await ensureSubscription(
    tenantId,
    chosen.plan.id,
  );

  if (
    !canStartCheckout({
      status: row.status,
      providerSubscriptionRef: row.providerSubscriptionRef,
      planIsFree: currentPlan.isFree,
    })
  ) {
    throw new TenantRuleError(
      409,
      "CHECKOUT_NOT_ALLOWED",
      "Esta organização já tem uma assinatura. Troque de plano ou pague a fatura em aberto.",
    );
  }

  const ctx = platformContext();
  const sameProvider = row.provider === provider.id;
  const customerRef =
    sameProvider && row.providerCustomerRef
      ? row.providerCustomerRef
      : (
          await callProvider(() =>
            provider.ensureCustomer(ctx, { tenantId, billingProfile: profile }),
          )
        ).customerRef;

  await withTenant(tenantId, (tx) =>
    tx
      .update(subscription)
      .set({ provider: provider.id, providerCustomerRef: customerRef })
      .where(eq(subscription.id, row.id)),
  );

  const metadata = {
    tenantId,
    subscriptionId: row.id,
    planPriceId: chosen.price.id,
  };
  const result = await callProvider(() =>
    provider.createCheckout(ctx, {
      customerRef,
      price: toPlanPrice(chosen.price),
      methods: [input.method],
      successUrl: appLink("/app/assinatura/retorno"),
      cancelUrl: appLink("/app/assinatura"),
      idempotencyKey: checkoutKey(row.id, chosen.price.id, input.method, now),
      metadata,
      trialEndsAt:
        row.status === "trialing" && provider.capabilities.nativeTrial
          ? (row.trialEndsAt ?? undefined)
          : undefined,
    }),
  );

  await audit("billing.checkout_started", {
    ...actorEntry(actor),
    tenantId,
    target: { type: "subscription", id: row.id },
    metadata: { provider: provider.id, method: input.method, kind: result.kind },
  });

  if (result.kind === "redirect") return result;

  // Inline: a tela acompanha esta fatura até o webhook marcar `paid`.
  const [created] = await withTenant(tenantId, (tx) =>
    tx
      .insert(invoice)
      .values({
        tenantId,
        subscriptionId: row.id,
        provider: provider.id,
        providerRef: result.invoiceRef ?? null,
        amountCents: chosen.price.amountCents,
        currency: chosen.price.currency,
        paymentMethod: input.method,
        dueAt: result.expiresAt,
        pixPayload: result.pixPayload,
        boletoLine: result.boletoLine,
        hostedUrl: result.boletoUrl,
      })
      .onConflictDoNothing()
      .returning({ id: invoice.id }),
  );
  const invoiceId =
    created?.id ?? (await findInvoiceByRef(tenantId, result.invoiceRef));

  return {
    kind: "inline",
    invoiceId,
    pixPayload: result.pixPayload,
    boletoUrl: result.boletoUrl,
    boletoLine: result.boletoLine,
    expiresAt: result.expiresAt.toISOString(),
  };
}

/** O webhook da fatura pode chegar antes da resposta do checkout. */
async function findInvoiceByRef(tenantId: string, ref: string | undefined) {
  if (!ref) throw new Error("fatura inline sem referência");

  const [row] = await withTenant(tenantId, (tx) =>
    tx.select({ id: invoice.id }).from(invoice).where(eq(invoice.providerRef, ref)),
  );
  if (!row) throw new Error("fatura inline não encontrada");

  return row.id;
}

/** Assinatura viva no provedor, com o módulo ativo. Senão, não há o que alterar. */
async function liveSubscription(tenantId: string) {
  const current = await loadTenantPlan(tenantId);
  const row = current?.subscription;

  if (!current || !row?.providerSubscriptionRef || !row.provider) {
    throw REFUSED.noSubscription;
  }
  if (["canceled", "expired", "unpaid"].includes(row.status)) {
    throw REFUSED.noSubscription;
  }

  const provider = getProvider(row.provider);
  if (!provider) throw REFUSED.noProvider;

  return {
    row,
    plan: current.plan,
    provider,
    ref: row.providerSubscriptionRef,
  };
}

async function applyOwnerEvent(
  tenantId: string,
  subscriptionId: string,
  event: BillingEvent,
  actor: Actor,
  now: Date,
) {
  return withTenant(tenantId, async (tx) => {
    const row = await lockSubscription(tx, subscriptionId);
    if (!row) throw REFUSED.noSubscription;

    const decision = transition(snapshotOf(row), event, now);
    if (decision.outcome === "ignored") return row;

    return applyDecision(tx, row, decision, {
      source: "owner",
      ...actorEntry(actor),
    });
  });
}

export async function cancelAtPeriodEnd(
  tenantId: string,
  actor: Actor,
  now = new Date(),
) {
  const { row, provider, ref } = await liveSubscription(tenantId);

  if (!row.cancelAtPeriodEnd) {
    await callProvider(() =>
      provider.cancelSubscription(platformContext(), ref, { atPeriodEnd: true }),
    );
  }

  const updated = await applyOwnerEvent(
    tenantId,
    row.id,
    { type: "cancel.requested" },
    actor,
    now,
  );

  if (!row.cancelAtPeriodEnd) {
    await notifyCanceled(tenantId, row.planId, row.currentPeriodEnd ?? now).catch(
      (error) => logError("Falha ao avisar cancelamento", error),
    );
  }

  return updated;
}

/** Desfaz o cancelamento agendado e tira da pausa. */
export async function resumeSubscription(
  tenantId: string,
  actor: Actor,
  now = new Date(),
) {
  const { row, provider, ref } = await liveSubscription(tenantId);

  if (!provider.resumeSubscription) {
    throw new TenantRuleError(
      409,
      "NOT_SUPPORTED",
      "Este provedor não permite retomar a assinatura. Faça um novo checkout.",
    );
  }

  const resume = provider.resumeSubscription;
  await callProvider(() => resume(platformContext(), ref));

  return applyOwnerEvent(tenantId, row.id, { type: "resume.requested" }, actor, now);
}

export async function pauseSubscription(
  tenantId: string,
  actor: Actor,
  now = new Date(),
) {
  const { row, provider, ref } = await liveSubscription(tenantId);
  const pause = provider.pauseSubscription;

  if (!pause || !provider.capabilities.pause || row.status !== "active") {
    throw new TenantRuleError(
      409,
      "NOT_SUPPORTED",
      "Esta assinatura não pode ser pausada.",
    );
  }

  await callProvider(() => pause(platformContext(), ref));

  return applyOwnerEvent(
    tenantId,
    row.id,
    { type: "pause.requested", supported: true },
    actor,
    now,
  );
}

/** Mesma comparação para mês e ano: o que pesa é o valor por mês. */
const monthlyCents = ({ amountCents, interval }: PlanPrice) =>
  interval === "year" ? amountCents / 12 : amountCents;

async function chargeDifference(
  provider: PaymentProvider,
  row: SubscriptionRow,
  current: PlanPrice,
  next: PlanPrice,
  now: Date,
) {
  if (!row.currentPeriodStart || !row.currentPeriodEnd || !row.providerCustomerRef) {
    return;
  }

  const amountCents = prorationCents({
    currentAmountCents: current.amountCents,
    newAmountCents: next.amountCents,
    periodStart: row.currentPeriodStart,
    periodEnd: row.currentPeriodEnd,
    now,
  });
  if (amountCents === 0 || !provider.chargeOnce) return;

  const charge = provider.chargeOnce;
  const customerRef = row.providerCustomerRef;

  await callProvider(() =>
    charge(platformContext(), {
      customerRef,
      amountCents,
      currency: next.currency,
      description: "Diferença da troca de plano",
      idempotencyKey: `upgrade:${row.id}:${next.id}:${row.currentPeriodEnd?.getTime()}`,
      metadata: { tenantId: row.tenantId, subscriptionId: row.id },
    }),
  );
}

export type PlanChange = { effectiveAt: "now" | "period_end"; periodEnd: Date | null };

/**
 * Upgrade: imediato, com proração do provedor ou calculada aqui. Downgrade: o preço novo
 * entra no provedor para a próxima cobrança, sem proração, e o plano local muda no fim do
 * período (`pending_plan_id`): não há estorno nem risco de cobrar o preço antigo.
 */
export async function changePlan(
  tenantId: string,
  input: { planPriceId: string },
  actor: Actor,
  now = new Date(),
): Promise<PlanChange> {
  const { row, provider, ref } = await liveSubscription(tenantId);
  const chosen = await loadPrice(input.planPriceId);
  const update = provider.updateSubscription;

  if (chosen.price.provider !== provider.id || !update) {
    throw new TenantRuleError(
      409,
      "PROVIDER_MISMATCH",
      "Este preço não está disponível para a assinatura atual.",
    );
  }
  usableProvider(chosen);

  if (!["active", "trialing"].includes(row.status)) {
    throw new TenantRuleError(
      409,
      "PLAN_CHANGE_NOT_ALLOWED",
      "Regularize o pagamento antes de trocar de plano.",
    );
  }
  if (chosen.price.id === row.planPriceId) {
    throw new TenantRuleError(409, "SAME_PLAN", "Este já é o plano atual.");
  }

  const [currentPrice] = row.planPriceId
    ? await getDb().select().from(planPrice).where(eq(planPrice.id, row.planPriceId))
    : [];
  const next = toPlanPrice(chosen.price);
  const current = currentPrice ? toPlanPrice(currentPrice) : null;
  const upgrade = !current || monthlyCents(next) > monthlyCents(current);
  const ctx = platformContext();

  if (upgrade) {
    const prorate = provider.capabilities.proration;
    await callProvider(() => update(ctx, ref, { price: next, prorate }));
    if (!prorate && current) {
      await chargeDifference(provider, row, current, next, now);
    }

    await withTenant(tenantId, async (tx) => {
      const locked = await lockSubscription(tx, row.id);
      if (!locked) throw REFUSED.noSubscription;

      await applyDecision(
        tx,
        locked,
        {
          outcome: "applied",
          status: locked.status,
          reason: "plan_upgraded",
          // Upgrade cancela o downgrade que estivesse agendado.
          patch: { pendingPlanId: null },
        },
        {
          source: "owner",
          ...actorEntry(actor),
          extra: { planId: chosen.plan.id, planPriceId: chosen.price.id },
        },
      );
    });

    return { effectiveAt: "now", periodEnd: row.currentPeriodEnd };
  }

  await callProvider(() => update(ctx, ref, { price: next, prorate: false }));

  await withTenant(tenantId, async (tx) => {
    const locked = await lockSubscription(tx, row.id);
    if (!locked) throw REFUSED.noSubscription;

    await tx
      .update(subscription)
      .set({
        pendingPlanId: chosen.plan.id,
        metadata: { ...locked.metadata, pendingPlanPriceId: chosen.price.id },
      })
      .where(eq(subscription.id, row.id));
  });

  await audit("billing.plan_change_requested", {
    ...actorEntry(actor),
    tenantId,
    target: { type: "plan", id: chosen.plan.id },
    metadata: { effectiveAt: "period_end" },
  });

  return { effectiveAt: "period_end", periodEnd: row.currentPeriodEnd };
}

export async function openPortal(tenantId: string) {
  const current = await loadTenantPlan(tenantId);
  const row = current?.subscription;
  const provider = row?.provider ? getProvider(row.provider) : null;

  if (!row?.providerCustomerRef || !provider) throw REFUSED.noSubscription;

  const portal = provider.portalUrl;
  const customerRef = row.providerCustomerRef;

  if (!provider.capabilities.customerPortal || !portal) {
    throw new TenantRuleError(
      409,
      "NOT_SUPPORTED",
      "Este provedor não tem portal do cliente.",
    );
  }

  const url = await callProvider(() =>
    portal(platformContext(), customerRef, appLink("/app/assinatura")),
  );

  return { url };
}

/** Só o proprietário da plataforma: encerra agora, no provedor e aqui. */
export async function adminCancelSubscription(
  subscriptionId: string,
  actorId: string,
  now = new Date(),
) {
  const [target] = await withPlatformScope("admin: carrega assinatura", (tx) =>
    tx.select().from(subscription).where(eq(subscription.id, subscriptionId)),
  );
  if (!target) throw notFound("Assinatura não encontrada.");

  const provider = target.provider ? getProvider(target.provider) : null;
  const ref = target.providerSubscriptionRef;
  const live = ref && !["canceled", "expired"].includes(target.status);

  // Módulo removido não prende a assinatura: o cancelamento local vale e fica registrado.
  if (provider && live) {
    await callProvider(() =>
      provider.cancelSubscription(platformContext(), ref, { atPeriodEnd: false }),
    );
  }

  return withPlatformScope("admin: cancela assinatura", async (tx) => {
    const row = await lockSubscription(tx, subscriptionId);
    if (!row) throw notFound("Assinatura não encontrada.");

    const decision = transition(snapshotOf(row), { type: "admin.canceled" }, now);
    if (decision.outcome === "ignored") {
      throw new TenantRuleError(409, "ALREADY_CANCELED", "Esta assinatura já foi cancelada.");
    }

    return applyDecision(tx, row, decision, {
      source: "admin",
      actor: { type: "platform", id: actorId },
    });
  });
}

/** Lista de `/admin/assinaturas`, sem referências do provedor na resposta. */
export async function loadSubscriptionForSync(subscriptionId: string) {
  const [row] = await withPlatformScope("admin: carrega assinatura", (tx) =>
    tx.select().from(subscription).where(eq(subscription.id, subscriptionId)),
  );
  if (!row) throw notFound("Assinatura não encontrada.");

  if (!row.provider || !row.providerSubscriptionRef) {
    throw new TenantRuleError(
      409,
      "NO_PROVIDER_SUBSCRIPTION",
      "Esta assinatura não tem par no provedor.",
    );
  }

  return {
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider,
    providerSubscriptionRef: row.providerSubscriptionRef,
  };
}
