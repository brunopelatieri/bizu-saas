import { useState } from "react";
import { useAdminMutation } from "@/components/admin/admin-api";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
  PROVIDER_LABELS,
  type PriceInterval,
  SUBSCRIPTION_STATUS_LABELS,
  type subscriptionStatusList,
} from "@/lib/billing/constants";

/** O que `GET /api/admin/tenants/:id` traz para a cobrança manual. */
export type ManualSubscription = {
  id: string;
  status: (typeof subscriptionStatusList)[number];
  trialEndsAt: string | null;
  planId: string;
  planPriceId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  cancelAtPeriodEnd: boolean;
  billingMode: "manual" | "provider";
};

export type ManualInvoice = {
  id: string;
  provider: keyof typeof PROVIDER_LABELS;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  dueAt: string | null;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export type ManualPrice = {
  id: string;
  interval: PriceInterval;
  amountCents: number;
  currency: string;
};

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "–";

const isOpen = (status: InvoiceStatus) => status === "open" || status === "failed";

type Props = {
  subscription: ManualSubscription;
  planIsFree: boolean;
  invoices: ManualInvoice[];
  prices: ManualPrice[];
  /** Só o proprietário da plataforma escreve; a API confere de novo. */
  canWrite: boolean;
};

/**
 * Período, vencimento e faturas da assinatura, com "Registrar pagamento" e "Marcar como não
 * pago" (`POST /api/admin/subscriptions/:id/manual-*`). Assinatura cobrada pelo provedor só
 * mostra os dados: quem cobra é o módulo.
 */
export function ManualBillingCard({
  subscription,
  planIsFree,
  invoices,
  prices,
  canWrite,
}: Props) {
  const [priceId, setPriceId] = useState(
    prices.find(({ id }) => id === subscription.planPriceId)?.id ?? prices[0]?.id ?? "",
  );
  const [unpaidOpen, setUnpaidOpen] = useState<{ immediate: boolean } | null>(null);
  const pay = useAdminMutation("Pagamento registrado.");
  const unpaid = useAdminMutation("Falta de pagamento registrada.");
  const pending = pay.isPending || unpaid.isPending;
  const manual = subscription.billingMode === "manual" && !planIsFree;
  const base = `/api/admin/subscriptions/${subscription.id}`;
  const priceItems = prices.map((price) => ({
    value: price.id,
    label: `${formatMoney(price.amountCents, price.currency)} / ${INTERVAL_LABELS[price.interval]}`,
  }));

  function registerPayment(invoiceId?: string) {
    pay.mutate({
      path: `${base}/manual-payment`,
      method: "POST",
      body: { invoiceId, planPriceId: invoiceId ? undefined : priceId || undefined },
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <dt className="text-muted-foreground">Situação</dt>
        <dd>
          {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
          {subscription.cancelAtPeriodEnd ? " (cancela no fim do período)" : ""}
        </dd>
        <dt className="text-muted-foreground">Cobrança</dt>
        <dd>
          {planIsFree
            ? "Gratuito"
            : subscription.billingMode === "manual"
              ? "Manual (marcada aqui)"
              : "Provedor de pagamento"}
        </dd>
        {subscription.trialEndsAt && subscription.status === "trialing" ? (
          <>
            <dt className="text-muted-foreground">Teste até</dt>
            <dd>{formatDate(subscription.trialEndsAt)}</dd>
          </>
        ) : null}
        {subscription.currentPeriodEnd ? (
          <>
            <dt className="text-muted-foreground">Período corrente</dt>
            <dd>
              {formatDate(subscription.currentPeriodStart)} a{" "}
              {formatDate(subscription.currentPeriodEnd)}
            </dd>
            <dt className="text-muted-foreground">Vencimento</dt>
            <dd>{formatDate(subscription.currentPeriodEnd)}</dd>
          </>
        ) : null}
        {subscription.graceUntil ? (
          <>
            <dt className="text-muted-foreground">Carência até</dt>
            <dd>{formatDate(subscription.graceUntil)}</dd>
          </>
        ) : null}
      </dl>

      {manual && canWrite ? (
        prices.length === 0 ? (
          <p className="text-muted-foreground">
            Cadastre um preço manual no plano (em Planos) para registrar pagamentos.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {priceItems.length > 1 ? (
              <Select
                items={priceItems}
                value={priceId}
                onValueChange={(next) => next && setPriceId(next)}
              >
                <SelectTrigger aria-label="Preço manual" className="w-48">
                  <SelectValue placeholder="Preço" />
                </SelectTrigger>
                <SelectContent>
                  {priceItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button size="sm" disabled={pending} onClick={() => registerPayment()}>
              Registrar pagamento
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setUnpaidOpen({ immediate: false })}
            >
              Marcar como não pago
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => setUnpaidOpen({ immediate: true })}
            >
              Bloquear agora
            </Button>
          </div>
        )
      ) : null}

      {invoices.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma fatura.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  {invoice.periodStart
                    ? `${formatDate(invoice.periodStart)} a ${formatDate(invoice.periodEnd)}`
                    : formatDate(invoice.dueAt)}
                </TableCell>
                <TableCell>{formatMoney(invoice.amountCents, invoice.currency)}</TableCell>
                <TableCell>
                  <Badge variant={invoice.status === "failed" ? "destructive" : "secondary"}>
                    {INVOICE_STATUS_LABELS[invoice.status]}
                  </Badge>
                  {invoice.paidAt ? ` em ${formatDate(invoice.paidAt)}` : ""}
                </TableCell>
                <TableCell>{PROVIDER_LABELS[invoice.provider] ?? invoice.provider}</TableCell>
                <TableCell className="text-right">
                  {manual && canWrite && invoice.provider === "manual" && isOpen(invoice.status) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => registerPayment(invoice.id)}
                    >
                      Marcar como paga
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={unpaidOpen !== null}
        title={unpaidOpen?.immediate ? "Bloquear por falta de pagamento?" : "Marcar como não pago?"}
        description={
          unpaidOpen?.immediate
            ? "A organização passa na hora a somente leitura, até o pagamento ser registrado."
            : "A assinatura fica com pagamento pendente. Terminada a carência sem pagamento, a organização passa a somente leitura."
        }
        confirmLabel={unpaidOpen?.immediate ? "Bloquear" : "Marcar"}
        pending={unpaid.isPending}
        onCancel={() => setUnpaidOpen(null)}
        onConfirm={() =>
          unpaid.mutate(
            {
              path: `${base}/manual-unpaid`,
              method: "POST",
              body: { immediate: unpaidOpen?.immediate ?? false },
            },
            { onSettled: () => setUnpaidOpen(null) },
          )
        }
      />
    </div>
  );
}
