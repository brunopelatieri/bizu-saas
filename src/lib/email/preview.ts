import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { escapeHtml } from "@/lib/email/templates/layout";
import { loadTemplates } from "@/lib/email/template-catalog";

/**
 * `npm run email:preview`: renderiza todos os templates com os dados fictícios de
 * `previewInput` em `.tmp/emails/<template>.html` (e `index.html` com a lista).
 * Abra o `index.html` no navegador para revisar o visual.
 */

const OUT_DIR = path.resolve(".tmp/emails");

const { templates, missingPreview } = await loadTemplates();
const links: string[] = [];

for (const { id, render, previewInput } of templates) {
  const rendered = render(previewInput as never);
  const file = path.join(OUT_DIR, `${id}.html`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, rendered.html, "utf-8");
  links.push(
    `<li><a href="./${id}.html">${escapeHtml(id)}</a> &mdash; ${escapeHtml(rendered.subject)}</li>`,
  );
  console.log(`${id}: ${rendered.subject}`);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  path.join(OUT_DIR, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Prévia dos e-mails</title><ul>${links.join("")}</ul>`,
  "utf-8",
);

console.log(`\n${templates.length} e-mails em ${OUT_DIR}`);
if (missingPreview.length > 0) {
  console.warn(
    `Sem \`export const previewInput\` (ignorados): ${missingPreview.join(", ")}`,
  );
}
