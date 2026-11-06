/**
 * Contrato de e-mail transacional. Provedores ficam em `providers/` e são
 * escolhidos por `EMAIL_PROVIDER` em `send.ts`. Templates devolvem um
 * `RenderedEmail`; quem envia acrescenta o destinatário.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
  /** Metadados para o provedor e para o log (ex.: `{ template: "verify-email" }`). */
  tags?: Record<string, string>;
};

export type RenderedEmail = Pick<EmailMessage, "subject" | "html" | "text">;

export type EmailEventType = "delivered" | "bounced" | "complained";

export type EmailEvent = {
  type: EmailEventType;
  providerMessageId: string;
  recipient: string;
  occurredAt: Date;
  reason?: string;
};

export type EmailProviderId = "smtp" | "resend" | "memory";

export interface EmailProvider {
  id: EmailProviderId;
  send(message: EmailMessage): Promise<{ providerMessageId: string }>;
  /** Só provedores com webhook de entrega (fase 3). */
  verifyWebhook?(request: Request): Promise<boolean>;
  parseWebhook?(body: unknown): EmailEvent[];
}
