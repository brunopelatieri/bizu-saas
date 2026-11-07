/**
 * Markdown mínimo dos textos legais, convertido em blocos de dados que o React renderiza. Nenhum
 * HTML é gerado nem interpretado: o texto nunca vira marcação, então o conteúdo (que um projeto
 * derivado edita) não abre brecha de XSS. Suporta títulos (`#`, `##`, `###`), parágrafos, listas
 * (`-` e `1.`), tabelas simples, `**negrito**` e `[texto](link)`.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "link"; text: string; href: string };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Só links absolutos http(s), `mailto:` e caminhos do próprio site. */
export function isSafeHref(href: string) {
  return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href);
}

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ type: "text", text: text.slice(last, index) });

    if (match[1] !== undefined) {
      parts.push({ type: "strong", text: match[1] });
    } else if (match[2] !== undefined && match[3] !== undefined) {
      parts.push(
        isSafeHref(match[3])
          ? { type: "link", text: match[2], href: match[3] }
          : { type: "text", text: match[2] },
      );
    }

    last = index + match[0].length;
  }

  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

export function parseMarkdown(source: string): Block[] {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", content: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);

    if (line.trim() === "") {
      flush();
    } else if (heading) {
      flush();
      blocks.push({
        type: "heading",
        level: heading[1]?.length as 1 | 2 | 3,
        content: parseInline(heading[2] ?? ""),
      });
    } else if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered);
      const previous = blocks.at(-1);
      const item = parseInline((bullet ?? numbered)?.[1] ?? "");

      if (previous?.type === "list" && previous.ordered === ordered) {
        previous.items.push(item);
      } else {
        blocks.push({ type: "list", ordered, items: [item] });
      }
    } else if (line.trimStart().startsWith("|") && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      flush();
      const header = cells(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;

      while (i < lines.length && (lines[i] ?? "").trimStart().startsWith("|")) {
        rows.push(cells(lines[i] ?? "").map(parseInline));
        i += 1;
      }
      i -= 1;

      blocks.push({ type: "table", header, rows });
    } else {
      paragraph.push(line.trim());
    }
  }

  flush();
  return blocks;
}

/** Troca `{{CHAVE}}` pelo valor; chave desconhecida fica como está, à vista de quem revisa. */
export function fillPlaceholders(source: string, values: Record<string, string>) {
  return source.replace(/\{\{([A-Z_]+)\}\}/g, (whole, key: string) => values[key] ?? whole);
}
