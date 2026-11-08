import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { handleTenantError } from "@/api/tenant-errors";
import { tenantsQuerySchema, updateTenantSchema } from "@/lib/schemas/admin";
import { adminAuditQuerySchema } from "@/lib/schemas/security";
import { TenantRuleError } from "@/lib/tenant/errors";

// SPEC admin-crud, trilha A.

describe("updateTenantSchema (edição pela plataforma)", () => {
  it("aceita só nome, só slug ou os dois, com trim", () => {
    expect(updateTenantSchema.parse({ name: "  Clínica Nova " })).toEqual({
      name: "Clínica Nova",
    });
    expect(updateTenantSchema.parse({ slug: " clinica-nova " })).toEqual({
      slug: "clinica-nova",
    });
    expect(updateTenantSchema.parse({ name: "Clínica", slug: "clinica" })).toEqual({
      name: "Clínica",
      slug: "clinica",
    });
  });

  it("recusa corpo vazio, nome curto e slug fora do padrão do owner", () => {
    for (const body of [
      {},
      { name: "x" },
      { name: "a".repeat(81) },
      { slug: "ab" },
      { slug: "Maiúscula" },
      { slug: "com espaço" },
      { slug: "-comeca-com-hifen" },
      { slug: "a".repeat(49) },
    ]) {
      expect(updateTenantSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});

describe("filtros novos das listagens", () => {
  it("/admin/tenants filtra por plano, que precisa ser um uuid", () => {
    const id = "6f0c1f1e-0a7c-4a5f-9b0b-0f6a3b1d2c4e";

    expect(tenantsQuerySchema.parse({ plan: id }).plan).toBe(id);
    expect(tenantsQuerySchema.parse({}).plan).toBeUndefined();
    expect(tenantsQuerySchema.safeParse({ plan: "pro" }).success).toBe(false);
  });

  it("/admin/auditoria busca a organização pelo nome, com limite", () => {
    expect(adminAuditQuerySchema.parse({ tenantQ: " Clínica " }).tenantQ).toBe("Clínica");
    expect(adminAuditQuerySchema.safeParse({ tenantQ: "a".repeat(101) }).success).toBe(false);
  });
});

describe("TenantRuleError com campos extras", () => {
  const app = new Hono();
  app.onError(handleTenantError);
  app.get("/com", () => {
    throw new TenantRuleError(409, "PLAN_IN_USE", "Em uso.", {
      tenants: [{ id: "1", name: "Acme" }],
    });
  });
  app.get("/sem", () => {
    throw new TenantRuleError(409, "SLUG_TAKEN", "Em uso.");
  });

  it("espalha os campos na resposta e mantém erro e code", async () => {
    const response = await app.request("/com");

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Em uso.",
      code: "PLAN_IN_USE",
      tenants: [{ id: "1", name: "Acme" }],
    });
  });

  it("sem campos extras a resposta é a de sempre", async () => {
    expect(await (await app.request("/sem")).json()).toEqual({
      error: "Em uso.",
      code: "SLUG_TAKEN",
    });
  });
});
