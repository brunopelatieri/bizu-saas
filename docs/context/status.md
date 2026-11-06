# Status do projeto

- **Escopo:** O que está pronto hoje, por fase da spec, e pendências técnicas conhecidas.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-plano.md` (fases)
- **Paths do código:** `src/lib/content/posts.ts`, `src/root.tsx`, `src/lib/env.ts`, `src/lib/auth/`

## Fases da spec saas-foundation

| Fase | Entrega | Estado |
|---|---|---|
| 0 | Reposicionamento: textos, docs, rules, `/dashboard` → `/app`, stubs removidos | concluída |
| 1 | Infra local: papéis do Postgres, Mailpit, `.env.example`, `env.ts`, CI com Postgres, `test:db`, seams de e-mail | concluída |
| 2 | Auth núcleo: Better Auth, cadastro, verificação de uso único, reset, troca de e-mail, `requireAuth` por sessão, papéis de plataforma | concluída |
| 3 | E-mail transacional completo e jobs (pg-boss) | pendente |
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
- Autenticação de equipe e plataforma com Better Auth: `/login`, `/cadastro`,
  `/verificar-email`, `/esqueci-senha`, `/redefinir-senha` e troca de e-mail em
  `/app/configuracoes`.
- `/app/**` com shell client-side: visão geral e configurações funcionam; clientes, equipe
  e assinatura seguem como "em breve".
- `/api/health`, `/api/me`, `/api/auth/*`, `/api/auth-ext/*` e `/api/contact` com rate
  limit, limite de corpo e headers de segurança.
- Variáveis de ambiente validadas em `src/lib/env.ts` na inicialização.
- Postgres do Docker com `bizu_owner` e `bizu_app` (`docker/postgres/init.sql`) e Mailpit.
- E-mail: interface `EmailProvider` com provedores `memory` e `smtp` (`src/lib/email/`);
  fila, templates e bounces entram na fase 3.
- Biome, Vitest (`npm test` sem banco, `npm run test:db` com banco) e CI com Postgres.
- Dockerfile multi-stage para VPS.

## Pendências Técnicas Conhecidas

- Fases 3 a 11 da spec.
- Sem seed: o primeiro `platform_owner` é promovido por SQL (`tech/08-auth.md`).
- `audit_log` (fase 4) e `consent_log` (fase 10) ainda não existem: autenticação não audita
  e o aceite de termos é exigido, mas não registrado.
- `requirePlatform` existe, mas nenhuma rota usa até `/admin` (fase 5).
- Rate limit das rotas próprias em memória até a fase 9.
- Evoluir blog estático para tabela Drizzle quando virar feature real.
- Migrar para React Router 8 e `react-router-hono-server` 4 para zerar os alertas
  moderados restantes (`tech/16-bugs-riscos.md`), depois da entrega da spec.
- Stack Portainer completa (`docker/compose.prod.yml`) na fase 11.
