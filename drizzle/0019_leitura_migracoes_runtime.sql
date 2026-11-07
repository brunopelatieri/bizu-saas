-- O app confere na subida se o banco tem as migrations do build (`src/db/schema-status.ts`), e
-- quem responde isso é a tabela do Drizzle, que nasce sem acesso para o papel de runtime.
GRANT USAGE ON SCHEMA "drizzle" TO "bizu_app";
--> statement-breakpoint
GRANT SELECT ON "drizzle"."__drizzle_migrations" TO "bizu_app";
