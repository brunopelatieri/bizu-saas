import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { withPlatformScope, withTenant } from "@/db/rls";
import { dataExport, deletionRequest, file } from "@/db/schema";
import { connectOwner } from "./tenant-helpers";

/**
 * RLS das tabelas da fase 10 (`file`, `deletion_request`, `data_export`), no mesmo desenho de
 * `rls.test.ts`: fora de `withTenant` nada passa, dentro só o próprio tenant, e a linha sem
 * tenant (pedido de pessoa) só aparece com o escopo de plataforma.
 */

describe("RLS: arquivos e pedidos de LGPD", () => {
  let owner: postgres.Sql;
  const marker = randomUUID();
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const person = randomUUID();

  beforeAll(async () => {
    owner = connectOwner();

    await owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      await tx`
        insert into organization (id, name, slug) values
          (${tenantA}, 'A', ${`rls-lgpd-a-${marker}`}),
          (${tenantB}, 'B', ${`rls-lgpd-b-${marker}`})
      `;
      await tx`
        insert into file (tenant_id, key, name, size, mime, provider) values
          (${tenantA}, ${`rls/${marker}-a`}, 'a.txt', 1, 'text/plain', 'local'),
          (${tenantB}, ${`rls/${marker}-b`}, 'b.txt', 1, 'text/plain', 'local')
      `;
      await tx`
        insert into deletion_request (subject_type, subject_id, tenant_id, requested_by, scheduled_for) values
          ('tenant', ${tenantA}, ${tenantA}, ${person}, now()),
          ('tenant', ${tenantB}, ${tenantB}, ${person}, now()),
          ('user', ${person}, null, ${person}, now())
      `;
      await tx`
        insert into data_export (subject_type, subject_id) values ('user', ${person})
      `;
    });
  });

  afterAll(async () => {
    await owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      await tx`delete from file where key like ${`rls/${marker}%`}`;
      await tx`delete from deletion_request where requested_by = ${person}`;
      await tx`delete from data_export where subject_id = ${person}`;
      await tx`delete from organization where id in (${tenantA}, ${tenantB})`;
    });
    await owner.end();
  });

  const mine = (key: string) => key.includes(marker);

  it("bizu_app fora de withTenant não lê nenhuma das três", async () => {
    expect((await getDb().select().from(file)).filter(({ key }) => mine(key))).toEqual([]);
    expect(
      (await getDb().select().from(deletionRequest)).filter(({ requestedBy }) => requestedBy === person),
    ).toEqual([]);
    expect(
      (await getDb().select().from(dataExport)).filter(({ subjectId }) => subjectId === person),
    ).toEqual([]);
  });

  it("bizu_app fora de withTenant não grava arquivo", async () => {
    await expect(
      getDb().insert(file).values({
        tenantId: tenantA,
        key: `rls/${marker}-x`,
        name: "x",
        size: 1,
        mime: "text/plain",
        provider: "local",
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("file: dentro de withTenant(A) só vê A e não grava, altera nem apaga em B", async () => {
    const rows = await withTenant(tenantA, (tx) => tx.select().from(file));
    expect(rows.filter(({ key }) => mine(key)).map(({ tenantId }) => tenantId)).toEqual([tenantA]);

    await expect(
      withTenant(tenantA, (tx) =>
        tx.insert(file).values({
          tenantId: tenantB,
          key: `rls/${marker}-y`,
          name: "y",
          size: 1,
          mime: "text/plain",
          provider: "local",
        }),
      ),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    const updated = await withTenant(tenantA, (tx) =>
      tx.update(file).set({ name: "alterado" }).returning({ id: file.id }),
    );
    expect(updated).toHaveLength(1);

    const deleted = await withTenant(tenantA, (tx) => tx.delete(file).returning({ id: file.id }));
    expect(deleted).toHaveLength(1);

    const [stillB] = await owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      return tx<{ name: string }[]>`select name from file where key = ${`rls/${marker}-b`}`;
    });
    expect(stillB?.name).toBe("b.txt");
  });

  it("deletion_request: o tenant só vê o próprio pedido; o de pessoa exige a plataforma", async () => {
    const rows = await withTenant(tenantA, (tx) => tx.select().from(deletionRequest));
    const visible = rows.filter(({ requestedBy }) => requestedBy === person);

    expect(visible.map(({ subjectId }) => subjectId)).toEqual([tenantA]);

    const platform = await withPlatformScope("teste", (tx) => tx.select().from(deletionRequest));
    expect(
      platform.filter(({ requestedBy }) => requestedBy === person).map(({ subjectType }) => subjectType).sort(),
    ).toEqual(["tenant", "tenant", "user"]);
  });

  it("data_export: pedido de pessoa (sem tenant) só com o escopo de plataforma", async () => {
    const asTenant = await withTenant(tenantA, (tx) => tx.select().from(dataExport));
    expect(asTenant.filter(({ subjectId }) => subjectId === person)).toEqual([]);

    const platform = await withPlatformScope("teste", (tx) => tx.select().from(dataExport));
    expect(platform.filter(({ subjectId }) => subjectId === person)).toHaveLength(1);
  });
});
