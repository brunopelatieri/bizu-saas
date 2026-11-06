import {
  assertAbsoluteUrl,
  formatDate,
  formatMoney,
} from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type PaymentFailedInput = {
  name: string;
  tenantName: string;
  amountCents: number;
  currency?: string;
  /** Fim da carência antes de a assinatura ficar inadimplente. */
  graceEndsAt?: Date;
  url: string;
};

export const previewInput: PaymentFailedInput = {
  name: "Ana",
  tenantName: "Acme Ltda",
  amountCents: 14900,
  graceEndsAt: new Date("2026-12-17T12:00:00Z"),
  url: "http://localhost:5173/app/assinatura",
};

export function paymentFailedTemplate(input: PaymentFailedInput) {
  const amount = formatMoney(input.amountCents, input.currency);
  const paragraphs = [
    `Não conseguimos cobrar ${amount} da assinatura de ${input.tenantName}.`,
  ];
  paragraphs.push(
    input.graceEndsAt
      ? `Atualize a forma de pagamento até ${formatDate(input.graceEndsAt)} para evitar a suspensão.`
      : "Atualize a forma de pagamento para evitar a suspensão.",
  );

  return renderLayout({
    subject: `Falha no pagamento de ${input.tenantName}`,
    heading: `Olá, ${input.name}`,
    paragraphs,
    action: { label: "Atualizar pagamento", url: assertAbsoluteUrl(input.url) },
  });
}
