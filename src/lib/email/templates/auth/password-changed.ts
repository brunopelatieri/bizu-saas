import { renderLayout } from "@/lib/email/templates/layout";

export function passwordChangedTemplate(input: {
  name: string;
  forgotPasswordUrl: string;
}) {
  return renderLayout({
    subject: "Sua senha foi alterada",
    heading: `Olá, ${input.name}`,
    paragraphs: [
      "A senha da sua conta acabou de ser alterada, e as sessões abertas foram encerradas.",
    ],
    action: { label: "Recuperar acesso", url: input.forgotPasswordUrl },
    footnote: "Se foi você, nada mais é preciso. Se não foi, recupere o acesso agora.",
  });
}

/** Dados fictícios do `npm run email:preview` (fase 3). */
export const previewInput = {
  name: "Ana",
  forgotPasswordUrl: "https://app.example/esqueci-senha",
};
