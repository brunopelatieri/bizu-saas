# SPEC: Plano de implementação e atualização de contexto

- **Parte de:** `docs/specs/saas-foundation/spec.md`

## Classificação dos pontos obrigatórios

| Ponto | Classificação | Justificativa |
|---|---|---|
| Webhooks com verificação, idempotência, reprocessamento, reconciliação | Essencial | Sem isso a cobrança mente |
| Onboarding do tenant, convites, recuperação de senha | Essencial | Jornadas do PRD |
| 2FA | Essencial (fase 8) | Obrigatório para proprietário em produção |
| Personificação com consentimento e auditoria | Essencial (fase 8) | Suporte sem pedir senha; risco alto se feito depois sem desenho |
| Log de auditoria | Essencial | Base de personificação, LGPD e suporte |
| E-mails transacionais substituíveis | Essencial | Verificação depende disso |
| Jobs no Postgres | Essencial | E-mail, webhooks e cobrança dependem |
| Limites por plano, feature flags, controle de uso | Essencial simples (contagem); métricas avançadas futuras | Trial e planos precisam de limites |
| Armazenamento de arquivos por tenant | Módulo opcional (fase 10) | Nem todo SaaS tem upload; exportação LGPD usa |
| LGPD: consentimento, exportação, exclusão, retenção | Essencial básico (fase 10) | Obrigação legal no Brasil |
| Segurança: ameaças, OWASP, CSRF, CSP, rate limit, segredos, criptografia | Essencial (fase 9, com itens básicos desde a fase 1) | Repositório público |
| Observabilidade, health, backups | Essencial mínimo (logs JSON, ready, backup documentado); tracing futuro | Operação em VPS |
| White label, domínio próprio, tema por tenant | Fase futura | Exige subdomínio e TLS wildcard |
| Notificações in-app, API pública, webhooks de saída | Fase futura | Não afetam o núcleo |
| i18n, moeda, fuso, fiscal | Premissa pt-BR/BRL; strings centralizadas; fiscal fora | Simplicidade |
| Testes de isolamento, permissões, sandbox | Essencial | Toda fronteira tem teste |
| LICENSE, CONTRIBUTING, SECURITY, changelog, CI, versionamento, atualizações | Essencial (fase 11) | Repositório público |

## Fases

Cada fase cabe em um PR revisável, termina com `npm run lint`, `typecheck`, `test`,
`build`, `/code-review` e atualização de `docs/context/`. Modelo recomendado segue
`docs/context/ai-engineering.md`: Haiku para edição mecânica, Sonnet para
implementação guiada por SPEC, Opus (ou Fable, quando disponível) para segurança,
arquitetura e cobrança. Rode `/security-review` nas fases marcadas.

