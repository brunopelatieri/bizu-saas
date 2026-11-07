# Stack principal

- **Escopo:** Ferramentas e versões por camada: runtime, frontend, UI, dados, backend e serviços.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/api/`, `src/api/app.ts`, `src/components/ui/`, `src/root.tsx`


## 2. Stack Principal

### Runtime e Linguagem

| Camada | Ferramenta | Uso |
|--------|------------|-----|
| Runtime | Node.js 24 | Runtime do build Docker e servidor de producao |
| Linguagem | TypeScript 5.9 | Tipagem estrita em front, server e configs |
| Package manager | npm | Instalacao e scripts |
| Modulos | ESM (`type: module`) | Padrao moderno exigido pela integracao RR/Hono |

### Frontend / Framework

| Ferramenta | Versao atual | Uso |
|------------|--------------|-----|
| React | 19.2 | UI |
| React DOM | 19.2 | Render/hidratacao |
| React Router | 7.18 | Framework Mode, SSR, loaders, meta functions e rotas |
| `@react-router/dev` | 7.18 | CLI `react-router dev/build/typegen` |
| `@react-router/node` | 7.18 | Utilitarios server-side do RR |
| Vite | 7.3 | Build tool por baixo do Framework Mode |
| `react-router-hono-server` | 2.21 | Servidor Hono integrado ao build/SSR do RR |

### UI / Design System

| Ferramenta | Uso |
|------------|-----|
| Tailwind CSS v4 | Styling utilitario |
| `@tailwindcss/vite` | Plugin Tailwind para Vite |
| shadcn/ui | Componentes copiados para `src/components/ui/` |
| Base UI | Dependencia base de alguns componentes |
| `class-variance-authority` | Variants de componentes |
| `clsx` | Composicao condicional de classes |
| `tailwind-merge` | Merge seguro de classes Tailwind |
| `tw-animate-css` | Animacoes para componentes Radix/shadcn |
| Lucide React | Icones |
| Sonner | Toast notifications |

### Estado, Forms e Dados no Cliente

| Ferramenta | Uso previsto |
|------------|--------------|
| Zustand | Estado global leve; atualmente usado no tema |
| TanStack Query | Server state, cache, loading/error states — `QueryProvider` em `src/root.tsx` |
| React Hook Form | Formularios performaticos |
| Zod | Validacao compartilhavel front/back |
| `@hookform/resolvers` | Integracao React Hook Form + Zod |

### Backend / API / Banco

| Ferramenta | Uso |
|------------|-----|
| Hono | API HTTP em `src/api/app.ts` |
| Better Auth | Autenticação, com `@better-auth/drizzle-adapter` (`src/lib/auth/server.ts`) |
| `@hono/zod-validator` | Validacao Zod nas rotas Hono |
| Drizzle ORM | ORM tipado para Postgres |
| Drizzle Kit | Migrations, generate, studio |
| postgres.js | Driver Postgres |
| Postgres 16 | Banco proprio da aplicacao |
| dotenv | Carregamento de `.env.local` em desenvolvimento |

Tabelas, graficos, datas e e-mail sao opcionais: veja `docs/context/receitas.md`.

### Operação e LGPD

| Ferramenta | Uso |
|------------|-----|
| pino (`pino-pretty` em dev) | Logs JSON com `request_id` e `redact` |
| `@sentry/node` | Erros em produção, módulo opcional (`SENTRY_DSN`) |
| `@aws-sdk/client-s3` | Provedor `s3` do módulo de arquivos (MinIO, R2...) |
| `age` | Cifra do backup (serviço `backup` do compose) |

### Qualidade

| Ferramenta | Uso |
|------------|-----|
| Biome | Lint de `src/` (`npm run lint`), sem formatacao |
| Vitest | Testes da API (`npm test`), configurados em `vitest.config.ts` |
| GitHub Actions | CI em `.github/workflows/ci.yml`: lint, tipos, testes e build |

---

