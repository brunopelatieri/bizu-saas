import type { Invoice } from "@/components/app/billing/billing-api";
import { Badge } from "@/components/ui/badge";
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
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
  PAYMENT_METHOD_LABELS,
} from "@/lib/billing/constants";

const VARIANTS: Record<
  InvoiceStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "secondary",
  paid: "default",
  failed: "destructive",
  refunded: "outline",
  void: "outline",
};

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "–";

export function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhuma fatura ainda.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Valor</TableHead>
          <TableHead>Situação</TableHead>
          <TableHead>Forma</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead className="text-right">Fatura</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell>{formatDate(invoice.createdAt)}</TableCell>
            <TableCell>
              {formatMoney(invoice.amountCents, invoice.currency)}
            </TableCell>
            <TableCell>
              <Badge variant={VARIANTS[invoice.status]}>
                {INVOICE_STATUS_LABELS[invoice.status]}
              </Badge>
            </TableCell>
            <TableCell>
              {invoice.paymentMethod
                ? PAYMENT_METHOD_LABELS[invoice.paymentMethod]
                : "–"}
            </TableCell>
            <TableCell>{formatDate(invoice.dueAt)}</TableCell>
            <TableCell className="text-right">
              {invoice.hostedUrl ? (
                <a
                  href={invoice.hostedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  {invoice.status === "open" || invoice.status === "failed"
                    ? "Pagar"
                    : "Ver"}
                </a>
              ) : (
                "–"
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
