import { lt, sql } from "drizzle-orm";
import { pruneRateLimitBuckets } from "@/api/rate-limit-postgres";
import { getDb } from "@/db";
import { emailMessages } from "@/db/schema";

export const EMAIL_MESSAGE_RETENTION_DAYS = 180;

/**
 * `maintenance.prune` (cron diário). Apaga `email_message` com mais de 180 dias e os
 * buckets vencidos de rate limit; as fases seguintes acrescentam `payment_event` e sessões.
 * Idempotente: rodar duas vezes seguidas não apaga nada a mais.
 */
export async function pruneOldData(now = new Date()) {
  const cutoff = new Date(now.getTime() - EMAIL_MESSAGE_RETENTION_DAYS * 86_400_000);

  const deleted = await getDb()
    .delete(emailMessages)
    .where(lt(emailMessages.createdAt, sql`${cutoff.toISOString()}::timestamptz`))
    .returning({ id: emailMessages.id });

  return {
    emailMessages: deleted.length,
    rateLimitBuckets: await pruneRateLimitBuckets(now),
  };
}

export async function handleMaintenancePrune() {
  await pruneOldData();
}
