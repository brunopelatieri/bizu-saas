import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  type Page,
  useAdminMutation,
  useAdminQuery,
  useIsPlatformOwner,
} from "@/components/admin/admin-api";
import { Pager } from "@/components/admin/pager";
import { PageTitle, QueryState } from "@/components/admin/query-state";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SubscriptionStatus } from "@/db/schema/billing";
import {
  PROVIDER_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  subscriptionStatusList,
} from "@/lib/billing/constants";

type AdminSubscription = {
  id: string;
  tenantId: string;
  tenantName: string;
  status: SubscriptionStatus;
  provider: keyof typeof PROVIDER_LABELS | null;
  planName: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  graceUntil: string | null;
  linked: boolean;
  alert: { kind: string; at: string; detail?: string } | null;
};

const ALERT_LABELS: Record<string, string> = {
  divergence: "Divergência com o provedor",
  duplicate_subscription: "Assinatura em duplicidade",
  chargeback: "Contestação aberta",
};

const ALL = "all";
const statusItems = [
  { value: ALL, label: "Todos os estados" },
  ...subscriptionStatusList.map((status) => ({
    value: status,
    label: SUBSCRIPTION_STATUS_LABELS[status],
  })),
];

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "–";

export function AdminSubscriptionsPage() {
  const owner = useIsPlatformOwner();
  const [params, setParams] = useSearchParams();
  const [canceling, setCanceling] = useState<AdminSubscription | null>(null);
  const status = params.get("status") ?? ALL;
  const page = Number(params.get("page") ?? "1") || 1;
  const query = useAdminQuery<Page<AdminSubscription>>("/api/admin/subscriptions", {
    status: status === ALL ? undefined : status,
    page,
  });
  const sync = useAdminMutation("Assinatura conferida com o provedor.");
  const cancel = useAdminMutation("Assinatura cancelada.");

  function update(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged, { replace: true });
  }

  return (
    <div className="max-w-6xl space-y-6">
      <PageTitle
        title="Assinaturas"
        description="Situação de cada tenant, com alertas da reconciliação."
      />

      <Select
        items={statusItems}
        value={status}
        onValueChange={(next) =>
          update({ status: next && next !== ALL ? next : null, page: null })
        }
      >
        <SelectTrigger aria-label="Estado" className="w-full sm:w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statusItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <QueryState {...query}>
        {query.data ? (
          <Card>
            <CardContent className="pt-6">
              {query.data.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma assinatura encontrada.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organização</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Provedor</TableHead>
                      <TableHead>Fim do período</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {query.data.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Link
                            to={`/admin/tenants/${row.tenantId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {row.tenantName}
                          </Link>
                          {row.alert ? (
                            <p className="text-xs text-destructive">
                              {ALERT_LABELS[row.alert.kind] ?? row.alert.kind}
                              {row.alert.detail ? `: ${row.alert.detail}` : ""}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row.status === "past_due" || row.status === "unpaid"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {SUBSCRIPTION_STATUS_LABELS[row.status]}
                          </Badge>
                          {row.cancelAtPeriodEnd ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Cancela no fim do período
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>{row.planName}</TableCell>
                        <TableCell>
                          {row.linked && row.provider
                            ? PROVIDER_LABELS[row.provider]
                            : "Manual"}
                        </TableCell>
                        <TableCell>{formatDate(row.currentPeriodEnd)}</TableCell>
                        <TableCell>
                          {owner ? (
                            <div className="flex justify-end gap-2">
                              {row.linked ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={sync.isPending}
                                  onClick={() =>
                                    sync.mutate({
                                      path: `/api/admin/subscriptions/${row.id}/sync`,
                                      method: "POST",
                                    })
                                  }
                                >
                                  Buscar do provedor
                                </Button>
                              ) : null}
                              {row.status !== "canceled" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setCanceling(row)}
                                >
                                  Cancelar
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <Pager
                page={page}
                total={query.data.total}
                pageSize={query.data.pageSize}
                onPage={(next) => update({ page: next > 1 ? String(next) : null })}
              />
            </CardContent>
          </Card>
        ) : null}
      </QueryState>

      <ConfirmDialog
        open={canceling !== null}
        title="Cancelar agora?"
        description={`A assinatura de ${canceling?.tenantName ?? ""} termina já, no provedor e aqui, sem estorno. A organização fica em modo somente leitura.`}
        confirmLabel="Cancelar assinatura"
        pending={cancel.isPending}
        onCancel={() => setCanceling(null)}
        onConfirm={() =>
          canceling &&
          cancel.mutate(
            {
              path: `/api/admin/subscriptions/${canceling.id}/cancel`,
              method: "POST",
            },
            { onSettled: () => setCanceling(null) },
          )
        }
      />
    </div>
  );
}
