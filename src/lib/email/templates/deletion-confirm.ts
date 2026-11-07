import { assertAbsoluteUrl } from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type DeletionConfirmInput = {
  name: string;
  /** Página que mostra o botão de confirmar: o clique, e não o GET, consome o link. */
  url: string;
  expiresInMinutes: number;
};

export const previewInput: DeletionConfirmInput = {
  name: "Ana",
  url: "http://localhost:5173/portal/conta?confirmar-exclusao=exemplo",
  expiresInMinutes: 60,
};

export function deletionConfirmTemplate(input: DeletionConfirmInput) {
  return renderLayout({
    subject: "Confirme a exclusão dos seus dados",
    heading: `Olá, ${input.name}`,
    paragraphs: [
      "Recebemos um pedido para excluir os seus dados. Para confirmar que foi você, use o botão abaixo e clique em confirmar na página que abrir.",
      `O link vale por ${input.expiresInMinutes} minutos e só pode ser usado uma vez. Depois da confirmação, você tem 30 dias para desistir.`,
    ],
    action: { label: "Revisar e confirmar", url: assertAbsoluteUrl(input.url) },
    footnote: "Se você não pediu a exclusão, ignore este e-mail: nada será excluído.",
  });
}
