import { assertAbsoluteUrl, formatDate } from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type DeletionScheduledInput = {
  name: string;
  /** O que será excluído (ex.: "sua conta" ou "a conta Acme Ltda"). */
  subjectLabel: string;
  scheduledFor: Date;
  /** Página para cancelar a exclusão. */
  url: string;
};

export const previewInput: DeletionScheduledInput = {
  name: "Ana",
  subjectLabel: "a conta Acme Ltda",
  scheduledFor: new Date("2026-12-31T12:00:00Z"),
  url: "http://localhost:5173/app/configuracoes/privacidade",
};

export function deletionScheduledTemplate(input: DeletionScheduledInput) {
  return renderLayout({
    subject: "Exclusão de dados agendada",
    heading: `Olá, ${input.name}`,
    paragraphs: [
      `Agendamos a exclusão de ${input.subjectLabel} para ${formatDate(input.scheduledFor)}.`,
      "Até lá você pode cancelar. Depois dessa data, os dados não podem ser recuperados.",
    ],
    action: { label: "Cancelar exclusão", url: assertAbsoluteUrl(input.url) },
    footnote: "Se você não pediu a exclusão, cancele agora e troque sua senha.",
  });
}
