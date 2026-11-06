/**
 * Regras puras de trial: sem banco, testáveis. O acesso ao banco fica em
 * `subscription.ts`. Contrato em `docs/specs/saas-foundation/spec-billing.md`.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export type TrialPlan = { id: string; isFree: boolean };

export type InitialSubscription =
  | { planId: string; status: "trialing"; trialEndsAt: Date }
  | { planId: string; status: "active"; trialEndsAt: null };

/** Fim do trial: `days` dias depois de `from`. */
export function computeTrialEnd(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/**
 * Estado com que o tenant nasce, pela configuração vigente da plataforma.
 *
 * - Plano gratuito: `active` e sem fim, qualquer que seja `trialDays`.
 * - Plano pago com `trialDays > 0`: `trialing` até `from + trialDays`.
 * - Plano pago com `trialDays = 0` seria acesso pago de graça para sempre: não é
 *   aceito. Cai no plano gratuito `fallback`, ou em `null` (sem assinatura) se não houver.
 */
export function initialSubscription(input: {
  plan: TrialPlan | null;
  trialDays: number;
  fallback: TrialPlan | null;
  now: Date;
}): InitialSubscription | null {
  const { plan, trialDays, fallback, now } = input;

  if (plan?.isFree) {
    return { planId: plan.id, status: "active", trialEndsAt: null };
  }

  if (plan && trialDays > 0) {
    return {
      planId: plan.id,
      status: "trialing",
      trialEndsAt: computeTrialEnd(now, trialDays),
    };
  }

  if (fallback?.isFree) {
    return { planId: fallback.id, status: "active", trialEndsAt: null };
  }

  return null;
}

/**
 * Avisos de fim de trial. `t3` e `t1` são os dias que faltam; `t0` é o dia em que o
 * trial acaba (a carência começa); `expired` é a passagem para `read_only`, depois da
 * carência.
 */
export const trialNotices = ["t3", "t1", "t0", "expired"] as const;
export type TrialNotice = (typeof trialNotices)[number];

/**
 * O aviso devido agora, ou `null`. Só o mais urgente é devolvido: se o job ficou
 * parado e o trial já está a 1 dia do fim, o `t3` não é mais enviado.
 */
export function dueTrialNotice(input: {
  now: Date;
  trialEndsAt: Date;
  graceDays: number;
}): TrialNotice | null {
  const { now, trialEndsAt, graceDays } = input;
  const left = trialEndsAt.getTime() - now.getTime();
  const expiresAt = trialEndsAt.getTime() + graceDays * DAY_MS;

  if (now.getTime() >= expiresAt) return "expired";
  if (left <= 0) return "t0";
  if (left <= DAY_MS) return "t1";
  if (left <= 3 * DAY_MS) return "t3";

  return null;
}

/** Dias inteiros que faltam (arredondado para cima); 0 se já acabou. */
export function daysLeft(now: Date, trialEndsAt: Date): number {
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS));
}
