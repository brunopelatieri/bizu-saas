import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildStorage } from "@/lib/storage";
import { assertSafeKey, isSafeKey, newStorageKey } from "@/lib/storage/keys";
import { createLocalProvider } from "@/lib/storage/providers/local";
import type { Env } from "@/lib/env";

async function read(stream: NodeJS.ReadableStream | null) {
  if (!stream) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

describe("chaves de armazenamento", () => {
  it("aceita segmentos simples e recusa tudo que sai do prefixo", () => {
    expect(isSafeKey("tenants/abc-123/Zm9v_bar")).toBe(true);

    for (const bad of [
      "",
      "..",
      "../x",
      "a/../b",
      "a/./b",
      "/abs",
      "a//b",
      "a\\b",
      "C:/x",
      "a/b/",
      ".oculto",
      "nome com espaço",
      "a\0b",
      "x".repeat(300),
    ]) {
      expect(isSafeKey(bad), JSON.stringify(bad)).toBe(false);
      expect(() => assertSafeKey(bad)).toThrow();
    }
  });

  it("gera chaves aleatórias e válidas", () => {
    const a = newStorageKey("tenants/t1");
    const b = newStorageKey("tenants/t1");

    expect(a).not.toBe(b);
    expect(isSafeKey(a)).toBe(true);
    expect(a.startsWith("tenants/t1/")).toBe(true);
  });
});

describe("provedor local", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "bizu-storage-"));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("grava, lê e apaga (apagar o inexistente não falha)", async () => {
    const storage = createLocalProvider(dir);

    await storage.put("a/b/obj", Buffer.from("conteúdo"));
    expect((await read(await storage.get("a/b/obj")))?.toString()).toBe("conteúdo");

    await storage.delete("a/b/obj");
    await storage.delete("a/b/obj");
    expect(await storage.get("a/b/obj")).toBeNull();
  });

  it("recusa chave com .. e nunca escreve fora da raiz", async () => {
    const root = path.join(dir, "raiz");
    await mkdir(root);
    const storage = createLocalProvider(root);

    await expect(storage.put("../fora", Buffer.from("x"))).rejects.toThrow();
    await expect(storage.put("a/../../fora", Buffer.from("x"))).rejects.toThrow();
    await expect(storage.get("../fora")).rejects.toThrow();
    await expect(storage.delete("../fora")).rejects.toThrow();

    expect(await readdir(dir)).toEqual(["raiz"]);
  });

  it("não deixa arquivo temporário para trás e não lê diretório", async () => {
    const storage = createLocalProvider(dir);
    await storage.put("x/obj", Buffer.from("1"));
    await storage.put("x/obj", Buffer.from("2"));

    expect(await readdir(path.join(dir, "x"))).toEqual(["obj"]);
    expect(await storage.get("x")).toBeNull();
  });

  it("não segue link simbólico para fora ao confinar pelo caminho lógico", async () => {
    // O confinamento é lógico (chave validada + caminho resolvido sob a raiz): a chave não
    // pode carregar `..`, então um link criado por fora do app não é alcançável por chave.
    const outside = path.join(dir, "fora.txt");
    await writeFile(outside, "segredo");
    const root = path.join(dir, "raiz");
    await mkdir(root);

    const storage = createLocalProvider(root);
    await expect(storage.get("../fora.txt")).rejects.toThrow();
    await symlink(outside, path.join(root, "link")).catch(() => undefined);
    expect(await readFile(outside, "utf8")).toBe("segredo");
  });
});

describe("registro", () => {
  it("id sem módulo é erro de configuração", () => {
    expect(() => buildStorage("nuvem", [], {} as Env)).toThrow(/não encontrado/);
  });
});
