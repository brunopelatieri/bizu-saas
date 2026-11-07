import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { api } from "@/api/app";
import type {
  NormalizedEvent,
  PaymentProvider,
  RemoteInvoice,
  RemoteSubscription,
} from "@/lib/payments/types";
import { createUser, type TestUser } from "./tenant-helpers";

/** Apoio dos testes de planos, admin e trial. */

export const PLAN_PREFIX = "test-";

export async function bodyOf(response: Response) {
  return (await response.clone().json()) as Record<string, unknown> & {
    code?: string;
    error?: string;
  };
}

/** Usuário com papel de plataforma. O papel vale já: `requireAuth` lê do banco. */
export async function makePlatformUser(
  owner: postgres.Sql,
  role: "platform_owner" | "platform_support",
): Promise<TestUser> {
  const user = await createUser(owner);
  await owner`update "user" set role = ${role} where id = ${user.id}`;

  return user;
}

export type SavedSettings = Array<{ key: string; value: unknown }>;

/** As configurações da plataforma são compartilhadas: o teste guarda e devolve. */
export async function saveSettings(owner: postgres.Sql): Promise<SavedSettings> {
  return owner<SavedSettings>`select key, value from platform_setting`;
}

export async function restoreSettings(owner: postgres.Sql, saved: SavedSettings) {
  await owner.begin(async (tx) => {
    await tx`delete from platform_setting`;
    for (const { key, value } of saved) {
      await tx`insert into platform_setting (key, value) values (${key}, ${tx.json(value as never)})`;
    }
  });
}

export async function setSettings(
  owner: postgres.Sql,
  settings: { trialPlanId: string | null; trialDays: number; graceDays: number },
) {
  const rows = [
    ["trial_plan_id", settings.trialPlanId],
    ["trial_days", settings.trialDays],
    ["grace_days", settings.graceDays],
  ] as const;

  await owner.begin(async (tx) => {
    for (const [key, value] of rows) {
      await tx`
        insert into platform_setting (key, value) values (${key}, ${tx.json(value)})
        on conflict (key) do update set value = excluded.value
      `;
    }
  });
}

export async function createPlanRow(
  owner: postgres.Sql,
  options: {
    isFree: boolean;
    limits?: Record<string, number | null>;
    features?: string[];
  },
) {
  const slug = `${PLAN_PREFIX}${randomUUID().slice(0, 8)}`;
  const [row] = await owner<{ id: string }[]>`
    insert into plan (slug, name, is_free, limits, features)
    values (${slug}, ${`Plano ${slug}`}, ${options.isFree},
            ${owner.json(options.limits ?? {})}, ${options.features ?? []})
    returning id
  `;
  if (!row) throw new Error("plano não criado");

  return { id: row.id, slug };
}

/**
 * Garante a assinatura do tenant no plano pedido. Sem o seed (como no CI) não há plano nem
 * trial, e `createTenant` deixa o tenant sem assinatura.
 */
export async function ensureSubscription(
  owner: postgres.Sql,
  tenantId: string,
  planId: string,
  status = "active",
) {
  await asPlatform(
    owner,
    (tx) => tx`
      insert into subscription (tenant_id, plan_id, status)
      values (${tenantId}, ${planId}, ${status})
      on conflict (tenant_id) do update set plan_id = excluded.plan_id, status = excluded.status
    `,
  );
}

/** Os tenants de teste saem em `cleanUp`; aqui saem os planos que ficaram sem assinatura. */
export async function cleanUpBilling(owner: postgres.Sql) {
  await owner.begin(async (tx) => {
    await tx`select set_config('app.bypass_tenant', 'on', true)`;
    // Tenants de teste ainda existem neste ponto: some a assinatura deles antes.
    await tx`
      delete from subscription where tenant_id in (
        select m.organization_id from member m
        join "user" u on u.id = m.user_id
        where u.email like ${"%@tenant-test.bizu.local"}
      )
    `;
    await tx`
      delete from audit_log where actor_type = 'platform' and actor_id in (
        select id from "user" where email like ${"%@tenant-test.bizu.local"}
      )
    `;
    await tx`delete from payment_event where provider = ${STUB_ID}`;
    // O seed roda com a configuração de teste: `acme` pode nascer num plano `test-`.
    await tx`
      delete from subscription where plan_id in (
        select id from plan where slug like ${`${PLAN_PREFIX}%`}
      )
    `;
    await tx`delete from plan where slug like ${`${PLAN_PREFIX}%`}`;
  });
}

