import type { Readable } from "node:stream";
import type { Env } from "@/lib/env";

export type StorageProviderId = "local" | "s3";

export type PutOptions = { contentType?: string };

/**
 * Interface do módulo de arquivos. O núcleo só conhece isto: quem escolhe a implementação é
 * `STORAGE_PROVIDER` (`src/lib/storage/index.ts`). A chave (`key`) é sempre gerada pelo servidor
 * (`newStorageKey`) e validada por `assertSafeKey` antes de chegar ao disco ou ao bucket.
 */
export interface StorageProvider {
  id: StorageProviderId;
  put(key: string, body: Buffer, options?: PutOptions): Promise<void>;
  /** Fluxo do conteúdo, ou `null` se a chave não existir. */
  get(key: string): Promise<Readable | null>;
  /** Idempotente: apagar o que não existe não é erro. */
  delete(key: string): Promise<void>;
  /** Link direto do provedor, se ele tiver. O app não depende disto: baixa pelo próprio `get`. */
  signedUrl?(key: string, options: { expiresInSeconds: number }): Promise<string>;
}

/** O que uma pasta `providers/<id>/index.ts` exporta como `default`. */
export type StorageModule = {
  id: StorageProviderId;
  /** Só monta o objeto: sem rede nem disco até o primeiro uso. */
  createProvider(env: Env): StorageProvider;
};
