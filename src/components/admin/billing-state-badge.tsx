import { Badge } from "@/components/ui/badge";
import type { BillingState } from "@/lib/billing/state";

export const BILLING_STATE_LABELS: Record<BillingState, string> = {
  trialing: "Em teste",
  active: "Ativa",
  read_only: "Somente leitura",
  locked: "Bloqueada",
};

const VARIANTS: Record<
  BillingState,
  "default" | "secondary" | "destructive" | "outline"
> = {
  trialing: "secondary",
  active: "default",
  read_only: "outline",
  locked: "destructive",
};

export function BillingStateBadge({ state }: { state: BillingState }) {
  return <Badge variant={VARIANTS[state]}>{BILLING_STATE_LABELS[state]}</Badge>;
}
