import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "@/api/app";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";
import { setStorageForTests } from "@/lib/storage";
import { createLocalProvider } from "@/lib/storage/providers/local";
import {
  addMember,
  APP_ORIGIN,
  cleanUp,
  connectOwner,
  createTenant,
  createUser,
  type TestUser,
} from "./tenant-helpers";

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 1),
]);

let ipCounter = Math.floor(Math.random() * 40_000);

function upload(
  user: TestUser,
  { name = "foto.png", type = "image/png", content = PNG as Buffer, fields = {} as Record<string, string> } = {},
) {
  ipCounter += 1;
  const form = new FormData();
  form.set("file", new File([new Uint8Array(content)], name, { type }));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);

  return api.request("/api/files", {
    method: "POST",
    headers: {
      Cookie: user.cookie,
      Origin: APP_ORIGIN,
      "X-Forwarded-For": `10.52.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`,
    },
    body: form,
  });
}

function send(method: string, pathname: string, user: TestUser) {
  ipCounter += 1;

  return api.request(pathname, {
    method,
    headers: {
      Cookie: user.cookie,
      Origin: APP_ORIGIN,
      "X-Forwarded-For": `10.53.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`,
    },
  });
}

describe("módulo de arquivos (/api/files)", () => {
  let owner: postgres.Sql;
  let dir: string;
  let admin: TestUser;
  let member: TestUser;
  let tenantId: string;
  let otherOwner: TestUser;
  let otherTenantId: string;

  beforeAll(async () => {
    setEmailProviderForTests(createMemoryProvider());
    owner = connectOwner();
    dir = await mkdtemp(path.join(os.tmpdir(), "bizu-files-"));
    setStorageForTests(createLocalProvider(dir));

    admin = await createUser(owner);
    tenantId = (await createTenant(admin)).id;
    member = await createUser(owner);
    await addMember(owner, tenantId, member, "member");

    otherOwner = await createUser(owner);
    otherTenantId = (await createTenant(otherOwner, "Outra")).id;
  });

  afterAll(async () => {
    setStorageForTests(undefined);
    setEmailProviderForTests(undefined);
    await cleanUp(owner);
    await owner.end();
    await rm(dir, { recursive: true, force: true });
  });

  it("envia, baixa como anexo e apaga", async () => {
    const response = await upload(admin, { name: "../../meu relatório.png" });
    expect(response.status).toBe(201);

    const { file } = (await response.json()) as {
      file: { id: string; name: string; size: number; mime: string };
    };
    expect(file).toMatchObject({ name: "meu relatório.png", size: PNG.length, mime: "image/png" });

    const download = await send("GET", `/api/files/${file.id}`, admin);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("image/png");
    expect(download.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(download.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await download.arrayBuffer()).equals(PNG)).toBe(true);

    // A chave é aleatória, sob o tenant, e não carrega o nome enviado.
    const stored = await readdir(path.join(dir, "tenants", tenantId));
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toContain("relat");

    expect((await send("DELETE", `/api/files/${file.id}`, admin)).status).toBe(200);
    expect((await send("GET", `/api/files/${file.id}`, admin)).status).toBe(404);
    expect(await readdir(path.join(dir, "tenants", tenantId))).toHaveLength(0);
  });

  it("recusa tipo fora da lista e conteúdo que não bate com o tipo", async () => {
    const html = await upload(admin, {
      name: "x.html",
      type: "text/html",
      content: Buffer.from("<script>alert(1)</script>"),
    });
    expect(html.status).toBe(415);

    const disguised = await upload(admin, {
      name: "x.png",
      type: "image/png",
      content: Buffer.from("<script>alert(1)</script>"),
    });
    expect(disguised.status).toBe(415);
  });

  it("recusa arquivo vazio e corpo sem o campo file", async () => {
    expect((await upload(admin, { content: Buffer.alloc(0) })).status).toBe(400);

    ipCounter += 1;
    const response = await api.request("/api/files", {
      method: "POST",
      headers: {
        Cookie: admin.cookie,
        Origin: APP_ORIGIN,
        "X-Forwarded-For": `10.54.0.${(ipCounter % 250) + 1}`,
      },
      body: new FormData(),
    });
    expect(response.status).toBe(400);
  });

  it("arquivo de outro tenant é 404 para leitura e exclusão", async () => {
    const response = await upload(otherOwner);
    const { file } = (await response.json()) as { file: { id: string } };

    expect((await send("GET", `/api/files/${file.id}`, admin)).status).toBe(404);
    expect((await send("DELETE", `/api/files/${file.id}`, admin)).status).toBe(404);
    expect((await send("GET", `/api/files/${file.id}`, otherOwner)).status).toBe(200);
    expect((await send("GET", "/api/files/nao-e-uuid", admin)).status).toBe(404);
  });

  it("colaborador envia e lê, mas não apaga; sem sessão é 401", async () => {
    const response = await upload(member);
    expect(response.status).toBe(201);
    const { file } = (await response.json()) as { file: { id: string } };

    expect((await send("GET", `/api/files/${file.id}`, member)).status).toBe(200);
    expect((await send("DELETE", `/api/files/${file.id}`, member)).status).toBe(403);

    const anonymous = await api.request(`/api/files/${randomUUID()}`, {
      headers: { "X-Forwarded-For": "10.55.0.1" },
    });
    expect(anonymous.status).toBe(401);
  });

  it("RLS: o registro do tenant não aparece para outro tenant", async () => {
    await upload(admin);
    const rows = await owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      return tx<{ tenant_id: string }[]>`select tenant_id from file`;
    });
    expect(rows.some((row) => row.tenant_id === tenantId)).toBe(true);

    // Sem tenant na sessão do banco, a política não devolve nada, nem para o dono (FORCE).
    const hidden = await owner`select id from file`;
    expect(hidden).toHaveLength(0);

    const scoped = await owner.begin(async (tx) => {
      await tx`select set_config('app.tenant_id', ${otherTenantId}, true)`;
      return tx<{ tenant_id: string }[]>`select tenant_id from file`;
    });
    expect(scoped.every((row) => row.tenant_id === otherTenantId)).toBe(true);
  });

  it("respeita storage_mb do plano, somando os arquivos já enviados", async () => {
    const limited = await createUser(owner);
    const limitedTenantId = (await createTenant(limited, "Limitada")).id;

    await owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      const [plan] = await tx<{ id: string }[]>`
        insert into plan (slug, name, limits)
        values (${`storage-${randomUUID()}`}, 'Armazenamento 1 MB', '{"storage_mb": 1}'::jsonb)
        returning id
      `;
      await tx`update subscription set plan_id = ${plan?.id ?? ""} where tenant_id = ${limitedTenantId}`;
    });

    const big = Buffer.concat([PNG, Buffer.alloc(700 * 1024, 2)]);
    expect((await upload(limited, { content: big })).status).toBe(201);

    const second = await upload(limited, { content: big });
    expect(second.status).toBe(403);
    expect(await second.json()).toMatchObject({ code: "PLAN_LIMIT_REACHED" });

    // Recusado antes de gravar: só o primeiro objeto está no armazenamento.
    expect(await readdir(path.join(dir, "tenants", limitedTenantId))).toHaveLength(1);
  });

  it("corpo acima de MAX_UPLOAD_MB é 413", async () => {
    const huge = Buffer.concat([PNG, Buffer.alloc(11 * 1024 * 1024, 3)]);
    expect((await upload(admin, { content: huge })).status).toBe(413);
  });
});
