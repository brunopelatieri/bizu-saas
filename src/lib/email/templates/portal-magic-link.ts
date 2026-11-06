import { assertAbsoluteUrl } from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type PortalMagicLinkInput = {
  tenantName: string;
  url: string;
  expiresInMinutes: number;
};

export const previewInput: PortalMagicLinkInput = {
  tenantName: "Acme Ltda",
  url: "http://localhost:5173/portal/entrar?token=exemplo",
  expiresInMinutes: 15,
};

export function portalMagicLinkTemplate(input: PortalMagicLinkInput) {
  return renderLayout({
    subject: `Seu link de acesso ao portal de ${input.tenantName}`,
    heading: "Entrar no portal",
    paragraphs: [
      `Use o botão abaixo para entrar no portal de ${input.tenantName}.`,
      `O link vale por ${input.expiresInMinutes} minutos e só pode ser usado uma vez.`,
    ],
    action: { label: "Entrar", url: assertAbsoluteUrl(input.url) },
    footnote: "Se você não pediu este link, ignore este e-mail.",
  });
}
