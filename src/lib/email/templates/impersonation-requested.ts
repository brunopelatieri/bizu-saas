import {
  assertAbsoluteUrl,
  formatDateTime,
} from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type ImpersonationRequestedInput = {
  ownerName: string;
  tenantName: string;
  /** Quem do suporte pediu acesso. */
  supportName: string;
  reason: string;
  /** Até quando o pedido pode ser aprovado. */
  expiresAt: Date;
  url: string;
};

export const previewInput: ImpersonationRequestedInput = {
  ownerName: "Ana",
  tenantName: "Acme Ltda",
  supportName: "Equipe de suporte",
  reason: "Investigar erro na importação de clientes.",
  expiresAt: new Date("2026-12-01T15:00:00Z"),
  url: "http://localhost:5173/app/configuracoes/suporte",
};

export function impersonationRequestedTemplate(
  input: ImpersonationRequestedInput,
) {
  return renderLayout({
    subject: `${input.supportName} pediu acesso à conta ${input.tenantName}`,
    heading: `Olá, ${input.ownerName}`,
    paragraphs: [
      `${input.supportName} pediu acesso temporário à conta ${input.tenantName}.`,
      `Motivo: ${input.reason}`,
      `Aprove ou recuse até ${formatDateTime(input.expiresAt)}. Sem resposta, o pedido expira.`,
    ],
    action: { label: "Revisar pedido", url: assertAbsoluteUrl(input.url) },
    footnote: "Só aprove se você reconhece o pedido.",
  });
}
