import { renderLayout } from "@/lib/email/templates/layout";

export function resetPasswordTemplate(input: { name: string; url: string }) {
  return renderLayout({
    subject: "Redefina sua senha",
    heading: `Olá, ${input.name}`,
    paragraphs: [
      "Recebemos um pedido para redefinir a senha da sua conta.",
      "O link vale por 1 hora e só pode ser usado uma vez.",
    ],
    action: { label: "Redefinir senha", url: input.url },
    footnote: "Se não foi você, ignore este e-mail: sua senha continua a mesma.",
  });
}

/** Dados fictícios do `npm run email:preview` (fase 3). */
export const previewInput = {
  name: "Ana",
  url: "https://app.example/redefinir-senha?token=exemplo",
};
