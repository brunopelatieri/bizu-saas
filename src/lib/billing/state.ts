import type { SubscriptionStatus } from "@/db/schema/billing";
import type { TenantAccessMode, TenantStatus } from "@/db/schema/tenant";

/** Estado de cobrança do tenant, como a interface e `/api/me` o conhecem. */
export const billingStates = [
  "trialing",
  "active",
  "past_due",
  "read_only",
  "locked",
] as const;
export type BillingState = (typeof billingStates)[number];

/**
 * `locked`: suspenso ou fechado, nada abre. `read_only`: lê, mas não grava.
 * `trialing`: trial em curso. `past_due`: pagamento falhou, ainda na carência, com acesso
 * total. `active`: o resto (gratuito sem fim ou pago em dia).
 * Sem assinatura (tenant anterior à fase 5) o tenant é `active`, sem limites.
 */
export function billingState(input: {
  status: TenantStatus;
  accessMode: TenantAccessMode;
  subscriptionStatus: SubscriptionStatus | null;
}): BillingState {
  if (input.status !== "active" || input.accessMode === "locked") return "locked";
  if (input.accessMode === "read_only") return "read_only";
  if (input.subscriptionStatus === "trialing") return "trialing";
  if (input.subscriptionStatus === "past_due") return "past_due";

  return "active";
}
