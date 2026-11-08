import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { plan, planPrice } from "@/db/schema";
import { MANUAL_PROVIDER, type PriceInterval } from "@/lib/billing/constants";
import { getProviders, isPriceUsable } from "@/lib/payments/registry";

/** O que `/precos` mostra de um plano. Nada de ids de provedor nem de uso interno. */
export type PublicPlan = {
  slug: string;
  name: string;
  description: string | null;
  isFree: boolean;
  limits: Record<string, number>;
  features: string[];
  /** Menor valor que dá para comprar, por intervalo, em centavos. */
  prices: Partial<Record<PriceInterval, { amountCents: number; currency: string }>>;
};

/**
 * Planos ativos para a página pública. `plan` e `plan_price` são tabelas da plataforma
 * (sem RLS e sem dado pessoal): o loader lê direto, sem volta HTTP. Entram os preços
 * compráveis, como no checkout; sem nenhum provedor ativo (cobrança manual), os preços
 * manuais. Plano sem nenhum dos dois fica "Preço em breve".
 */
export async function listPublicPlans(): Promise<PublicPlan[]> {
  const db = getDb();
  const plans = await db
    .select()
    .from(plan)
    .where(eq(plan.active, true))
    .orderBy(asc(plan.sortOrder), asc(plan.name));
  const prices = await db
    .select()
    .from(planPrice)
    .where(eq(planPrice.active, true));

  const manualOnly = getProviders().length === 0;

  return plans.map((row) => {
    const own = prices.filter(
      (price) =>
        price.planId === row.id &&
        (manualOnly ? price.provider === MANUAL_PROVIDER : isPriceUsable(price)),
    );
    const cheapest: PublicPlan["prices"] = {};

    for (const price of own) {
      const current = cheapest[price.interval];
      if (!current || price.amountCents < current.amountCents) {
        cheapest[price.interval] = {
          amountCents: price.amountCents,
          currency: price.currency,
        };
      }
    }

    return {
      slug: row.slug,
      name: row.name,
      description: row.description,
      isFree: row.isFree,
      limits: Object.fromEntries(
        Object.entries(row.limits).flatMap(([metric, value]) =>
          typeof value === "number" ? [[metric, value]] : [],
        ),
      ),
      features: row.features,
      prices: row.isFree ? {} : cheapest,
    };
  });
}
