import { and, asc, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { type Tx, withPlatformScope } from "@/db/rls";
import { invoice, plan, planPrice, subscription } from "@/db/schema";
import { type AuditEntry, auditInTransaction } from "@/lib/audit";
import {
  applyDecision,
  lockSubscription,
  type SubscriptionRow,
  snapshotOf,
} from "@/lib/billing/apply";
import {
  MANUAL_PROVIDER,
  type PaymentMethod,
  type PriceInterval,
} from "@/lib/billing/constants";
import { loadSettings } from "@/lib/billing/settings";
import { isProviderManaged, transition } from "@/lib/billing/state-machine";
import type { ManualPaymentInput, ManualUnpaidInput } from "@/lib/schemas/admin";
import { notFound, TenantRuleError } from "@/lib/tenant/errors";

/**
 * Cobrança manual (`docs/specs/cobranca-manual/spec.md`): sem módulo de pagamento, o
 * proprietário da plataforma marca em `/admin` quem pagou e quem não pagou. A assinatura é
 * manual quando não tem cobrança viva no provedor (`isProviderManaged`). O preço vem de
 * `plan_price` com `provider = manual`; a fatura, de `invoice` com o mesmo `provider`.
 */

type PriceRow = typeof planPrice.$inferSelect;
type InvoiceRow = typeof invoice.$inferSelect;

/** Soma um mês (ou ano) de calendário, em UTC. 31/01 + 1 mês = 28 ou 29/02. */
export function addInterval(start: Date, interval: PriceInterval): Date {
  const next = new Date(start.getTime());
  const day = next.getUTCDate();

  next.setUTCDate(1);
  if (interval === "year") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);

  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));

  return next;
}

/**
 * Período que um pagamento cobre. Em `active` ou `past_due`, continua do vencimento (ou do
 * início da fatura em aberto, `due`): quem paga atrasado paga o período que usou, e quem paga
 * adiantado não perde dias. Nos demais estados (trial, vencida, cancelada), começa agora:
 * em somente leitura o tenant não usou nada. Nunca termina no passado: um período inteiro já
 * vencido devolveria o tenant a `past_due` na hora seguinte, e ele seria bloqueado de novo
 * depois de pagar.
 */
export function manualPeriod(
  current: Pick<SubscriptionRow, "status" | "currentPeriodEnd">,
  interval: PriceInterval,
  now: Date,
  due?: Date | null,
) {
  const continues = current.status === "active" || current.status === "past_due";
  let periodStart = continues ? (due ?? current.currentPeriodEnd ?? now) : now;
  if (addInterval(periodStart, interval).getTime() <= now.getTime()) periodStart = now;

  return { periodStart, periodEnd: addInterval(periodStart, interval) };
}

/**
 * Período de uma fatura marcada como não paga. Com o período corrente ainda correndo, é ele
 * que não foi pago (o pagamento anterior não aconteceu ou foi registrado por engano); vencido,
 * é o período devido, que começa no vencimento.
 */
export function unpaidPeriod(
  current: Pick<SubscriptionRow, "currentPeriodStart" | "currentPeriodEnd">,
  interval: PriceInterval,
  now: Date,
) {
  const end = current.currentPeriodEnd;
  const running = end !== null && end.getTime() > now.getTime();
  let periodStart = running ? (current.currentPeriodStart ?? now) : (end ?? now);
  if (addInterval(periodStart, interval).getTime() <= now.getTime()) periodStart = now;

  return { periodStart, periodEnd: addInterval(periodStart, interval) };
}

/**
 * Preço manual do plano: o pedido, o que a assinatura já usa ou o primeiro ativo (mensal
 * antes do anual). `null` se o plano não tiver preço manual.
 */
