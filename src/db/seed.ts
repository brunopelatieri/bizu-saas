import { eq } from "drizzle-orm";
import { config } from "dotenv";
import { pathToFileURL } from "node:url";
import { logError } from "@/api/log";
import { acceptCurrentVersions, pendingConsents } from "@/lib/lgpd/consent";

/**
 * `npm run db:seed`: dados de desenvolvimento. Idempotente: roda quantas vezes quiser e
 * não sobrescreve o que foi editado em `/admin` (planos e configurações só são criados
 * se faltarem). Recusa `NODE_ENV=production` sem `SEED_ALLOW_PRODUCTION=1`.
 *
 * Roda com o papel de runtime (`DATABASE_URL`): o `bizu_app` já escreve em todas as
 * tabelas, e o RLS de `subscription` é atendido por `withTenant`. A senha vem de
 * `SEED_PASSWORD` e o hash é o do próprio Better Auth. As contas nascem verificadas por
 * `INSERT` direto, a exceção registrada no README: o cadastro real exige o e-mail.
 */

export const SEED_PLANS = [
  {
    slug: "free",
    name: "Gratuito",
    description: "Para conhecer o produto, sem prazo.",
    limits: { members: 2, customers: 20 },
    features: [],
    isFree: true,
    sortOrder: 0,
    prices: [],
  },
  {
    slug: "basic",
    name: "Básico",
    description: "Para equipes pequenas.",
    limits: { members: 5, customers: 200 },
    features: [],
    isFree: false,
    sortOrder: 1,
    prices: [
      { interval: "month", amountCents: 4900 },
      { interval: "year", amountCents: 49000 },
    ],
  },
  {
    slug: "pro",
    name: "Pro",
    description: "Para quem precisa de mais pessoas, clientes e recursos.",
    limits: { members: 15, customers: 5000 },
    features: ["audit_export", "custom_roles"],
    isFree: false,
    sortOrder: 2,
    prices: [
      { interval: "month", amountCents: 9900 },
      { interval: "year", amountCents: 99000 },
    ],
  },
] as const;

export const SEED_USERS = {
  platformOwner: { email: "owner@bizu.local", name: "Proprietário Bizu", role: "platform_owner" },
  platformSupport: { email: "suporte@bizu.local", name: "Suporte Bizu", role: "platform_support" },
  acmeOwner: { email: "acme.owner@bizu.local", name: "Ana Acme", role: "user" },
  acmeAdmin: { email: "acme.admin@bizu.local", name: "Beto Admin", role: "user" },
  acmeMember: { email: "acme.membro@bizu.local", name: "Carla Membro", role: "user" },
} as const;

/** Clientes do portal. Júlia é ativa em dois tenants: prova a escolha em `/portal/escolher`. */
export const SEED_CUSTOMERS = {
  julia: { email: "julia@cliente.local", name: "Júlia Lima" },
  lead: { email: "lead@cliente.local", name: "Lia Lead" },
} as const;

/** O valor de `.env.example`: público, serve só para desenvolvimento. */
const EXAMPLE_PASSWORD = "Bizu-seed-2026!";

export function assertSeedAllowed(env: Record<string, string | undefined>) {
  if (env.NODE_ENV === "production" && env.SEED_ALLOW_PRODUCTION !== "1") {
    throw new Error(
      "O seed cria contas de teste e é recusado em produção. Defina SEED_ALLOW_PRODUCTION=1 só se for isso mesmo que você quer.",
    );
  }

  const password = env.SEED_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error(
      "Defina SEED_PASSWORD (mínimo de 10 caracteres) em .env.local.",
    );
  }

  if (env.NODE_ENV === "production" && password === EXAMPLE_PASSWORD) {
    throw new Error("Em produção, SEED_PASSWORD não pode ser o valor de .env.example.");
  }

  return password;
}

export type SeedSummary = {
  users: number;
  plans: number;
  tenant: string;
  customers: number;
};

