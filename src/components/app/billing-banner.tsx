import { AlertTriangle, Clock } from "lucide-react";
import { Link } from "react-router";
import { useCan } from "@/components/auth/can";
import { useAuth } from "@/providers/auth-provider";

/**
 * Aviso de trial e de somente leitura no topo de `/app`. Só informa: quem bloqueia a
 * escrita é `requireTenant`. O link leva à assinatura para quem pode vê-la.
 */
export function BillingBanner() {
  const { billing } = useAuth();
  const can = useCan();

  if (!billing || (billing.state !== "trialing" && billing.state !== "read_only")) {
    return null;
  }

  const action = can("billing", "read") ? (
    <Link to="/app/assinatura" className="font-medium underline underline-offset-4">
      Escolher um plano
    </Link>
  ) : (
    <span>Peça ao proprietário da organização para escolher um plano.</span>
  );

  if (billing.state === "read_only") {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          Esta organização está em modo somente leitura: você vê tudo, mas não
          pode alterar nada. {action}
        </p>
      </div>
    );
  }

  const days = billing.trialDaysLeft ?? 0;
  const left =
    days <= 0 ? "termina hoje" : days === 1 ? "termina amanhã" : `termina em ${days} dias`;

  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-primary/20 bg-primary/10 px-4 py-3 text-sm text-foreground"
    >
      <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
      <p>
        Período de teste{billing.plan ? ` do plano ${billing.plan.name}` : ""}{" "}
        {left}. {action}
      </p>
    </div>
  );
}
