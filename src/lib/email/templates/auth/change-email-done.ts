import { renderLayout } from "@/lib/email/templates/layout";

/** Vai para o endereço antigo, depois de concluída a troca. */
export function changeEmailDoneTemplate(input: {
  name: string;
  newEmail: string;
  forgotPasswordUrl: string;
}) {
  return renderLayout({
    subject: "O e-mail da sua conta foi alterado",
    heading: `Olá, ${input.name}`,
    paragraphs: [
      `O e-mail da sua conta agora é ${input.newEmail}. Este endereço não recebe mais avisos dela.`,
    ],
    action: { label: "Recuperar acesso", url: input.forgotPasswordUrl },
    footnote: "Se não foi você, recupere o acesso agora e fale com o suporte.",
  });
}

/** Dados fictícios do `npm run email:preview` (fase 3). */
export const previewInput = {
  name: "Ana",
  newEmail: "nova@example.com",
  forgotPasswordUrl: "https://app.example/esqueci-senha",
};
