import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { withPlatformScope } from "@/db/rls";
import { plan, planPrice, subscription } from "@/db/schema";
import { loadSettings, saveSettings } from "@/lib/billing/settings";
import type {
  PlanInput,
  PlatformSettingsInput,
  PlanPriceInput,
  UpdatePlanInput,
} from "@/lib/schemas/admin";
import { notFound, TenantRuleError } from "@/lib/tenant/errors";

export type PlanPriceRow = typeof planPrice.$inferSelect;
export type PlanRow = typeof plan.$inferSelect;

/** `23505`: o postgres.js a põe no erro, o Drizzle a embrulha em `cause`. */
export function isUniqueViolation(error: unknown) {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;

  return code(error) === "23505" || code((error as { cause?: unknown }).cause) === "23505";
}

const SLUG_TAKEN = new TenantRuleError(
  409,
  "SLUG_TAKEN",
  "Já existe um plano com este identificador.",
);

/** Todos os planos (inclusive inativos), com preços e quantos tenants os usam. */
export async function listPlans() {
  const plans = await getDb()
    .select()
    .from(plan)
    .orderBy(asc(plan.sortOrder), asc(plan.name));
  const prices = await getDb()
    .select()
    .from(planPrice)
    .orderBy(asc(planPrice.interval), asc(planPrice.provider));
  const usage = await withPlatformScope("admin: uso dos planos", (tx) =>
    tx
      .select({ planId: subscription.planId, tenants: sql<number>`count(*)::int` })
      .from(subscription)
      .groupBy(subscription.planId),
  );

  return plans.map((row) => ({
    ...row,
    prices: prices.filter(({ planId }) => planId === row.id),
    tenants: usage.find(({ planId }) => planId === row.id)?.tenants ?? 0,
  }));
}

export async function getPlan(planId: string) {
  const [row] = await getDb().select().from(plan).where(eq(plan.id, planId));
  if (!row) throw notFound("Plano não encontrado.");

  return row;
}

export async function createPlan(input: PlanInput) {
  try {
    const [created] = await getDb().insert(plan).values(input).returning();
    return created as PlanRow;
  } catch (error) {
    if (isUniqueViolation(error)) throw SLUG_TAKEN;
    throw error;
  }
}

export async function updatePlan(planId: string, patch: UpdatePlanInput) {
  const current = await getPlan(planId);

  // Plano gratuito não tem preço: marcá-lo assim com preço ativo geraria um plano
  // que cobra e é de graça ao mesmo tempo.
  if (patch.isFree) {
    const [priced] = await getDb()
      .select({ id: planPrice.id })
      .from(planPrice)
      .where(eq(planPrice.planId, planId))
      .limit(1);

    if (priced) {
      throw new TenantRuleError(
        409,
        "PLAN_HAS_PRICES",
        "Remova os preços antes de marcar o plano como gratuito.",
      );
    }
  }

  const [updated] = await getDb()
    .update(plan)
    .set(patch)
    .where(eq(plan.id, current.id))
    .returning();

  return updated as PlanRow;
}

export async function createPrice(planId: string, input: PlanPriceInput) {
  const owner = await getPlan(planId);

  if (owner.isFree) {
    throw new TenantRuleError(
      409,
      "FREE_PLAN_NO_PRICE",
      "Plano gratuito não tem preço.",
    );
  }

  try {
    const [created] = await getDb()
      .insert(planPrice)
      .values({ ...input, planId, providerPriceRef: input.providerPriceRef || null })
      .returning();
    return created as PlanPriceRow;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TenantRuleError(
        409,
        "PRICE_EXISTS",
        "Este plano já tem um preço para o provedor e o intervalo.",
      );
    }
    throw error;
  }
}

export async function updatePrice(
  planId: string,
  priceId: string,
  patch: Partial<Pick<PlanPriceInput, "amountCents" | "providerPriceRef" | "active">>,
) {
  const [updated] = await getDb()
    .update(planPrice)
    .set({
      ...patch,
      ...(patch.providerPriceRef !== undefined
        ? { providerPriceRef: patch.providerPriceRef || null }
        : {}),
    })
    .where(sql`${planPrice.id} = ${priceId} and ${planPrice.planId} = ${planId}`)
    .returning();

  if (!updated) throw notFound("Preço não encontrado.");

  return updated;
}

/**
 * Valida contra o banco o que o Zod não alcança: o plano existe e está ativo, e sem
 * trial (0 dias) o plano precisa ser gratuito, ou o tenant nasceria com plano pago sem
 * pagar.
 */
export async function updateSettings(
  patch: PlatformSettingsInput,
  updatedBy: string,
) {
  const merged = { ...(await loadSettings()), ...patch };

  if (merged.trialPlanId) {
    const [chosen] = await getDb()
      .select({ active: plan.active, isFree: plan.isFree })
      .from(plan)
      .where(eq(plan.id, merged.trialPlanId));

    if (!chosen?.active) {
      throw new TenantRuleError(
        400,
        "PLAN_NOT_FOUND",
        "Escolha um plano ativo para o período de teste.",
      );
    }

    if (merged.trialDays === 0 && !chosen.isFree) {
      throw new TenantRuleError(
        400,
        "TRIAL_PLAN_NOT_FREE",
        "Sem período de teste, o plano padrão precisa ser gratuito.",
      );
    }
  }

  await saveSettings(patch, updatedBy);

  return loadSettings();
}
