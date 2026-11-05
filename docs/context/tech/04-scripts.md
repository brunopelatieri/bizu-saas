# Scripts

- **Escopo:** Scripts npm de dev, build, typecheck e banco.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** não declarado

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L189-203 -->
## 4. Scripts

| Script | Funcao |
|--------|--------|
| `npm run dev` | Inicia RR dev server com SSR + Hono + HMR |
| `npm run build` | Gera `build/client` e `build/server` |
| `npm run start` | Roda producao local: `node ./build/server/index.js` |
| `npm run typecheck` | `react-router typegen && tsc` |
| `npm run lint` | Lint com Biome |
| `npm test` | Testes com Vitest |
| `npm run db:generate` | Gera migrations Drizzle |
| `npm run db:migrate` | Aplica migrations |
| `npm run db:push` | Push direto do schema |
| `npm run db:studio` | Abre Drizzle Studio |

---

