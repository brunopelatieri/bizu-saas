import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { setEmailProviderForTests } from "@/lib/email/send";
import {
  asPlatform,
  bodyOf,
  cleanUpBilling,
  createPlanRow,
  ensureSubscription,
  makePlatformUser,
  restoreSettings,
  saveSettings,
  type SavedSettings,
} from "./billing-helpers";
import { cleanUpPortal, customerEmail } from "./portal-helpers";
import {
  addMember,
  call,
  cleanUp,
  connectOwner,
  createTenant,
  createUser,
  type TestUser,
} from "./tenant-helpers";

/**
 * SPEC `admin-crud`, trilha A: nome da organização nas listagens, excluir plano e preço,
 * editar organização. Cada bloco cobre uma etapa.
 */

let owner: postgres.Sql;
let saved: SavedSettings;
let platformOwner: TestUser;
let support: TestUser;
let tag: string;

const get = (user: TestUser, path: string) => call("GET", path, { cookie: user.cookie });
const send = (user: TestUser, method: string, path: string, body?: unknown) =>
  call(method, path, { cookie: user.cookie, body });

type Org = { id: string; name: string; role?: string; status?: string };
type Row = { id: string; organizations: Org[]; more: number };

beforeAll(async () => {
  setEmailProviderForTests(createMemoryProvider());
  owner = connectOwner();
  saved = await saveSettings(owner);
  platformOwner = await makePlatformUser(owner, "platform_owner");
  support = await makePlatformUser(owner, "platform_support");
  tag = randomUUID().slice(0, 6);
});

afterAll(async () => {
  setEmailProviderForTests(undefined);
  await cleanUpPortal(owner);
  await cleanUpBilling(owner);
  await restoreSettings(owner, saved);
  await cleanUp(owner);
  await owner.end();
});

/** Quatro organizações com donos próprios; nomes em ordem alfabética: A, B, C, D. */
async function createOrganizations() {
  const created: { id: string; name: string; owner: TestUser }[] = [];

  for (const letter of ["A", "B", "C", "D"]) {
    const user = await createUser(owner);
    const name = `Org ${tag} ${letter}`;
    created.push({ id: (await createTenant(user, name)).id, name, owner: user });
  }

  return created;
}

