import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { assertSafeKey } from "@/lib/storage/keys";
import type { StorageModule, StorageProvider } from "@/lib/storage/types";

/**
 * Provedor em disco (`STORAGE_PROVIDER=local`, padrão). Guarda em `STORAGE_LOCAL_DIR`. Toda
 * chave passa por `assertSafeKey` e o caminho final é conferido contra a raiz: nenhuma entrada
 * escapa do diretório, mesmo que a validação mude um dia.
 */
export function createLocalProvider(rootDir: string): StorageProvider {
  const root = path.resolve(rootDir);

  function resolveKey(key: string) {
    assertSafeKey(key);

    const target = path.resolve(root, ...key.split("/"));
    const relative = path.relative(root, target);

    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Chave fora do diretório de armazenamento.");
    }

    return target;
  }

  return {
    id: "local",

    async put(key, body) {
      const target = resolveKey(key);
      await mkdir(path.dirname(target), { recursive: true });

      // Escreve ao lado e renomeia: quem lê nunca vê o arquivo pela metade.
      const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`;

      try {
        await writeFile(temporary, body, { flag: "wx" });
        await rename(temporary, target);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    },

    async get(key): Promise<Readable | null> {
      const target = resolveKey(key);
      const info = await stat(target).catch(() => null);

      return info?.isFile() ? createReadStream(target) : null;
    },

    async delete(key) {
      await rm(resolveKey(key), { force: true });
    },
  };
}

const localModule: StorageModule = {
  id: "local",
  createProvider: (env) => createLocalProvider(env.STORAGE_LOCAL_DIR),
};

export default localModule;
