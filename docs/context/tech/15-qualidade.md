# Qualidade e validação

- **Escopo:** Verificações realizadas e comandos antes de cada entrega.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** não declarado


## 15. Qualidade e Validacao

Autenticacao: `npm test` cobre `requireAuth`, `requirePlatform`, `verificationGuard`,
schemas e templates sem banco; `npm run test:db` cobre os fluxos em `tests/db/auth.test.ts`
e, sobre o servidor Node, em `tests/db/auth-http.test.ts`.

Verificacoes recentes realizadas:

- `npm run typecheck` passou.
- Smoke test de producao passou anteriormente:
  - `/api/health`
  - `/`
  - `/blog`
  - `/blog/reduzir-mensagens-de-status`
  - `/login`
  - `/app` sem auth, confirmando shell sem dados sensiveis.

Comandos recomendados antes de cada entrega:

```bash
npm run lint
npm run typecheck
npm test
npm run test:db   # exige o Postgres do Docker com migrations aplicadas
npm run build
```

O CI em `.github/workflows/ci.yml` roda os mesmos comandos em push para `main` e em
pull requests, com um servico `postgres:16` onde `docker/postgres/init.sql` e aplicado
via `psql` antes de `db:migrate` e `test:db`, e fecha com
`npm audit --omit=dev --audit-level=high`.

Testes unitarios e de API ficam ao lado do codigo (`src/**/*.test.ts`): autenticacao,
protecoes da API, `env.ts` e e-mail com provedor `memory`. Testes com banco real
ficam em `tests/db/` (`vitest.db.config.ts`, sem paralelismo entre arquivos).

Para smoke test local de producao:

```powershell
$env:NODE_ENV="production"
$env:PORT="3000"
node build/server/index.js
```

---

