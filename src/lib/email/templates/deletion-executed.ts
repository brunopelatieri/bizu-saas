import { assertAbsoluteUrl } from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type DeletionExecutedInput = {
  name: string;
  /** O que foi excluído (ex.: "sua conta" ou "a organização Acme Ltda"). */
  subjectLabel: string;
  /** Página de contato da plataforma. */
  url: string;
};

export const previewInput: DeletionExecutedInput = {
  name: "Ana",
  subjectLabel: "a organização Acme Ltda",
  url: "http://localhost:5173/contato",
};

/** Exclusão imediata feita pela administração (`/admin`, "Excluir agora"). */
export function deletionExecutedTemplate(input: DeletionExecutedInput) {
  return renderLayout({
    subject: "Dados excluídos pela administração",
    heading: `Olá, ${input.name}`,
    paragraphs: [
      `A administração da plataforma excluiu ${input.subjectLabel}.`,
      "Os dados pessoais foram removidos e não podem ser recuperados. Faturas e registros que a lei exige guardar continuam, sem identificar você.",
    ],
    action: { label: "Falar com a administração", url: assertAbsoluteUrl(input.url) },
  });
}
