import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import type { BillingAddress, DocumentType, SubscriptionStatus } from "@/db/schema/billing";
import type {
  InvoiceStatus,
  PaymentMethod,
  PaymentProviderId,
  PriceInterval,
} from "@/lib/billing/constants";
import { useAuth } from "@/providers/auth-provider";

/** Contratos de `/api/billing/*` vistos pelo cliente. A chave começa com `billing`. */

export type BillingPrice = {
  id: string;
  provider: PaymentProviderId;
  interval: PriceInterval;
  amountCents: number;
  currency: string;
};

export type BillingPlan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isFree: boolean;
  limits: Record<string, number | null | undefined>;
  features: string[];
  prices: BillingPrice[];
};

export type BillingProvider = {
  id: PaymentProviderId;
  methods: PaymentMethod[];
  customerPortal: boolean;
  pause: boolean;
};

export type PlansResponse = {
  plans: BillingPlan[];
  providers: BillingProvider[];
};

export type BillingProfile = {
  legalName: string;
  document: string;
  documentType: DocumentType;
  email: string;
  address: BillingAddress;
};

export type Invoice = {
  id: string;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  paymentMethod: PaymentMethod | null;
  dueAt: string | null;
  paidAt: string | null;
  hostedUrl: string | null;
  createdAt: string;
  pixPayload?: string | null;
  boletoLine?: string | null;
};

export type SubscriptionView = {
  status: SubscriptionStatus;
  plan: { id: string; name: string; isFree: boolean };
  planPriceId: string | null;
  provider: PaymentProviderId | null;
  /** Há assinatura no provedor: troca de plano em vez de checkout. */
  paid: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  graceUntil: string | null;
  pendingPlan: { id: string; name: string } | null;
};

export type SubscriptionResponse = {
  subscription: SubscriptionView | null;
  profile: BillingProfile | null;
  invoices: Invoice[];
};

export type CheckoutResponse =
  | { kind: "redirect"; url: string }
  | {
      kind: "inline";
      invoiceId: string;
      pixPayload?: string;
      boletoUrl?: string;
      boletoLine?: string;
      expiresAt: string;
    };

export function useBillingPlans() {
  return useQuery({
    queryKey: ["billing", "plans"],
    queryFn: () => apiFetch<PlansResponse>("/api/billing/plans"),
    retry: false,
  });
}

/** `refetchInterval`: a página de retorno usa para esperar o webhook. */
export function useSubscription(
  refetchInterval?: (data: SubscriptionResponse | undefined) => number | false,
) {
  return useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: () => apiFetch<SubscriptionResponse>("/api/billing/subscription"),
    retry: false,
    refetchInterval: refetchInterval
      ? (query) => refetchInterval(query.state.data)
      : undefined,
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: ["billing", "invoices"],
    queryFn: () => apiFetch<{ invoices: Invoice[] }>("/api/billing/invoices"),
    retry: false,
  });
}

export const INVOICE_POLL_MS = 5_000;

/** Polling do checkout inline: para quando a fatura sai de `open`. */
export function useInvoicePolling(invoiceId: string) {
  return useQuery({
    queryKey: ["billing", "invoice", invoiceId],
    queryFn: () =>
      apiFetch<{ invoice: Invoice }>(`/api/billing/invoices/${invoiceId}`),
    refetchInterval: (query) =>
      query.state.data?.invoice.status === "open" ? INVOICE_POLL_MS : false,
  });
}

type BillingRequest = {
  path: string;
  method?: "POST" | "PUT";
  body?: unknown;
};

/** Escrita: recarrega a cobrança e `/api/me`, de onde vem o banner e os limites. */
export function useBillingMutation<T = unknown>(successMessage?: string) {
  const queryClient = useQueryClient();
  const { refresh } = useAuth();

  return useMutation({
    mutationFn: ({ path, method = "POST", body }: BillingRequest) =>
      apiFetch<T>(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    onSuccess: async () => {
      if (successMessage) toast.success(successMessage);
      await queryClient.invalidateQueries({ queryKey: ["billing"] });
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
}
