import type { JobWithMetadata } from "pg-boss";
import { type DeliveryResult, deliverEmail } from "@/lib/email/deliver";
import { getEmailProvider, getEmailStore } from "@/lib/email/send";
import { type EmailStore, sanitizeError } from "@/lib/email/store";
import type { EmailProvider } from "@/lib/email/types";
import type { EmailSendJob } from "@/jobs/queues";

type EmailJobDeps = { store: EmailStore; provider: EmailProvider };

/**
 * Processa uma tentativa de `email.send`.
 *
 * Falha do provedor relança o erro (o pg-boss agenda a próxima tentativa com
 * backoff). Na última tentativa (`retryCount === retryLimit`), a `email_message`
 * vira `failed` antes de o job ir para a dead letter `email.send.dead`.
 */
export async function processEmailSend(
  job: EmailSendJob,
  attempt: { retryCount: number; retryLimit: number },
  deps: EmailJobDeps = { store: getEmailStore(), provider: getEmailProvider() },
): Promise<DeliveryResult> {
  try {
    return await deliverEmail(deps, job);
  } catch (error) {
    if (attempt.retryCount >= attempt.retryLimit) {
      await deps.store.markFailed(job.emailMessageId, sanitizeError(error));
    }
    throw error;
  }
}

/** Handler registrado em `email.send` (`src/jobs/index.ts`). */
export async function handleEmailSend(jobs: JobWithMetadata<EmailSendJob>[]) {
  for (const job of jobs) {
    await processEmailSend(job.data, job);
  }
}
