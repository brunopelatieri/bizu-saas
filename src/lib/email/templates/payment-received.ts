import {
  assertAbsoluteUrl,
  formatDate,
  formatMoney,
} from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type PaymentReceivedInput = {
  name: string;
  tenantName: string;
  amountCents: number;
  currency?: string;
  paidAt: Date;
  url: string;
};

export const previewInput: PaymentReceivedInput = {
  name: "Ana",
  tenantName: "Acme Ltda",
  amountCents: 14900,
  paidAt: new Date("2026-12-09T12:00:00Z"),
  url: "http://localhost:5173/app/assinatura",
};

export function paymentReceivedTemplate(input: PaymentReceivedInput) {
  const amount = formatMoney(input.amountCents, input.currency);

  return renderLayout({
    subject: `Pagamento recebido: ${amount}`,
    heading: `Obrigado, ${input.name}`,
    paragraphs: [
      `Recebemos ${amount} da assinatura de ${input.tenantName} em ${formatDate(input.paidAt)}.`,
    ],
    action: { label: "Ver assinatura", url: assertAbsoluteUrl(input.url) },
  });
}
