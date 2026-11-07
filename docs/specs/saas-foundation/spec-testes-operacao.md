# SPEC: Testes, variáveis de ambiente, README, deploy e repositório público

- **Parte de:** `docs/specs/saas-foundation/spec.md`
- **Paths previstos:** `src/**/*.test.ts`, `tests/db/`, `tests/fixtures/webhooks/`,
  `vitest.config.ts`, `.github/workflows/ci.yml`, `docker/`, `README.md`, `LICENSE`,
  `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `.github/dependabot.yml`

## Plano de testes

| Camada | Ferramenta | O que cobre | Script |
|---|---|---|---|
| Unitário | Vitest | schemas Zod, máquina de estados da assinatura, proração, catálogo de permissões, `verificationGuard`, criptografia, templates | `npm test` |
| API | Vitest + `api.request()` + Postgres do Docker | auth (cadastro, verificação, reenvio, reset, 2FA), tenant, equipe, papéis, clientes, billing, admin, portal, webhooks | `npm run test:db` |
| Banco | Vitest + duas conexões (`bizu_owner`, `bizu_app`) | RLS por tabela, inventário de tabelas com `tenant_id`, policies | `npm run test:db` |
| E-mail | provedor `memory` | cada fluxo envia o template certo, uma vez, com link válido; supressão | `npm test` |
| Webhooks | fixtures reais anonimizadas por provedor em `tests/fixtures/webhooks/<provider>/` | assinatura válida, inválida, replay, duplicata, fora de ordem | `npm run test:db` |
| Sandbox | checklist manual por módulo (`src/lib/payments/providers/<id>/README.md`) + `stripe listen` | checkout real em teste, webhook real, reembolso | manual, antes de release |
| E2E | Playwright (fase futura) | jornadas do PRD no navegador | `npm run test:e2e` |
| Segurança | `npm audit`, `/security-review` | dependências e revisão | CI |

Cenários obrigatórios (mapeiam os critérios de aceite do PRD):

- **Verificação de e-mail:** cadastro → e-mail capturado → GET da página não altera
  `email_verified` → POST com token verifica → segundo POST 400 → reenvio invalida
  o primeiro → token expirado recusado → login antes de verificar 403 → respostas
  idênticas para e-mail existente e inexistente (status, corpo, headers).
- **Portal:** magic link uso único; cliente de A não lista nada de B; cookie de
  portal em `/api/me` → 401; cookie de app em `/api/portal/me` → 401.
- **Isolamento:** `rls.test.ts` (ver `spec-tenant-rbac.md`); API com ids cruzados → 404.
- **Permissões:** tabela `papel × endpoint × esperado` gerada do catálogo; papel
  personalizado com permissão reservada → 400.
- **Billing:** trial → `read_only` após carência; `invoice.paid` reativa; downgrade
  agendado aplicado em `period_end`; cancelamento no fim do período; webhook
  duplicado no-op; evento antigo ignorado; reconciliação detecta divergência.
- **Personificação:** sem grant → 403; com grant → sessão com `impersonatedBy`;
  `POST /api/billing/checkout` personificado → 403 + auditoria; expira em 1 h.
- **Jobs:** handler idempotente (rodar duas vezes = mesmo estado); dead letter
  após 5 falhas.
- **Módulo removível:** CI roda um job extra que apaga `providers/asaas/` e
  `PAYMENT_PROVIDERS=stripe` e repete lint, typecheck, test e build.

CI (`ci.yml`): serviço `postgres:16` com `init.sql` montado; `npm ci`, `lint`,
`typecheck`, `db:migrate`, `test`, `test:db`, `build`, `npm audit --omit=dev
--audit-level=high`; job `module-removal` como acima.

## Variáveis de ambiente (`.env.example`)

| Variável | Obrigatória | Exemplo | Uso |
|---|---|---|---|
| `NODE_ENV` | sim | `development` | |
| `PORT` | não | `3000` | |
| `APP_URL` | sim | `http://localhost:5173` | links, cookies, `trustedOrigins` |
| `TRUSTED_PROXY_HOPS` | não | `0` | rate limit e IP |
| `DATABASE_URL` | sim | `postgresql://bizu_app:bizu_app@localhost:15437/bizu` | runtime (RLS) |
| `DIRECT_URL` | sim | `postgresql://bizu_owner:bizu_owner@localhost:15437/bizu` | migrations, seed, pg-boss install |
| `BETTER_AUTH_SECRET` | sim | `openssl rand -base64 32` | assinatura de tokens e cookies |
| `CREDENTIALS_ENCRYPTION_KEY` | sim | base64 de 32 bytes | credenciais por tenant |
| `AUDIT_SALT` | sim | aleatório | hash de IP |
| `EMAIL_PROVIDER` | sim | `smtp` | `smtp`, `resend`, `memory` |
| `EMAIL_FROM`, `EMAIL_REPLY_TO` | sim/não | `Bizu <no-reply@localhost>` | |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | se smtp | `localhost`, `1025` | Mailpit |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | se resend | | |
| `JOBS_MODE` | não | `inline` | `inline`, `worker`, `off` |
| `RATE_LIMIT_STORE` | não | `postgres` | `memory` em dev |
| `PAYMENT_PROVIDERS` | não | `stripe,asaas` | módulos ativos; vazio = só planos gratuitos |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | se stripe | `sk_test_...`, `whsec_...` | |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_SANDBOX` | se asaas | `$aact_hmlg_...`, token ≥ 32 chars, `true` | |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` | módulo futuro | | |
| `PAGARME_SECRET_KEY`, `PAGARME_WEBHOOK_SECRET` | módulo futuro | | segredo de URL |
| `PAGBANK_TOKEN`, `PAGBANK_SANDBOX` | módulo futuro | | |
| `STORAGE_PROVIDER`, `STORAGE_LOCAL_DIR`, `S3_*` | módulo de arquivos | `local` | |
| `CSP_REPORT_ONLY` | não | `true` | |
| `SEED_PASSWORD`, `SEED_ALLOW_PRODUCTION` | dev | | |
| `LOG_LEVEL`, `SENTRY_DSN` | não | `info` | observabilidade |
| `VITE_APP_NAME` | não | `Bizu SaaS` | público |

