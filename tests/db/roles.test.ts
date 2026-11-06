import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Smoke test dos papéis do Postgres (docker/postgres/init.sql):
 * - DIRECT_URL conecta como bizu_owner, dono das tabelas.
 * - DATABASE_URL conecta como bizu_app, sem BYPASSRLS e sem criar objetos.
 * - Tabelas criadas pelas migrations ficam acessíveis ao runtime.
 */

function url(name: "DATABASE_URL" | "DIRECT_URL") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não definida; veja docs/context/onboarding.md`);
  return value;
}

type RoleRow = { current_user: string; rolsuper: boolean; rolbypassrls: boolean };

async function describeRole(sql: postgres.Sql) {
  const [row] = await sql<RoleRow[]>`
    select current_user, rolsuper, rolbypassrls
    from pg_roles where rolname = current_user
  `;
  if (!row) throw new Error("papel atual não encontrado em pg_roles");
  return row;
}

describe("papéis do Postgres", () => {
  let app: postgres.Sql;
  let owner: postgres.Sql;

  beforeAll(() => {
    app = postgres(url("DATABASE_URL"), { max: 1 });
    owner = postgres(url("DIRECT_URL"), { max: 1 });
  });

  afterAll(async () => {
    await Promise.all([app.end(), owner.end()]);
  });

  it("DATABASE_URL é bizu_app, sem superuser e sem BYPASSRLS", async () => {
    const role = await describeRole(app);

    expect(role.current_user).toBe("bizu_app");
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);
  });

  it("DIRECT_URL é bizu_owner e não é superuser", async () => {
    const role = await describeRole(owner);

    expect(role.current_user).toBe("bizu_owner");
    expect(role.rolsuper).toBe(false);
  });

  it("bizu_app não cria tabelas no schema public", async () => {
    await expect(
      app`create table if not exists _bizu_app_should_fail (id int)`,
    ).rejects.toMatchObject({ code: "42501" }); // insufficient_privilege
  });

  it("tabelas das migrations ficam acessíveis ao runtime", async () => {
    const rows = await app`select count(*)::int as total from contact_messages`;

    expect(rows[0]?.total).toBeTypeOf("number");
  });

  it("tabela nova criada por bizu_owner herda as permissões do runtime", async () => {
    await owner`create table if not exists _bizu_roles_probe (id serial primary key, note text)`;

    try {
      await app`insert into _bizu_roles_probe (note) values ('ok')`;
      const rows = await app`select note from _bizu_roles_probe`;
      expect(rows.map((r) => r.note)).toContain("ok");
    } finally {
      await owner`drop table if exists _bizu_roles_probe`;
    }
  });
});
