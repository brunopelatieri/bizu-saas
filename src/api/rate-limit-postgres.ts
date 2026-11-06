import { and, eq, lt, sql } from "drizzle-orm";
import type { RateLimitStore } from "@/api/rate-limit";
import { getDb } from "@/db";
import { rateLimitBucket } from "@/db/schema";
import { hashIp } from "@/lib/audit";

/** A maior janela em uso é 1 h; os buckets vencidos saem em `maintenance.prune`. */
export const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Janela fixa alinhada ao relógio, a mesma em toda instância. O upsert é atômico: duas
 * instâncias ao mesmo tempo não perdem contagem. A chave traz o IP, por isso vai em hash.
 */
export const postgresRateLimitStore: RateLimitStore = {
  async hit(key, windowMs, now) {
    const start = Math.floor(now / windowMs) * windowMs;
    const [row] = await getDb()
      .insert(rateLimitBucket)
      .values({ key: hashIp(key), windowStart: new Date(start), count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitBucket.key, rateLimitBucket.windowStart],
        set: { count: sql`"rate_limit_bucket"."count" + 1` },
      })
      .returning({ count: rateLimitBucket.count });

    return { count: row?.count ?? 1, resetAt: start + windowMs };
  },

  async undo(key, { resetAt }, windowMs) {
    await getDb()
      .update(rateLimitBucket)
      .set({ count: sql`greatest("rate_limit_bucket"."count" - 1, 0)` })
      .where(
        and(
          eq(rateLimitBucket.key, hashIp(key)),
          eq(rateLimitBucket.windowStart, new Date(resetAt - windowMs)),
        ),
      );
  },
};

export async function pruneRateLimitBuckets(now = new Date()) {
  const cutoff = new Date(now.getTime() - RATE_LIMIT_RETENTION_MS);
  const deleted = await getDb()
    .delete(rateLimitBucket)
    .where(lt(rateLimitBucket.windowStart, cutoff))
    .returning({ key: rateLimitBucket.key });

  return deleted.length;
}
