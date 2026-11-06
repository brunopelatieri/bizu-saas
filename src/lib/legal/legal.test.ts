import { describe, expect, it } from "vitest";
import {
  fillPlaceholders,
  isSafeHref,
  parseInline,
  parseMarkdown,
} from "@/lib/legal/markdown";
import privacidade from "@/lib/legal/privacidade.md?raw";
import termos from "@/lib/legal/termos.md?raw";
import { LEGAL_VERSIONS, REQUIRED_CONSENTS, TERMS_VERSION } from "@/lib/legal/versions";

describe("versões legais", () => {
  it("termos e privacidade têm versão e o cadastro envia a dos termos", () => {
    expect(LEGAL_VERSIONS.terms).toMatch(/^\d{4}-\d{2}$/);
    expect(LEGAL_VERSIONS.privacy).toMatch(/^\d{4}-\d{2}$/);
    expect(TERMS_VERSION).toBe(LEGAL_VERSIONS.terms);
    expect([...REQUIRED_CONSENTS]).toEqual(["terms", "privacy"]);
  });
});

describe("markdown dos textos legais", () => {
  it("nunca devolve HTML: marcação digitada fica como texto", () => {
    const [block] = parseMarkdown("<script>alert(1)</script> **forte**");

    expect(block).toMatchObject({ type: "paragraph" });
    expect(JSON.stringify(block)).toContain("<script>alert(1)</script> ");
    expect(block?.type === "paragraph" && block.content.some((p) => p.type === "strong")).toBe(true);
  });

  it("só aceita links http(s), mailto e do próprio site", () => {
    expect(isSafeHref("https://exemplo.com")).toBe(true);
    expect(isSafeHref("mailto:a@b.com")).toBe(true);
    expect(isSafeHref("/legal/termos")).toBe(true);
    for (const bad of ["javascript:alert(1)", "//evil.com", "data:text/html,x", "JaVaScRiPt:1"]) {
      expect(isSafeHref(bad)).toBe(false);
    }

    expect(parseInline("[x](javascript:alert(1))").some((part) => part.type === "link")).toBe(false);
  });

  it("converte títulos, listas e tabelas", () => {
    const blocks = parseMarkdown(
      "# T\n\n## S\n\n- a\n- b\n\n1. um\n2. dois\n\n| A | B |\n|---|---|\n| 1 | 2 |",
    );

    expect(blocks.map((b) => b.type)).toEqual(["heading", "heading", "list", "list", "table"]);
    expect(blocks[2]).toMatchObject({ ordered: false });
    expect(blocks[3]).toMatchObject({ ordered: true });
  });

  it("substitui placeholders conhecidos e deixa os demais à vista", () => {
    expect(fillPlaceholders("{{DPO_EMAIL}} e {{OUTRO}}", { DPO_EMAIL: "dpo@x.com" })).toBe(
      "dpo@x.com e {{OUTRO}}",
    );
  });

  it("os dois textos têm título, placeholders do controlador e do encarregado", () => {
    for (const source of [termos, privacidade]) {
      const blocks = parseMarkdown(source);
      expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
      expect(source).toContain("{{VERSION}}");
      expect(source).toContain("{{DPO_EMAIL}}");
      expect(source).toContain("[NOME DO CONTROLADOR");
    }
  });
});
