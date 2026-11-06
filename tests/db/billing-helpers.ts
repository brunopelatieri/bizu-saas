import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { createUser, type TestUser } from "./tenant-helpers";

/** Apoio dos testes de planos, admin e trial. */

export const PLAN_PREFIX = "test-";

export async function bodyOf(response: Response) {
  return (await response.clone().json()) as Record<string, unknown> & {
    code?: string;
    error?: string;
  };
}

/** Usuário com papel de plataforma. O papel vale já: `requireAuth` lê do banco. */
export async function makePlatformUser(
  owner: postgres.Sql,
  role: "platform_owner" | "platform_support",
): Promise<TestUser> {
  const user = await createUser(owner);
  await owner`update "user" set role = ${role} where id = ${user.id}`;

  return user;
}

export type SavedSettings = Array<{ key: string; value: unknown }>;

/** As configurações da plataforma são compartilhadas: o teste guarda e devolve. */
export async function saveSettings(owner: postgres.Sql): Promise<SavedSettings> {
  return owner<SavedSettings>`select key, value from platform_setting`;
}

export async function restoreSettings(owner: postgres.Sql, saved: SavedSettings) {
  await owner.begin(async (tx) => {
    await tx`delete from platform_setting`;
    for (const { key, value } of saved) {
      await tx`insert into platform_setting (key, value) values (${key}, ${tx.json(value as never)})`;
    }
  });
}

export async function setSettings(
  owner: postgres.Sql,
  settings: { trialPlanId: string | null; trialDays: number; graceDays: number },
) {
  const rows = [
    ["trial_plan_id", settings.trialPlanId],
    ["trial_days", settings.trialDays],
    ["grace_days", settings.graceDays],
  ] as const;

  await owner.begin(async (tx) => {
    for (const [key, value] of rows) {
      await tx`
        insert into platform_setting (key, value) values (${key}, ${tx.json(value)})
        on conflict (key) do update set value = excluded.value
      `;
    }
  });
}

export async function createPlanRow(
  owner: postgres.Sql,
  options: {
    isFree: boolean;
    limits?: Record<string, number | null>;
    features?: string[];
  },
) {
  const slug = `${PLAN_PREFIX}${randomUUID().slice(0, 8)}`;
  const [row] = await owner<{ id: string }[]>`
    insert into plan (slug, name, is_free, limits, features)
    values (${slug}, ${`Plano ${slug}`}, ${options.isFree},
            ${owner.json(options.limits ?? {})}, ${options.features ?? []})
    returning id
  `;
  if (!row) throw new Error("plano não criado");

  return { id: row.id, slug };
}

/** Os tenants de teste saem em `cleanUp`; aqui saem os planos que ficaram sem assinatura. */
export async function cleanUpBilling(owner: postgres.Sql) {
  await owner.begin(async (tx) => {
    await tx`select set_config('app.bypass_tenant', 'on', true)`;
    // Tenants de teste ainda existem neste ponto: some a assinatura deles antes.
    await tx`
      delete from subscription where tenant_id in (
        select m.organization_id from member m
        join "user" u on u.id = m.user_id
        where u.email like ${"%@tenant-test.bizu.local"}
      )
    `;
    await tx`
      delete from audit_log where actor_type = 'platform' and actor_id in (
        select id from "user" where email like ${"%@tenant-test.bizu.local"}
      )
    `;
    await tx`delete from plan where slug like ${`${PLAN_PREFIX}%`}`;
  });
}
