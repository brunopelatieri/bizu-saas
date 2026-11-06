import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * Cifra credenciais de provedores por tenant com AES-256-GCM. Cada registro tem nonce
 * próprio. Formato: `v<versão da chave>:<nonce>:<tag>:<cifra>`, em base64url. A versão vai
 * no texto para a rotação (`docs/context/tech/26-seguranca.md`) decidir a chave.
 */

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const FORMAT = /^v(\d+):([\w-]+):([\w-]+):([\w-]*)$/;

export type SecretKeyRing = {
  version: number;
  key: Buffer;
  /** Chave da versão anterior, só durante a rotação. */
  previous?: Buffer;
};

export class SecretDecryptError extends Error {
  constructor() {
    super("Não foi possível decifrar a credencial.");
    this.name = "SecretDecryptError";
  }
}

export function currentKeyRing(): SecretKeyRing {
  const env = getEnv();

  return {
    version: env.CREDENTIALS_KEY_VERSION,
    key: Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY, "base64"),
    previous: env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS
      ? Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS, "base64")
      : undefined,
  };
}

/** `aad` amarra o texto ao dono: cifra copiada para outro registro não decifra. */
export function encryptSecret(
  plaintext: string,
  aad: string,
  ring: SecretKeyRing = currentKeyRing(),
) {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", ring.key, nonce, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(aad, "utf8"));

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    `v${ring.version}`,
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function keyFor(version: number, ring: SecretKeyRing) {
  if (version === ring.version) return ring.key;
  if (version === ring.version - 1 && ring.previous) return ring.previous;
  return null;
}

/** Lança `SecretDecryptError` com chave errada, texto adulterado ou `aad` de outro dono. */
export function decryptSecret(
  token: string,
  aad: string,
  ring: SecretKeyRing = currentKeyRing(),
) {
  const [, version, nonce, tag, encrypted] = FORMAT.exec(token) ?? [];
  const key = version ? keyFor(Number(version), ring) : null;

  if (!key || !nonce || !tag || encrypted === undefined) {
    throw new SecretDecryptError();
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(nonce, "base64url"),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SecretDecryptError();
  }
}
