import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { type Env, getEnv } from "@/lib/env";
import type { StorageModule, StorageProvider } from "@/lib/storage/types";

export { assertSafeKey, newStorageKey } from "@/lib/storage/keys";
export type { StorageProvider } from "@/lib/storage/types";

/**
 * Registro do módulo de arquivos. Um provedor é uma pasta em `providers/<id>/` cujo `index.ts`
 * exporta `default: StorageModule`; `STORAGE_PROVIDER` escolhe qual. Apagar a pasta do `s3` e
 * deixar `STORAGE_PROVIDER=local` remove o S3 sem quebrar typecheck nem testes.
 */

type ModuleFile = { default: StorageModule };

/** `tsx` (seed, worker em dev) não é Vite: lá o `glob` não existe e a pasta é lida à mão. */
async function discover(): Promise<ModuleFile[]> {
  try {
    return Object.values(
      import.meta.glob<ModuleFile>("./providers/*/index.ts", { eager: true }),
    );
  } catch {
    const root = path.join(import.meta.dirname, "providers");
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);

    return Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(
          (entry) =>
            import(
              pathToFileURL(path.join(root, entry.name, "index.ts")).href
            ) as Promise<ModuleFile>,
        ),
    );
  }
}

const discovered = await discover();

/** Monta o provedor do id pedido. Id sem pasta é erro de configuração, não de execução. */
export function buildStorage(
  id: string,
  modules: readonly StorageModule[],
  env: Env,
): StorageProvider {
  const found = modules.find((module) => module.id === id);

  if (!found) {
    throw new Error(`STORAGE_PROVIDER: módulo "${id}" não encontrado.`);
  }

  return found.createProvider(env);
}

let provider: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  if (!provider) {
    const env = getEnv();
    provider = buildStorage(
      env.STORAGE_PROVIDER,
      discovered.map((file) => file.default),
      env,
    );
  }

  return provider;
}

/** Troca o provedor em testes; `undefined` volta ao de `STORAGE_PROVIDER`. */
export function setStorageForTests(next: StorageProvider | undefined) {
  provider = next;
}
