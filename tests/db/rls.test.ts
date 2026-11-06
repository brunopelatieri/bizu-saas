import { randomUUID } from "node:crypto";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { eq, isTable } from "drizzle-orm";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { withPlatformScope, withTenant } from "@/db/rls";
import * as schema from "@/db/schema";
import { connectOwner } from "./tenant-helpers";

/**
 * Isolamento na camada do banco (`spec-tenant-rbac.md`). `customer` chega na fase 8; até
 * lá `audit_log` é a tabela de tenant que prova as regras, e o inventário cobre as novas.
 */

const { auditLog } = schema;

const tables = (Object.values(schema) as unknown[]).filter(
  (value): value is PgTable => isTable(value),
);

const tenantTables = tables
  .map((table) => getTableConfig(table))
  .filter(({ columns }) => columns.some(({ name }) => name === "tenant_id"));

describe("RLS", () => {
  let owner: postgres.Sql;
  const marker = randomUUID();
  const tenantA = randomUUID();
  const tenantB = randomUUID();

  const onlyMine = eq(auditLog.action, marker);

  beforeAll(async () => {
    owner = connectOwner();

    await owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      await tx`
        insert into organization (id, name, slug) values
          (${tenantA}, 'A', ${`rls-a-${marker}`}),
          (${tenantB}, 'B', ${`rls-b-${marker}`})
      `;
      await tx`
        insert into audit_log (tenant_id, actor_type, action) values
          (${tenantA}, 'system', ${marker}),
          (${tenantB}, 'system', ${marker})
      `;
    });
  });

  afterAll(async () => {
    await owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      await tx`delete from audit_log where action = ${marker}`;
      await tx`delete from organization where id in (${tenantA}, ${tenantB})`;
    });
    await owner.end();
  });

  describe("inventário", () => {
    it("acha as tabelas de tenant no schema", () => {
      expect(tenantTables.map(({ name }) => name)).toContain("audit_log");
    });

    it.each(tenantTables.map(({ name, ...config }) => [name, config] as const))(
      "%s declara enableRLS e policy",
      (_name, config) => {
        expect(config.enableRLS).toBe(true);
        expect(config.policies.length).toBeGreaterThan(0);
      },
    );

    it.each(tenantTables.map(({ name }) => [name]))(
      "%s tem RLS forçado e policy no banco",
      async (name) => {
        const [row] = await owner<
          { relrowsecurity: boolean; relforcerowsecurity: boolean }[]
        >`
          select relrowsecurity, relforcerowsecurity
          from pg_class where oid = ${`public.${name}`}::regclass
        `;
        const policies = await owner`
          select 1 from pg_policies
          where schemaname = 'public' and tablename = ${name}
        `;

        expect(row).toEqual({
          relrowsecurity: true,
          relforcerowsecurity: true,
        });
        expect(policies.length).toBeGreaterThan(0);
      },
    );
  });

  it("bizu_app fora de withTenant não lê nada", async () => {
    const rows = await getDb().select().from(auditLog).where(onlyMine);

    expect(rows).toEqual([]);
  });

  it("bizu_app fora de withTenant não grava", async () => {
    await expect(
      getDb()
        .insert(auditLog)
        .values({ tenantId: tenantA, actorType: "system", action: marker }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("dentro de withTenant(A) não lê B", async () => {
    const rows = await withTenant(tenantA, (tx) =>
      tx.select().from(auditLog).where(onlyMine),
    );

    expect(rows.map(({ tenantId }) => tenantId)).toEqual([tenantA]);
  });

  it("dentro de withTenant(A) não grava em B", async () => {
    await expect(
      withTenant(tenantA, (tx) =>
        tx
          .insert(auditLog)
          .values({ tenantId: tenantB, actorType: "system", action: marker }),
      ),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("dentro de withTenant(A) não altera linhas de B", async () => {
    const updated = await withTenant(tenantA, (tx) =>
      tx
        .update(auditLog)
        .set({ targetType: "alterado" })
        .where(eq(auditLog.tenantId, tenantB))
        .returning(),
    );

    expect(updated).toEqual([]);
  });

  it("evento sem tenant só aparece com withPlatformScope", async () => {
    const [row] = await withPlatformScope("teste", (tx) =>
      tx
        .insert(auditLog)
        .values({ actorType: "system", action: marker })
        .returning(),
    );
    if (!row) throw new Error("linha não criada");

    const fromTenant = await withTenant(tenantA, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.id, row.id)),
    );

    expect(fromTenant).toEqual([]);
  });

  it("o escopo não sobrevive à transação", async () => {
    // O pool tem várias conexões: repetir aumenta a chance de reusar a mesma.
    for (let i = 0; i < 20; i += 1) {
      await withTenant(tenantA, (tx) => tx.select().from(auditLog).limit(1));
      await withPlatformScope("teste", (tx) =>
        tx.select().from(auditLog).limit(1),
      );

      const rows = await getDb().select().from(auditLog).where(onlyMine);
      expect(rows).toEqual([]);
    }
  });

  it("withPlatformScope lê todos os tenants", async () => {
    const rows = await withPlatformScope("teste", (tx) =>
      tx.select().from(auditLog).where(onlyMine),
    );

    expect(rows.map(({ tenantId }) => tenantId)).toEqual(
      expect.arrayContaining([tenantA, tenantB]),
    );
  });

  it("bizu_owner também obedece: sem bypass não lê, com bypass lê tudo", async () => {
    const without = await owner`
      select 1 from audit_log where action = ${marker}
    `;
    const withBypass = await owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      return tx`select tenant_id from audit_log where action = ${marker}`;
    });

    expect(without.length).toBe(0);
    expect(withBypass.map(({ tenant_id }) => tenant_id)).toEqual(
      expect.arrayContaining([tenantA, tenantB]),
    );
  });
});
