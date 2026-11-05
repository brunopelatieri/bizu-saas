import { afterEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ configured: true }));

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => config.configured,
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "token-da-sessao" } },
      }),
    },
  }),
}));

const { ApiError, apiFetch } = await import("@/lib/api/client");

function mockFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentHeaders(fetchMock: ReturnType<typeof mockFetch>) {
  return new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
}

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    config.configured = true;
  });

  it("envia o token da sessão", async () => {
    const fetchMock = mockFetch(Response.json({ ok: true }));

    await apiFetch("/api/me");

    expect(sentHeaders(fetchMock).get("Authorization")).toBe(
      "Bearer token-da-sessao",
    );
  });

  it("funciona sem Supabase, sem enviar token", async () => {
    config.configured = false;
    const fetchMock = mockFetch(Response.json({ ok: true }));

    await expect(apiFetch("/api/publica")).resolves.toEqual({ ok: true });
    expect(sentHeaders(fetchMock).has("Authorization")).toBe(false);
  });

  it("marca corpo em texto como JSON", async () => {
    const fetchMock = mockFetch(Response.json({ ok: true }));

    await apiFetch("/api/x", { method: "POST", body: JSON.stringify({ a: 1 }) });

    expect(sentHeaders(fetchMock).get("Content-Type")).toBe("application/json");
  });

  it("não troca o Content-Type informado nem o de FormData", async () => {
    const custom = mockFetch(Response.json({ ok: true }));
    await apiFetch("/api/x", {
      method: "POST",
      body: "a=1",
      headers: { "Content-Type": "text/plain" },
    });
    expect(sentHeaders(custom).get("Content-Type")).toBe("text/plain");

    const form = mockFetch(Response.json({ ok: true }));
    await apiFetch("/api/x", { method: "POST", body: new FormData() });
    expect(sentHeaders(form).has("Content-Type")).toBe(false);
  });

  it("lança ApiError com a mensagem e o status da API", async () => {
    mockFetch(Response.json({ error: "Sem acesso." }, { status: 403 }));

    const error = await apiFetch("/api/x").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: "Sem acesso.", status: 403 });
  });
});
