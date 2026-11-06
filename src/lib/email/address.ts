import { createHash } from "node:crypto";

/** Minúsculas e sem espaços: a mesma forma para hash, supressão e comparação. */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * sha256 do e-mail normalizado. É o que `email_message.to_hash` e
 * `email_suppression.email_hash` guardam: o endereço em claro nunca vai para o banco.
 */
export function hashEmail(email: string) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

/** Extrai `ana@example.com` de `Ana <ana@example.com>`; devolve o texto como veio se não houver `<>`. */
export function extractEmailAddress(value: string) {
  const match = value.match(/<([^<>\s]+)>\s*$/);
  return (match?.[1] ?? value).trim();
}