async function resolveManualPrice(
  tx: Tx,
  planId: string,
  options: { planPriceId?: string; current?: string | null } = {},
): Promise<PriceRow | null> {
  const prices = await tx
    .select()
    .from(planPrice)
    .where(
      and(
        eq(planPrice.planId, planId),
        eq(planPrice.provider, MANUAL_PROVIDER),
        eq(planPrice.active, true),
      ),
    )
    .orderBy(asc(planPrice.interval));

  if (options.planPriceId) {
    return prices.find(({ id }) => id === options.planPriceId) ?? null;
  }

  return (
    prices.find(({ id }) => id === options.current) ??
    prices.find(({ interval }) => interval === "month") ??
    prices[0] ??
    null
  );
}

/** Fatura manual em aberto mais recente (`open` ou `failed`). */
async function openManualInvoice(tx: Tx, subscriptionId: string) {
  const [row] = await tx
    .select()
    .from(invoice)
    .where(
      and(
        eq(invoice.subscriptionId, subscriptionId),
        eq(invoice.provider, MANUAL_PROVIDER),
        inArray(invoice.status, ["open", "failed"]),
      ),
    )
    .orderBy(desc(invoice.createdAt))
    .limit(1);

  return row ?? null;
}

async function findManualInvoice(tx: Tx, subscriptionId: string, invoiceId: string) {
  const [row] = await tx
    .select()
    .from(invoice)
    .where(
      and(
        eq(invoice.id, invoiceId),
        eq(invoice.subscriptionId, subscriptionId),
        eq(invoice.provider, MANUAL_PROVIDER),
      ),
    );
  if (!row) throw notFound("Fatura não encontrada.");

  return row;
}

/** Faturas manuais em aberto viram `void`: o valor era de outro plano. */
export async function voidOpenManualInvoices(tx: Tx, subscriptionId: string) {
  await tx
    .update(invoice)
    .set({ status: "void" })
    .where(
      and(
        eq(invoice.subscriptionId, subscriptionId),
        eq(invoice.provider, MANUAL_PROVIDER),
        inArray(invoice.status, ["open", "failed"]),
      ),
    );
}

type Actor = { userId: string; ip?: string | null };

/** Carrega e trava a assinatura, recusando a que é do provedor ou de plano gratuito. */
async function lockManualSubscription(tx: Tx, subscriptionId: string) {
  const row = await lockSubscription(tx, subscriptionId);
  if (!row) throw notFound("Assinatura não encontrada.");

  if (isProviderManaged(row)) {
    throw new TenantRuleError(
      409,
      "PROVIDER_SUBSCRIPTION_ACTIVE",
      "Esta assinatura é cobrada pelo provedor de pagamento.",
    );
  }

  const [current] = await tx.select().from(plan).where(eq(plan.id, row.planId));
  if (!current) throw notFound("Plano não encontrado.");

  if (current.isFree) {
    throw new TenantRuleError(409, "FREE_PLAN", "Plano gratuito não tem cobrança.");
  }

  return { row, plan: current };
}

function requirePrice(price: PriceRow | null): PriceRow {
  if (!price) {
    throw new TenantRuleError(
      409,
      "MANUAL_PRICE_REQUIRED",
      "Cadastre um preço manual para este plano em /admin/planos.",
    );
  }
  return price;
}

const auditActor = (actor: Actor): AuditEntry["actor"] => ({
  type: "platform",
  id: actor.userId,
});

/**
 * "Registrar pagamento": a fatura indicada (ou a em aberto) vira `paid`; sem fatura, nasce uma
 * já paga. A assinatura volta a `active`, com período novo, acesso total e sem carência.
 */
