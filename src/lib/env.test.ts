import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "@/lib/env";

const base = {
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://bizu_app:bizu_app@localhost:15432/bizu",
  DIRECT_URL: "postgresql://bizu_owner:bizu_owner@localhost:15432/bizu",
  BETTER_AUTH_SECRET: "change-me-better-auth-secret-with-32-bytes",
  CREDENTIALS_ENCRYPTION_KEY: "change-me-credentials-encryption-key-32-bytes",
  AUDIT_SALT: "change-me-audit-salt",
  SMTP_HOST: "localhost",
};

function problemsOf(source: Record<string, string | undefined>) {
  try {
    parseEnv(source);
  } catch (error) {
    if (error instanceof EnvError) return error.problems;
    throw error;
  }
  return [];
}

describe("parseEnv", () => {
  it("aceita o .env.example em desenvolvimento e aplica padrões", () => {
    const env = parseEnv(base);

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.EMAIL_PROVIDER).toBe("smtp");
    expect(env.JOBS_MODE).toBe("inline");
    expect(env.PAYMENT_PROVIDERS).toEqual([]);
    expect(env.CSP_REPORT_ONLY).toBe(true);
    expect(env.SMTP_SECURE).toBe(false);
  });

  it("lista as obrigatórias que faltam, sem valores", () => {
    const problems = problemsOf({ ...base, DATABASE_URL: undefined, APP_URL: "" });

    expect(problems).toContain("DATABASE_URL: obrigatória");
    expect(problems.some((p) => p.startsWith("APP_URL:"))).toBe(true);
    expect(problems.join("\n")).not.toContain("bizu_owner");
  });

  it("exige variáveis condicionais do provedor escolhido", () => {
    expect(problemsOf({ ...base, SMTP_HOST: "" })).toContain(
      "SMTP_HOST: obrigatória com EMAIL_PROVIDER=smtp",
    );
    expect(problemsOf({ ...base, EMAIL_PROVIDER: "resend" })).toContain(
      "RESEND_API_KEY: obrigatória com EMAIL_PROVIDER=resend",
    );
    expect(problemsOf({ ...base, PAYMENT_PROVIDERS: "stripe, asaas" })).toEqual(
      expect.arrayContaining([
        "STRIPE_SECRET_KEY: obrigatória com stripe em PAYMENT_PROVIDERS",
        "ASAAS_WEBHOOK_TOKEN: obrigatória com asaas em PAYMENT_PROVIDERS",
      ]),
    );
  });

  it("recusa segredos de exemplo e provedor memory em produção", () => {
    const problems = problemsOf({
      ...base,
      NODE_ENV: "production",
      EMAIL_PROVIDER: "memory",
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "BETTER_AUTH_SECRET: use um valor gerado, não o exemplo do .env.example",
        "AUDIT_SALT: use um valor gerado, não o exemplo do .env.example",
        "EMAIL_PROVIDER: memory só serve para testes",
      ]),
    );
  });

  it("aceita segredos gerados em produção", () => {
    const env = parseEnv({
      ...base,
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "u1Z9x2Qw8eRtYuIoPaSdFgHjKlZxCvBnM0987654321=",
      CREDENTIALS_ENCRYPTION_KEY: "aB3dE6fG9hJ2kL5mN8pQ1rS4tU7vW0xYzA1bC2dE3f=",
      AUDIT_SALT: "9f8e7d6c5b4a39281706f5e4d3c2b1a0",
    });

    expect(env.NODE_ENV).toBe("production");
  });
});
