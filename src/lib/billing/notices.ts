import { and, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db/rls";
import { subscription } from "@/db/schema";

/**
 * Avisos que saem uma vez só (`billing.trial`, `billing.dunning`). Cada um é reservado em
 * `subscription.metadata.<lista>.<aviso>` de forma atômica antes do envio: dois jobs ao
 * mesmo tempo (ou o mesmo job duas vezes) só deixam um passar.
 */

export type NoticeList = "trialNotices" | "dunningNotices";

type NoticeTarget = { tenantId: string; subscriptionId: string };

/** Devolve `false` se o aviso já estava reservado. */
export async function claimNotice(
  { tenantId, subscriptionId }: NoticeTarget,
  list: NoticeList,
  notice: string,
  now: Date,
) {
  const claimed = await withTenant(tenantId, (tx) =>
    tx
      .update(subscription)
      .set({
        metadata: sql`jsonb_set(${subscription.metadata}, array[${list}::text], coalesce(${subscription.metadata}->${list}::text, '{}'::jsonb) || jsonb_build_object(${notice}::text, ${now.toISOString()}::text), true)`,
      })
      .where(
        and(
          eq(subscription.id, subscriptionId),
          sql`${subscription.metadata}->${list}::text->>${notice}::text is null`,
        ),
      )
      .returning({ id: subscription.id }),
  );

  return claimed.length > 0;
}

/** Se o envio falha, o aviso volta a ser devido e a próxima tentativa do job o refaz. */
export async function releaseNotice(
  { tenantId, subscriptionId }: NoticeTarget,
  list: NoticeList,
  notice: string,
) {
  await withTenant(tenantId, (tx) =>
    tx
      .update(subscription)
      .set({
        metadata: sql`${subscription.metadata} #- array[${list}::text, ${notice}::text]`,
      })
      .where(eq(subscription.id, subscriptionId)),
  );
}
