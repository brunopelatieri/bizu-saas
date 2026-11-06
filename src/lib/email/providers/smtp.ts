import nodemailer from "nodemailer";
import type { EmailMessage, EmailProvider } from "@/lib/email/types";

export type SmtpOptions = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  replyTo?: string;
};

/**
 * Envio por SMTP com nodemailer. Em desenvolvimento aponta para o Mailpit do
 * docker-compose (localhost:1025, interface em http://localhost:8025).
 */
export function createSmtpProvider(options: SmtpOptions): EmailProvider {
  const transport = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: options.user ? { user: options.user, pass: options.pass ?? "" } : undefined,
  });

  return {
    id: "smtp",
    async send(message: EmailMessage) {
      const info = await transport.sendMail({
        from: options.from,
        to: message.to,
        replyTo: message.replyTo ?? options.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
      });

      return { providerMessageId: info.messageId };
    },
  };
}
