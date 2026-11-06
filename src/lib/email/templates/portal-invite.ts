import { assertAbsoluteUrl } from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type PortalInviteInput = {
  customerName: string;
  tenantName: string;
  url: string;
};

export const previewInput: PortalInviteInput = {
  customerName: "Carlos Lima",
  tenantName: "Acme Ltda",
  url: "http://localhost:5173/portal/convite/exemplo",
};

/** Enviado em nome do tenant; o `Reply-To` do owner é definido por quem envia. */
export function portalInviteTemplate(input: PortalInviteInput) {
  return renderLayout({
    subject: `${input.tenantName} liberou seu acesso ao portal`,
    heading: `Olá, ${input.customerName}`,
    paragraphs: [
      `${input.tenantName} criou um acesso para você no portal de clientes.`,
      "Use o botão abaixo para definir como você quer entrar.",
    ],
    action: { label: "Acessar o portal", url: assertAbsoluteUrl(input.url) },
    footnote: "Se você não conhece esta empresa, ignore este e-mail.",
  });
}
