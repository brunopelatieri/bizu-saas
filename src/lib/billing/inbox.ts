import { randomUUID } from "node:crypto";
import { and, count, desc, eq, lt, type SQL, sql } from "drizzle-orm";
import { logError } from "@/api/log";
import { withPlatformScope } from "@/db/rls";
import { paymentEvent } from "@/db/schema";
import type { PaymentEventStatus } from "@/db/schema/billing";
import { getBoss } from "@/jobs/boss";
import { QUEUE, type WebhookProcessJob } from "@/jobs/queues";
import type { PaymentProviderId } from "@/lib/billing/constants";
import { PAGE_SIZE } from "@/lib/schemas/admin";
import { notFound, TenantRuleError } from "@/lib/tenant/errors";

/**
 * Caixa de entrada dos webhooks (`payment_event`). O handler HTTP grava e enfileira; quem
 * aplica é o job `webhook.process`, com retry. Reconhecer rápido é o que evita o provedor
 * reenviar à toa, e a unique por evento é o que torna o reenvio inofensivo.
 */

/** Só estes cabeçalhos ficam: os demais podem carregar segredo (token estático do provedor). */
const KEPT_HEADERS = ["content-type", "user-agent"];

export function safeHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    KEPT_HEADERS.flatMap((name) =>
      headers[name] ? [[name, headers[name].slice(0, 200)]] : [],
    ),
  );
}

/** Assinatura inválida: fica o rastro, nunca o corpo de quem não provou quem é. */
export async function recordRejected(
  provider: PaymentProviderId,
  headers: Record<string, string>,
  reason: string,
) {
  try {
    await withPlatformScope("webhook: assinatura inválida", (tx) =>
      tx.insert(paymentEvent).values({
        provider,
        providerEventId: `rejected:${randomUUID()}`,
        headers: safeHeaders(headers),
        verified: false,
        status: "failed",
        error: reason.slice(0, 200),
      }),
    );
  } catch (error) {
    logError("Falha ao registrar webhook recusado", error);
  }
}

/** `duplicate`: o evento já estava na caixa. `pending`: ainda não terminou lá. */
export async function receiveEvent(input: {
  provider: PaymentProviderId;
  eventId: string;
  eventType?: string;
  raw: unknown;
  headers: Record<string, string>;
}) {
  return withPlatformScope("webhook: recebe evento", async (tx) => {
    const [created] = await tx
      .insert(paymentEvent)
      .values({
        provider: input.provider,
        providerEventId: input.eventId,
        eventType: input.eventType?.slice(0, 100),
        raw: input.raw,
        headers: safeHeaders(input.headers),
        verified: true,
        status: "pending",
      })
      .onConflictDoNothing({
        target: [paymentEvent.provider, paymentEvent.providerEventId],
      })
      .returning({ id: paymentEvent.id });

    if (created) return { id: created.id, duplicate: false, pending: true };

    const [existing] = await tx
      .select({ id: paymentEvent.id, status: paymentEvent.status })
      .from(paymentEvent)
      .where(
        and(
          eq(paymentEvent.provider, input.provider),
          eq(paymentEvent.providerEventId, input.eventId),
        ),
      );
    if (!existing) throw new Error("evento não encontrado após conflito");

    return {
      id: existing.id,
      duplicate: true,
      pending: existing.status === "pending",
    };
  });
}

type Enqueue = (paymentEventId: string) => Promise<void>;

const enqueueWithBoss: Enqueue = async (paymentEventId) => {
  const boss = await getBoss();
  const job: WebhookProcessJob = { paymentEventId };
  // A fila é `exclusive`: com um job vivo para o evento, `send` não cria outro.
  await boss.send(QUEUE.webhookProcess, job, { singletonKey: paymentEventId });
};

let enqueue: Enqueue = enqueueWithBoss;

export const enqueueWebhook: Enqueue = (paymentEventId) => enqueue(paymentEventId);

/** Sem pg-boss nos testes de fluxo: eles chamam o job direto. `undefined` restaura. */
export function setWebhookQueueForTests(next: Enqueue | undefined) {
  enqueue = next ?? enqueueWithBoss;
}

export async function listPaymentEvents(input: {
  status?: PaymentEventStatus;
  page: number;
}) {
  const where: SQL | undefined = input.status
    ? eq(paymentEvent.status, input.status)
    : undefined;

  return withPlatformScope("admin: lista webhooks", async (tx) => {
    const [total] = await tx
      .select({ total: count() })
      .from(paymentEvent)
      .where(where);

    // `raw` tem dado pessoal e fica fora da listagem.
    const items = await tx
      .select({
        id: paymentEvent.id,
        provider: paymentEvent.provider,
        providerEventId: paymentEvent.providerEventId,
        eventType: paymentEvent.eventType,
        status: paymentEvent.status,
        verified: paymentEvent.verified,
        attempts: paymentEvent.attempts,
        error: paymentEvent.error,
        receivedAt: paymentEvent.receivedAt,
        processedAt: paymentEvent.processedAt,
        tenantId: paymentEvent.tenantId,
      })
      .from(paymentEvent)
      .where(where)
      .orderBy(desc(paymentEvent.receivedAt))
      .limit(PAGE_SIZE)
      .offset((input.page - 1) * PAGE_SIZE);

    return { items, total: total?.total ?? 0, pageSize: PAGE_SIZE };
  });
}

/**
 * Volta o evento para a fila. Evento já processado não repete (duplicaria e-mail), e o que
 * falhou na assinatura nunca foi confiável.
 */
export async function reprocessEvent(id: string) {
  const [event] = await withPlatformScope("admin: reprocessa webhook", async (tx) => {
    const [row] = await tx
      .select({ status: paymentEvent.status, verified: paymentEvent.verified })
      .from(paymentEvent)
      .where(eq(paymentEvent.id, id))
      .for("update");

    if (!row) throw notFound("Evento não encontrado.");
    if (!row.verified || (row.status !== "failed" && row.status !== "ignored")) {
      throw new TenantRuleError(
        409,
        "NOT_REPROCESSABLE",
        "Este evento não pode ser reprocessado.",
      );
    }

    return tx
      .update(paymentEvent)
      .set({ status: "pending", error: null, processedAt: null })
      .where(eq(paymentEvent.id, id))
      .returning({ id: paymentEvent.id });
  });

  if (event) await enqueueWebhook(event.id);

  return event;
}

/** Evento que ficou sem job (fila fora do ar na hora): a reconciliação o devolve. */
export async function requeueStuckEvents(now: Date, ageMinutes = 10) {
  const cutoff = new Date(now.getTime() - ageMinutes * 60_000);
  const stuck = await withPlatformScope("billing.reconcile: eventos parados", (tx) =>
    tx
      .select({ id: paymentEvent.id })
      .from(paymentEvent)
      .where(
        and(
          eq(paymentEvent.status, "pending"),
          lt(paymentEvent.receivedAt, sql`${cutoff.toISOString()}::timestamptz`),
        ),
      ),
  );

  for (const { id } of stuck) await enqueueWebhook(id);

  return stuck.length;
}
