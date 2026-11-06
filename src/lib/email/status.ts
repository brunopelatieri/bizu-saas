import type { EmailMessageStatus } from "@/db/schema";

/**
 * Eventos do provedor chegam fora de ordem e podem se repetir. O status só avança:
 * `queued` < `sent` < `delivered` < `bounced` < `complained`. `failed` aceita
 * qualquer evento (o provedor sabe mais do que o nosso último erro).
 */
const RANK: Record<EmailMessageStatus, number> = {
  failed: -1,
  queued: 0,
  sent: 1,
  delivered: 2,
  bounced: 3,
  complained: 4,
};

export function canAdvance(from: EmailMessageStatus, to: EmailMessageStatus) {
  return RANK[to] > RANK[from];
}

/** Status que podem ser substituídos por `to` (para o `WHERE` do UPDATE). */
export function statusesBelow(to: EmailMessageStatus): EmailMessageStatus[] {
  return (Object.keys(RANK) as EmailMessageStatus[]).filter((status) =>
    canAdvance(status, to),
  );
}
