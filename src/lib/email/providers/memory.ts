import type { EmailMessage, EmailProvider } from "@/lib/email/types";

export type MemoryEmailProvider = EmailProvider & {
  id: "memory";
  /** Mensagens "enviadas", na ordem. Inspecione nos testes. */
  sent: EmailMessage[];
  reset(): void;
};

/**
 * Provedor em memória para testes: nada sai do processo.
 * `EMAIL_PROVIDER=memory` é recusado em produção por `src/lib/env.ts`.
 */
export function createMemoryProvider(): MemoryEmailProvider {
  const sent: EmailMessage[] = [];

  return {
    id: "memory",
    sent,
    reset() {
      sent.length = 0;
    },
    async send(message) {
      sent.push(message);
      return { providerMessageId: `memory-${sent.length}` };
    },
  };
}
