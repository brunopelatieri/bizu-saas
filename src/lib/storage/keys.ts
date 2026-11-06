import { randomBytes } from "node:crypto";

/**
 * Chave de objeto: segmentos de letras, números, `.`, `_` e `-` separados por `/`. Sem barra
 * invertida, sem segmento vazio nem `.`/`..`, sem barra inicial. Vale para qualquer provedor,
 * porque no S3 a chave é só texto e no disco ela vira caminho.
 */
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
export const MAX_KEY_LENGTH = 255;

export class InvalidStorageKeyError extends Error {
  constructor() {
    super("Chave de armazenamento inválida.");
    this.name = "InvalidStorageKeyError";
  }
}

export function isSafeKey(key: string) {
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) return false;

  return key.split("/").every((segment) => segment !== ".." && SEGMENT.test(segment));
}

export function assertSafeKey(key: string) {
  if (!isSafeKey(key)) throw new InvalidStorageKeyError();
  return key;
}

/** Chave aleatória (192 bits) sob um prefixo, ex.: `tenants/<id>`. O nome original não entra. */
export function newStorageKey(prefix: string) {
  return assertSafeKey(`${prefix}/${randomBytes(24).toString("base64url")}`);
}
