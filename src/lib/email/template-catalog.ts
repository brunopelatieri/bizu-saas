import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { RenderedEmail } from "@/lib/email/types";

/**
 * Descobre os templates de `templates/**` (inclusive `templates/auth/`).
 *
 * Convenção: cada arquivo exporta uma função `<nome>Template(input)` que devolve
 * `RenderedEmail` e, para o `email:preview` e os testes, `previewInput` com dados
 * fictícios. Arquivos sem `*Template` (como `layout.ts` e `format.ts`) são ignorados;
 * template sem `previewInput` aparece em `missingPreview`.
 */

const TEMPLATES_DIR = path.resolve(import.meta.dirname, "templates");

export type TemplateEntry = {
  /** Caminho relativo sem extensão, ex.: `invite-member` ou `auth/verify-email`. */
  id: string;
  render: (input: never) => RenderedEmail;
  previewInput: unknown;
};

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

export async function loadTemplates() {
  const templates: TemplateEntry[] = [];
  const missingPreview: string[] = [];

  for (const file of listFiles(TEMPLATES_DIR).sort()) {
    const id = path.relative(TEMPLATES_DIR, file).replaceAll(path.sep, "/").replace(/\.ts$/, "");
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    const renderName = Object.keys(mod).find(
      (key) => key.endsWith("Template") && typeof mod[key] === "function",
    );
    if (!renderName) continue;

    if (mod.previewInput === undefined) {
      missingPreview.push(id);
      continue;
    }

    templates.push({
      id,
      render: mod[renderName] as TemplateEntry["render"],
      previewInput: mod.previewInput,
    });
  }

  return { templates, missingPreview };
}
