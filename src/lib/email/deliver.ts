import { hashEmail } from "@/lib/email/address";
import { sanitizeError, type EmailStore } from "@/lib/email/store";
import type { EmailMessage, EmailProvider } from "@/lib/email/types";

export type DeliveryResult =
  | { status: "sent"; providerMessageId: string }
  | { status: "failed"; reason: "suppressed" }
  /** A mensagem já saiu (ou falhou) antes: reexecução do job não envia de novo. */
  | { status: "skipped" };

/**
 * Entrega uma `email_message` já criada: confere o estado, a supressão e chama o
 * provedor. Usada pelo job `email.send` e pelo envio direto dos testes.
 *
 * - Idempotente: só age sobre mensagem `queued`.
 * - Supressão não é erro retentável: grava `failed`/`suppressed` e devolve o resultado.
 * - Falha do provedor grava o erro da tentativa e relança, para o pg-boss tentar de novo.
 */
export async function deliverEmail(
  deps: { store: EmailStore; provider: EmailProvider },
  input: { emailMessageId: string; message: EmailMessage },
): Promise<DeliveryResult> {
  const { store, provider } = deps;
  const { emailMessageId, message } = input;

  if ((await store.getStatus(emailMessageId)) !== "queued") {
    return { status: "skipped" };
  }

  if (await store.isSuppressed(hashEmail(message.to))) {
    await store.markFailed(emailMessageId, "suppressed");
    return { status: "failed", reason: "suppressed" };
  }

  try {
    const { providerMessageId } = await provider.send(message);
    await store.markSent(emailMessageId, {
      provider: provider.id,
      providerMessageId,
    });
    return { status: "sent", providerMessageId };
  } catch (error) {
    await store.recordAttemptError(emailMessageId, sanitizeError(error));
    throw error;
  }
}
