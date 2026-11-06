import { CheckCircle2, Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { PageTitle, QueryState } from "@/components/admin/query-state";
import {
  type SubscriptionResponse,
  useSubscription,
} from "@/components/app/billing/billing-api";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";

const POLL_MS = 3_000;
const GIVE_UP_MS = 2 * 60_000;

/** Pago é o que o banco diz: a assinatura ativa no provedor, não um parâmetro da URL. */
const confirmed = (data: SubscriptionResponse | undefined) =>
  data?.subscription?.paid === true &&
  ["active", "trialing"].includes(data.subscription.status);

/**
 * Volta do checkout hospedado. Quem chega aqui pode ter pago, desistido ou digitado a URL:
 * a página ignora a query string e espera o webhook aparecer no estado local.
 */
export function CheckoutReturnPage() {
  const startedAt = useRef(Date.now());
  const [gaveUp, setGaveUp] = useState(false);
  const { refresh } = useAuth();
  const query = useSubscription((data) =>
    confirmed(data) || Date.now() - startedAt.current > GIVE_UP_MS ? false : POLL_MS,
  );
  const done = confirmed(query.data);

  useEffect(() => {
    if (done) void refresh();
  }, [done, refresh]);

  useEffect(() => {
    const timer = setTimeout(() => setGaveUp(true), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="max-w-xl space-y-6">
      <PageTitle title="Pagamento" />

      <QueryState {...query}>
        <Card>
          <CardContent className="flex items-start gap-3 pt-6 text-sm text-foreground">
            {done ? (
              <>
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                <p>
                  Assinatura confirmada
                  {query.data?.subscription
                    ? ` no plano ${query.data.subscription.plan.name}`
                    : ""}
                  .
                </p>
              </>
            ) : (
              <>
                <Clock className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <p>
                  {gaveUp
                    ? "Ainda não recebemos a confirmação. Boleto pode levar até três dias úteis; assim que compensar, a assinatura é ativada e avisamos por e-mail."
                    : "Aguardando a confirmação do pagamento. Isto costuma levar poucos segundos."}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </QueryState>

      <Link
        to="/app/assinatura"
        className="text-sm font-medium text-primary hover:underline"
      >
        Voltar para a assinatura
      </Link>
    </div>
  );
}
