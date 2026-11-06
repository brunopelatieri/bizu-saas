import { assertAbsoluteUrl } from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type TrialExpiredInput = {
  name: string;
  tenantName: string;
  url: string;
};

export const previewInput: TrialExpiredInput = {
  name: "Ana",
  tenantName: "Acme Ltda",
  url: "http://localhost:5173/app/assinatura",
};

export function trialExpiredTemplate(input: TrialExpiredInput) {
  return renderLayout({
    subject: `O período de teste de ${input.tenantName} terminou`,
    heading: `Olá, ${input.name}`,
    paragraphs: [
      `O período de teste de ${input.tenantName} terminou e a conta passou para o modo somente leitura.`,
      "Escolha um plano para voltar a editar. Seus dados continuam guardados.",
    ],
    action: { label: "Escolher um plano", url: assertAbsoluteUrl(input.url) },
  });
}
