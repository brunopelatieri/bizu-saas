import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  type AdminPlan,
  useAdminMutation,
  useAdminQuery,
  useIsPlatformOwner,
} from "@/components/admin/admin-api";
import { Field } from "@/components/admin/field";
import { PageTitle, QueryState } from "@/components/admin/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatMoney,
  INTERVAL_LABELS,
} from "@/lib/billing/constants";
import { planSchema } from "@/lib/schemas/admin";
import { slugify } from "@/lib/schemas/tenant";

function priceSummary(plan: AdminPlan) {
  if (plan.isFree) return "Gratuito";

  const active = plan.prices.filter(({ active }) => active);
  if (active.length === 0) return "Sem preço";

  return active
    .map(
      ({ amountCents, interval, currency }) =>
        `${formatMoney(amountCents, currency)}/${INTERVAL_LABELS[interval]}`,
    )
    .join(" · ");
}

function NewPlanForm() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isFree, setIsFree] = useState(false);
  const create = useAdminMutation<{ plan: { id: string } }>("Plano criado.");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = planSchema.safeParse({ name, slug: slug || slugify(name), isFree });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    create.mutate(
      { path: "/api/admin/plans", method: "POST", body: parsed.data },
      { onSuccess: ({ plan }) => navigate(`/admin/planos/${plan.id}`) },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Novo plano</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <Field label="Nome">
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Business"
              />
            )}
          </Field>
          <Field label="Identificador">
            {(id) => (
              <Input
                id={id}
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder={slugify(name) || "business"}
              />
            )}
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={isFree}
              onChange={(event) => setIsFree(event.target.checked)}
            />
            Gratuito
          </label>
          <Button type="submit" disabled={create.isPending}>
            Criar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function AdminPlansPage() {
  const owner = useIsPlatformOwner();
  const query = useAdminQuery<{ plans: AdminPlan[] }>("/api/admin/plans");

  return (
    <div className="max-w-5xl space-y-6">
      <PageTitle
        title="Planos"
        description="Limites, features e preços. Plano inativo deixa de aparecer em /precos e de ser oferecido, mas segue valendo para quem já o usa."
      />

      {owner ? <NewPlanForm /> : null}

      <QueryState {...query}>
        {query.data ? (
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plano</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Organizações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.plans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell>
                        <Link
                          to={`/admin/planos/${plan.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {plan.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{plan.slug}</p>
                      </TableCell>
                      <TableCell>{priceSummary(plan)}</TableCell>
                      <TableCell>
                        <Badge variant={plan.active ? "default" : "outline"}>
                          {plan.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{plan.tenants}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </QueryState>
    </div>
  );
}
