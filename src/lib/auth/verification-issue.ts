import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  type EmailVerificationKind,
  emailVerificationIssue,
} from "@/db/schema";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Claims do JWT de verificação, sem validar: quem valida é o Better Auth. */
export type VerificationClaims = {
  email?: string;
  updateTo?: string;
  requestType?: string;
};

export function readVerificationClaims(token: string): VerificationClaims {
  const payload = token.split(".")[1];
  if (!payload) return {};

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/** Grava a emissão vigente do usuário; a anterior deixa de valer. */
export async function recordVerificationIssue(
  userId: string,
  token: string,
  kind: EmailVerificationKind,
) {
  const values = { tokenHash: hashToken(token), kind, issuedAt: new Date() };

  await getDb()
    .insert(emailVerificationIssue)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: emailVerificationIssue.userId, set: values });
}

/**
 * Consome a emissão em um único `DELETE`: de dois cliques simultâneos, só um vê a
 * linha. Devolve `false` para token anterior, já usado ou desconhecido.
 */
export async function consumeVerificationIssue(token: string) {
  const deleted = await getDb()
    .delete(emailVerificationIssue)
    .where(eq(emailVerificationIssue.tokenHash, hashToken(token)))
    .returning({ userId: emailVerificationIssue.userId });

  return deleted.length > 0;
}
