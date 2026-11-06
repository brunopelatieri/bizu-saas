import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { logError } from "@/api/log";
import { getEmailProvider, getEmailStore } from "@/lib/email/send";

/**
 * `POST /api/webhooks/email/:provider`: eventos de entrega, bounce e reclamação.
 *
 * - O `:provider` precisa ser o provedor configurado em `EMAIL_PROVIDER` e ter
 *   webhook (hoje só `resend`); qualquer outro devolve 404.
 * - A assinatura é conferida no corpo bruto antes de qualquer leitura de JSON: falha → 400.
 * - Hard bounce e reclamação criam `email_suppression`; ver `src/lib/email/store.ts`.
 * - Sem token consumido em GET e sem rate limit: só quem assina o corpo passa.
 */
export const emailWebhooks = new Hono();

emailWebhooks.post(
  "/api/webhooks/email/:provider",
  bodyLimit({
    maxSize: 256 * 1024,
    onError: (c) => c.json({ error: "Corpo muito grande." }, 413),
  }),
  async (c) => {
    let provider: ReturnType<typeof getEmailProvider>;
    try {
      provider = getEmailProvider();
    } catch (error) {
      logError("Provedor de e-mail indisponível no webhook", error);
      return c.json({ error: "Indisponível." }, 503);
    }

    if (
      provider.id !== c.req.param("provider") ||
      !provider.verifyWebhook ||
      !provider.parseWebhook
    ) {
      return c.json({ error: "Provedor sem webhook." }, 404);
    }

    if (!(await provider.verifyWebhook(c.req.raw.clone()))) {
      return c.json({ error: "Assinatura inválida." }, 400);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Corpo inválido." }, 400);
    }

    try {
      const store = getEmailStore();
      for (const event of provider.parseWebhook(body)) {
        await store.applyEvent(event);
      }
    } catch (error) {
      // 5xx: o provedor reenvia o evento depois.
      logError("Falha ao aplicar evento de e-mail", error);
      return c.json({ error: "Não foi possível processar agora." }, 500);
    }

    return c.json({ received: true });
  },
);
