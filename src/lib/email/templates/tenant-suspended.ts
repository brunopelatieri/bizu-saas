import { assertAbsoluteUrl } from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type TenantSuspendedInput = {
  name: string;
  tenantName: string;
  /** Motivo em texto simples (ex.: "Pagamento em atraso"). */
  reason?: string;
  /** Onde resolver (assinatura ou contato). */
  url: string;
};

export const previewInput: TenantSuspendedInput = {
  name: "Ana",
  tenantName: "Acme Ltda",
  reason: "Pagamento em atraso",
  url: "http://localhost:5173/app/assinatura",
};

export function tenantSuspendedTemplate(input: TenantSuspendedInput) {
  const paragraphs = [`O acesso de ${input.tenantName} foi suspenso.`];
  if (input.reason) paragraphs.push(`Motivo: ${input.reason}`);
  paragraphs.push(
    "Seus dados continuam guardados. Resolva a pendência para reativar.",
  );

  return renderLayout({
    subject: `Conta ${input.tenantName} suspensa`,
    heading: `Olá, ${input.name}`,
    paragraphs,
    action: { label: "Resolver pendência", url: assertAbsoluteUrl(input.url) },
  });
}
