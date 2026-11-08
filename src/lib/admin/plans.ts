import { and, asc, count, eq, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { isForeignKeyViolation, isUniqueViolation } from "@/db/errors";
import { type Tx, withPlatformScope } from "@/db/rls";
import { organization, plan, planPrice, subscription } from "@/db/schema";
import { planOrganizations } from "@/lib/admin/org-links";
import { MANUAL_PROVIDER } from "@/lib/billing/constants";
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

const SLUG_TAKEN = new TenantRuleError(
  409,
  "SLUG_TAKEN",
  "Já existe um plano com este identificador.",
);

const FREE_PLAN_NO_PRICE = new TenantRuleError(
  409,
  "FREE_PLAN_NO_PRICE",
  "Plano gratuito não tem preço.",
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
  const { usage, links } = await withPlatformScope("admin: uso dos planos", async (tx) => ({
    usage: await tx
      .select({ planId: subscription.planId, tenants: sql<number>`count(*)::int` })
      .from(subscription)
      .groupBy(subscription.planId),
    // admin-crud A: nome das organizações de cada plano (as 3 primeiras e o resto).
    links: await planOrganizations(
      tx,
      plans.map(({ id }) => id),
    ),
  }));

  return plans.map((row) => ({
    ...row,
    prices: prices.filter(({ planId }) => planId === row.id),
    tenants: usage.find(({ planId }) => planId === row.id)?.tenants ?? 0,
    organizations: links.get(row.id)?.organizations ?? [],
    more: links.get(row.id)?.more ?? 0,
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

  // Plano gratuito não tem preço ativo: marcá-lo assim geraria um plano que cobra e é de
  // graça ao mesmo tempo. Preço não se apaga: desativado, deixa de contar.
  if (patch.isFree) {
    const [priced] = await getDb()
      .select({ id: planPrice.id })
      .from(planPrice)
      .where(and(eq(planPrice.planId, planId), eq(planPrice.active, true)))
      .limit(1);

    if (priced) {
      throw new TenantRuleError(
        409,
        "PLAN_HAS_PRICES",
        "Desative os preços antes de marcar o plano como gratuito.",
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

  if (owner.isFree) throw FREE_PLAN_NO_PRICE;

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
  if (patch.active && (await getPlan(planId)).isFree) throw FREE_PLAN_NO_PRICE;

  const ref =
    patch.providerPriceRef !== undefined
      ? // Preço manual não tem par no provedor: a referência nunca é gravada.
        sql`case when ${planPrice.provider} = ${MANUAL_PROVIDER} then null else ${patch.providerPriceRef || null} end`
      : undefined;
  const [updated] = await getDb()
    .update(planPrice)
    .set({ ...patch, ...(ref ? { providerPriceRef: ref } : {}) })
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

  // O plano escolhido fica travado (`FOR SHARE`) até a configuração gravar: `deletePlan` o
  // trava com `FOR UPDATE` antes de ler `trial_plan_id`, então um espera o outro e o trial
  // nunca aponta para um plano apagado.
  await getDb().transaction(async (tx) => {
    if (merged.trialPlanId) {
      const [chosen] = await tx
        .select({ active: plan.active, isFree: plan.isFree })
        .from(plan)
        .where(eq(plan.id, merged.trialPlanId))
        .for("share");

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

    await saveSettings(patch, updatedBy, tx);
  });

  return loadSettings();
}

// admin-crud A: excluir plano e preço ------------------------------------------------------

type TenantRef = { id: string; name: string };

const PLAN_IN_USE_MESSAGE =
  "Este plano está em uso por organizações. Arquive-o para tirá-lo da oferta.";

/** Organizações que citam o plano como atual ou como troca pendente (qualquer status). */
function tenantsUsingPlan(tx: Tx, planId: string): Promise<TenantRef[]> {
  return tx
    .selectDistinct({ id: organization.id, name: organization.name })
    .from(subscription)
    .innerJoin(organization, eq(subscription.tenantId, organization.id))
    .where(or(eq(subscription.planId, planId), eq(subscription.pendingPlanId, planId)))
    .orderBy(organization.name)
    .limit(20);
}

/**
 * Exclusão física, só de plano que nunca chegou a um tenant: o histórico precisa dele
 * (`subscription.plan_id` é `restrict`). O caminho normal é arquivar. Os preços saem junto
 * (`cascade`); o que existia no provedor não é apagado, e as referências voltam para a tela
 * avisar.
 */
export async function deletePlan(planId: string) {
  try {
    return await withPlatformScope("admin: excluir plano", async (tx) => {
      const [row] = await tx.select().from(plan).where(eq(plan.id, planId)).for("update");
      if (!row) throw notFound("Plano não encontrado.");

      const using = await tenantsUsingPlan(tx, planId);
      if (using.length > 0) {
        throw new TenantRuleError(409, "PLAN_IN_USE", PLAN_IN_USE_MESSAGE, {
          tenants: using,
        });
      }

      // Lida depois do `FOR UPDATE`: quem escolhe o plano do trial o trava com `FOR SHARE`
      // na mesma transação em que grava (`updateSettings`), então aqui já vale a escolha.
      const settings = await loadSettings();
      if (settings.trialPlanId === planId) {
        throw new TenantRuleError(
          409,
          "PLAN_IS_TRIAL_DEFAULT",
          "Este é o plano padrão do período de teste. Escolha outro em Configurações antes.",
        );
      }

      if (!settings.trialPlanId && row.isFree && row.active) {
        const [others] = await tx
          .select({ total: count() })
          .from(plan)
          .where(and(eq(plan.isFree, true), eq(plan.active, true), ne(plan.id, planId)));

        if (!others?.total) {
          throw new TenantRuleError(
            409,
            "LAST_FREE_PLAN",
            "Este é o único plano gratuito ativo: novas organizações dependem dele. Crie outro antes.",
          );
        }
      }

      const prices = await tx.select().from(planPrice).where(eq(planPrice.planId, planId));
      await tx.delete(plan).where(eq(plan.id, planId));

      return {
        plan: row,
        prices: prices.length,
        providerRefs: prices.flatMap(({ provider, providerPriceRef }) =>
          providerPriceRef ? [{ provider, ref: providerPriceRef }] : [],
        ),
      };
    });
  } catch (error) {
    // Assinatura criada entre a checagem e o `DELETE`: o banco barra do mesmo jeito.
    if (isForeignKeyViolation(error)) {
      throw new TenantRuleError(409, "PLAN_IN_USE", PLAN_IN_USE_MESSAGE);
    }

    throw error;
  }
}

/** Preço fora de uso (nem assinatura atual, nem troca pendente). Em uso, o caminho é desativar. */
export async function deletePrice(planId: string, priceId: string) {
  return withPlatformScope("admin: excluir preço", async (tx) => {
    const [price] = await tx
      .select()
      .from(planPrice)
      .where(and(eq(planPrice.id, priceId), eq(planPrice.planId, planId)))
      .for("update");

    if (!price) throw notFound("Preço não encontrado.");

    const using = await tx
      .selectDistinct({ id: organization.id, name: organization.name })
      .from(subscription)
      .innerJoin(organization, eq(subscription.tenantId, organization.id))
      .where(
        or(
          eq(subscription.planPriceId, priceId),
          sql`${subscription.metadata}->>'pendingPlanPriceId' = ${priceId}`,
        ),
      )
      .orderBy(organization.name)
      .limit(20);

    if (using.length > 0) {
      throw new TenantRuleError(
        409,
        "PRICE_IN_USE",
        "Este preço está em uso por assinaturas. Desative-o em vez de excluir.",
        { tenants: using },
      );
    }

    await tx.delete(planPrice).where(eq(planPrice.id, priceId));

    return price;
  });
}
