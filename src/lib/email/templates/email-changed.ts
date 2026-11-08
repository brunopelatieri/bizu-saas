import { assertAbsoluteUrl } from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type EmailChangedInput = {
  name: string;
  /** O endereço novo, mascarado (ex.: "an***@exemplo.com"). */
  maskedEmail: string;
  /** Página de contato da plataforma. */
  url: string;
};

export const previewInput: EmailChangedInput = {
  name: "Ana",
  maskedEmail: "an***@exemplo.com",
  url: "http://localhost:5173/contato",
};

/** Aviso ao endereço antigo quando a administração troca o e-mail da conta. */
export function emailChangedTemplate(input: EmailChangedInput) {
  return renderLayout({
    subject: "O e-mail da sua conta foi alterado",
    heading: `Olá, ${input.name}`,
    paragraphs: [
      `A administração da plataforma trocou o e-mail da sua conta para ${input.maskedEmail}.`,
      "As sessões abertas foram encerradas e este endereço deixa de receber os avisos da conta.",
    ],
    action: { label: "Falar com a administração", url: assertAbsoluteUrl(input.url) },
    footnote: "Se você não pediu a troca, fale com a gente agora.",
  });
}
