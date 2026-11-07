import { Link } from "react-router";
import {
  type BillingState,
  billingStates,
} from "@/lib/billing/state";
import {
  BILLING_STATE_LABELS,
} from "@/components/admin/billing-state-badge";
import { useAdminQuery } from "@/components/admin/admin-api";
import { PageTitle, QueryState } from "@/components/admin/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Overview = {
  tenants: Record<BillingState, number>;
  tenantsTotal: number;
  customers: number;
  users: { total: number; banned: number };
  trialsExpiringSoon: number;
  activePlans: number;
  failedWebhooks: number;
  /** `null`: a fila não respondeu. */
  deadJobs: number | null;
  /** Processos consumindo a fila. `null`: a fila não respondeu. */
  jobConsumers: { inline: number; worker: number } | null;
};

function jobConsumersHint(consumers: Overview["jobConsumers"]) {
  if (!consumers) return "A fila não respondeu";
  if (consumers.inline > 0 && consumers.worker > 0) {
    return "App e worker na mesma fila: defina APP_JOBS_MODE=off no app";
  }
  if (consumers.inline + consumers.worker === 0) {
    return "Ninguém processa a fila: confira JOBS_MODE e o worker";
  }
  return "Processos ativos, por modo";
}

function Stat({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: number | string;
  hint?: string;
  to?: string;
}) {
  const card = (
    <Card className={to ? "transition-shadow hover:shadow-md" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold text-foreground">{value}</p>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );

  return to ? <Link to={to}>{card}</Link> : card;
}

export function AdminOverviewPage() {
  const query = useAdminQuery<Overview>("/api/admin/overview");
  const data = query.data;

  return (
    <div className="max-w-5xl space-y-6">
      <PageTitle
        title="Visão geral"
        description="Organizações por estado, usuários e planos."
      />

      <QueryState {...query}>
        {data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Organizações"
                value={data.tenantsTotal}
                to="/admin/tenants"
              />
              {billingStates.map((state) => (
                <Stat
                  key={state}
                  label={BILLING_STATE_LABELS[state]}
                  value={data.tenants[state]}
                  to={`/admin/tenants?status=${state}`}
                />
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Stat
                label="Testes acabando"
                value={data.trialsExpiringSoon}
                hint="Terminam nos próximos 7 dias"
              />
              <Stat
                label="Usuários"
                value={data.users.total}
                hint={`${data.users.banned} banidos`}
                to="/admin/usuarios"
              />
              <Stat
                label="Clientes"
                value={data.customers}
                hint="Clientes e leads de todos os tenants"
                to="/admin/usuarios?scope=portal"
              />
              <Stat
                label="Planos ativos"
                value={data.activePlans}
                to="/admin/planos"
              />
              <Stat
                label="Webhooks com falha"
                value={data.failedWebhooks}
                hint="Eventos de pagamento a reprocessar"
                to="/admin/webhooks?status=failed"
              />
              <Stat
                label="Jobs mortos"
                value={data.deadJobs ?? "—"}
                hint={
                  data.deadJobs === null
                    ? "A fila não respondeu"
                    : "Esgotaram as tentativas (filas .dead)"
                }
              />
              <Stat
                label="Consumidores da fila"
                value={
                  data.jobConsumers
                    ? `${data.jobConsumers.inline} inline, ${data.jobConsumers.worker} worker`
                    : "—"
                }
                hint={jobConsumersHint(data.jobConsumers)}
              />
            </div>
          </>
        ) : null}
      </QueryState>
    </div>
  );
}
