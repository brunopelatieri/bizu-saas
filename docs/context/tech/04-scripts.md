# Scripts

- **Escopo:** Scripts npm de dev, build, typecheck, testes e banco.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `package.json`

| Script | Função |
|--------|--------|
| `npm run dev` | Inicia RR dev server com SSR + Hono + HMR |
| `npm run build` | Gera `build/client` e `build/server` |
| `npm run start` | Roda produção local: `node ./build/server/index.js` |
| `npm run typecheck` | Gera os tipos de rota e verifica `tsconfig.app.json` e `tsconfig.node.json` |
| `npm run lint` | Lint com Biome |
| `npm test` | Testes unitários e de API, sem banco |
| `npm run test:db` | Testes em `tests/db/` contra o Postgres do Docker (`DATABASE_URL` e `DIRECT_URL`) |
| `npm run db:generate` | Gera migrations Drizzle |
| `npm run db:migrate` | Aplica migrations |
| `npm run db:push` | Push direto do schema (só dev) |
| `npm run db:studio` | Abre Drizzle Studio |

Scripts previstos nas fases seguintes: `db:seed`, `db:reset`, `jobs:install`,
`email:preview`.
