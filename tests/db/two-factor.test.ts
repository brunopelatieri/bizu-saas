import type postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { waitForBackgroundTasks } from "@/lib/auth/background";
import { getAuth } from "@/lib/auth/server";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";
import { makePlatformUser } from "./billing-helpers";
import {
  applyCookies,
  enableTwoFactor,
  PASSWORD,
  signInWithPassword,
  totpCode,
} from "./security-helpers";
import {
  addMember,
  call,
  cleanUp,
  connectOwner,
  createTenant,
  createUser,
  type TestUser,
} from "./tenant-helpers";

describe("2FA", () => {
  let owner: postgres.Sql;

  async function auditActions(userId: string) {
    await waitForBackgroundTasks();

    return owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      const rows = await tx<{ action: string }[]>`
        select action from audit_log where actor_id = ${userId}
      `;
      return rows.map(({ action }) => action);
    });
  }

  const twoFactorEnabled = async (cookie: string) => {
    const response = await call("GET", "/api/me", { cookie });
    const { user } = (await response.json()) as {
      user: { twoFactorEnabled: boolean };
    };
    return user.twoFactorEnabled;
  };

  beforeAll(() => {
    setEmailProviderForTests(createMemoryProvider());
    owner = connectOwner();
  });

  afterAll(async () => {
    setEmailProviderForTests(undefined);
    await cleanUp(owner);
    await owner.end();
  });

  describe("ativar", () => {
    it("exige a senha", async () => {
      const user = await createUser(owner);

      const response = await call("POST", "/api/auth/two-factor/enable", {
        cookie: user.cookie,
        body: { password: "senha-errada-123" },
      });

      expect(response.status).toBe(400);
      expect(await twoFactorEnabled(user.cookie)).toBe(false);
    });

    it("só vale depois do primeiro código, e audita", async () => {
      const user = await createUser(owner);

      const enabled = await call("POST", "/api/auth/two-factor/enable", {
        cookie: user.cookie,
        body: { password: PASSWORD },
      });
      const { totpURI, backupCodes } = (await enabled.json()) as {
        totpURI: string;
        backupCodes: string[];
      };

      expect(new URL(totpURI).searchParams.get("issuer")).toBe("Bizu SaaS");
      expect(backupCodes).toHaveLength(10);
      expect(await twoFactorEnabled(user.cookie)).toBe(false);

      // Ativação pela metade não trava o login.
      const halfway = await signInWithPassword(user.email);
      expect(await halfway.json()).not.toHaveProperty("twoFactorRedirect");

      const wrong = await call("POST", "/api/auth/two-factor/verify-totp", {
        cookie: user.cookie,
        body: { code: "000000" },
      });
      expect(wrong.status).toBe(401);

      const right = await call("POST", "/api/auth/two-factor/verify-totp", {
        cookie: user.cookie,
        body: { code: totpCode(totpURI) },
      });
      expect(right.status).toBe(200);

      expect(await twoFactorEnabled(applyCookies(user.cookie, right))).toBe(true);
      expect(await auditActions(user.id)).toContain("auth.2fa_enabled");
    });

    it("guarda o segredo cifrado", async () => {
      const user = await createUser(owner);
      const { totpURI, backupCodes } = await enableTwoFactor(user);

      const [row] = await owner<{ secret: string; backup_codes: string }[]>`
        select secret, backup_codes from two_factor where user_id = ${user.id}
      `;

      expect(row?.secret).not.toContain(
        new URL(totpURI).searchParams.get("secret"),
      );
      expect(row?.backup_codes).not.toContain(backupCodes[0]);
    });
  });

  describe("desafio no login", () => {
    let user: TestUser;
    let setup: Awaited<ReturnType<typeof enableTwoFactor>>;

    beforeAll(async () => {
      user = await createUser(owner);
      setup = await enableTwoFactor(user);
    });

    /** A senha passou: sobra só o cookie do desafio, sem sessão. */
    async function challenge() {
      const response = await signInWithPassword(user.email);
      expect(await response.clone().json()).toMatchObject({
        twoFactorRedirect: true,
        twoFactorMethods: ["totp"],
      });

      return { cookie: applyCookies("", response) };
    }

    it("a senha sozinha não abre sessão", async () => {
      const { cookie } = await challenge();

      expect(cookie).not.toContain("session_token");
      expect((await call("GET", "/api/me", { cookie })).status).toBe(401);
    });

    it("o código certo abre a sessão, e o errado não", async () => {
      const { cookie } = await challenge();

      const wrong = await call("POST", "/api/auth/two-factor/verify-totp", {
        cookie,
        body: { code: "000000" },
      });
      expect(wrong.status).toBe(401);

      const right = await call("POST", "/api/auth/two-factor/verify-totp", {
        cookie,
        body: { code: totpCode(setup.totpURI) },
      });
      expect(right.status).toBe(200);

      const session = applyCookies(cookie, right);
      expect((await call("GET", "/api/me", { cookie: session })).status).toBe(200);
    });

    it("nada é consumido em GET", async () => {
      const { cookie } = await challenge();

      for (const path of ["verify-totp", "verify-backup-code"]) {
        const response = await call("GET", `/api/auth/two-factor/${path}`, { cookie });
        expect(response.ok).toBe(false);
      }

      const stillValid = await call("POST", "/api/auth/two-factor/verify-totp", {
        cookie,
        body: { code: totpCode(setup.totpURI) },
      });
      expect(stillValid.status).toBe(200);
    });

    it("código de backup vale uma vez só", async () => {
      const code = setup.backupCodes[0];

      const first = await challenge();
      const used = await call("POST", "/api/auth/two-factor/verify-backup-code", {
        cookie: first.cookie,
        body: { code },
      });
      expect(used.status).toBe(200);

      const second = await challenge();
      const again = await call("POST", "/api/auth/two-factor/verify-backup-code", {
        cookie: second.cookie,
        body: { code },
      });
      expect(again.status).toBe(401);
    });

    it("dispositivo confiável pula o desafio", async () => {
      const { cookie } = await challenge();
      const verified = await call("POST", "/api/auth/two-factor/verify-totp", {
        cookie,
        body: { code: totpCode(setup.totpURI), trustDevice: true },
      });
      const trusted = applyCookies("", verified);

      expect(trusted).toContain("trust_device");

      const response = await call("POST", "/api/auth/sign-in/email", {
        cookie: trusted,
        body: { email: user.email, password: PASSWORD },
      });

      expect(await response.json()).not.toHaveProperty("twoFactorRedirect");
    });
  });

  describe("desativar", () => {
    it("exige a senha, encerra o 2FA e audita", async () => {
      const user = await createUser(owner);
      await enableTwoFactor(user);

      const wrong = await call("POST", "/api/auth/two-factor/disable", {
        cookie: user.cookie,
        body: { password: "senha-errada-123" },
      });
      expect(wrong.status).toBe(400);

      const right = await call("POST", "/api/auth/two-factor/disable", {
        cookie: user.cookie,
        body: { password: PASSWORD },
      });
      expect(right.status).toBe(200);

      expect(await twoFactorEnabled(applyCookies(user.cookie, right))).toBe(false);
      expect(await auditActions(user.id)).toContain("auth.2fa_disabled");
    });
  });

  it("gera novos códigos só com a senha, e os antigos deixam de valer", async () => {
    const user = await createUser(owner);
    const { backupCodes } = await enableTwoFactor(user);

    const wrong = await call("POST", "/api/auth/two-factor/generate-backup-codes", {
      cookie: user.cookie,
      body: { password: "senha-errada-123" },
    });
    expect(wrong.status).toBe(400);

    const renewed = await call("POST", "/api/auth/two-factor/generate-backup-codes", {
      cookie: user.cookie,
      body: { password: PASSWORD },
    });
    expect(renewed.status).toBe(200);

    const challenge = applyCookies("", await signInWithPassword(user.email));
    const old = await call("POST", "/api/auth/two-factor/verify-backup-code", {
      cookie: challenge,
      body: { code: backupCodes[0] },
    });
    expect(old.status).toBe(401);
  });

  describe("lista fechada", () => {
    it("o plugin fica classificado: nada novo responde sem decisão", () => {
      const open = [
        "/two-factor/disable",
        "/two-factor/enable",
        "/two-factor/generate-backup-codes",
        "/two-factor/get-totp-uri",
        "/two-factor/verify-backup-code",
        "/two-factor/verify-totp",
      ];
      const closed = ["/two-factor/send-otp", "/two-factor/verify-otp"];
      const auth = getAuth();
      const plugin = Object.values(auth.api).flatMap((endpoint) => {
        const { path } = endpoint as { path?: string };
        return path?.startsWith("/two-factor/") ? [path] : [];
      });

      expect([...plugin].sort()).toEqual([...open, ...closed].sort());
      expect(auth.options.disabledPaths).toEqual(expect.arrayContaining(closed));
    });

    it.each(["send-otp", "verify-otp"])("/two-factor/%s não existe", async (path) => {
      const user = await createUser(owner);

      const response = await call("POST", `/api/auth/two-factor/${path}`, {
        cookie: user.cookie,
        body: { code: "123456" },
      });

      expect(response.status).toBe(404);
    });

    it("no portal, nenhuma rota de 2FA responde", async () => {
      for (const path of ["enable", "verify-totp", "verify-backup-code"]) {
        const response = await call("POST", `/api/portal/auth/two-factor/${path}`, {
          body: {},
        });
        expect(response.status).toBe(404);
      }
    });
  });

  describe("exigido pelo tenant", () => {
    let tenantOwner: TestUser;
    let member: TestUser;
    let tenantId: string;

    const setRequired = (user: TestUser, require2fa: boolean) =>
      call("PATCH", "/api/tenant/security", {
        cookie: user.cookie,
        body: { require2fa },
      });

    beforeAll(async () => {
      tenantOwner = await createUser(owner);
      tenantId = (await createTenant(tenantOwner)).id;
      member = await createUser(owner);
      await addMember(owner, tenantId, member, "admin");
    });

    it("o owner sem 2FA não liga a regra, para não se trancar para fora", async () => {
      const response = await setRequired(tenantOwner, true);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: "TWO_FACTOR_REQUIRED_FIRST",
      });
    });

    it("só o owner liga, mesmo quem tem settings:update", async () => {
      const response = await setRequired(member, true);

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "PERMISSION_DENIED" });
    });

    it("membro sem 2FA recebe TENANT_2FA_REQUIRED até ativar", async () => {
      await owner`
        update organization set settings = '{"portal_self_signup": true}'
        where id = ${tenantId}
      `;
      await enableTwoFactor(tenantOwner);
      expect((await setRequired(tenantOwner, true)).status).toBe(200);

      const blocked = await call("GET", "/api/team", { cookie: member.cookie });
      expect(blocked.status).toBe(403);
      expect(await blocked.json()).toMatchObject({ code: "TENANT_2FA_REQUIRED" });

      // A interface precisa saber para onde mandar, e o caminho de ativar segue aberto.
      const me = await call("GET", "/api/me", { cookie: member.cookie });
      expect(await me.json()).toMatchObject({
        security: { tenantRequires2fa: true },
      });

      await enableTwoFactor(member);

      expect((await call("GET", "/api/team", { cookie: member.cookie })).status).toBe(200);
      expect((await call("GET", "/api/team", { cookie: tenantOwner.cookie })).status).toBe(200);
    });

    it("guardar a regra preserva o resto de settings", async () => {
      const [row] = await owner<{ settings: Record<string, unknown> }[]>`
        select settings from organization where id = ${tenantId}
      `;

      expect(row?.settings).toEqual({ portal_self_signup: true, require_2fa: true });
    });

    it("desligar libera quem não tem 2FA", async () => {
      const other = await createUser(owner);
      await owner`
        insert into member (organization_id, user_id, role)
        values (${tenantId}, ${other.id}, 'member')
      `;
      await owner`
        update session set active_organization_id = ${tenantId}
        where user_id = ${other.id}
      `;

      expect((await call("GET", "/api/team", { cookie: other.cookie })).status).toBe(403);
      expect((await setRequired(tenantOwner, false)).status).toBe(200);
      expect((await call("GET", "/api/team", { cookie: other.cookie })).status).toBe(200);
    });
  });

  describe("obrigatório da plataforma", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("fora de produção não bloqueia", async () => {
      const staff = await makePlatformUser(owner, "platform_owner");

      const response = await call("GET", "/api/admin/overview", {
        cookie: staff.cookie,
      });

      expect(response.status).toBe(200);
    });

    it("em produção, responde PLATFORM_2FA_REQUIRED até ativar", async () => {
      for (const role of ["platform_owner", "platform_support"] as const) {
        const staff = await makePlatformUser(owner, role);
        vi.stubEnv("NODE_ENV", "production");

        const blocked = await call("GET", "/api/admin/overview", {
          cookie: staff.cookie,
        });
        expect(blocked.status).toBe(403);
        expect(await blocked.json()).toMatchObject({
          code: "PLATFORM_2FA_REQUIRED",
        });

        const me = await call("GET", "/api/me", { cookie: staff.cookie });
        expect(await me.json()).toMatchObject({
          security: { platformRequires2fa: true },
        });

        await enableTwoFactor(staff);

        const open = await call("GET", "/api/admin/overview", {
          cookie: staff.cookie,
        });
        expect(open.status).toBe(200);
        vi.unstubAllEnvs();
      }
    });

    it("quem não é da plataforma recebe PLATFORM_FORBIDDEN, sem revelar a regra", async () => {
      const user = await createUser(owner);
      vi.stubEnv("NODE_ENV", "production");

      const response = await call("GET", "/api/admin/overview", {
        cookie: user.cookie,
      });

      expect(await response.json()).toMatchObject({ code: "PLATFORM_FORBIDDEN" });
    });
  });
});
