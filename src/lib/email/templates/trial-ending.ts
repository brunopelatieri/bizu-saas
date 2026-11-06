import { assertAbsoluteUrl, formatDate } from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type TrialEndingInput = {
  name: string;
  tenantName: string;
  daysLeft: number;
  endsAt: Date;
  url: string;
};

export const previewInput: TrialEndingInput = {
  name: "Ana",
  tenantName: "Acme Ltda",
  daysLeft: 3,
  endsAt: new Date("2026-12-01T15:00:00Z"),
  url: "http://localhost:5173/app/assinatura",
};

export function trialEndingTemplate(input: TrialEndingInput) {
  const when =
    input.daysLeft <= 0
      ? "termina hoje"
      : input.daysLeft === 1
        ? "termina amanhã"
        : `termina em ${input.daysLeft} dias`;

  return renderLayout({
    subject: `O período de teste de ${input.tenantName} ${when}`,
    heading: `Olá, ${input.name}`,
    paragraphs: [
      `O período de teste de ${input.tenantName} ${when}, em ${formatDate(input.endsAt)}.`,
      "Escolha um plano para continuar usando sem interrupção.",
    ],
    action: { label: "Escolher um plano", url: assertAbsoluteUrl(input.url) },
  });
}
