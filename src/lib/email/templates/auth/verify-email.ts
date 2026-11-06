import { renderLayout } from "@/lib/email/templates/layout";

/** `changing`: o link confirma o novo endereço na troca de e-mail. */
export function verifyEmailTemplate(input: {
  name: string;
  url: string;
  changing?: boolean;
}) {
  return renderLayout({
    subject: "Confirme seu e-mail",
    heading: `Olá, ${input.name}`,
    paragraphs: [
      input.changing
        ? "Confirme este endereço para concluir a troca do e-mail da sua conta."
        : "Confirme seu e-mail para ativar a conta.",
      "O link vale por 1 hora e só pode ser usado uma vez.",
    ],
    action: { label: "Confirmar e-mail", url: input.url },
    footnote: "Se não foi você, ignore este e-mail.",
  });
}

/** Dados fictícios do `npm run email:preview` (fase 3). */
export const previewInput = {
  name: "Ana",
  url: "https://app.example/verificar-email?token=exemplo",
};
