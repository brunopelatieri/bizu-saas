import { describe, expect, it } from "vitest";
import { createZip } from "@/lib/lgpd/zip";
import { signExportLink, verifyExportSignature } from "@/lib/lgpd/link";
import { unzip } from "../../../tests/unzip";

describe("zip da exportação", () => {
  it("gera um arquivo que se lê de volta, com nomes em UTF-8", () => {
    const zip = createZip([
      { name: "perfil.json", data: Buffer.from('{"nome":"Ação"}') },
      { name: "vazio.txt", data: Buffer.alloc(0) },
      { name: "grande.json", data: Buffer.from("x".repeat(100_000)) },
    ]);

    const files = unzip(zip);

    expect([...files.keys()]).toEqual(["perfil.json", "vazio.txt", "grande.json"]);
    expect(files.get("perfil.json")?.toString()).toBe('{"nome":"Ação"}');
    expect(files.get("vazio.txt")?.length).toBe(0);
    expect(files.get("grande.json")?.length).toBe(100_000);
  });
});

const SECRET = "segredo-de-teste-com-mais-de-16";

describe("assinatura do link de download", () => {
  const id = "7d8f3a52-1b0e-4c75-9f5e-0a4f3b2c1d00";
  const now = new Date("2026-11-10T12:00:00Z");
  const later = new Date("2026-11-17T12:00:00Z");

  it("aceita a assinatura válida, dentro do prazo", () => {
    expect(verifyExportSignature(id, signExportLink(id, later, SECRET), now, SECRET)).toBe("ok");
  });

  it("recusa depois do prazo", () => {
    const sig = signExportLink(id, later, SECRET);
    expect(verifyExportSignature(id, sig, new Date("2026-11-18T00:00:00Z"), SECRET)).toBe("expired");
  });

  it("recusa assinatura feita com outro segredo", () => {
    const foreign = signExportLink(id, later, "outro-segredo-qualquer-16+");
    expect(verifyExportSignature(id, foreign, now, SECRET)).toBe("invalid");
  });

  it("recusa assinatura de outro pedido, adulterada ou com o prazo estendido", () => {
    const sig = signExportLink(id, later, SECRET);
    const [seconds, mac] = sig.split(".");

    expect(verifyExportSignature("outro-id", sig, now, SECRET)).toBe("invalid");
    expect(verifyExportSignature(id, `${Number(seconds) + 86_400}.${mac}`, now, SECRET)).toBe("invalid");
    expect(verifyExportSignature(id, `${seconds}.${"0".repeat(64)}`, now, SECRET)).toBe("invalid");
    for (const bad of [undefined, "", "abc", "123.xyz", `${seconds}.`, `.${mac}`]) {
      expect(verifyExportSignature(id, bad, now, SECRET)).toBe("invalid");
    }
  });
});
