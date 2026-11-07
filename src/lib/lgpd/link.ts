import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * Assinatura do link de download da exportação: HMAC-SHA256 de `id.expira` com um segredo
 * derivado de `BETTER_AUTH_SECRET` (o segredo bruto nunca assina outra coisa). O link vale por
 * 7 dias e **não** basta: a rota ainda exige a sessão da própria pessoa. Não é consumido no
 * GET, porque baixar duas vezes dentro do prazo é legítimo.
 */

export const EXPORT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Só os testes passam o segredo; no app é sempre `BETTER_AUTH_SECRET`. */
const appSecret = () => getEnv().BETTER_AUTH_SECRET;

function key(secret: string) {
  return createHmac("sha256", secret).update("bizu:lgpd-export-link:v1").digest();
}

function mac(exportId: string, expiresAtSeconds: number, secret: string) {
  return createHmac("sha256", key(secret))
    .update(`${exportId}.${expiresAtSeconds}`)
    .digest("hex");
}

/** `<expira em segundos>.<hmac>`: vai no parâmetro `sig`. */
export function signExportLink(
  exportId: string,
  expiresAt: Date,
  secret: string = appSecret(),
) {
  const seconds = Math.floor(expiresAt.getTime() / 1000);
  return `${seconds}.${mac(exportId, seconds, secret)}`;
}

export type SignatureCheck = "ok" | "invalid" | "expired";

export function verifyExportSignature(
  exportId: string,
  signature: string | undefined,
  now = new Date(),
  secret: string = appSecret(),
): SignatureCheck {
  const [rawSeconds, given] = (signature ?? "").split(".");
  const seconds = Number(rawSeconds);

  if (!given || !Number.isInteger(seconds) || !/^[0-9a-f]{64}$/.test(given)) {
    return "invalid";
  }

  const expected = Buffer.from(mac(exportId, seconds, secret), "hex");
  const received = Buffer.from(given, "hex");

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return "invalid";
  }

  return seconds * 1000 > now.getTime() ? "ok" : "expired";
}
