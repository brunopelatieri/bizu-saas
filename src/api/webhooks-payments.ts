import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { MINUTE } from "@/api/guards";
import { logError } from "@/api/log";
import { clientKey, failureLimit } from "@/api/rate-limit";
import {
  enqueueWebhook,
  receiveEvent,
  recordRejected,
} from "@/lib/billing/inbox";
import { getProvider, platformContext } from "@/lib/payments/registry";
import type { PaymentProvider } from "@/lib/payments/types";

/**
 * `POST /api/webhooks/payments/:provider`: a porta de entrada do provedor. Só verifica,
 * grava em `payment_event` e enfileira; quem aplica é o job `webhook.process`
 * (`src/jobs/webhooks.ts`).
 *
 * - Lê o corpo bruto: a assinatura vale para os bytes recebidos, não para um JSON refeito.
 * - Só a assinatura inválida conta para o limite por IP: o provedor legítimo pode mandar
 *   centenas de eventos por minuto, e quem erra 20 vezes para de ser ouvido antes de
 *   encher a tabela.
 * - 5xx faz o provedor reenviar; o reenvio cai na unique e só reenfileira o que parou.
 */
export const paymentWebhooks = new Hono();

const rejectedLimit = failureLimit({ limit: 20, windowMs: MINUTE });

const headersOf = (raw: Headers) => Object.fromEntries(raw.entries());

function findProvider(id: string): PaymentProvider | null | "unavailable" {
  try {
    return getProvider(id);
  } catch (error) {
    logError("Registro de pagamentos indisponível", error);
    return "unavailable";
  }
}

paymentWebhooks.post(
  "/api/webhooks/payments/:provider",
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ error: "Corpo muito grande." }, 413),
  }),
  async (c) => {
    const provider = findProvider(c.req.param("provider"));

    if (provider === "unavailable") return c.json({ error: "Indisponível." }, 503);
    if (!provider) return c.json({ error: "Provedor sem webhook." }, 404);

    const ip = clientKey(c);
    if (rejectedLimit.blocked(ip)) {
      return c.json({ error: "Muitas tentativas. Tente mais tarde." }, 429);
    }

    const rawBody = await c.req.text();
    const headers = headersOf(c.req.raw.headers);
    const ctx = platformContext();

    let verification: Awaited<ReturnType<PaymentProvider["verifyWebhook"]>>;
    try {
      verification = await provider.verifyWebhook(ctx, {
        headers,
        rawBody,
        url: c.req.url,
      });
    } catch (error) {
      logError("Falha ao verificar webhook de pagamento", error);
      return c.json({ error: "Indisponível." }, 503);
    }

    if (!verification.ok) {
      rejectedLimit.hit(ip);
      await recordRejected(provider.id, headers, verification.reason);
      return c.json({ error: "Assinatura inválida." }, 400);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "Corpo inválido." }, 400);
    }

    try {
      const received = await receiveEvent({
        provider: provider.id,
        eventId: verification.eventId,
        eventType: verification.eventType,
        raw,
        headers,
      });

      if (received.pending) await enqueueWebhook(received.id);

      return c.json({
        received: true,
        ...(received.duplicate ? { status: "duplicate" } : {}),
      });
    } catch (error) {
      logError("Falha ao receber webhook de pagamento", error);
      return c.json({ error: "Não foi possível processar agora." }, 500);
    }
  },
);
