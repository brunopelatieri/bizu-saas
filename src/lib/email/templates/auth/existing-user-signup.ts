import { renderLayout } from "@/lib/email/templates/layout";

export function existingUserSignupTemplate(input: {
  name: string;
  loginUrl: string;
  forgotPasswordUrl: string;
}) {
  return renderLayout({
    subject: "Tentativa de cadastro com seu e-mail",
    heading: `Olá, ${input.name}`,
    paragraphs: [
      "Alguém tentou criar uma conta com este e-mail, mas você já tem uma.",
      "Se foi você, entre normalmente. Se esqueceu a senha, recupere-a neste endereço:",
      input.forgotPasswordUrl,
    ],
    action: { label: "Entrar", url: input.loginUrl },
    footnote: "Se não foi você, ignore este e-mail: nada mudou na sua conta.",
  });
}

/** Dados fictícios do `npm run email:preview` (fase 3). */
export const previewInput = {
  name: "Ana",
  loginUrl: "https://app.example/login",
  forgotPasswordUrl: "https://app.example/esqueci-senha",
};
