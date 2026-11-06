import { Link } from "react-router";
import { PageHero } from "@/components/layout/page-hero";
import type { Block, Inline } from "@/lib/legal/markdown";

type LegalDocument = {
  title: string;
  description: string;
  version: string;
  blocks: Block[];
};

function Inlines({ content }: { content: Inline[] }) {
  return content.map((part, index) => {
    const key = `${part.type}-${index}`;

    if (part.type === "strong") return <strong key={key}>{part.text}</strong>;
    if (part.type === "link") {
      return part.href.startsWith("/") ? (
        <Link key={key} to={part.href} className="text-primary underline">
          {part.text}
        </Link>
      ) : (
        <a key={key} href={part.href} className="text-primary underline">
          {part.text}
        </a>
      );
    }

    return <span key={key}>{part.text}</span>;
  });
}

function renderBlock(block: Block, index: number) {
  switch (block.type) {
    case "heading":
      // O `h1` do texto vira o título da página (`PageHero`); aqui só os níveis abaixo.
      return block.level === 1 ? null : (
        <h2 key={index} className="mt-8 text-xl font-semibold text-foreground">
          <Inlines content={block.content} />
        </h2>
      );
    case "paragraph":
      return (
        <p key={index} className="mt-3 leading-relaxed text-muted-foreground">
          <Inlines content={block.content} />
        </p>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List
          key={index}
          className={`mt-3 space-y-1 pl-6 text-muted-foreground ${block.ordered ? "list-decimal" : "list-disc"}`}
        >
          {block.items.map((item, itemIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lista estática de texto
            <li key={itemIndex}>
              <Inlines content={item} />
            </li>
          ))}
        </List>
      );
    }
    case "table":
      return (
        <div key={index} className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                {block.header.map((cell, cellIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: tabela estática de texto
                  <th key={cellIndex} className="py-2 pr-4 font-medium text-foreground">
                    <Inlines content={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: tabela estática de texto
                <tr key={rowIndex} className="border-b border-border/60">
                  {row.map((cell, cellIndex) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: tabela estática de texto
                    <td key={cellIndex} className="py-2 pr-4 text-muted-foreground">
                      <Inlines content={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <>
      <PageHero
        eyebrow="Legal"
        title={document.title}
        description={`Versão ${document.version}. ${document.description}`}
      />
      <article className="px-6 py-12">
        <div className="mx-auto max-w-3xl">{document.blocks.map(renderBlock)}</div>
      </article>
    </>
  );
}