| # | Fase | Depende de | Entrega | Verificação | LLM |
|---|---|---|---|---|---|
| 0 | **Reposicionamento** | – | `CLAUDE.md`, README (seções de posicionamento), landing, `docs/context/` e rules sem "não é SaaS"; `package.json` `bizu-saas`; `/dashboard` → `/app`; remove stubs e placeholders; `LICENSE` conferida | `npm run build`; grep sem "não é SaaS"/"multi-tenant fora" | Haiku/Sonnet |
| 1 | **Infra local** | 0 | `docker-compose.yml` com roles (`init.sql`) e Mailpit; `.env.example` completo; `src/lib/env.ts`; CI com Postgres; `npm run test:db` | `docker compose up`, migrate, CI verde | Sonnet |
| 2 | **Auth núcleo (equipe)** | 1 | Better Auth `auth` com Drizzle, schema gerado, `requireAuth` por sessão, `/login`, `/cadastro`, `/verificar-email`, guard de uso único, reenvio, reset, troca de e-mail, `AuthProvider` com `authClient`, `/api/me` | testes de verificação (todos os cenários), enumeração, Mailpit manual | Opus + `/security-review` |
| 3 | **E-mail e jobs** | 1 | `EmailProvider` smtp/resend/memory, templates, fila `email.send`, pg-boss `inline`/`worker`, `/api/ready`, bounces Resend | testes de template e supressão; e-mail real no Mailpit | Sonnet |
| 4 | **Tenant, equipe e RBAC** | 2, 3 | plugin organization com papéis dinâmicos, onboarding, `/app` com sidebar, equipe, convites, papéis, `withTenant`, RLS + roles, `requireTenant`, `requirePermission`, `<Can>`, `audit_log` básico | `rls.test.ts`, matriz de permissões, convite ponta a ponta | Opus + `/security-review` |
| 5 | **Admin e planos** | 4 | `/admin` (overview, tenants, usuários, planos, configurações), `plan`, `plan_price`, `platform_setting`, trial no onboarding, limites e features, `read_only` | trial expira por job; limites bloqueiam | Sonnet |
| 6 | **Billing núcleo + Stripe** | 5 | `PaymentProvider`, registry, máquina de estados, `/app/assinatura`, checkout, webhooks inbox + job, reconciliação, dunning, módulo Stripe com fixtures | fixtures de webhook; `stripe listen` em sandbox; checklist do módulo | Opus |
| 7 | **Módulo Asaas** | 6 | Pix/boleto inline, assinatura nativa, token + confirmação na API, README do módulo | fixtures; sandbox Asaas; job de remoção do módulo no CI | Sonnet |
| 8 | **Portal do cliente** | 4, 3 | `portalAuth`, `portal_*`, `customer`, `/app/clientes`, magic link, `/portal/**`, `requirePortalAuth`, escolha de tenant | magic link uso único; isolamento portal × app; cliente em dois tenants | Opus + `/security-review` |
| 9 | **2FA, personificação, segurança** | 5, 8 | twoFactor nas duas instâncias, 2FA obrigatório da plataforma, `impersonation_grant`, banner, bloqueios, CSRF, CSP com nonce (report-only → enforce), rate limit em Postgres, criptografia de credenciais | testes de personificação e CSRF; smoke de CSP no navegador | Opus + `/security-review` |
| 10 | **LGPD, arquivos, observabilidade** | 9 | consentimento, páginas legais, export, exclusão com carência, retenção/prune, `StorageProvider` local/S3 (módulo), pino, Sentry opcional, backup no compose | export gera zip; exclusão anonimiza; prune | Sonnet |
| 11 | **Repositório público e README** | todas | README tutorial completo, CONTRIBUTING, SECURITY, CHANGELOG, dependabot, templates, `compose.prod.yml`, seed final, guia de atualização do template, `docs/context/` consolidado | teste de onboarding com pessoa externa ≤ 30 min | Sonnet (texto) + Haiku (revisão mecânica) |
| 12 | **Módulos seguintes** | 6 | Mercado Pago (HMAC `x-signature`, preapproval), Pagar.me (segredo de URL + confirmação), PagBank (ECDSA) | fixtures e sandbox de cada | Sonnet por módulo |
| 13 | **Fase futura** | – | fluxo (b) com split, login social, white label/subdomínio, notificações, API pública, webhooks de saída, Playwright, React Router 8 | specs próprias | – |

**Primeira fase recomendada:** 0 e 1 juntas (um PR curto), depois a 2, que é a
fundação de tudo e a mais sensível.

## Lista de atualização de contexto

### Arquivos a reescrever

| Arquivo | Mudança |
|---|---|
| `CLAUDE.md` | título "Bizu SaaS"; "Domínio" vira SaaS multi-tenant com quatro níveis; remover "Fora do escopo: multi-tenant, planos e cobrança"; "Autenticação" passa a Better Auth em duas instâncias, com cookies; adicionar regras: `withTenant` obrigatório, `requirePermission`, nenhum token consumido em GET, módulos em pastas removíveis; rotas `/app`, `/admin`, `/portal` |
| `README.md` | reescrito conforme tutorial (`spec-testes-operacao.md`) |
| `docs/context/INDEX.md` | linhas novas: tenant/RBAC → `tech/19-tenant-rbac.md`; billing → `tech/20-billing.md`; e-mail/jobs → `tech/21-email-jobs.md`; portal → `tech/22-portal.md`; admin → `tech/23-admin.md`; segurança/LGPD → `tech/24-seguranca-lgpd.md`; `lgpd.md`; `atualizar-template.md`; `08-auth.md` reescrito |
| `docs/context/core.md` | objetivo, arquitetura (três áreas, duas instâncias de auth, jobs), regras de decisão novas; remover "não são SaaS" e blocos `ORIGEM` obsoletos |
| `docs/context/status.md` | estado real por fase; pendências |
| `docs/context/onboarding.md` | roles do Postgres, Mailpit, `jobs:install`, seed |
| `docs/context/receitas.md` | receitas novas: tabela de tenant com RLS, rota com `withTenant` + `requirePermission`, tela em `/app`, módulo de pagamento, template de e-mail, job; receita antiga de rota privada atualizada |
| `docs/context/ai-engineering.md` | passo "Adaptar para um novo projeto" sem a frase "se precisa de multi-tenant está fora do propósito"; adicionar "remover módulos" |
| `docs/context/infra-deploy.md`, `tech/14-deploy.md` | compose de produção, worker, migrate, backup, roles |
| `docs/context/tech/01-visao-geral.md`, `02-stack.md`, `03-estrutura-pastas.md`, `04-scripts.md` | stack com Better Auth, pg-boss, nodemailer/resend, stripe, pino; estrutura `src/lib/{auth,billing,payments,email,crypto}`, `src/jobs`, `docker/`; scripts `db:seed`, `db:reset`, `test:db`, `jobs:install`, `email:preview` |
| `docs/context/tech/05-react-router.md` | mapa de rotas novo |
| `docs/context/tech/06-hono-api.md` | montagem do Better Auth, middlewares, contratos |
| `docs/context/tech/07-banco-drizzle.md` | schema por domínio, RLS, roles, migrations customizadas, seed |
| `docs/context/tech/08-auth.md` | reescrito: duas instâncias, verificação, convites, 2FA, personificação |
| `docs/context/tech/10-site-publico.md` | landing reposicionada, `/precos`, `/legal` |
| `docs/context/tech/11-dashboard.md` | vira `/app`; referencia `/admin` e `/portal` |
| `docs/context/tech/15-qualidade.md` | plano de testes e CI com Postgres |
| `docs/context/tech/16-bugs-riscos.md` | RISK-005 resolvido pelo store Postgres; riscos novos (Better Auth versão, RLS) |
| `docs/context/tech/17-roadmap.md`, `18-conclusao.md` | remover "fora do escopo"; roadmap = fases 12 e 13 |
| `docs/context/tech/13-skills-rules.md` | mover para `archive/` (histórico de Supabase) |
| `AI_CONTEXT.md`, `PROJECT_TECHNICAL_SPEC.md` | remover (stubs); ajustar menções em `core.md` e README |

