import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";
import {
  call,
  cleanUp,
  connectOwner,
  createUser,
  signIn,
  type TestUser,
} from "./tenant-helpers";

type SessionRow = { id: string; current: boolean; support: boolean };

describe("sessões", () => {
  let owner: postgres.Sql;

  async function list(user: TestUser, cookie = user.cookie) {
    const response = await call("GET", "/api/me/sessions", { cookie });
    expect(response.status).toBe(200);

    const { sessions } = (await response.json()) as { sessions: SessionRow[] };
    return sessions;
  }

  const revocations = (userId: string) =>
    owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      return tx<{ metadata: { scope: string } }[]>`
        select metadata from audit_log
        where actor_id = ${userId} and action = 'auth.session_revoked'
      `;
    });

  beforeAll(() => {
    setEmailProviderForTests(createMemoryProvider());
    owner = connectOwner();
  });

  afterAll(async () => {
    setEmailProviderForTests(undefined);
    await cleanUp(owner);
    await owner.end();
  });

  it("lista as sessões sem entregar o token", async () => {
    const user = await createUser(owner);
    await signIn(user.email);

    const response = await call("GET", "/api/me/sessions", { cookie: user.cookie });
    const text = await response.text();
    const [row] = await owner<{ token: string }[]>`
      select token from session where user_id = ${user.id} limit 1
    `;

    expect(text).not.toContain(row?.token);
    expect(text).not.toContain('"token"');
    expect(await list(user)).toHaveLength(2);
    expect((await list(user)).filter(({ current }) => current)).toHaveLength(1);
  });

  it("encerra outra sessão, na hora, e audita", async () => {
    const user = await createUser(owner);
    const other = await signIn(user.email);
    const target = (await list(user)).find(({ current }) => !current);

    const response = await call("DELETE", `/api/me/sessions/${target?.id}`, {
      cookie: user.cookie,
    });

    expect(response.status).toBe(200);
    expect((await call("GET", "/api/me", { cookie: other })).status).toBe(401);
    expect((await revocations(user.id)).map(({ metadata }) => metadata.scope)).toEqual([
      "one",
    ]);
  });

  it("a sessão atual sai por Sair, não por aqui", async () => {
    const user = await createUser(owner);
    const [current] = await list(user);

    const response = await call("DELETE", `/api/me/sessions/${current?.id}`, {
      cookie: user.cookie,
    });

    expect(response.status).toBe(400);
  });

  it("sessão de outra pessoa não existe", async () => {
    const user = await createUser(owner);
    const stranger = await createUser(owner);
    const [foreign] = await list(stranger);

    for (const id of [foreign?.id, randomUUID()]) {
      const response = await call("DELETE", `/api/me/sessions/${id}`, {
        cookie: user.cookie,
      });

      expect(response.status).toBe(404);
    }

    expect((await call("GET", "/api/me", { cookie: stranger.cookie })).status).toBe(200);
  });

  it("encerra as outras e mantém esta", async () => {
    const user = await createUser(owner);
    const second = await signIn(user.email);
    const third = await signIn(user.email);

    const response = await call("POST", "/api/me/sessions/revoke-others", {
      cookie: user.cookie,
    });

    expect(response.status).toBe(200);
    expect((await call("GET", "/api/me", { cookie: user.cookie })).status).toBe(200);
    expect((await call("GET", "/api/me", { cookie: second })).status).toBe(401);
    expect((await call("GET", "/api/me", { cookie: third })).status).toBe(401);
    expect((await revocations(user.id)).map(({ metadata }) => metadata.scope)).toEqual([
      "others",
    ]);
  });

  it.each([
    "/api/auth/list-sessions",
    "/api/auth/revoke-session",
    "/api/auth/revoke-sessions",
    "/api/auth/revoke-other-sessions",
  ])("%s não responde por HTTP", async (path) => {
    const user = await createUser(owner);

    for (const method of ["GET", "POST"]) {
      const response = await call(method, path, {
        cookie: user.cookie,
        body: method === "POST" ? { token: "x" } : undefined,
      });

      expect(response.status).toBe(404);
    }
  });

  it("sessão de suporte aparece marcada, e some depois do teto", async () => {
    const user = await createUser(owner);
    const [current] = await list(user);
    const support = randomUUID();

    await owner`
      insert into session (token, user_id, expires_at, impersonated_by, impersonation_expires_at)
      values
        (${randomUUID()}, ${user.id}, now() + interval '7 days', ${support}, now() + interval '1 hour'),
        (${randomUUID()}, ${user.id}, now() + interval '7 days', ${support}, now() - interval '1 hour')
    `;

    const sessions = await list(user);

    expect(sessions).toHaveLength(2);
    expect(sessions.find(({ id }) => id !== current?.id)?.support).toBe(true);
  });

  it("exige sessão", async () => {
    expect((await call("GET", "/api/me/sessions")).status).toBe(401);
    expect((await call("POST", "/api/me/sessions/revoke-others")).status).toBe(401);
  });
});