export async function recordManualPayment(
  subscriptionId: string,
  input: ManualPaymentInput,
  actor: Actor,
  now = new Date(),
) {
  return withPlatformScope("admin: registra pagamento manual", async (tx) => {
    const { row, plan: current } = await lockManualSubscription(tx, subscriptionId);
    const target = input.invoiceId
      ? await findManualInvoice(tx, row.id, input.invoiceId)
      : await openManualInvoice(tx, row.id);

    if (target && !["open", "failed"].includes(target.status)) {
      throw new TenantRuleError(409, "INVOICE_NOT_OPEN", "Esta fatura não está em aberto.");
    }

    const price = requirePrice(
      await resolveManualPrice(tx, current.id, {
        planPriceId: input.planPriceId,
        current: row.planPriceId,
      }),
    );
    // O preço escolhido manda no intervalo; a fatura em aberto, só no início do período.
    const period = manualPeriod(row, price.interval, now, target?.periodStart);

    const decision = transition(
      snapshotOf(row),
      { type: "manual.paid", ...period },
      now,
    );
    if (decision.outcome === "ignored") {
      throw new TenantRuleError(409, "NOT_APPLICABLE", "Nada a registrar nesta assinatura.");
    }

    const paid = await savePaidInvoice(tx, row, target, price, period, {
      method: input.method,
      // Preço escolhido à mão é o valor recebido; sem escolha, vale o que a fatura já dizia.
      repriced: input.planPriceId !== undefined,
      now,
    });
    const updated = await applyDecision(tx, row, decision, {
      source: "admin",
      actor: auditActor(actor),
      ip: actor.ip,
      extra: { planPriceId: price.id, provider: null },
    });
    await auditInTransaction(tx, "admin.manual_payment_recorded", {
      actor: auditActor(actor),
      tenantId: row.tenantId,
      ip: actor.ip,
      target: { type: "invoice", id: paid.id },
      metadata: { subscriptionId: row.id, amountCents: paid.amountCents },
    });

    return { subscription: updated, invoice: paid };
  });
}

async function savePaidInvoice(
  tx: Tx,
  row: SubscriptionRow,
  target: InvoiceRow | null,
  price: PriceRow,
  period: { periodStart: Date; periodEnd: Date },
  { method, repriced, now }: { method?: PaymentMethod; repriced: boolean; now: Date },
) {
  if (target) {
    // A fatura passa a dizer o que foi pago: período (e valor, se o preço foi escolhido).
    const [updated] = await tx
      .update(invoice)
      .set({
        status: "paid",
        paidAt: now,
        paymentMethod: method ?? target.paymentMethod,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        ...(repriced ? { amountCents: price.amountCents, currency: price.currency } : {}),
      })
      .where(eq(invoice.id, target.id))
      .returning();
    return updated ?? target;
  }

  const [created] = await tx
    .insert(invoice)
    .values({
      tenantId: row.tenantId,
      subscriptionId: row.id,
      provider: MANUAL_PROVIDER,
      amountCents: price.amountCents,
      currency: price.currency,
      status: "paid",
      paymentMethod: method,
      dueAt: period.periodStart,
      paidAt: now,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    })
    .returning();
  if (!created) throw new Error("Falha ao gravar a fatura manual");

  return created;
}

/**
 * "Marcar como não pago": a fatura indicada (ou a em aberto) vira `failed`; sem fatura, nasce
 * uma para o período devido. A assinatura vai a `past_due` com carência de `grace_days` ou,
 * com `immediate`, direto a `unpaid` + `read_only`.
 */
