import { describe, expect, it } from "vitest";
import { hideUnverified } from "@/api/auth-ext";

function betterAuthError(status: number, body: string) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("hideUnverified", () => {
  it("troca EMAIL_NOT_VERIFIED pelo 401 de senha errada, com os mesmos bytes", async () => {
    const response = await hideUnverified(
      betterAuthError(
        403,
        '{"message":"Email not verified","code":"EMAIL_NOT_VERIFIED"}',
      ),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(await response.text()).toBe(
      '{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}',
    );
  });

  it("não mexe em outro 403, como o de conta suspensa", async () => {
    const banned = betterAuthError(403, '{"code":"BANNED_USER"}');

    expect(await hideUnverified(banned)).toBe(banned);
  });

  it("não quebra em 403 sem JSON ou com corpo null", async () => {
    const empty = new Response(null, { status: 403 });
    const nullBody = betterAuthError(403, "null");

    expect(await hideUnverified(empty)).toBe(empty);
    expect(await hideUnverified(nullBody)).toBe(nullBody);
  });

  it("deixa passar o que não é 403", async () => {
    const ok = betterAuthError(200, '{"code":"EMAIL_NOT_VERIFIED"}');

    expect(await hideUnverified(ok)).toBe(ok);
  });
});
