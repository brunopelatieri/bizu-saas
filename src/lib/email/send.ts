import { getBoss } from "@/jobs/boss";
import { type EmailSendJob, QUEUE } from "@/jobs/queues";
import { hashEmail } from "@/lib/email/address";
import { deliverEmail } from "@/lib/email/deliver";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { createResendProvider } from "@/lib/email/providers/resend";
import { createSmtpProvider } from "@/lib/email/providers/smtp";
import {
  createDrizzleEmailStore,
  createMemoryEmailStore,
  type EmailStore,
  sanitizeError,
} from "@/lib/email/store";
import type { EmailMessage, EmailProvider } from "@/lib/email/types";
import { type Env, getEnv } from "@/lib/env";

/** Escolhe o provedor por `EMAIL_PROVIDER`. */
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
      return createResendProvider({
        apiKey: env.RESEND_API_KEY ?? "",
        from: env.EMAIL_FROM,
        replyTo: env.EMAIL_REPLY_TO,
        webhookSecret: env.RESEND_WEBHOOK_SECRET,
      });
  }
}

let provider: EmailProvider | undefined;
let store: EmailStore | undefined;
let testOptions: EmailTestOptions = {};

export function getEmailProvider(): EmailProvider {
  if (!provider) provider = createEmailProvider(getEnv());
  return provider;
}

/** `email_message` e `email_suppression` no banco (ou o store injetado nos testes). */
export function getEmailStore(): EmailStore {
  if (testOptions.store) return testOptions.store;
  if (!store) store = createDrizzleEmailStore();
  return store;
}

export type EmailTestOptions = {
  /** Store em memória (ex.: para semear supressões). Padrão: um store novo e vazio. */
  store?: EmailStore;
  /**
   * `true` passa pelo fluxo real (banco + fila pg-boss), usado por `tests/db/`.
   * Padrão `false`: entrega na hora, em memória, sem banco nem fila.
   */
  queue?: boolean;
};

/**
 * Troca o provedor em testes; `undefined` volta ao de `env`.
 *
 * Com `createMemoryProvider()`, `sendEmail` entrega na hora e `memory.sent` já tem a
 * mensagem quando a promessa resolve, sem banco nem pg-boss. Passe `{ queue: true }`
 * para exercitar o fluxo completo (`email_message` + fila) contra o Postgres.
 */
export function setEmailProviderForTests(
  next: EmailProvider | undefined,
  options: EmailTestOptions = {},
) {
  provider = next;
  testOptions = next ? { ...options } : {};
}

export type SendEmailResult = {
  /** Id da `email_message`. */
  id: string;
  /**
   * `queued`: na fila, o job entrega. `sent`/`failed`: entrega direta (provedor `memory`);
   * `failed` com `error: "suppressed"` quando o destinatário está na lista de supressão.
   */
  status: "queued" | "sent" | "failed";
  error?: string;
};

/**
 * Registra o envio e o entrega pelo provedor configurado.
 *
 * Fluxo normal: grava `email_message` (`queued`) e enfileira `email.send`; o job
 * checa a supressão, chama o provedor e atualiza o status, com retry e dead letter
 * (`src/jobs/email.ts`). Com o provedor `memory` a entrega é direta (ver
 * `setEmailProviderForTests`). Passe `tags: { template: "nome" }` para auditar.
 *
 * Os templates devolvem `{ subject, html, text }`; quem chama acrescenta `to`.
 */
export async function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  const emailProvider = getEmailProvider();
  const direct = emailProvider.id === "memory" && !testOptions.queue;
  if (direct && !testOptions.store) testOptions.store = createMemoryEmailStore();
  const emailStore = direct ? (testOptions.store as EmailStore) : getEmailStore();

  const { id } = await emailStore.createMessage({
    toHash: hashEmail(message.to),
    template: message.tags?.template ?? "custom",
  });

  if (direct) {
    const result = await deliverEmail(
      { store: emailStore, provider: emailProvider },
      { emailMessageId: id, message },
    );
    return result.status === "failed"
      ? { id, status: "failed", error: result.reason }
      : { id, status: "sent" };
  }

  try {
    const boss = await getBoss();
    const job: EmailSendJob = { emailMessageId: id, message };
    await boss.send(QUEUE.emailSend, job, { singletonKey: id });
  } catch (error) {
    await emailStore.markFailed(id, sanitizeError(error));
    throw error;
  }

  return { id, status: "queued" };
}
