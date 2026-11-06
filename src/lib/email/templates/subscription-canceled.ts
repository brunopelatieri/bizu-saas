import { assertAbsoluteUrl, formatDate } from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type SubscriptionCanceledInput = {
  name: string;
  tenantName: string;
  planName: string;
  /** Último dia com acesso ao plano. */
  endsAt: Date;
  url: string;
};

export const previewInput: SubscriptionCanceledInput = {
  name: "Ana",
  tenantName: "Acme Ltda",
  planName: "Profissional",
  endsAt: new Date("2026-12-31T12:00:00Z"),
  url: "http://localhost:5173/app/assinatura",
};

export function subscriptionCanceledTemplate(input: SubscriptionCanceledInput) {
  return renderLayout({
    subject: `Assinatura de ${input.tenantName} cancelada`,
    heading: `Olá, ${input.name}`,
    paragraphs: [
      `A assinatura do plano ${input.planName} de ${input.tenantName} foi cancelada.`,
      `Você continua com acesso até ${formatDate(input.endsAt)}.`,
    ],
    action: { label: "Reativar assinatura", url: assertAbsoluteUrl(input.url) },
  });
}
