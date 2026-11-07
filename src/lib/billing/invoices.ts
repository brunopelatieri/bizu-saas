import { and, desc, eq, isNull } from "drizzle-orm";
import { type Tx, withTenant } from "@/db/rls";
import { invoice } from "@/db/schema";
import type { InvoiceStatus, PaymentMethod } from "@/lib/billing/constants";
import { nextInvoiceStatus } from "@/lib/billing/state-machine";
import { notFound } from "@/lib/tenant/errors";

/** Espelho local das faturas. Escreve quem já travou a assinatura; lê o owner, por tenant. */

export type InvoiceRow = typeof invoice.$inferSelect;

/** Link de fatura vem de fora e vira `href`: só `https` passa. */
export function safeUrl(url: string | undefined) {
  if (!url) return undefined;

  try {
    return new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

type InvoiceTarget = {
  id: string;
  tenantId: string;
  provider: string;
};

type InvoiceData = {
  amountCents?: number;
  currency?: string;
  status?: InvoiceStatus;
  paymentMethod?: PaymentMethod;
  dueAt?: Date;
  paidAt?: Date;
  hostedUrl?: string;
  pixPayload?: string;
  boletoLine?: string;
  attempt?: number;
};

/** Sem valor indefinido no `set`: evento parcial não apaga o que outro já trouxe. */
const defined = <T extends object>(values: T) =>
  Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

export type InvoiceChange = {
  invoice: InvoiceRow;
  created: boolean;
  /** Status antes do evento; `null` se a fatura é nova. */
  previous: InvoiceStatus | null;
};

/**
 * Cria ou atualiza pela referência do provedor. Sem linha com essa referência, adota a
 * fatura aberta do checkout inline, que nasceu sem ela. `null`: a referência é de outro
 * tenant, e nada é tocado.
 */
export async function upsertInvoice(
  tx: Tx,
  subscription: InvoiceTarget,
  invoiceRef: string,
  data: InvoiceData,
): Promise<InvoiceChange | null> {
  const provider = subscription.provider as InvoiceRow["provider"];
  const [byRef] = await tx
    .select()
    .from(invoice)
    .where(and(eq(invoice.provider, provider), eq(invoice.providerRef, invoiceRef)))
    .for("update");

  if (byRef && byRef.tenantId !== subscription.tenantId) return null;

  const [inline] = byRef
    ? []
    : await tx
        .select()
        .from(invoice)
        .where(
          and(
            eq(invoice.subscriptionId, subscription.id),
            eq(invoice.provider, provider),
            isNull(invoice.providerRef),
            eq(invoice.status, "open"),
          ),
        )
        .orderBy(desc(invoice.createdAt))
        .limit(1)
        .for("update");

  const current = byRef ?? inline;

  if (!current) {
    const [created] = await tx
      .insert(invoice)
      .values({
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
        provider,
        providerRef: invoiceRef,
        amountCents: 0,
        ...defined(data),
      })
      .returning();
    if (!created) throw new Error("fatura não criada");

    return { invoice: created, created: true, previous: null };
  }

  const [updated] = await tx
    .update(invoice)
    .set({
      ...defined(data),
      providerRef: invoiceRef,
      status: nextInvoiceStatus(current.status, data.status ?? current.status),
    })
    .where(eq(invoice.id, current.id))
    .returning();
  if (!updated) throw new Error("fatura não atualizada");

  return { invoice: updated, created: false, previous: current.status };
}

/** Valor da última cobrança em aberto, para os avisos da carência. */
export async function latestUnpaidInvoice(tx: Tx, subscriptionId: string) {
  const rows = await tx
    .select()
    .from(invoice)
    .where(eq(invoice.subscriptionId, subscriptionId))
    .orderBy(desc(invoice.createdAt))
    .limit(10);

  return rows.find(({ status }) => status === "failed" || status === "open") ?? null;
}

const publicColumns = {
  id: invoice.id,
  amountCents: invoice.amountCents,
  currency: invoice.currency,
  status: invoice.status,
  paymentMethod: invoice.paymentMethod,
  dueAt: invoice.dueAt,
  paidAt: invoice.paidAt,
  periodStart: invoice.periodStart,
  periodEnd: invoice.periodEnd,
  hostedUrl: invoice.hostedUrl,
  createdAt: invoice.createdAt,
};

export function listInvoices(tenantId: string, limit = 50) {
  return withTenant(tenantId, (tx) =>
    tx
      .select(publicColumns)
      .from(invoice)
      .where(eq(invoice.tenantId, tenantId))
      .orderBy(desc(invoice.createdAt))
      .limit(limit),
  );
}

/** Polling do checkout inline: traz também Pix e boleto. */
export async function getInvoice(tenantId: string, invoiceId: string) {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        ...publicColumns,
        pixPayload: invoice.pixPayload,
        boletoLine: invoice.boletoLine,
      })
      .from(invoice)
      .where(and(eq(invoice.id, invoiceId), eq(invoice.tenantId, tenantId))),
  );

  if (!row) throw notFound("Fatura não encontrada.");

  return row;
}
