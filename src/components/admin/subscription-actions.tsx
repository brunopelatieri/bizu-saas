import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import {
  type AdminPlan,
  useAdminMutation,
  useAdminQuery,
} from "@/components/admin/admin-api";
import { Field } from "@/components/admin/field";
import {
  ManualBillingCard,
  type ManualInvoice,
  type ManualPrice,
  type ManualSubscription,
} from "@/components/admin/manual-billing-card";
import { QueryState } from "@/components/admin/query-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SubscriptionStatus } from "@/db/schema/billing";
import {
  type AdminDateField,
  allowedTargets,
  EDITABLE_FIELD,
} from "@/lib/billing/admin-edit-rules";
import { type PROVIDER_LABELS, SUBSCRIPTION_STATUS_LABELS } from "@/lib/billing/constants";
import { updateSubscriptionSchema } from "@/lib/schemas/admin";

/** Linha de `GET /api/admin/subscriptions`. */
export type AdminSubscription = {
  id: string;
  tenantId: string;
  tenantName: string;
  status: SubscriptionStatus;
  provider: keyof typeof PROVIDER_LABELS | null;
  planId: string;
  planName: string;
  planIsFree: boolean;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  graceUntil: string | null;
  linked: boolean;
  billingMode: "manual" | "provider";
  alert: { kind: string; at: string; detail?: string } | null;
};

type Dialogs = "edit" | "plan" | "billing" | null;

type Props = {
  row: AdminSubscription;
  syncing: boolean;
  onSync: () => void;
  onCancel: () => void;
};

/**
 * Menu da linha em `/admin/assinaturas`: editar datas e status, trocar o plano, cobrança
 * manual (marcar pago ou não pago), buscar do provedor e cancelar. Só aparece para o
 * proprietário; a API confere de novo.
 */
export function SubscriptionActions({ row, syncing, onSync, onCancel }: Props) {
  const [open, setOpen] = useState<Dialogs>(null);
  const provider = row.billingMode === "provider";
  const editable =
    !row.planIsFree &&
    (EDITABLE_FIELD[row.status] !== null || allowedTargets(row.status, provider).length > 0);
  const close = () => setOpen(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="sm" variant="outline" aria-label={`Ações de ${row.tenantName}`}>
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-52">
          {editable ? (
            <DropdownMenuItem onClick={() => setOpen("edit")}>
              Editar datas e status
            </DropdownMenuItem>
          ) : null}
          {provider ? null : (
            <DropdownMenuItem onClick={() => setOpen("plan")}>Trocar plano</DropdownMenuItem>
          )}
          {!provider && !row.planIsFree ? (
            <DropdownMenuItem onClick={() => setOpen("billing")}>
              Marcar pago ou não pago
            </DropdownMenuItem>
          ) : null}
          {row.linked ? (
            <DropdownMenuItem disabled={syncing} onClick={onSync}>
              Buscar do provedor
            </DropdownMenuItem>
          ) : null}
          {row.status !== "canceled" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onCancel}>
                Cancelar assinatura
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {open === "edit" ? <EditDialog row={row} onClose={close} /> : null}
      {open === "plan" ? <PlanDialog row={row} onClose={close} /> : null}
      {open === "billing" ? <BillingDialog row={row} onClose={close} /> : null}
    </>
  );
}

const FIELD_LABELS: Record<AdminDateField, string> = {
  trialEndsAt: "Fim do teste",
  currentPeriodEnd: "Vencimento",
  graceUntil: "Fim da carência",
};

/** `YYYY-MM-DD` no fuso de quem edita, para o `<input type="date">`. */
function toDateInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A data vale até o fim do dia escolhido, no fuso de quem edita. */
const fromDateInput = (value: string) => new Date(`${value}T23:59:59`).toISOString();

const KEEP = "keep";

