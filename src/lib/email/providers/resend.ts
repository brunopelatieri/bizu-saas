import { Resend } from "resend";
import { extractEmailAddress } from "@/lib/email/address";
import type {
  EmailEvent,
  EmailMessage,
  EmailProvider,
} from "@/lib/email/types";

export type ResendOptions = {
  apiKey: string;
  from: string;
  replyTo?: string;
  /** Segredo de assinatura do webhook (`whsec_...`). Sem ele, `verifyWebhook` recusa tudo. */
  webhookSecret?: string;
};

type ResendWebhookPayload = {
  type?: unknown;
  created_at?: unknown;
  data?: {
    email_id?: unknown;
    to?: unknown;
    bounce?: { type?: unknown; message?: unknown };
  };
};

/**
 * Provedor Resend (SDK oficial). Entrega pelo `emails.send` e interpreta os
 * webhooks de entrega, bounce e reclamação (assinados via Svix; o SDK verifica).
 */
export function createResendProvider(options: ResendOptions): EmailProvider {
  const client = new Resend(options.apiKey);

  return {
    id: "resend",

    async send(message: EmailMessage) {
      const { data, error } = await client.emails.send({
        from: options.from,
        to: message.to,
        replyTo: message.replyTo ?? options.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
        tags: message.tags
          ? Object.entries(message.tags).map(([name, value]) => ({ name, value }))
          : undefined,
      });

      if (error || !data) {
        throw new Error(`Resend recusou o envio: ${error?.message ?? "sem resposta"}`);
      }

      return { providerMessageId: data.id };
    },

    async verifyWebhook(request: Request) {
      if (!options.webhookSecret) return false;

      // O Resend assina com Svix: cabeçalhos svix-id, svix-timestamp e svix-signature.
      const id = request.headers.get("svix-id");
      const timestamp = request.headers.get("svix-timestamp");
      const signature = request.headers.get("svix-signature");
      if (!id || !timestamp || !signature) return false;

      try {
        client.webhooks.verify({
          payload: await request.clone().text(),
          headers: { id, timestamp, signature },
          webhookSecret: options.webhookSecret,
        });
        return true;
      } catch {
        return false;
      }
    },

    parseWebhook: parseResendWebhook,
  };
}

/**
 * Converte o corpo de um webhook do Resend em eventos. Tipos que não importam
 * para a supressão (`email.sent`, `email.opened`, ...) viram lista vazia.
 * Bounce `Permanent` é hard bounce; `Transient` e `Undetermined` não suprimem.
 */
export function parseResendWebhook(body: unknown): EmailEvent[] {
  if (typeof body !== "object" || body === null) return [];

  const payload = body as ResendWebhookPayload;
  const data = payload.data;
  if (!data || typeof data.email_id !== "string" || !Array.isArray(data.to)) {
    return [];
  }

  const occurredAt = new Date(
    typeof payload.created_at === "string" ? payload.created_at : Date.now(),
  );
  const providerMessageId = data.email_id;
  const recipients = data.to
    .filter((to): to is string => typeof to === "string")
    .map(extractEmailAddress);

  const base = (recipient: string) => ({ providerMessageId, recipient, occurredAt });

  switch (payload.type) {
    case "email.delivered":
      return recipients.map((recipient) => ({
        type: "delivered" as const,
        ...base(recipient),
      }));
    case "email.bounced": {
      const bounce = data.bounce;
      return recipients.map((recipient) => ({
        type: "bounced" as const,
        ...base(recipient),
        permanent: bounce?.type === "Permanent",
        reason: typeof bounce?.message === "string" ? bounce.message : undefined,
      }));
    }
    case "email.complained":
      return recipients.map((recipient) => ({
        type: "complained" as const,
        ...base(recipient),
      }));
    default:
      return [];
  }
}