export async function markManualUnpaid(
  subscriptionId: string,
  input: ManualUnpaidInput,
  actor: Actor,
  now = new Date(),
) {
  const { graceDays } = await loadSettings();

  return withPlatformScope("admin: marca falta de pagamento", async (tx) => {
    const { row, plan: current } = await lockManualSubscription(tx, subscriptionId);
    const target = input.invoiceId
      ? await findManualInvoice(tx, row.id, input.invoiceId)
      : await openManualInvoice(tx, row.id);

    if (target && !["open", "failed"].includes(target.status)) {
      throw new TenantRuleError(409, "INVOICE_NOT_OPEN", "Esta fatura não está em aberto.");
    }

    const decision = transition(
      snapshotOf(row),
      { type: "manual.unpaid", graceDays, immediate: input.immediate },
      now,
    );
    if (decision.outcome === "ignored") {
      throw new TenantRuleError(
        409,
        decision.reason === "already_past_due" ? "ALREADY_PAST_DUE" : "NOT_APPLICABLE",
        decision.reason === "already_past_due"
          ? "O pagamento já está pendente; use \"sem carência\" para bloquear agora."
          : "Nada a marcar nesta assinatura.",
      );
    }

    let failed: InvoiceRow;
    if (target) {
      const [updated] = await tx
        .update(invoice)
        .set({ status: "failed", attempt: target.attempt + 1 })
        .where(eq(invoice.id, target.id))
        .returning();
      failed = updated ?? target;
    } else {
      const price = requirePrice(
        await resolveManualPrice(tx, current.id, { current: row.planPriceId }),
      );
      const { periodStart, periodEnd } = unpaidPeriod(row, price.interval, now);
      const [created] = await tx
        .insert(invoice)
        .values({
          tenantId: row.tenantId,
          subscriptionId: row.id,
          provider: MANUAL_PROVIDER,
          amountCents: price.amountCents,
          currency: price.currency,
          status: "failed",
          attempt: 1,
          dueAt: periodStart,
          periodStart,
          periodEnd,
        })
        .returning();
      if (!created) throw new Error("Falha ao gravar a fatura manual");
      failed = created;
    }

    const updated = await applyDecision(tx, row, decision, {
      source: "admin",
      actor: auditActor(actor),
      ip: actor.ip,
    });
    await auditInTransaction(tx, "admin.manual_payment_missed", {
      actor: auditActor(actor),
      tenantId: row.tenantId,
      ip: actor.ip,
      target: { type: "invoice", id: failed.id },
      metadata: { subscriptionId: row.id, immediate: input.immediate },
    });

    return { subscription: updated, invoice: failed };
  });
}

/**
 * Vencimento do período manual (job `billing.period_end`, com a linha travada por quem chama).
 * Abre a fatura do período seguinte, se não houver uma em aberto, e passa a `past_due` com a
 * carência contada do vencimento. Sem preço manual, só transita.
 */
export async function applyManualDue(
  tx: Tx,
  row: SubscriptionRow,
  input: { graceDays: number; now: Date },
) {
  const [current] = await tx.select().from(plan).where(eq(plan.id, row.planId));
  if (!current) return { applied: false, invoiceOpened: false };

  const decision = transition(
    snapshotOf(row),
    { type: "manual.due", graceDays: input.graceDays, planIsFree: current.isFree },
    input.now,
  );
  if (decision.outcome === "ignored") return { applied: false, invoiceOpened: false };

  let invoiceOpened = false;
  const price = await resolveManualPrice(tx, current.id, { current: row.planPriceId });
  const due = row.currentPeriodEnd ?? input.now;

  if (price && !(await openManualInvoice(tx, row.id))) {
    await tx.insert(invoice).values({
      tenantId: row.tenantId,
      subscriptionId: row.id,
      provider: MANUAL_PROVIDER,
      amountCents: price.amountCents,
      currency: price.currency,
      status: "open",
      dueAt: due,
      periodStart: due,
      periodEnd: addInterval(due, price.interval),
    });
    invoiceOpened = true;
  }

  await applyDecision(tx, row, decision, {
    source: "job",
    actor: { type: "system", id: null },
  });

  return { applied: true, invoiceOpened, missingPrice: !price };
}

/** Assinaturas manuais vencidas: ativas, sem provedor, plano pago e período no passado. */
export function dueManualSubscriptions(tx: Tx, now: Date, tenantIds?: string[]) {
  return tx
    .select({ id: subscription.id, tenantId: subscription.tenantId })
    .from(subscription)
    .innerJoin(plan, eq(subscription.planId, plan.id))
    .where(
      and(
        eq(subscription.status, "active"),
        eq(subscription.cancelAtPeriodEnd, false),
        // `active` com referência é do provedor: ele cobra e avisa por webhook.
        isNull(subscription.providerSubscriptionRef),
        eq(plan.isFree, false),
        lte(subscription.currentPeriodEnd, now),
        tenantIds ? inArray(subscription.tenantId, tenantIds) : undefined,
      ),
    );
}
