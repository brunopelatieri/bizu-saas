// Schema por domínio em src/db/schema/; drizzle.config.ts e o adapter do Better Auth
// leem este arquivo, então todo domínio novo entra aqui (spec-dados.md).
export * from "./schema/auth";
export * from "./schema/tenant";
export * from "./schema/audit";
export * from "./schema/contact";
export * from "./schema/email";
export * from "./schema/billing";