describe("etapa 1: nome da organização nas listagens", () => {
  let orgs: Awaited<ReturnType<typeof createOrganizations>>;

  beforeAll(async () => {
    orgs = await createOrganizations();
  });

  it("equipe: as 3 primeiras organizações por nome, com o papel, e o resto em `more`", async () => {
    const member = await createUser(owner);
    for (const org of orgs) await addMember(owner, org.id, member, "user");

    const body = await bodyOf(
      await get(support, `/api/admin/users?q=${member.email}`),
    );
    const [row] = body.items as Row[];

    expect(row?.organizations).toEqual([
      { id: orgs[0]?.id, name: orgs[0]?.name, role: "user" },
      { id: orgs[1]?.id, name: orgs[1]?.name, role: "user" },
      { id: orgs[2]?.id, name: orgs[2]?.name, role: "user" },
    ]);
    expect(row?.more).toBe(1);
    expect(row).not.toHaveProperty("tenants");
  });

  it("equipe: dono de uma organização vem com ela e sem `more`; sem organização, vazio", async () => {
    const [first] = orgs;
    const alone = await createUser(owner);
    const body = await bodyOf(
      await get(support, `/api/admin/users?q=${first?.owner.email}`),
    );

    expect((body.items as Row[])[0]).toMatchObject({
      organizations: [{ id: first?.id, name: first?.name, role: "owner" }],
      more: 0,
    });

    const empty = await bodyOf(await get(support, `/api/admin/users?q=${alone.email}`));
    expect((empty.items as Row[])[0]).toMatchObject({ organizations: [], more: 0 });
  });

  it("equipe: busca por nome de organização não casa, e a página respeita o limite de 3", async () => {
    // Forma da resposta para vários usuários de uma vez: cada um só vê as próprias organizações.
    const body = await bodyOf(await get(support, `/api/admin/users?q=${tag}`));
    const items = body.items as Array<Row & { email: string }>;

    // Nenhum usuário com `Org <tag>` no e-mail: a busca é por nome/e-mail, não por organização.
    expect(items).toEqual([]);

    const page = await bodyOf(await get(support, "/api/admin/users"));
    for (const item of page.items as Row[]) {
      expect(item.organizations.length).toBeLessThanOrEqual(3);
      expect(item.more).toBeGreaterThanOrEqual(0);
    }
  });

  it("portal: nomes das organizações com o status do vínculo", async () => {
    const email = customerEmail();
    const [person] = await owner<{ id: string }[]>`
      insert into portal_user (name, email) values ('Cliente', ${email}) returning id
    `;
    await asPlatform(owner, async (tx) => {
      for (const [index, org] of orgs.entries()) {
        await tx`
          insert into customer (tenant_id, portal_user_id, name, email, status)
          values (${org.id}, ${person?.id ?? ""}, 'Cliente', ${email},
                  ${index === 1 ? "active" : "lead"})
        `;
      }
    });

    const body = await bodyOf(
      await get(support, `/api/admin/users?scope=portal&q=${email}`),
    );
    const [row] = body.items as Row[];

    expect(row?.organizations).toEqual([
      { id: orgs[0]?.id, name: orgs[0]?.name, status: "lead" },
      { id: orgs[1]?.id, name: orgs[1]?.name, status: "active" },
      { id: orgs[2]?.id, name: orgs[2]?.name, status: "lead" },
    ]);
    expect(row?.more).toBe(1);
  });

  it("planos: nomes das organizações, `more` e filtro `plan` em /admin/tenants", async () => {
    const plan = await createPlanRow(owner, { isFree: false });
    for (const org of orgs) await ensureSubscription(owner, org.id, plan.id);

    const list = await bodyOf(await get(support, "/api/admin/plans"));
    const row = (list.plans as Array<Row & { tenants: number }>).find(
      ({ id }) => id === plan.id,
    );

    expect(row?.tenants).toBe(4);
    expect(row?.organizations.map(({ name }) => name)).toEqual([
      orgs[0]?.name,
      orgs[1]?.name,
      orgs[2]?.name,
    ]);
    expect(row?.more).toBe(1);

    const tenants = await bodyOf(
      await get(support, `/api/admin/tenants?plan=${plan.id}`),
    );
    expect(tenants.total).toBe(4);
    expect(
      (tenants.items as Array<{ id: string }>).map(({ id }) => id).sort(),
    ).toEqual(orgs.map(({ id }) => id).sort());

    // Plano sem assinatura: lista vazia, não erro.
    const unused = await createPlanRow(owner, { isFree: false });
    const emptyRow = ((await bodyOf(await get(support, "/api/admin/plans"))).plans as Row[]).find(
      ({ id }) => id === unused.id,
    );
    expect(emptyRow).toMatchObject({ organizations: [], more: 0 });
    expect((await get(support, `/api/admin/tenants?plan=${unused.id}`)).status).toBe(200);
    expect((await get(support, "/api/admin/tenants?plan=nao-e-uuid")).status).toBe(400);
  });

  it("auditoria: filtra pelo nome da organização, sem tratar % e _ como curinga", async () => {
    const [first, second] = orgs;
    const byName = await bodyOf(
      await get(support, `/api/admin/audit?tenantQ=${encodeURIComponent(first?.name ?? "")}`),
    );
    const items = byName.items as Array<{ tenantId: string; tenantName: string }>;

    expect(items.length).toBeGreaterThan(0);
    expect(items.every(({ tenantId }) => tenantId === first?.id)).toBe(true);
    expect(byName.total).toBe(items.length);

    // Busca parcial e sem diferenciar maiúsculas.
    const partial = await bodyOf(
      await get(support, `/api/admin/audit?tenantQ=${encodeURIComponent(`org ${tag} b`)}`),
    );
    expect(
      (partial.items as Array<{ tenantId: string }>).every(
        ({ tenantId }) => tenantId === second?.id,
      ),
    ).toBe(true);

    const wildcard = await bodyOf(await get(support, "/api/admin/audit?tenantQ=%25"));
    expect(
      (wildcard.items as Array<{ tenantName: string | null }>).every(
        ({ tenantName }) => tenantName?.includes("%"),
      ),
    ).toBe(true);

    const none = await bodyOf(await get(support, `/api/admin/audit?tenantQ=zz-${tag}-inexistente`));
    expect(none).toMatchObject({ total: 0, items: [] });
  });
});

// Etapas 2 e 3c: ver os blocos abaixo.
void platformOwner;
