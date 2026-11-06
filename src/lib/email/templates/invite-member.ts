import { assertAbsoluteUrl } from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type InviteMemberInput = {
  inviterName: string;
  tenantName: string;
  /** Nome do papel que o convidado receberá (ex.: "Colaborador"). */
  roleLabel: string;
  url: string;
  expiresInDays: number;
};

export const previewInput: InviteMemberInput = {
  inviterName: "Ana Souza",
  tenantName: "Acme Ltda",
  roleLabel: "Colaborador",
  url: "http://localhost:5173/convite/exemplo",
  expiresInDays: 7,
};

export function inviteMemberTemplate(input: InviteMemberInput) {
  return renderLayout({
    subject: `${input.inviterName} convidou você para ${input.tenantName}`,
    heading: `Convite para ${input.tenantName}`,
    paragraphs: [
      `${input.inviterName} convidou você para entrar na equipe de ${input.tenantName} como ${input.roleLabel}.`,
      `O convite vale por ${input.expiresInDays} dias.`,
    ],
    action: { label: "Aceitar convite", url: assertAbsoluteUrl(input.url) },
    footnote: "Se você não esperava este convite, ignore este e-mail.",
  });
}
