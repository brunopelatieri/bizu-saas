import { assertAbsoluteUrl, formatDate } from "@/lib/email/templates/format";
import { renderLayout } from "@/lib/email/templates/layout";

export type DataExportReadyInput = {
  name: string;
  url: string;
  expiresAt: Date;
};

export const previewInput: DataExportReadyInput = {
  name: "Ana",
  url: "http://localhost:5173/app/configuracoes/privacidade",
  expiresAt: new Date("2026-12-08T12:00:00Z"),
};

export function dataExportReadyTemplate(input: DataExportReadyInput) {
  return renderLayout({
    subject: "Sua exportação de dados está pronta",
    heading: `Olá, ${input.name}`,
    paragraphs: [
      "O arquivo com os seus dados está pronto para download.",
      `Ele fica disponível até ${formatDate(input.expiresAt)}.`,
    ],
    action: { label: "Baixar dados", url: assertAbsoluteUrl(input.url) },
    footnote: "Se você não pediu esta exportação, troque sua senha.",
  });
}
