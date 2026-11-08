import { assertAbsoluteUrl, formatDate } from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type DeletionScheduledInput = {
  name: string;
  /** O que será excluído (ex.: "sua conta" ou "a conta Acme Ltda"). */
  subjectLabel: string;
  scheduledFor: Date;
  /** Página para cancelar a exclusão; no pedido da plataforma, a de contato. */
  url: string;
  /** Pedido feito pela administração (`/admin`): só ela cancela. */
  byPlatform?: boolean;
};

export const previewInput: DeletionScheduledInput = {
  name: "Ana",
  subjectLabel: "a conta Acme Ltda",
  scheduledFor: new Date("2026-12-31T12:00:00Z"),
  url: "http://localhost:5173/app/configuracoes/privacidade",
};

export function deletionScheduledTemplate(input: DeletionScheduledInput) {
  if (input.byPlatform) {
    return renderLayout({
      subject: "Exclusão de dados agendada pela administração",
      heading: `Olá, ${input.name}`,
      paragraphs: [
        `A administração da plataforma agendou a exclusão de ${input.subjectLabel} para ${formatDate(input.scheduledFor)}.`,
        "O acesso fica suspenso até lá. Depois dessa data, os dados não podem ser recuperados.",
      ],
      action: { label: "Falar com a administração", url: assertAbsoluteUrl(input.url) },
      footnote: "Se você acredita que é um engano, fale com a gente antes dessa data.",
    });
  }

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
