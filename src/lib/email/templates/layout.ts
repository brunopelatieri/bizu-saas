import type { RenderedEmail } from "@/lib/email/types";

export type LayoutInput = {
  subject: string;
  /** Título visível no topo do e-mail. */
  heading: string;
  /** Parágrafos do corpo, em texto puro: o layout escapa o HTML. */
  paragraphs: string[];
  /** Botão de ação. O link é sempre absoluto, montado com `APP_URL` por quem chama. */
  action?: { label: string; url: string };
  /** Texto pequeno no rodapé do corpo (ex.: "Se não foi você, ignore este e-mail."). */
  footnote?: string;
  /** Nome exibido no rodapé. Padrão: Bizu SaaS. */
  appName?: string;
};

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Layout base dos e-mails transacionais, em TypeScript puro: HTML com estilos
 * inline e versão em texto. Templates em `templates/<nome>.ts` chamam esta
 * função e devolvem `{ subject, html, text }`.
 */
export function renderLayout(input: LayoutInput): RenderedEmail {
  const appName = input.appName ?? "Bizu SaaS";
  const paragraphsHtml = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937;">${escapeHtml(p)}</p>`,
    )
    .join("");

  const actionHtml = input.action
    ? `<p style="margin:24px 0;">
        <a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#111827;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">${escapeHtml(input.action.label)}</a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#6b7280;">Se o botão não funcionar, copie este endereço no navegador:<br>${escapeHtml(input.action.url)}</p>`
    : "";

  const footnoteHtml = input.footnote
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:20px;color:#6b7280;">${escapeHtml(input.footnote)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;">
    <tr><td style="padding:32px;">
      <p style="margin:0 0 24px;font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;">${escapeHtml(appName)}</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:#111827;">${escapeHtml(input.heading)}</h1>
      ${paragraphsHtml}
      ${actionHtml}
      ${footnoteHtml}
    </td></tr>
  </table>
  <p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:18px;color:#9ca3af;text-align:center;">E-mail automático de ${escapeHtml(appName)}. Não responda a esta mensagem.</p>
</body>
</html>`;

  const textParts = [input.heading, "", ...input.paragraphs];
  if (input.action) textParts.push("", `${input.action.label}: ${input.action.url}`);
  if (input.footnote) textParts.push("", input.footnote);
  textParts.push("", `${appName}`);

  return { subject: input.subject, html, text: textParts.join("\n") };
}
