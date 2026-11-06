import { describe, expect, it } from "vitest";
import {
  customerSchema,
  customersQuerySchema,
  updateCustomerSchema,
} from "@/lib/schemas/customer";
import {
  magicLinkRequestSchema,
  portalProfileSchema,
  portalTokenSchema,
  setPasswordSchema,
} from "@/lib/schemas/portal";

describe("customerSchema", () => {
  const valid = { name: "Júlia Lima", email: "  JULIA@Example.com " };

  it("normaliza o e-mail e não inventa campos", () => {
    expect(customerSchema.parse(valid)).toEqual({
      name: "Júlia Lima",
      email: "julia@example.com",
    });
  });

  it("texto opcional vazio vira null", () => {
    expect(
      customerSchema.parse({ ...valid, phone: "", document: "", notes: "" }),
    ).toMatchObject({ phone: null, document: null, notes: null });
  });

  it("etiquetas repetidas somem", () => {
    expect(customerSchema.parse({ ...valid, tags: ["a", "b", "a"] }).tags).toEqual([
      "a",
      "b",
    ]);
  });

  it("recusa status fora da lista e telefone com letras", () => {
    expect(customerSchema.safeParse({ ...valid, status: "vip" }).success).toBe(false);
    expect(customerSchema.safeParse({ ...valid, phone: "abc" }).success).toBe(false);
  });
});

describe("updateCustomerSchema", () => {
  it("só traz o que veio: o PATCH não apaga o resto", () => {
    expect(updateCustomerSchema.parse({ name: "Novo nome" })).toEqual({
      name: "Novo nome",
    });
  });

  it("recusa corpo vazio", () => {
    expect(updateCustomerSchema.safeParse({}).success).toBe(false);
  });
});

describe("customersQuerySchema", () => {
  it("usa a primeira página e converte o número", () => {
    expect(customersQuerySchema.parse({})).toEqual({ page: 1 });
    expect(customersQuerySchema.parse({ page: "3" }).page).toBe(3);
  });

  it("recusa página inválida", () => {
    expect(customersQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });
});

describe("schemas do portal", () => {
  it("magic link exige `org` válido", () => {
    expect(
      magicLinkRequestSchema.safeParse({ email: "a@b.com", org: "acme" }).success,
    ).toBe(true);
    expect(
      magicLinkRequestSchema.safeParse({ email: "a@b.com", org: "ACME/../x" })
        .success,
    ).toBe(false);
  });

  it("token é obrigatório; `org` é opcional", () => {
    expect(portalTokenSchema.safeParse({ token: "abc" }).success).toBe(true);
    expect(portalTokenSchema.safeParse({ token: "" }).success).toBe(false);
  });

  it("telefone vazio no perfil vira null", () => {
    expect(portalProfileSchema.parse({ name: "Júlia", phone: "" }).phone).toBeNull();
  });

  it("senha nova segue o mínimo de 10", () => {
    expect(setPasswordSchema.safeParse({ newPassword: "curta" }).success).toBe(false);
    expect(
      setPasswordSchema.safeParse({ newPassword: "senha-com-dez" }).success,
    ).toBe(true);
  });
});
