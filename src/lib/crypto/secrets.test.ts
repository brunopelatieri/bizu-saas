import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  SecretDecryptError,
  type SecretKeyRing,
} from "@/lib/crypto/secrets";

const ring: SecretKeyRing = { version: 1, key: randomBytes(32) };
const AAD = "tenant-a:stripe";

describe("encryptSecret", () => {
  it("faz o round-trip, inclusive com acento e texto vazio", () => {
    for (const secret of ["sk_live_abc123", "çãé ação", ""]) {
      expect(decryptSecret(encryptSecret(secret, AAD, ring), AAD, ring)).toBe(secret);
    }
  });

  it("usa o formato v1:<nonce>:<tag>:<cifra>, sem o segredo em claro", () => {
    const token = encryptSecret("sk_live_abc123", AAD, ring);

    expect(token).toMatch(/^v1:[\w-]{16}:[\w-]{22}:[\w-]+$/);
    expect(token).not.toContain("sk_live");
  });

  it("gera nonce novo a cada registro", () => {
    const first = encryptSecret("mesmo", AAD, ring);
    const second = encryptSecret("mesmo", AAD, ring);

    expect(first).not.toBe(second);
  });

  it("falha com a chave errada", () => {
    const token = encryptSecret("segredo", AAD, ring);
    const wrong = { version: 1, key: randomBytes(32) };

    expect(() => decryptSecret(token, AAD, wrong)).toThrow(SecretDecryptError);
  });

  it("falha com texto adulterado ou malformado", () => {
    const [version, nonce, tag, cipher = ""] = encryptSecret(
      "segredo",
      AAD,
      ring,
    ).split(":");
    const flipped = `${cipher.startsWith("A") ? "B" : "A"}${cipher.slice(1)}`;

    expect(() =>
      decryptSecret([version, nonce, tag, flipped].join(":"), AAD, ring),
    ).toThrow(SecretDecryptError);
    expect(() => decryptSecret("texto-qualquer", AAD, ring)).toThrow(
      SecretDecryptError,
    );
  });

  it("não decifra com o aad de outro dono", () => {
    const token = encryptSecret("segredo", AAD, ring);

    expect(() => decryptSecret(token, "tenant-b:stripe", ring)).toThrow(
      SecretDecryptError,
    );
  });

  it("na rotação, lê a versão anterior e grava na nova", () => {
    const token = encryptSecret("segredo", AAD, ring);
    const rotated = { version: 2, key: randomBytes(32), previous: ring.key };

    expect(decryptSecret(token, AAD, rotated)).toBe("segredo");
    expect(encryptSecret("segredo", AAD, rotated)).toMatch(/^v2:/);
  });

  it("sem a chave anterior, a versão antiga falha", () => {
    const token = encryptSecret("segredo", AAD, ring);

    expect(() =>
      decryptSecret(token, AAD, { version: 2, key: randomBytes(32) }),
    ).toThrow(SecretDecryptError);
  });
});