function EditDialog({ row, onClose }: { row: AdminSubscription; onClose: () => void }) {
  const provider = row.billingMode === "provider";
  const targets = allowedTargets(row.status, provider);
  const [target, setTarget] = useState<string>(KEEP);
  const to = (target === KEEP ? row.status : target) as SubscriptionStatus;
  const statusChanged = to !== row.status;
  // Com provedor, pausar e retomar não levam data: o ciclo é do provedor.
  const field = provider && statusChanged ? null : EDITABLE_FIELD[to];
  const initial = field ? toDateInput(row[field]) : "";
  const [date, setDate] = useState(initial);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useAdminMutation("Assinatura atualizada.");

  const statusItems = [
    { value: KEEP, label: `Manter: ${SUBSCRIPTION_STATUS_LABELS[row.status]}` },
    ...targets.map((status) => ({ value: status, label: SUBSCRIPTION_STATUS_LABELS[status] })),
  ];

  function chooseTarget(next: string) {
    setTarget(next);
    const nextTo = (next === KEEP ? row.status : next) as SubscriptionStatus;
    const nextField =
      provider && nextTo !== row.status ? null : EDITABLE_FIELD[nextTo];
    setDate(nextField ? toDateInput(row[nextField]) : "");
    setError(null);
  }

  function submit() {
    const payload: Record<string, string> = { reason };
    if (statusChanged) payload.status = to;
    // A data só vai se mudou, ou se o trial novo a exige.
    if (field && date && (date !== initial || to === "trialing")) {
      payload[field] = fromDateInput(date);
    }

    const parsed = updateSubscriptionSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setError(null);
    save.mutate(
      { path: `/api/admin/subscriptions/${row.id}`, method: "PATCH", body: payload },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar assinatura de {row.tenantName}</DialogTitle>
          <DialogDescription>
            {provider
              ? "Cobrada pelo provedor: a mudança vai primeiro a ele. O status vem dos pagamentos; aqui só pausa e retomada."
              : "Cobrança manual. O status muda junto o acesso do tenant e os avisos."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {targets.length > 0 ? (
            <Field label="Status">
              {(id) => (
                <Select
                  items={statusItems}
                  value={target}
                  onValueChange={(next) => next && chooseTarget(next)}
                >
                  <SelectTrigger id={id} className="w-full">
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
              )}
            </Field>
          ) : null}

          {field ? (
            <Field
              label={FIELD_LABELS[field]}
              hint={
                to === "active" && !statusChanged
                  ? "No passado, vence na próxima rodada do job."
                  : undefined
              }
            >
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              )}
            </Field>
          ) : null}

          {to === "active" && statusChanged && !provider ? (
            <p className="text-xs text-muted-foreground">
              Ativar não registra pagamento. Para isso, use &quot;Marcar pago ou não pago&quot;.
            </p>
          ) : null}

          <Field label="Motivo" hint="Obrigatório. Fica no histórico da assinatura.">
            {(id) => (
              <Textarea
                id={id}
                value={reason}
                maxLength={200}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button disabled={save.isPending} onClick={submit}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({ row, onClose }: { row: AdminSubscription; onClose: () => void }) {
  const query = useAdminQuery<{ plans: AdminPlan[] }>("/api/admin/plans");
  const [planId, setPlanId] = useState(row.planId);
  const change = useAdminMutation("Plano alterado.");
  const items = (query.data?.plans ?? [])
    .filter(({ active, id }) => active || id === row.planId)
    .map(({ id, name }) => ({ value: id, label: name }));

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trocar o plano de {row.tenantName}</DialogTitle>
          <DialogDescription>
            Faturas manuais em aberto são anuladas. Plano gratuito encerra o teste e devolve o
            acesso; saindo do gratuito, a cobrança manual vence agora.
          </DialogDescription>
        </DialogHeader>
        <QueryState {...query}>
          <Select items={items} value={planId} onValueChange={(next) => next && setPlanId(next)}>
            <SelectTrigger aria-label="Plano" className="w-full">
              <SelectValue placeholder="Escolha o plano" />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </QueryState>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            disabled={!planId || planId === row.planId || change.isPending}
            onClick={() =>
              change.mutate(
                {
                  path: `/api/admin/tenants/${row.tenantId}/plan`,
                  method: "PUT",
                  body: { planId },
                },
                { onSuccess: onClose },
              )
            }
          >
            Trocar plano
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TenantBilling = {
  subscription: ManualSubscription | null;
  plan: { isFree: boolean } | null;
  invoices: ManualInvoice[];
  manualPrices: ManualPrice[];
};

/** Reaproveita o cartão do detalhe da organização, com os dados dela. */
function BillingDialog({ row, onClose }: { row: AdminSubscription; onClose: () => void }) {
  const query = useAdminQuery<TenantBilling>(`/api/admin/tenants/${row.tenantId}`);
  const detail = query.data;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cobrança de {row.tenantName}</DialogTitle>
          <DialogDescription>
            Registre o pagamento recebido ou marque a falta dele.
          </DialogDescription>
        </DialogHeader>
        <QueryState {...query}>
          {detail?.subscription ? (
            <ManualBillingCard
              key={`${detail.subscription.id}:${detail.subscription.planId}`}
              subscription={detail.subscription}
              planIsFree={detail.plan?.isFree ?? false}
              invoices={detail.invoices}
              prices={detail.manualPrices}
              canWrite
            />
          ) : (
            <p className="text-sm text-muted-foreground">Sem assinatura.</p>
          )}
        </QueryState>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
