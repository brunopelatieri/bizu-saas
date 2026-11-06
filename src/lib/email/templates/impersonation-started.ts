import { formatDateTime } from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type ImpersonationStartedInput = {
  ownerName: string;
  tenantName: string;
  supportName: string;
  startedAt: Date;
  endsAt: Date;
};

export const previewInput: ImpersonationStartedInput = {
  ownerName: "Ana",
  tenantName: "Acme Ltda",
  supportName: "Equipe de suporte",
  startedAt: new Date("2026-12-01T15:00:00Z"),
  endsAt: new Date("2026-12-01T16:00:00Z"),
};

export function impersonationStartedTemplate(input: ImpersonationStartedInput) {
  return renderLayout({
    subject: `Acesso de suporte iniciado em ${input.tenantName}`,
    heading: `Olá, ${input.ownerName}`,
    paragraphs: [
      `${input.supportName} entrou na conta ${input.tenantName} em ${formatDateTime(input.startedAt)}.`,
      `O acesso termina em ${formatDateTime(input.endsAt)}. Todas as ações ficam registradas no log de auditoria.`,
    ],
    footnote:
      "Se você não autorizou este acesso, fale com o suporte imediatamente.",
  });
}
