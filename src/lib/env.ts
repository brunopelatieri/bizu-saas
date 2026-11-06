import { z } from "zod";

/**
 * Variáveis de ambiente do servidor, validadas uma vez na inicialização.
 *
 * - Nova variável entra aqui e em `.env.example`, com comentário de uso.
 * - Falta ou valor inválido derruba o processo listando os nomes, nunca os valores.
 * - Em produção, segredos com o valor de exemplo (`change-me...`) são recusados.
 * - Só o servidor lê este módulo. O navegador recebe apenas `VITE_*`.
 */

const PLACEHOLDER_PREFIX = "change-me";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const booleanString = (defaultValue: boolean) =>
  z.preprocess(
    emptyToUndefined,
    z
      .enum(["true", "false", "1", "0"])
      .default(defaultValue ? "true" : "false")
      .transform((value) => value === "true" || value === "1"),
  );

const integerString = (defaultValue: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().nonnegative().default(defaultValue),
  );

const csvList = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
);

const secret = z.string().min(16, "mínimo de 16 caracteres");

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: integerString(3000),
    APP_URL: z.url({ protocol: /^https?$/ }),
    TRUSTED_PROXY_HOPS: integerString(0),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DIRECT_URL: z.url({ protocol: /^postgres(ql)?$/ }),

    BETTER_AUTH_SECRET: secret,
    CREDENTIALS_ENCRYPTION_KEY: secret,
    AUDIT_SALT: secret,

    EMAIL_PROVIDER: z.enum(["smtp", "resend", "memory"]).default("smtp"),
    EMAIL_FROM: z.string().min(3).default("Bizu SaaS <no-reply@localhost>"),
    EMAIL_REPLY_TO: optionalString,
    SMTP_HOST: optionalString,
    SMTP_PORT: integerString(1025),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    SMTP_SECURE: booleanString(false),
    RESEND_API_KEY: optionalString,
    RESEND_WEBHOOK_SECRET: optionalString,

    JOBS_MODE: z.enum(["inline", "worker", "off"]).default("inline"),
    RATE_LIMIT_STORE: z.enum(["memory", "postgres"]).default("memory"),

    PAYMENT_PROVIDERS: csvList,
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    ASAAS_API_KEY: optionalString,
    ASAAS_WEBHOOK_TOKEN: optionalString,
    ASAAS_SANDBOX: booleanString(true),
    MERCADOPAGO_ACCESS_TOKEN: optionalString,
    MERCADOPAGO_WEBHOOK_SECRET: optionalString,
    PAGARME_SECRET_KEY: optionalString,
    PAGARME_WEBHOOK_SECRET: optionalString,
    PAGBANK_TOKEN: optionalString,
    PAGBANK_SANDBOX: booleanString(true),

    STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default(".data/storage"),
    S3_BUCKET: optionalString,
    S3_REGION: optionalString,
    S3_ENDPOINT: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,

    CSP_REPORT_ONLY: booleanString(true),
    SEED_PASSWORD: optionalString,
    SEED_ALLOW_PRODUCTION: optionalString,
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
    SENTRY_DSN: optionalString,
  })
  .superRefine((env, ctx) => {
    const requireWhen = (
      condition: boolean,
      keys: Array<keyof typeof env>,
      reason: string,
    ) => {
      if (!condition) return;
      for (const key of keys) {
        if (env[key] === undefined) {
          ctx.addIssue({ code: "custom", path: [key], message: reason });
        }
      }
    };

    requireWhen(
      env.EMAIL_PROVIDER === "smtp",
      ["SMTP_HOST"],
      "obrigatória com EMAIL_PROVIDER=smtp",
    );
    requireWhen(
      env.EMAIL_PROVIDER === "resend",
      ["RESEND_API_KEY"],
      "obrigatória com EMAIL_PROVIDER=resend",
    );
    requireWhen(
      env.PAYMENT_PROVIDERS.includes("stripe"),
      ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      "obrigatória com stripe em PAYMENT_PROVIDERS",
    );
    requireWhen(
      env.PAYMENT_PROVIDERS.includes("asaas"),
      ["ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"],
      "obrigatória com asaas em PAYMENT_PROVIDERS",
    );
    requireWhen(
      env.STORAGE_PROVIDER === "s3",
      ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
      "obrigatória com STORAGE_PROVIDER=s3",
    );

    if (env.NODE_ENV === "production") {
      for (const key of [
        "BETTER_AUTH_SECRET",
        "CREDENTIALS_ENCRYPTION_KEY",
        "AUDIT_SALT",
      ] as const) {
        if (env[key].startsWith(PLACEHOLDER_PREFIX)) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "use um valor gerado, não o exemplo do .env.example",
          });
        }
      }
      if (env.EMAIL_PROVIDER === "memory") {
        ctx.addIssue({
          code: "custom",
          path: ["EMAIL_PROVIDER"],
          message: "memory só serve para testes",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Variáveis de ambiente inválidas:\n${problems.map((p) => `  - ${p}`).join("\n")}\n` +
        "Confira .env.local (dev) ou as variáveis do container, usando .env.example como referência.",
    );
    this.name = "EnvError";
  }
}

/** Valida um objeto de variáveis. Lança `EnvError` só com nomes e motivos. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);

  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const name = issue.path.join(".") || "(raiz)";
    const reason =
      issue.code === "invalid_type" && issue.message.includes("undefined")
        ? "obrigatória"
        : issue.message;
    return `${name}: ${reason}`;
  });

  throw new EnvError(problems);
}

let cached: Env | undefined;

/** Variáveis validadas do processo. A primeira chamada valida; as demais reaproveitam. */
export function getEnv(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}

/** Descarta o cache. Só para testes. */
export function resetEnvForTests() {
  cached = undefined;
}