/** Provedor de mentira. O id é o de um módulo que não existe no repositório. */
export const STUB_ID = "pagarme";

const DATE_FIELDS = new Set([
  "occurredAt",
  "paidAt",
  "periodStart",
  "periodEnd",
  "dueAt",
  "currentPeriodStart",
  "currentPeriodEnd",
]);

export type StubProvider = PaymentProvider & {
  /** Chamadas ao provedor, por nome do método. */
  calls: Record<string, unknown[][]>;
  remoteSubscription?: RemoteSubscription;
  remoteInvoice?: RemoteInvoice;
};

/** Verifica por cabeçalho e lê os eventos do próprio corpo: `{ id, events }`. */
export function createStubProvider(
  overrides: Partial<PaymentProvider> = {},
): StubProvider {
  const calls: Record<string, unknown[][]> = {};
  const record = (name: string, args: unknown[]) => {
    calls[name] = [...(calls[name] ?? []), args];
  };

  const stub: StubProvider = {
    id: STUB_ID,
    calls,
    requiresPriceRef: false,
    capabilities: {
      pix: true,
      boleto: true,
      card: true,
      debitCard: false,
      recurring: true,
      recurringPix: true,
      split: false,
      refund: true,
      partialRefund: true,
      hostedCheckout: true,
      customerPortal: true,
      pause: true,
      sandbox: true,
      webhookSignature: "hmac",
      nativeTrial: false,
      proration: true,
    },
    async ensureCustomer(...args) {
      record("ensureCustomer", args);
      return { customerRef: `cus_${randomUUID()}` };
    },
    async createCheckout(...args) {
      record("createCheckout", args);
      return { kind: "redirect", url: "https://pagamento.test/checkout" };
    },
    async updateSubscription(...args) {
      record("updateSubscription", args);
    },
    async cancelSubscription(...args) {
      record("cancelSubscription", args);
    },
    async pauseSubscription(...args) {
      record("pauseSubscription", args);
    },
    async resumeSubscription(...args) {
      record("resumeSubscription", args);
    },
    async refund(...args) {
      record("refund", args);
      return { refundRef: "re_1", status: "succeeded" };
    },
    async fetchSubscription(...args) {
      record("fetchSubscription", args);
      if (!stub.remoteSubscription) throw new Error("sem assinatura remota");
      return stub.remoteSubscription;
    },
    async fetchInvoice(...args) {
      record("fetchInvoice", args);
      if (!stub.remoteInvoice) throw new Error("sem fatura remota");
      return stub.remoteInvoice;
    },
    async verifyWebhook(_ctx, req) {
      if (req.headers["x-stub-signature"] !== "ok") {
        return { ok: false, reason: "invalid_signature" };
      }

      const { id, type } = JSON.parse(req.rawBody) as { id: string; type?: string };
      return { ok: true, eventId: id, eventType: type };
    },
    parseWebhook(rawBody) {
      const body = JSON.parse(rawBody, (key, value) =>
        DATE_FIELDS.has(key) && typeof value === "string" ? new Date(value) : value,
      ) as { events: NormalizedEvent[] };

      return body.events;
    },
    async portalUrl(...args) {
      record("portalUrl", args);
      return "https://pagamento.test/portal";
    },
    ...overrides,
  };

  return stub;
}

let webhookIp = 0;

