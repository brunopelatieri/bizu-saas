import { describe, expect, it } from "vitest";
import { processEmailSend } from "@/jobs/email";
import { hashEmail } from "@/lib/email/address";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { createMemoryEmailStore } from "@/lib/email/store";
import type { EmailProvider } from "@/lib/email/types";

const message = {
  to: "ana@example.com",
  subject: "Oi",
  html: "<p>oi</p>",
  text: "oi",
};

async function setup(provider: EmailProvider) {
  const store = createMemoryEmailStore();
  const { id } = await store.createMessage({ toHash: hashEmail(message.to), template: "teste" });
  return { store, id, deps: { store, provider } };
}

const failing: EmailProvider = {
  id: "memory",
  async send() {
    throw new Error("falha para ana@example.com");
  },
};

describe("processEmailSend", () => {
  it("entrega e marca sent; reexecutar não envia de novo (idempotente)", async () => {
    const memory = createMemoryProvider();
    const { store, id, deps } = await setup(memory);

    const first = await processEmailSend({ emailMessageId: id, message }, { retryCount: 0, retryLimit: 5 }, deps);
    const second = await processEmailSend({ emailMessageId: id, message }, { retryCount: 1, retryLimit: 5 }, deps);

    expect(first.status).toBe("sent");
    expect(second.status).toBe("skipped");
    expect(memory.sent).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({ status: "sent", provider: "memory" });
  });

  it("endereço suprimido: failed/suppressed, sem erro e sem chamar o provedor", async () => {
    const memory = createMemoryProvider();
    const { store, id, deps } = await setup(memory);
    await store.suppress(hashEmail(message.to), "hard_bounce");

    const result = await processEmailSend({ emailMessageId: id, message }, { retryCount: 0, retryLimit: 5 }, deps);

    expect(result).toEqual({ status: "failed", reason: "suppressed" });
    expect(store.messages[0]).toMatchObject({ status: "failed", error: "suppressed" });
    expect(memory.sent).toHaveLength(0);
  });

  it("falha antes da última tentativa relança e mantém queued, sem e-mail no erro", async () => {
    const { store, id, deps } = await setup(failing);

    await expect(
      processEmailSend({ emailMessageId: id, message }, { retryCount: 2, retryLimit: 5 }, deps),
    ).rejects.toThrow();

    expect(store.messages[0]?.status).toBe("queued");
    expect(store.messages[0]?.error).toBe("falha para [e-mail]");
  });

  it("na última tentativa marca failed e ainda relança (job vai para a dead letter)", async () => {
    const { store, id, deps } = await setup(failing);

    await expect(
      processEmailSend({ emailMessageId: id, message }, { retryCount: 5, retryLimit: 5 }, deps),
    ).rejects.toThrow();

    expect(store.messages[0]).toMatchObject({ status: "failed", error: "falha para [e-mail]" });
  });
});
