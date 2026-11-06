# Status do projeto

- **Escopo:** O que está pronto hoje, por fase da spec, e pendências técnicas conhecidas.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-plano.md` (fases)
- **Paths do código:** `src/lib/content/posts.ts`, `src/root.tsx`, `src/lib/env.ts`

## Fases da spec saas-foundation

| Fase | Entrega | Estado |
|---|---|---|
| 0 | Reposicionamento: textos, docs, rules, `/dashboard` → `/app`, stubs removidos | concluída |
| 1 | Infra local: papéis do Postgres, Mailpit, `.env.example`, `env.ts`, CI com Postgres, `test:db`, seams de e-mail | concluída |
| 2 | Auth núcleo (Better Auth, equipe e plataforma) | pendente |
| 3 | E-mail transacional completo e jobs (pg-boss) | concluída |
| 4 | Tenant, equipe, RBAC e RLS | pendente |
| 5 | Admin e planos | pendente |
| 6 | Billing núcleo + Stripe | pendente |
| 7 | Módulo Asaas | pendente |
| 8 | Portal do cliente | pendente |
| 9 | 2FA, personificação e segurança | pendente |
| 10 | LGPD, arquivos e observabilidade | pendente |
| 11 | Repositório público e README final | pendente |

## Estado atual do código

- React Router Framework Mode com `ssr: true`; Hono integrado via `react-router-hono-server`.
- Site público com SSR: landing reposicionada para SaaS, blog estático em
  `src/lib/content/posts.ts`.
- `/login` com Tabs Login/Cadastro (bloqueado até a fase 2) e `/app/**` com shell
  client-side (visão geral, clientes, equipe, assinatura e configurações como "em breve").
- `/api/health`, `/api/me` (401/503) e `/api/contact` com rate limit, limite de corpo e
  headers de segurança.
- Variáveis de ambiente validadas em `src/lib/env.ts` na inicialização.
- Postgres do Docker com `bizu_owner` e `bizu_app` (`docker/postgres/init.sql`) e Mailpit.
- E-mail: `sendEmail` grava `email_message` e enfileira `email.send` (pg-boss, retry 5x,
  dead letter, supressão); provedores `smtp`, `resend` e `memory`; webhook
  `POST /api/webhooks/email/:provider`; 14 templates gerais; `npm run email:preview`
  (`tech/19-email.md`, `tech/20-jobs.md`).
- Jobs: pg-boss 12 no schema `pgboss` (`npm run jobs:install`), `JOBS_MODE=inline|worker|off`,
  `maintenance.prune`, `GET /api/ready`. Filas de billing e LGPD entram nas fases 6 e 10.
- Biome, Vitest (`npm test` sem banco, `npm run test:db` com banco) e CI com Postgres.
- Dockerfile multi-stage para VPS.

## Pendências Técnicas Conhecidas

- Fases 2 a 11 da spec.
- Evoluir blog estático para tabela Drizzle quando virar feature real.
- Migrar para React Router 8 e `react-router-hono-server` 4 para zerar os alertas
  moderados restantes (`tech/16-bugs-riscos.md`), depois da entrega da spec.
- Stack Portainer completa (`docker/compose.prod.yml`) na fase 11.
