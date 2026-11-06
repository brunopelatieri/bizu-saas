import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createResendProvider, parseResendWebhook } from "@/lib/email/providers/resend";

const FIXTURES = path.resolve(import.meta.dirname, "../../../../tests/fixtures/webhooks/resend");

function fixture(name: string) {
  const raw = readFileSync(path.join(FIXTURES, `${name}.json`), "utf-8");
  return { raw, json: JSON.parse(raw) as unknown };
}

describe("parseResendWebhook", () => {
  it("email.delivered vira delivered", () => {
    expect(parseResendWebhook(fixture("email-delivered").json)).toEqual([
      {
        type: "delivered",
        providerMessageId: "re_delivered_0001",
        recipient: "ana@example.com",
        occurredAt: new Date("2026-11-05T14:02:11.000Z"),
      },
    ]);
  });

  it("bounce Permanent é hard bounce e extrai o endereço de 'Nome <e-mail>'", () => {
    const [event] = parseResendWebhook(fixture("email-bounced-permanent").json);

    expect(event).toMatchObject({
      type: "bounced",
      providerMessageId: "re_bounced_0002",
      recipient: "caio@example.com",
      permanent: true,
    });
    expect(event?.reason).toContain("does not exist");
  });

  it("bounce Transient não é permanente", () => {
    const [event] = parseResendWebhook(fixture("email-bounced-transient").json);

    expect(event).toMatchObject({ type: "bounced", permanent: false });
  });

  it("email.complained vira complained", () => {
    const [event] = parseResendWebhook(fixture("email-complained").json);

    expect(event).toMatchObject({
      type: "complained",
      providerMessageId: "re_complained_0004",
      recipient: "eva@example.com",
    });
  });

  it("ignora eventos sem efeito na entrega e corpos inválidos", () => {
    expect(parseResendWebhook(fixture("email-opened").json)).toEqual([]);
    expect(parseResendWebhook(null)).toEqual([]);
    expect(parseResendWebhook("texto")).toEqual([]);
    expect(parseResendWebhook({ type: "email.bounced", data: {} })).toEqual([]);
  });
});

describe("verifyWebhook do Resend", () => {
  const key = Buffer.from("segredo-de-teste-com-32-bytes!!!");
  const webhookSecret = `whsec_${key.toString("base64")}`;
  const provider = createResendProvider({
    apiKey: "re_test",
    from: "Bizu <no-reply@exemplo.com.br>",
    webhookSecret,
  });

  function signed(body: string, { id = "msg_1", at = Date.now(), secretKey = key } = {}) {
    const timestamp = String(Math.floor(at / 1000));
    const signature = createHmac("sha256", secretKey)
      .update(`${id}.${timestamp}.${body}`)
      .digest("base64");
    return new Request("http://localhost/api/webhooks/email/resend", {
      method: "POST",
      body,
      headers: {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": `v1,${signature}`,
      },
    });
  }

  it("aceita corpo com assinatura válida e não consome o corpo da requisição", async () => {
    const { raw } = fixture("email-delivered");
    const request = signed(raw);

    expect(await provider.verifyWebhook?.(request)).toBe(true);
    expect(await request.text()).toBe(raw);
  });

  it("recusa corpo adulterado, segredo errado e timestamp velho", async () => {
    const { raw } = fixture("email-delivered");

    const original = signed(raw);
    const tampered = new Request(original.url, {
      method: "POST",
      headers: original.headers,
      body: raw.replace("ana@", "mal@"),
    });
    expect(await provider.verifyWebhook?.(tampered)).toBe(false);
    expect(await provider.verifyWebhook?.(signed(raw, { secretKey: Buffer.from("outro-segredo-outro-segredo-123") }))).toBe(false);
    expect(await provider.verifyWebhook?.(signed(raw, { at: Date.now() - 3_600_000 }))).toBe(false);
  });

  it("sem segredo configurado recusa tudo", async () => {
    const open = createResendProvider({ apiKey: "re_test", from: "a@b.c" });
    expect(await open.verifyWebhook?.(signed("{}"))).toBe(false);
  });
});
