# Onboarding local

- **Escopo:** Primeira execução: instalação, env, Postgres local, migrations Drizzle e dev server.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** não declarado

<!-- ORIGEM: AI_CONTEXT.md L76-93 -->
## Onboarding Local (Primeira Execução)

```bash
npm install
cp .env.example .env.local
docker compose up -d          # Postgres em localhost:15432
npm run db:migrate
npm run dev
```

- `drizzle-kit` está em **devDependencies** — disponível após `npm install`; não
  instalar globalmente. Scripts `db:*` usam o binário local via npm.
- `drizzle.config.ts` carrega `.env.local` e usa `DIRECT_URL` (fallback
  `DATABASE_URL`).
- Postgres local: porta **15432** no host (5432 reservada/bloqueada em muitos
  Windows). Ver `docker-compose.yml` e `.env.example`.
- Se migrate falhar por conexão: `docker compose ps` + conferir `.env.local`.

