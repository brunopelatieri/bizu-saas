import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import {
  type AdminPlan,
  type AdminPlanPrice,
  useAdminMutation,
  useAdminQuery,
  useIsPlatformOwner,
} from "@/components/admin/admin-api";
import { Field } from "@/components/admin/field";
import { OrgList } from "@/components/admin/org-list";
import { PageTitle, QueryState } from "@/components/admin/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  formatMoney,
  INTERVAL_LABELS,
  LIMIT_LABELS,
  limitMetrics,
  PROVIDER_LABELS,
  billingProviderIds,
  priceIntervals,
} from "@/lib/billing/constants";
import { planPriceSchema, updatePlanSchema } from "@/lib/schemas/admin";

const providerItems = billingProviderIds.map((value) => ({
  value,
  label: PROVIDER_LABELS[value],
}));
const intervalItems = priceIntervals.map((value) => ({
  value,
  label: `Por ${INTERVAL_LABELS[value]}`,
}));

/** "99,90" ou "99.90" em centavos; `null` se não for um valor. */
function toCents(text: string) {
  const value = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

function PlanForm({ plan, readOnly }: { plan: AdminPlan; readOnly: boolean }) {
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description ?? "");
  const [features, setFeatures] = useState(plan.features.join(", "));
  const [limits, setLimits] = useState<Record<string, string>>(
    Object.fromEntries(
      limitMetrics.map((metric) => [metric, plan.limits[metric]?.toString() ?? ""]),
    ),
  );
  const [sortOrder, setSortOrder] = useState(String(plan.sortOrder));
  const [active, setActive] = useState(plan.active);
  const [isFree, setIsFree] = useState(plan.isFree);
  const save = useAdminMutation("Plano salvo.");

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = updatePlanSchema.safeParse({
      name,
      description: description.trim() || null,
      features: features
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      // Campo vazio = ilimitado (`null`).
      limits: Object.fromEntries(
        limitMetrics.map((metric) => [
          metric,
          limits[metric]?.trim() ? Number(limits[metric]) : null,
        ]),
      ),
      sortOrder: Number(sortOrder),
      active,
      isFree,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    save.mutate({
      path: `/api/admin/plans/${plan.id}`,
      method: "PATCH",
      body: parsed.data,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Plano</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome">
              {(id) => (
                <Input id={id} value={name} onChange={(e) => setName(e.target.value)} readOnly={readOnly} />
              )}
            </Field>
            <Field label="Ordem na lista">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  readOnly={readOnly}
                />
              )}
            </Field>
          </div>
          <Field label="Descrição">
            {(id) => (
              <Input
                id={id}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                readOnly={readOnly}
                maxLength={280}
              />
            )}
          </Field>

          <fieldset className="grid gap-3 sm:grid-cols-4">
            <legend className="mb-1 text-sm font-medium">
              Limites{" "}
              <span className="font-normal text-muted-foreground">
                (vazio = ilimitado; organizações vazio = 1)
              </span>
            </legend>
            {limitMetrics.map((metric) => (
              <Field key={metric} label={LIMIT_LABELS[metric]} className="first-letter:uppercase">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    // Organizações por dono: vazio vale 1, nunca ilimitado (`organizations.ts`).
                    placeholder={metric === "organizations" ? "1" : undefined}
                    value={limits[metric] ?? ""}
                    onChange={(e) => setLimits({ ...limits, [metric]: e.target.value })}
                    readOnly={readOnly}
                  />
                )}
              </Field>
            ))}
          </fieldset>

          <Field label="Features (separadas por vírgula)">
            {(id) => (
              <Input
                id={id}
                value={features}
                onChange={(e) => setFeatures(e.target.value)}
                placeholder="audit_export, custom_roles"
                readOnly={readOnly}
              />
            )}
          </Field>

          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={active}
                disabled={readOnly}
                onChange={(e) => setActive(e.target.checked)}
              />
              Ativo
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isFree}
                disabled={readOnly}
                onChange={(e) => setIsFree(e.target.checked)}
              />
              Gratuito (sem preço, sem provedor)
            </label>
          </div>

          {readOnly ? null : (
            <Button type="submit" className="justify-self-start" disabled={save.isPending}>
              Salvar
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function PriceRow({
  planId,
  price,
  readOnly,
}: {
  planId: string;
  price: AdminPlanPrice;
  readOnly: boolean;
}) {
  const [ref, setRef] = useState(price.providerPriceRef ?? "");
  const [amount, setAmount] = useState((price.amountCents / 100).toFixed(2).replace(".", ","));
  const save = useAdminMutation("Preço salvo.");
  const path = `/api/admin/plans/${planId}/prices/${price.id}`;

  function submit() {
    const cents = toCents(amount);
    if (!cents) {
      toast.error("Informe um valor maior que zero.");
      return;
    }

    save.mutate({
      path,
      method: "PATCH",
      body: { amountCents: cents, providerPriceRef: ref.trim() || null },
    });
  }

  return (
    <TableRow>
      <TableCell>{PROVIDER_LABELS[price.provider as keyof typeof PROVIDER_LABELS] ?? price.provider}</TableCell>
      <TableCell>Por {INTERVAL_LABELS[price.interval]}</TableCell>
      <TableCell>
        <Input
          aria-label="Valor"
          className="w-28"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          readOnly={readOnly}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {formatMoney(price.amountCents, price.currency)}
        </p>
      </TableCell>
      <TableCell>
        {price.provider === "manual" ? (
          <span className="text-xs text-muted-foreground">
            Cobrança manual: marcada em Organizações.
          </span>
        ) : (
          <Input
            aria-label="Referência no provedor"
            placeholder="price_..."
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            readOnly={readOnly}
          />
        )}
      </TableCell>
      <TableCell className="space-x-2 text-right">
        {readOnly ? null : (
          <>
            <Button size="sm" variant="outline" disabled={save.isPending} onClick={submit}>
              Salvar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate({ path, method: "PATCH", body: { active: !price.active } })}
            >
              {price.active ? "Desativar" : "Ativar"}
            </Button>
          </>
        )}
      </TableCell>
    </TableRow>
  );
}

function NewPriceForm({ planId }: { planId: string }) {
  const [provider, setProvider] = useState<string>(billingProviderIds[0]);
  const [interval, setInterval] = useState<string>("month");
  const [amount, setAmount] = useState("");
  const create = useAdminMutation("Preço criado.");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const cents = toCents(amount);
    const parsed = planPriceSchema.safeParse({ provider, interval, amountCents: cents ?? 0 });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    create.mutate(
      { path: `/api/admin/plans/${planId}/prices`, method: "POST", body: parsed.data },
      { onSuccess: () => setAmount("") },
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <Select items={providerItems} value={provider} onValueChange={(v) => v && setProvider(v)}>
        <SelectTrigger aria-label="Provedor">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providerItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select items={intervalItems} value={interval} onValueChange={(v) => v && setInterval(v)}>
        <SelectTrigger aria-label="Intervalo">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {intervalItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        aria-label="Valor em reais"
        placeholder="99,00"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Button type="submit" disabled={create.isPending}>
        Adicionar preço
      </Button>
    </form>
  );
}

export function AdminPlanDetailPage() {
  const { id = "" } = useParams();
  const owner = useIsPlatformOwner();
  const query = useAdminQuery<{ plans: AdminPlan[] }>("/api/admin/plans");
  const plan = query.data?.plans.find((item) => item.id === id);

  return (
    <div className="max-w-4xl space-y-6">
      <Link to="/admin/planos" className="text-sm text-muted-foreground hover:text-foreground">
        ← Planos
      </Link>

      <QueryState {...query}>
        {plan ? (
          <>
            <PageTitle
              title={plan.name}
              description={`${plan.slug} · ${plan.tenants} ${plan.tenants === 1 ? "organização" : "organizações"}`}
            />
            {plan.tenants > 0 ? (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Organizações:</span>
                <OrgList
                  organizations={plan.organizations}
                  more={plan.more}
                  moreHref={`/admin/tenants?plan=${plan.id}`}
                />
              </p>
            ) : null}
            <PlanForm key={plan.id + plan.name} plan={plan} readOnly={!owner} />

            {plan.isFree ? null : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Preços</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Um preço por provedor e intervalo. A referência é o id do preço no provedor
                    (Stripe <code>price_...</code>); fica vazia até a cobrança ser ligada.
                  </p>
                  {plan.prices.length === 0 ? (
                    <p className="text-sm">Nenhum preço ainda.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Provedor</TableHead>
                          <TableHead>Intervalo</TableHead>
                          <TableHead>Valor (R$)</TableHead>
                          <TableHead>Referência</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {plan.prices.map((price) => (
                          <PriceRow
                            key={price.id + String(price.active) + price.amountCents}
                            planId={plan.id}
                            price={price}
                            readOnly={!owner}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {owner ? <NewPriceForm planId={plan.id} /> : null}
                </CardContent>
              </Card>
            )}
          </>
        ) : query.data ? (
          <p className="text-sm text-muted-foreground">Plano não encontrado.</p>
        ) : null}
      </QueryState>
    </div>
  );
}
