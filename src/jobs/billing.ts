import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { logError } from "@/api/log";
import { withPlatformScope, withTenant } from "@/db/rls";
import { organization, subscription } from "@/db/schema";
import { auditInTransaction } from "@/lib/audit";
import { appLink } from "@/lib/auth/links";
import { listTenantOwners } from "@/lib/billing/notify";
import { loadSettings } from "@/lib/billing/settings";
import { recordSubscriptionEvent } from "@/lib/billing/subscription";
import { DAY_MS, dueTrialNotice, type TrialNotice } from "@/lib/billing/trial";
import { sendEmail } from "@/lib/email/send";
import { trialEndingTemplate } from "@/lib/email/templates/trial-ending";
import { trialExpiredTemplate } from "@/lib/email/templates/trial-expired";

/** Janela em que o primeiro aviso (T-3) já pode estar devido. */
const LOOKAHEAD_DAYS = 3;

export type TrialJobResult = {
  expired: number;
  notices: Record<TrialNotice, number>;
};

type Candidate = {
  subscriptionId: string;
  tenantId: string;
  tenantName: string;
  trialEndsAt: Date;
};

/**
 * Marca o aviso como enviado antes de enviar, de forma atômica: dois jobs ao mesmo tempo
 * (ou o mesmo job duas vezes) só deixam um passar. Devolve `false` se já estava marcado.
 */
async function claimNotice(
  { tenantId, subscriptionId }: Candidate,
  notice: TrialNotice,
  now: Date,
) {
  const claimed = await withTenant(tenantId, (tx) =>
    tx
      .update(subscription)
      .set({
        metadata: sql`jsonb_set(${subscription.metadata}, '{trialNotices}', coalesce(${subscription.metadata}->'trialNotices', '{}'::jsonb) || jsonb_build_object(${notice}::text, ${now.toISOString()}::text), true)`,
      })
      .where(
        and(
          eq(subscription.id, subscriptionId),
          sql`${subscription.metadata}->'trialNotices'->>${notice} is null`,
        ),
      )
      .returning({ id: subscription.id }),
  );

  return claimed.length > 0;
}

/** Se o envio falha, o aviso volta a ser devido e a próxima tentativa do job o refaz. */
async function releaseNotice(
  { tenantId, subscriptionId }: Candidate,
  notice: TrialNotice,
) {
  await withTenant(tenantId, (tx) =>
    tx
      .update(subscription)
      .set({
        metadata: sql`${subscription.metadata} #- array['trialNotices', ${notice}::text]`,
      })
      .where(eq(subscription.id, subscriptionId)),
  );
}

async function sendNotice(candidate: Candidate, notice: TrialNotice) {
  const owners = await listTenantOwners(candidate.tenantId);
  const url = appLink("/app/assinatura");

  for (const owner of owners) {
    const base = { name: owner.name, tenantName: candidate.tenantName, url };
    const content =
      notice === "expired"
        ? trialExpiredTemplate(base)
        : trialEndingTemplate({
            ...base,
            daysLeft: notice === "t3" ? 3 : notice === "t1" ? 1 : 0,
            endsAt: candidate.trialEndsAt,
          });

    await sendEmail({
      to: owner.email,
      ...content,
      tags: {
        template: notice === "expired" ? "trial-expired" : "trial-ending",
      },
    });
  }
}

/** Passa o trial vencido para `expired` e o tenant para `read_only`. */
async function expireTrial(candidate: Candidate) {
  return withTenant(candidate.tenantId, async (tx) => {
    const [expired] = await tx
      .update(subscription)
      .set({ status: "expired" })
      .where(
        and(
          eq(subscription.id, candidate.subscriptionId),
          eq(subscription.status, "trialing"),
        ),
      )
      .returning({ id: subscription.id });

    if (!expired) return false;

    // Suspensão (`locked`) tem precedência: só `full` vira `read_only`.
    await tx
      .update(organization)
      .set({ accessMode: "read_only" })
      .where(
        and(
          eq(organization.id, candidate.tenantId),
          eq(organization.accessMode, "full"),
        ),
      );
    await recordSubscriptionEvent(tx, {
      tenantId: candidate.tenantId,
      subscriptionId: candidate.subscriptionId,
      from: "trialing",
      to: "expired",
      reason: "trial_expired",
      source: "job",
    });
    await auditInTransaction(tx, "billing.trial_expired", {
      actor: { type: "system", id: null },
      tenantId: candidate.tenantId,
      target: { type: "subscription", id: candidate.subscriptionId },
    });

    return true;
  });
}

/**
 * `billing.trial` (cron diário). Para cada trial em curso: avisa em T-3, T-1 e T0 e,
 * passada a carência (`grace_days`), expira para `read_only` e avisa. Cada aviso é
 * marcado em `subscription.metadata` e sai uma vez só: rodar duas vezes não repete
 * e-mail. Um tenant com falha não impede os outros; o erro sobe no fim para o pg-boss
 * tentar de novo.
 */
export async function runBillingTrial(
  now = new Date(),
  /** Restringe a execução a estes tenants (testes e reprocessamento pontual). */
  options: { tenantIds?: string[] } = {},
): Promise<TrialJobResult> {
  const { graceDays } = await loadSettings();
  const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * DAY_MS);

  const rows = await withPlatformScope("billing.trial: lista trials", (tx) =>
    tx
      .select({
        subscriptionId: subscription.id,
        tenantId: subscription.tenantId,
        tenantName: organization.name,
        trialEndsAt: subscription.trialEndsAt,
      })
      .from(subscription)
      .innerJoin(organization, eq(subscription.tenantId, organization.id))
      .where(
        and(
          eq(subscription.status, "trialing"),
          isNotNull(subscription.trialEndsAt),
          lte(subscription.trialEndsAt, horizon),
          eq(organization.status, "active"),
          options.tenantIds
            ? inArray(subscription.tenantId, options.tenantIds)
            : undefined,
        ),
      ),
  );

  const candidates = rows.flatMap(({ trialEndsAt, ...rest }) =>
    trialEndsAt ? [{ ...rest, trialEndsAt }] : [],
  );

  const result: TrialJobResult = {
    expired: 0,
    notices: { t3: 0, t1: 0, t0: 0, expired: 0 },
  };
  const failures: unknown[] = [];

  for (const candidate of candidates) {
    const notice = dueTrialNotice({
      now,
      trialEndsAt: candidate.trialEndsAt,
      graceDays,
    });
    if (!notice) continue;

    try {
      if (notice === "expired" && (await expireTrial(candidate))) {
        result.expired += 1;
      }

      if (!(await claimNotice(candidate, notice, now))) continue;

      try {
        await sendNotice(candidate, notice);
        result.notices[notice] += 1;
      } catch (error) {
        await releaseNotice(candidate, notice);
        throw error;
      }
    } catch (error) {
      logError("Falha ao processar trial", error);
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new Error(`billing.trial: ${failures.length} tenant(s) com falha`);
  }

  return result;
}

export async function handleBillingTrial() {
  await runBillingTrial();
}
