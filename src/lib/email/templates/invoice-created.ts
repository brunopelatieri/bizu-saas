import {
  assertAbsoluteUrl,
  formatDate,
  formatMoney,
} from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type InvoiceCreatedInput = {
  name: string;
  tenantName: string;
  amountCents: number;
  currency?: string;
  dueDate: Date;
  url: string;
};

export const previewInput: InvoiceCreatedInput = {
  name: "Ana",
  tenantName: "Acme Ltda",
  amountCents: 14900,
  dueDate: new Date("2026-12-10T12:00:00Z"),
  url: "http://localhost:5173/app/assinatura",
};

export function invoiceCreatedTemplate(input: InvoiceCreatedInput) {
  const amount = formatMoney(input.amountCents, input.currency);

  return renderLayout({
    subject: `Nova fatura de ${input.tenantName}: ${amount}`,
    heading: `Olá, ${input.name}`,
    paragraphs: [
      `A fatura de ${input.tenantName} no valor de ${amount} vence em ${formatDate(input.dueDate)}.`,
    ],
    action: { label: "Ver fatura", url: assertAbsoluteUrl(input.url) },
  });
}
