import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  type AdminTenant,
  type Page,
  useAdminQuery,
} from "@/components/admin/admin-api";
import {
  BILLING_STATE_LABELS,
  BillingStateBadge,
} from "@/components/admin/billing-state-badge";
import { Pager } from "@/components/admin/pager";
import { PageTitle, QueryState } from "@/components/admin/query-state";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { billingStates } from "@/lib/billing/state";

const ALL = "all";
const stateItems = [
  { value: ALL, label: "Todos os estados" },
  ...billingStates.map((state) => ({
    value: state,
    label: BILLING_STATE_LABELS[state],
  })),
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR");

export function AdminTenantsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const status = params.get("status") ?? ALL;
  const page = Number(params.get("page") ?? "1") || 1;
  const q = params.get("q") ?? "";

  const query = useAdminQuery<Page<AdminTenant>>("/api/admin/tenants", {
    q,
    status: status === ALL ? undefined : status,
    page,
  });

  function update(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged, { replace: true });
  }

  return (
    <div className="max-w-5xl space-y-6">
      <PageTitle
        title="Organizações"
        description="Todos os tenants da plataforma."
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <form
          className="flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: search.trim() || null, page: null });
          }}
        >
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou identificador"
            aria-label="Buscar organização"
            maxLength={100}
          />
        </form>
        <Select
          items={stateItems}
          value={status}
          onValueChange={(next) =>
            update({ status: next && next !== ALL ? next : null, page: null })
          }
        >
          <SelectTrigger aria-label="Estado" className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stateItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <QueryState {...query}>
        {query.data ? (
          <Card>
            <CardContent className="pt-6">
              {query.data.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma organização encontrada.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organização</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead className="text-right">Membros</TableHead>
                      <TableHead>Criada em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {query.data.items.map((tenant) => (
                      <TableRow key={tenant.id}>
                        <TableCell>
                          <Link
                            to={`/admin/tenants/${tenant.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {tenant.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {tenant.slug}
                          </p>
                        </TableCell>
                        <TableCell>
                          <BillingStateBadge state={tenant.state} />
                        </TableCell>
                        <TableCell>{tenant.planName ?? "–"}</TableCell>
                        <TableCell className="text-right">
                          {tenant.members}
                        </TableCell>
                        <TableCell>{formatDate(tenant.createdAt)}</TableCell>
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
    </div>
  );
}
