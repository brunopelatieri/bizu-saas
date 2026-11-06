import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emailWebhooks } from "@/api/webhooks-email";
import { hashEmail } from "@/lib/email/address";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { createResendProvider } from "@/lib/email/providers/resend";
import { setEmailProviderForTests } from "@/lib/email/send";
import { createMemoryEmailStore } from "@/lib/email/store";

const FIXTURES = path.resolve(import.meta.dirname, "../../tests/fixtures/webhooks/resend");
const key = Buffer.from("segredo-de-teste-com-32-bytes!!!");

function body(name: string) {
  return readFileSync(path.join(FIXTURES, `${name}.json`), "utf-8");
}

function post(raw: string, provider = "resend", sign = true) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", key)
    .update(`msg_1.${timestamp}.${raw}`)
    .digest("base64");

  return emailWebhooks.request(`/api/webhooks/email/${provider}`, {
    method: "POST",
    body: raw,
    headers: sign
      ? { "svix-id": "msg_1", "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` }
      : {},
  });
}

function setup() {
  const store = createMemoryEmailStore();
  setEmailProviderForTests(
    createResendProvider({
      apiKey: "re_test",
      from: "Bizu <no-reply@exemplo.com.br>",
      webhookSecret: `whsec_${key.toString("base64")}`,
    }),
    { store },
  );
  return store;
}

afterEach(() => setEmailProviderForTests(undefined));

describe("POST /api/webhooks/email/:provider", () => {
  it("recusa sem assinatura (400) e não altera nada", async () => {
    const store = setup();

    const response = await post(body("email-bounced-permanent"), "resend", false);

    expect(response.status).toBe(400);
    expect(store.suppressions.size).toBe(0);
  });

  it("hard bounce atualiza a mensagem e cria supressão", async () => {
    const store = setup();
    const { id } = await store.createMessage({ toHash: hashEmail("caio@example.com"), template: "invite-member" });
    await store.markSent(id, { provider: "resend", providerMessageId: "re_bounced_0002" });

    const response = await post(body("email-bounced-permanent"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(store.messages[0]?.status).toBe("bounced");
    expect(store.suppressions.get(hashEmail("caio@example.com"))).toBe("hard_bounce");
  });

  it("bounce transitório marca bounced mas não suprime", async () => {
    const store = setup();
    const { id } = await store.createMessage({ toHash: hashEmail("duda@example.com"), template: "x" });
    await store.markSent(id, { provider: "resend", providerMessageId: "re_bounced_0003" });

    await post(body("email-bounced-transient"));

    expect(store.messages[0]?.status).toBe("bounced");
    expect(store.suppressions.size).toBe(0);
  });

  it("reclamação suprime o endereço, mesmo sem a mensagem no banco", async () => {
    const store = setup();

    const response = await post(body("email-complained"));

    expect(response.status).toBe(200);
    expect(store.suppressions.get(hashEmail("eva@example.com"))).toBe("complaint");
  });

  it("evento atrasado não rebaixa o status", async () => {
    const store = setup();
    const { id } = await store.createMessage({ toHash: hashEmail("eva@example.com"), template: "x" });
    await store.markSent(id, { provider: "resend", providerMessageId: "re_complained_0004" });
    await post(body("email-complained"));

    await post(body("email-delivered").replace("re_delivered_0001", "re_complained_0004"));

    expect(store.messages[0]?.status).toBe("complained");
  });

  it("404 para provedor diferente do configurado ou sem webhook", async () => {
    setup();
    expect((await post(body("email-delivered"), "postmark")).status).toBe(404);

    setEmailProviderForTests(createMemoryProvider());
    expect((await post(body("email-delivered"), "memory")).status).toBe(404);
  });
});