export async function runSeed(password: string): Promise<SeedSummary> {
  // Imports tardios: o ambiente precisa estar carregado antes de `getEnv()`.
  const { getDb } = await import("@/db");
  const {
    account,
    customer,
    member,
    organization,
    plan,
    planPrice,
    platformSetting,
    portalAccount,
    portalUser,
    user,
  } = await import("@/db/schema");
  const { withTenant } = await import("@/db/rls");
  const { getAuth } = await import("@/lib/auth/server");
  const { SETTING_DEFAULTS, SETTING_KEYS } = await import("@/lib/billing/settings");
  const { startTrial } = await import("@/lib/billing/subscription");

  const db = getDb();
  const { password: hashPassword } = await getAuth().$context;
  const passwordHash = await hashPassword.hash(password);

  // Planos: só os que faltam.
  for (const { prices, ...values } of SEED_PLANS) {
    await db
      .insert(plan)
      .values({ ...values, features: [...values.features] })
      .onConflictDoNothing({ target: plan.slug });

    const [row] = await db.select({ id: plan.id }).from(plan).where(eq(plan.slug, values.slug));
    if (!row) throw new Error(`plano ${values.slug} não foi criado`);

    for (const price of prices) {
      await db
        .insert(planPrice)
        .values({ planId: row.id, provider: "stripe", ...price })
        .onConflictDoNothing();
    }
  }

  // Configurações: só as chaves que faltam (o proprietário pode ter mudado).
  const [pro] = await db.select({ id: plan.id }).from(plan).where(eq(plan.slug, "pro"));
  await db
    .insert(platformSetting)
    .values([
      { key: SETTING_KEYS.trialPlanId, value: pro?.id ?? null },
      { key: SETTING_KEYS.trialDays, value: SETTING_DEFAULTS.trialDays },
      { key: SETTING_KEYS.graceDays, value: SETTING_DEFAULTS.graceDays },
      {
        key: SETTING_KEYS.impersonationPolicy,
        value: SETTING_DEFAULTS.impersonationPolicy,
      },
    ])
    .onConflictDoNothing({ target: platformSetting.key });

  // Usuários: contas verificadas; quem já existe só tem o papel conferido. Conta sem e-mail
  // confirmado veio do cadastro público, com a senha de quem cadastrou: promovê-la daria o
  // papel a essa pessoa.
  const ids = new Map<string, string>();
  for (const { email, name, role } of Object.values(SEED_USERS)) {
    const [found] = await db
      .select({ id: user.id, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.email, email));

    if (found && !found.emailVerified) {
      throw new Error(
        `${email} já existe sem e-mail confirmado. Apague essa conta antes de rodar o seed.`,
      );
    }

    if (found) {
      await db.update(user).set({ role }).where(eq(user.id, found.id));
      ids.set(email, found.id);
      continue;
    }

    const [created] = await db
      .insert(user)
      .values({ name, email, role, emailVerified: true })
      .returning({ id: user.id });
    if (!created) throw new Error(`usuário ${email} não foi criado`);

    await db.insert(account).values({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: passwordHash,
    });
    ids.set(email, created.id);
  }

  // Tenant "acme": equipe e assinatura (plano padrão + trial, como no onboarding).
  let [acme] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, "acme"));

  if (!acme) {
    [acme] = await db
      .insert(organization)
      .values({ name: "Clínica Acme", slug: "acme" })
      .returning({ id: organization.id });
  }
  if (!acme) throw new Error("tenant acme não foi criado");

  const roles = [
    [SEED_USERS.acmeOwner.email, "owner"],
    [SEED_USERS.acmeAdmin.email, "admin"],
    [SEED_USERS.acmeMember.email, "member"],
  ] as const;
  for (const [email, role] of roles) {
    const userId = ids.get(email);
    if (!userId) continue;

    await db
      .insert(member)
      .values({ organizationId: acme.id, userId, role })
      .onConflictDoNothing();
    await db
      .update(user)
      .set({ lastTenantId: acme.id })
      .where(eq(user.id, userId));
  }

  await startTrial(acme.id);

  // Tenant "beta": prova o multi-tenant. O admin da Acme também é membro aqui.
  let [beta] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, "beta"));

  if (!beta) {
    [beta] = await db
      .insert(organization)
      .values({ name: "Studio Beta", slug: "beta" })
      .returning({ id: organization.id });
  }
  if (!beta) throw new Error("tenant beta não foi criado");

  const betaMember = ids.get(SEED_USERS.acmeAdmin.email);
  if (betaMember) {
    await db
      .insert(member)
      .values({ organizationId: beta.id, userId: betaMember, role: "member" })
      .onConflictDoNothing();
  }

  await startTrial(beta.id);

  // Portal: Júlia com senha e e-mail verificado; a lead, sem identidade, à espera do convite.
  // Como na equipe, identidade sem e-mail confirmado veio do autocadastro, com a senha de
  // quem cadastrou: ligá-la a um cliente ativo daria o acesso a essa pessoa.
  const { julia, lead } = SEED_CUSTOMERS;

  await db
    .insert(portalUser)
    .values({ ...julia, emailVerified: true })
    .onConflictDoNothing({ target: portalUser.email });

  const [juliaUser] = await db
    .select({ id: portalUser.id, emailVerified: portalUser.emailVerified })
    .from(portalUser)
    .where(eq(portalUser.email, julia.email));
  if (!juliaUser) throw new Error("cliente julia não foi criada");
  if (!juliaUser.emailVerified) {
    throw new Error(
      `${julia.email} já existe no portal sem e-mail confirmado. Apague essa conta antes de rodar o seed.`,
    );
  }

  await db
    .insert(portalAccount)
    .values({
      userId: juliaUser.id,
      providerId: "credential",
      accountId: juliaUser.id,
      password: passwordHash,
    })
    .onConflictDoNothing();

  const seedCustomer = (tenantId: string, values: typeof customer.$inferInsert) =>
    withTenant(tenantId, (tx) =>
      tx.insert(customer).values(values).onConflictDoNothing(),
    );

  for (const tenantId of [acme.id, beta.id]) {
    await seedCustomer(tenantId, {
      ...julia,
      tenantId,
      portalUserId: juliaUser.id,
      status: "active",
    });
  }
  await seedCustomer(acme.id, { ...lead, tenantId: acme.id });

  // Contas do seed já aceitaram os textos vigentes: sem isso, o primeiro login abriria o
  // modal de re-aceite. O cadastro real grava o aceite pelo hook de `src/lib/lgpd/consent.ts`.
  const seeded: Array<{ type: "user" | "portal_user"; id: string }> = [
    ...[...ids.values()].map((id) => ({ type: "user" as const, id })),
    { type: "portal_user" as const, id: juliaUser.id },
  ];
  for (const subject of seeded) {
    if ((await pendingConsents(subject)).length > 0) {
      await acceptCurrentVersions(subject, {});
    }
  }

  return {
    users: ids.size,
    plans: SEED_PLANS.length,
    tenant: "acme",
    customers: Object.keys(SEED_CUSTOMERS).length,
  };
}

async function main() {
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });

  try {
    const password = assertSeedAllowed(process.env);
    const summary = await runSeed(password);

    console.log(
      `Seed concluído: ${summary.users} usuários, ${summary.plans} planos, ${summary.customers} clientes e o tenant ${summary.tenant}.`,
    );
    console.log(
      `Entre em /login com ${SEED_USERS.platformOwner.email} (admin) ou ${SEED_USERS.acmeOwner.email} (tenant), senha em SEED_PASSWORD.`,
    );
    console.log(
      `Portal: ${SEED_CUSTOMERS.julia.email} em /portal/login?org=acme, com a mesma senha.`,
    );
    process.exit(0);
  } catch (error) {
    logError("Falha no seed", error);
    process.exit(1);
  }
}

// Só roda como script; os testes importam `runSeed`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
