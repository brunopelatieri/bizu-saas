import { renderLayout } from "@/lib/email/templates/layout";

/** Vai para o endereço atual: nada muda sem a aprovação do dono da conta. */
export function changeEmailConfirmTemplate(input: {
  name: string;
  newEmail: string;
  url: string;
}) {
  return renderLayout({
    subject: "Aprove a troca do seu e-mail",
    heading: `Olá, ${input.name}`,
    paragraphs: [
      `Pediram para trocar o e-mail da sua conta para ${input.newEmail}.`,
      "Depois de aprovar, enviaremos um link de confirmação ao novo endereço. O link vale por 1 hora.",
    ],
    action: { label: "Aprovar troca", url: input.url },
    footnote: "Se não foi você, não clique no botão e troque sua senha.",
  });
}

/** Dados fictícios do `npm run email:preview` (fase 3). */
export const previewInput = {
  name: "Ana",
  newEmail: "nova@example.com",
  url: "https://app.example/verificar-email?token=exemplo",
};
