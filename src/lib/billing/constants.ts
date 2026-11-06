/**
 * Constantes de cobrança sem dependência de servidor: o schema do Drizzle, os schemas
 * Zod e a interface importam daqui. Importe por caminho relativo no schema, porque o
 * Drizzle Kit carrega `src/db/schema.ts` sem o alias `@/`.
 */

export const paymentProviderIds = [
  "stripe",
  "asaas",
  "mercadopago",
  "pagarme",
  "pagbank",
] as const;
export type PaymentProviderId = (typeof paymentProviderIds)[number];

export const priceIntervals = ["month", "year"] as const;
export type PriceInterval = (typeof priceIntervals)[number];

export const paymentMethods = ["pix", "boleto", "card"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  boleto: "Boleto",
  card: "Cartão",
};

export const invoiceStatuses = [
  "open",
  "paid",
  "failed",
  "refunded",
  "void",
] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: "Em aberto",
  paid: "Paga",
  failed: "Falhou",
  refunded: "Reembolsada",
  void: "Cancelada",
};

export const paymentEventStatuses = [
  "pending",
  "processed",
  "ignored",
  "failed",
  "duplicate",
] as const;

export const PROVIDER_LABELS: Record<PaymentProviderId, string> = {
  stripe: "Stripe",
  asaas: "Asaas",
  mercadopago: "Mercado Pago",
  pagarme: "Pagar.me",
  pagbank: "PagBank",
};

export const INTERVAL_LABELS: Record<PriceInterval, string> = {
  month: "mês",
  year: "ano",
};

/** Limites que um plano pode fixar (`plan.limits`). */
export const limitMetrics = [
  "members",
  "customers",
  "storage_mb",
  "custom_roles",
] as const;
export type LimitMetric = (typeof limitMetrics)[number];

export const LIMIT_LABELS: Record<LimitMetric, string> = {
  members: "membros",
  customers: "clientes",
  storage_mb: "armazenamento (MB)",
  custom_roles: "papéis personalizados",
};

export function formatMoney(cents: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
    cents / 100,
  );
}
