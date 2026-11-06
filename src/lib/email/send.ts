import { type Env, getEnv } from "@/lib/env";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { createSmtpProvider } from "@/lib/email/providers/smtp";
import type { EmailMessage, EmailProvider } from "@/lib/email/types";

/**
 * Escolhe o provedor por `EMAIL_PROVIDER`. `resend` entra na fase 3 da spec;
 * até lá, pedi-lo é erro explícito, não fallback silencioso.
 */
export function createEmailProvider(env: Env): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case "memory":
      return createMemoryProvider();
    case "smtp":
      return createSmtpProvider({
        host: env.SMTP_HOST ?? "localhost",
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.EMAIL_FROM,
        replyTo: env.EMAIL_REPLY_TO,
      });
    case "resend":
      throw new Error(
        "EMAIL_PROVIDER=resend ainda não está disponível (fase 3 da spec).",
      );
  }
}

let provider: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (!provider) provider = createEmailProvider(getEnv());
  return provider;
}

/** Troca o provedor em testes (ex.: `createMemoryProvider()`); `undefined` volta ao de `env`. */
export function setEmailProviderForTests(next: EmailProvider | undefined) {
  provider = next;
}

/**
 * Envia um e-mail pelo provedor configurado.
 *
 * Hoje a entrega é direta. A fase 3 passa a registrar em `email_message` e
 * enfileirar `email.send` (retry, supressão de bounces); a assinatura não muda,
 * então quem chama `sendEmail` não precisa mudar.
 */
export async function sendEmail(message: EmailMessage) {
  return getEmailProvider().send(message);
}
