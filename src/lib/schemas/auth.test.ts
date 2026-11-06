import { describe, expect, it } from "vitest";
import {
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/lib/schemas/auth";

const signup = {
  name: "Ana",
  email: "Ana@Example.com ",
  password: "senha-com-10",
  acceptTerms: true,
  termsVersion: "2026-11",
};

describe("signupSchema", () => {
  it("normaliza o e-mail", () => {
    expect(signupSchema.parse(signup).email).toBe("ana@example.com");
  });

  it("exige senha de 10 caracteres", () => {
    expect(signupSchema.safeParse({ ...signup, password: "123456789" }).success).toBe(
      false,
    );
  });

  it("exige o aceite dos termos", () => {
    expect(signupSchema.safeParse({ ...signup, acceptTerms: false }).success).toBe(
      false,
    );
  });

  it("não exige telefone", () => {
    expect(signupSchema.safeParse(signup).success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("não aplica regra de tamanho a senha antiga", () => {
    expect(
      loginSchema.safeParse({ email: "ana@example.com", password: "123" }).success,
    ).toBe(true);
  });
});

describe("resetPasswordSchema", () => {
  it("recusa confirmação diferente", () => {
    const result = resetPasswordSchema.safeParse({
      password: "senha-com-10",
      confirmPassword: "senha-com-11",
    });

    expect(result.success).toBe(false);
  });
});