/** Entrega um webhook do provedor stub. Cada chamada vem de um IP, salvo se pedir outro. */
export function sendWebhook(
  events: unknown[],
  options: { id?: string; signature?: string; ip?: string; provider?: string } = {},
) {
  webhookIp += 1;

  return api.request(`/api/webhooks/payments/${options.provider ?? STUB_ID}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "stub/1.0",
      "X-Stub-Signature": options.signature ?? "ok",
      "Asaas-Access-Token": "segredo-que-nao-pode-ser-gravado",
      "X-Forwarded-For": options.ip ?? `10.60.${Math.floor(webhookIp / 250)}.${(webhookIp % 250) + 1}`,
    },
    body: JSON.stringify({
      id: options.id ?? `evt_${randomUUID()}`,
      type: "teste",
      events,
    }),
  });
}

/** Plano pago com um preço no provedor stub. */
export async function createPaidPlan(
  owner: postgres.Sql,
  amountCents: number,
  options: { interval?: "month" | "year"; features?: string[] } = {},
) {
  const plan = await createPlanRow(owner, {
    isFree: false,
    features: options.features,
  });
  const [price] = await owner<{ id: string }[]>`
    insert into plan_price (plan_id, provider, interval, amount_cents, provider_price_ref)
    values (${plan.id}, ${STUB_ID}, ${options.interval ?? "month"}, ${amountCents},
            ${`price_${plan.slug}`})
    returning id
  `;
  if (!price) throw new Error("preço não criado");

  return { ...plan, priceId: price.id, priceRef: `price_${plan.slug}` };
}

/** Sem isso, um plano gratuito do seed mudaria o destino de quem cancela. */
export async function hideFreePlans(owner: postgres.Sql) {
  const rows = await owner<{ id: string }[]>`
    update plan set active = false where is_free and active returning id
  `;
  const ids = rows.map(({ id }) => id);

  return async () => {
    if (ids.length) await owner`update plan set active = true where id in ${owner(ids)}`;
  };
}

/** Lê e escreve como dono, atravessando o RLS. */
export function asPlatform<T>(
  owner: postgres.Sql,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
) {
  return owner.begin(async (tx) => {
    await tx`select set_config('app.bypass_tenant', 'on', true)`;
    return fn(tx);
  }) as Promise<T>;
}

export type SubscriptionState = {
  id: string;
  status: string;
  plan_id: string;
  plan_price_id: string | null;
  provider: string | null;
  provider_customer_ref: string | null;
  provider_subscription_ref: string | null;
  cancel_at_period_end: boolean;
  current_period_end: Date | null;
  grace_until: Date | null;
  pending_plan_id: string | null;
  metadata: {
    alert?: { kind: string; detail?: string };
    dunningNotices?: Record<string, string>;
    lastProviderEventAt?: string;
    pendingPlanPriceId?: string;
    paidThrough?: string;
  };
};

export async function subscriptionState(owner: postgres.Sql, tenantId: string) {
  const [row] = await asPlatform(owner, (tx) =>
    tx<SubscriptionState[]>`select * from subscription where tenant_id = ${tenantId}`,
  );
  if (!row) throw new Error("assinatura não encontrada");

  return row;
}

export async function accessModeOf(owner: postgres.Sql, tenantId: string) {
  const [row] = await owner<{ access_mode: string }[]>`
    select access_mode from organization where id = ${tenantId}
  `;

  return row?.access_mode;
}

export async function updateSubscription(
  owner: postgres.Sql,
  tenantId: string,
  values: Record<string, unknown>,
) {
  await asPlatform(owner, (tx) =>
    tx`update subscription set ${tx(values as never)} where tenant_id = ${tenantId}`,
  );
}

export type PaymentEventState = {
  id: string;
  status: string;
  verified: boolean;
  raw: unknown;
  headers: Record<string, string>;
  attempts: number;
  error: string | null;
  tenant_id: string | null;
  provider_event_id: string;
};

export async function paymentEvents(owner: postgres.Sql, eventId: string) {
  return asPlatform(owner, (tx) =>
    tx<PaymentEventState[]>`
      select * from payment_event
      where provider = ${STUB_ID} and provider_event_id = ${eventId}
    `,
  );
}
