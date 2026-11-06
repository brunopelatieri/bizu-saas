import { describe, expect, it } from "vitest";
import {
  billingProfileSchema,
  cancelSchema,
  checkoutSchema,
  isValidCnpj,
  isValidCpf,
} from "@/lib/schemas/billing";

const profile = {
  legalName: "Clínica Acme Ltda",
  document: "11.222.333/0001-81",
  documentType: "cnpj",
  email: "financeiro@acme.test",
};

describe("documentos", () => {
  it("aceita CPF válido, com ou sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("recusa CPF com dígito errado ou repetido", () => {
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });

  it("aceita CNPJ válido", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("recusa CNPJ com dígito errado ou repetido", () => {
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });
});

describe("billingProfileSchema", () => {
  it("guarda só os dígitos do documento", () => {
    expect(billingProfileSchema.parse(profile).document).toBe("11222333000181");
  });

  it("confere o documento pelo tipo escolhido", () => {
    expect(
      billingProfileSchema.safeParse({ ...profile, documentType: "cpf" }).success,
    ).toBe(false);
  });

  it("recusa campo desconhecido no endereço", () => {
    expect(
      billingProfileSchema.safeParse({ ...profile, address: { extra: "x" } }).success,
    ).toBe(false);
  });
});

describe("checkoutSchema", () => {
  const planPriceId = "6f1d0f5e-9c3b-4b5f-8a11-1c2d3e4f5a6b";

  it("aceita Pix, boleto e cartão", () => {
    for (const method of ["pix", "boleto", "card"]) {
      expect(checkoutSchema.safeParse({ planPriceId, method }).success).toBe(true);
    }
  });

  it("recusa método desconhecido e preço malformado", () => {
    expect(
      checkoutSchema.safeParse({ planPriceId, method: "cheque" }).success,
    ).toBe(false);
    expect(
      checkoutSchema.safeParse({ planPriceId: "1", method: "card" }).success,
    ).toBe(false);
  });
});

describe("cancelSchema", () => {
  it("o owner só cancela no fim do período", () => {
    expect(cancelSchema.parse({})).toEqual({ atPeriodEnd: true });
    expect(cancelSchema.safeParse({ atPeriodEnd: false }).success).toBe(false);
  });
});