Validação na inicialização: `src/lib/env.ts` com Zod; falta de variável obrigatória
derruba o processo com mensagem clara (sem imprimir valores).

## Tutorial do README (sumário)

1. O que é o Bizu SaaS, para quem, os quatro níveis, o que vem pronto, demo.
2. Pré-requisitos: Node 24.19+, Docker, Git.
3. Clonar e instalar: `git clone`, `npm install`, `cp .env.example .env.local`,
   gerar `BETTER_AUTH_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `AUDIT_SALT`.
4. Subir serviços: `docker compose up -d` (Postgres com roles e Mailpit),
   `npm run db:migrate`, `npm run jobs:install`, `npm run db:seed`, `npm run dev`.
5. Primeiro acesso: `/login` como `owner@bizu.local`; `/admin`; depois
   `acme.owner@bizu.local` em `/app`; `julia@cliente.local` em `/portal/login?org=acme`.
   Mailpit em `http://localhost:8025`.
6. Testar o fluxo de verificação: cadastrar em `/cadastro`, abrir o Mailpit,
   confirmar.
7. Configurar pagamentos: criar conta sandbox Stripe e Asaas, preencher chaves,
   registrar webhooks (`stripe listen`; Asaas com URL pública via túnel), preencher
   `provider_price_ref` em `/admin/planos`.
8. Configurar e-mail real: provedor, SPF/DKIM/DMARC, bounces.
9. Personalizar: marca, landing, remover módulos (apagar pasta + env), adaptar
   `CLAUDE.md` e `docs/context/`.
10. Deploy em VPS: `docker/compose.prod.yml` (app, worker, migrate, postgres,
    reverse proxy Caddy com TLS), roles do Postgres, variáveis, `TRUSTED_PROXY_HOPS=1`,
    backup e restore.
11. Receber atualizações do template: `git remote add template ...`,
    `git fetch template`, `git merge template/main --allow-unrelated-histories` na
    primeira vez, resolução de conflitos; CHANGELOG com notas de migração.
12. Scripts, documentação, contribuição, segurança, licença.

## Deploy e operação

- `docker/compose.prod.yml`: `app` (porta 3000, `JOBS_MODE=inline` ou `off`),
  `worker` (opcional, `--worker`), `migrate` (perfil `tools`), `postgres` (volume,
  `init.sql`), `caddy` (TLS automático, HSTS, `reverse_proxy app:3000`). Portainer
  usa esse arquivo como stack.
- Migrations: `docker compose --profile tools run --rm migrate` antes de subir a
  nova imagem; sem migrations automáticas no start.
- Observabilidade: `pino` com JSON e `request_id`; `logError` passa a usar o
  logger; `LOG_LEVEL`; `SENTRY_DSN` opcional via `@sentry/node` em
  `src/lib/observability.ts` (módulo removível); `/api/health` e `/api/ready`;
  `/admin` com contadores de webhooks falhos e jobs mortos.
- Backups: serviço `backup` opcional no compose (`pg_dump` diário cifrado com `age`
  para volume ou S3), documentado com `pg_restore` e teste de restauração mensal.
  Arquivos de `STORAGE_LOCAL_DIR` entram no mesmo backup.
- Escala: `worker` separado e `RATE_LIMIT_STORE=postgres` permitem mais de uma
  instância de `app` atrás do proxy, sem Redis.

## Repositório público

| Item | Conteúdo |
|---|---|
| `LICENSE` | MIT (existente), ano e autor conferidos |
| `CONTRIBUTING.md` | fluxo PRD/SPEC, Conventional Commits, `npm run` de verificação, como propor módulo de pagamento |
| `SECURITY.md` | canal privado de report, prazo de resposta, versões suportadas |
| `CHANGELOG.md` | Keep a Changelog + SemVer; seção "Migração" por versão |
| `.github/` | `ci.yml`, `dependabot.yml` (npm semanal), templates de issue e PR, `CODEOWNERS` |
| Versionamento | tags `vX.Y.Z`; `package.json` `version`; GitHub Releases com notas |
| Atualizações do template | seção do README + `docs/context/atualizar-template.md` |
| Nome | `package.json` `name: "bizu-saas"`; textos "Bizu Starter" trocados |
| Demo | README aponta demo quando existir; remove nota da Vercel ou atualiza |
