import { describe, expect, it } from "vitest";
import { parseSettings, SETTING_DEFAULTS } from "@/lib/billing/settings";
import {
  changeTenantPlanSchema,
  planPriceSchema,
  planSchema,
  platformSettingsSchema,
  reasonSchema,
  tenantsQuerySchema,
  updatePlanSchema,
  usersQuerySchema,
} from "@/lib/schemas/admin";

const validPlan = { slug: "pro", name: "Pro" };

describe("planSchema", () => {
  it("aceita o mínimo e preenche os padrões", () => {
    expect(planSchema.parse(validPlan)).toEqual({
      slug: "pro",
      name: "Pro",
      limits: {},
      features: [],
      isFree: false,
      active: true,
      sortOrder: 0,
    });
  });

  it("aceita limites, com null para ilimitado, e tira features repetidas", () => {
    const plan = planSchema.parse({
      ...validPlan,
      limits: { members: 10, customers: null },
      features: ["audit_export", "audit_export", "custom_roles"],
    });

    expect(plan.limits).toEqual({ members: 10, customers: null });
    expect(plan.features).toEqual(["audit_export", "custom_roles"]);
  });

  it.each([
    ["limite negativo", { limits: { members: -1 } }],
    ["limite fracionado", { limits: { members: 1.5 } }],
    ["métrica desconhecida", { limits: { cpus: 4 } }],
    ["feature com maiúscula", { features: ["AuditExport"] }],
    ["slug inválido", { slug: "Plano Pro" }],
    ["nome curto", { name: "A" }],
    ["ordem negativa", { sortOrder: -1 }],
  ])("recusa %s", (_label, patch) => {
    expect(planSchema.safeParse({ ...validPlan, ...patch }).success).toBe(false);
  });
});

describe("updatePlanSchema", () => {
  it("é parcial, mas não aceita vazio nem troca de slug", () => {
    expect(updatePlanSchema.safeParse({ name: "Novo" }).success).toBe(true);
    expect(updatePlanSchema.safeParse({}).success).toBe(false);
    // O slug não faz parte do esquema: some do resultado.
    expect(updatePlanSchema.parse({ name: "Novo", slug: "outro" })).toEqual({
      name: "Novo",
    });
  });
});

describe("planPriceSchema", () => {
  const price = { provider: "stripe", interval: "month", amountCents: 9900 };

  it("aceita preço válido", () => {
    expect(planPriceSchema.parse(price)).toMatchObject({ ...price, active: true });
  });

  it.each([
    ["provedor desconhecido", { provider: "paypal" }],
    ["intervalo desconhecido", { interval: "week" }],
    ["valor zero", { amountCents: 0 }],
    ["valor fracionado", { amountCents: 99.5 }],
    ["valor negativo", { amountCents: -100 }],
  ])("recusa %s", (_label, patch) => {
    expect(planPriceSchema.safeParse({ ...price, ...patch }).success).toBe(false);
  });
});

describe("platformSettingsSchema", () => {
  it("aceita um campo só", () => {
    expect(platformSettingsSchema.parse({ trialDays: 30 })).toEqual({ trialDays: 30 });
  });

  it("trial 0 e plano nulo são válidos (gratuito sem fim)", () => {
    expect(
      platformSettingsSchema.parse({ trialDays: 0, trialPlanId: null }),
    ).toEqual({ trialDays: 0, trialPlanId: null });
  });

  it.each([
    ["vazio", {}],
    ["dias negativos", { trialDays: -1 }],
    ["trial acima de 365", { trialDays: 366 }],
    ["carência acima de 60", { graceDays: 61 }],
    ["dias fracionados", { trialDays: 1.5 }],
    ["plano que não é uuid", { trialPlanId: "pro" }],
  ])("recusa %s", (_label, input) => {
    expect(platformSettingsSchema.safeParse(input).success).toBe(false);
  });
});

describe("parseSettings", () => {
  it("sem linhas, usa os padrões", () => {
    expect(parseSettings([])).toEqual(SETTING_DEFAULTS);
  });

  it("lê as chaves e ignora valor malformado", () => {
    expect(
      parseSettings([
        { key: "trial_days", value: 30 },
        { key: "grace_days", value: "sete" },
        { key: "trial_plan_id", value: "abc" },
      ]),
    ).toEqual({
      trialPlanId: "abc",
      trialDays: 30,
      graceDays: 7,
      impersonationPolicy: "consent",
    });
  });
});

describe("consultas e ações", () => {
  it("lista de tenants: página padrão 1, filtro de estado validado", () => {
    expect(tenantsQuerySchema.parse({})).toEqual({ page: 1 });
    expect(tenantsQuerySchema.parse({ status: "read_only", page: "2" })).toMatchObject({
      status: "read_only",
      page: 2,
    });
    expect(tenantsQuerySchema.safeParse({ status: "pago" }).success).toBe(false);
    expect(tenantsQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("lista de usuários limita a busca", () => {
    expect(usersQuerySchema.safeParse({ q: "a".repeat(101) }).success).toBe(false);
  });

  it("motivo é opcional e limitado", () => {
    expect(reasonSchema.parse({})).toEqual({});
    expect(reasonSchema.safeParse({ reason: "x".repeat(201) }).success).toBe(false);
  });

  it("troca de plano exige uuid", () => {
    expect(changeTenantPlanSchema.safeParse({ planId: "pro" }).success).toBe(false);
  });
});