### Rules (`.claude/rules/` e `.cursor/rules/`, sempre em par)

| Rule | Mudança |
|---|---|
| `auth.md` / `auth.mdc` | reescrita: Better Auth, `requireAuth` por sessão, guard de verificação, nunca consumir token em GET, respostas uniformes; paths `src/lib/auth/**`, `src/api/auth*.ts`, `src/routes/auth/**` |
| `api-hono.md` / `.mdc` | ordem de middlewares, `withTenant`, `requirePermission`, webhooks com corpo bruto, `audit` |
| `banco-drizzle.md` / `.mdc` | `tenant_id` + `enableRLS` obrigatórios, roles, migration customizada, seed |
| `dashboard.md` / `.mdc` | paths `/app`; nova rule `admin.md` e `portal.md` |
| `infra-deploy.md` / `.mdc` | compose de produção, worker, migrate, backup |
| `rotas-ssr.md` / `.mdc` | três áreas sem loader; páginas de token só renderizam |
| `site-publico.md` / `.mdc` | landing SaaS; `/precos` com loader |
| `ai-context-governance.mdc` | remover "Multi-tenant e cobrança recorrente estão fora do escopo"; adicionar regras de tenant e módulos |
| novas: `billing.md`, `email-jobs.md`, `tenant.md`, `admin.md`, `portal.md` | uma por domínio novo, com `paths:` |

### Skills (`.claude/skills/`)

| Skill | Mudança |
|---|---|
| `ctx-auth` | aponta para o novo `08-auth.md` e lembra: duas instâncias, nunca consumir token em GET |
| `ctx-dashboard` | renomear para `ctx-app`; novas `ctx-admin`, `ctx-portal` |
| novas `ctx-tenant`, `ctx-billing`, `ctx-email-jobs`, `ctx-seguranca` | leem o arquivo do domínio |
| `prd`, `spec`, `context-budget` | sem mudança |
| `README` (tabela de comandos) | lista as skills novas |

### Textos do código

| Arquivo | Mudança |
|---|---|
| `src/components/landing/hero-section.tsx`, `about-section.tsx`, `faq-section.tsx`, `features-section.tsx`, `audience-section.tsx`, `how-it-works-section.tsx`, `cta-section.tsx` | copy de SaaS: quatro níveis, Pix/boleto, trial, módulos; FAQ "é para SaaS?" vira "sim" |
| `src/pages/projects-page.tsx`, `src/lib/constants/projects.ts` | vitrine do template, sem "não é SaaS" |
| `src/lib/constants/navigation.ts` | `siteConfig.name = "Bizu SaaS"`, links `/precos`, `/legal/*` |
| `src/routes/*.tsx` `meta` | "Bizu SaaS" |
| `src/lib/schemas/auth.ts` | senha ≥ 10, aceite de termos, remover `phone` obrigatório |
| `src/components/dashboard/account-card.tsx`, `dashboard-*` | mover para `src/components/app/` |
| `public/sitemap.xml`, `robots.txt` | rotas novas; `Disallow: /app /admin /portal` |
| `package.json` | `name`, `description`, scripts novos, dependências: `better-auth`, `@better-auth/drizzle-adapter`, `pg-boss`, `nodemailer`, `resend`, `stripe`, `pino`; dev: `@better-auth/cli`, `@types/nodemailer` |

## Verificação final da entrega

- [ ] Todos os critérios de aceite do PRD cobertos por teste ou checklist manual.
- [ ] `docs/context/` reflete o código; INDEX atualizado; rules em par.
- [ ] PRD e SPEC marcados como entregues; itens "não verificado" resolvidos ou
      movidos para `tech/16-bugs-riscos.md`.
