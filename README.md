# Bizu SaaS

**Bizu SaaS** é o ponto de partida open source para quem vai lançar um SaaS:
multi-tenant, quatro níveis de login com verificação de e-mail, trial configurável e
pagamentos em módulos (Pix, boleto e cartão). Tudo sobre Drizzle em qualquer Postgres,
com documentação viva e fluxo pensado para **AI Software Engineering**.

> **Em construção.** O projeto está sendo transformado a partir do antigo Bizu
> Starter seguindo a spec em [`docs/specs/saas-foundation/`](docs/specs/saas-foundation/spec.md).
> O estado real de cada fase está em [`docs/context/status.md`](docs/context/status.md).
> Hoje o site público, a infra local e a autenticação da equipe funcionam; tenants e
> cobrança entram nas próximas fases.

---

## 📋 Índice

- [O que o Bizu SaaS entrega](#o-que-o-bizu-saas-entrega)
- [Níveis de acesso](#níveis-de-acesso)
- [Resumo Técnico 80/20](#resumo-técnico-8020)
- [Metodologia](#metodologia)
- [Como Clonar e Rodar](#como-clonar-e-rodar)
- [Variáveis Principais](#variáveis-principais)
- [Scripts Úteis](#scripts-úteis)
- [Documentação](#documentação)
- [Autor](#autor)

---

## O que o Bizu SaaS entrega

Quando todas as fases da spec estiverem concluídas:

- Landing page, página de preços e blog com SSR e SEO.
- Autenticação própria sobre Postgres (Better Auth + Drizzle), com verificação de
  e-mail por link em todos os cadastros, recuperação de senha, 2FA e sessões em banco.
- Multi-tenant com isolamento por `tenant_id` na aplicação e Row Level Security no
  Postgres, provado por testes.
- Papéis `owner`, `admin`, `member` e papéis personalizados por tenant.
- Área do proprietário (`/admin`), área do owner e equipe (`/app`) e portal do
  cliente (`/portal`).
- Planos, trial configurável (inclusive gratuito), assinaturas, inadimplência e
  webhooks verificados, com Stripe e Asaas como primeiros módulos.
- E-mails transacionais com provedor substituível, Mailpit no desenvolvimento e fila
  de jobs no próprio Postgres.
- Auditoria, personificação com consentimento, base de LGPD, Docker para VPS, CI,
  migrations, seed e este tutorial.

**Já disponível hoje:** site público com SSR, API Hono em processo único, Drizzle,
rate limit, headers de segurança, Postgres com papéis de runtime e migração, Mailpit,
validação de variáveis de ambiente, lint, testes (unitários e de banco) e CI.

---

## Níveis de acesso

| Nível | Área | Quem é |
|---|---|---|
| Proprietário da plataforma | `/admin` | Quem opera o SaaS: tenants, planos, trial, assinaturas, suporte |
| Owner da conta | `/app` | Cliente do SaaS, dono de um tenant |
| Colaborador | `/app` | Equipe do owner, com papel `admin`, `member` ou personalizado |
| Cliente/lead | `/portal` | Cliente do owner, com login próprio dentro do tenant |

---

## Resumo Técnico 80/20

```text
React Router v7 Framework Mode + SSR global
  |
  |-- /api/*              Hono API -> Drizzle -> Postgres (RLS por tenant)
  |-- /, /sobre, /blog    rotas públicas com SSR e SEO
  |-- /login, /cadastro   autenticação (Better Auth) com verificação de e-mail
  |-- /app/**             owner e equipe, client-side, sem loader sensível
  |-- /admin/**           proprietário (fase 5)
  `-- /portal/**          clientes e leads, com login próprio
```

**Stack principal:** React 19, TypeScript, React Router v7, Vite, Tailwind v4,
shadcn/ui, Hono, Drizzle, Postgres, Zod, Zustand, TanStack Query, React Hook Form,
Better Auth, pg-boss, Nodemailer, Biome, Vitest e Docker.

---

## Metodologia

PRD e SPEC antes do código, contexto enxuto carregado sob demanda e mudanças pequenas
e documentadas. Humanos e agentes de IA trabalham com o mesmo mapa técnico.

```text
PRD -> SPEC -> implementação -> lint + tipos + testes + build -> /code-review -> atualizar contexto
```

| Nível | O que é | Quando carrega |
|---|---|---|
| Fixo | `CLAUDE.md` + `docs/context/INDEX.md` | Toda sessão |
| Por escopo | Rules em `.claude/rules/` e `.cursor/rules/` | Ao tocar os arquivos cobertos |
| Sob demanda | `docs/context/**` e skills `ctx-*` | Quando a tarefa pede |
| Arquivo morto | `docs/context/archive/` | Só por pedido explícito |

Comandos no Claude Code: `/prd <feature>`, `/spec <feature>`, `/ctx-banco-drizzle`,
`/ctx-auth`, `/ctx-api-hono`, `/ctx-dashboard`, `/ctx-infra-deploy`, `/context-budget`.
O método completo está em `docs/context/ai-engineering.md`.

---

## Como Clonar e Rodar

**Pré-requisitos:** Node.js 22.12 ou superior, Docker e Git.

```bash
git clone https://github.com/brunopelatieri/bizu-saas.git
cd bizu-saas

npm install
cp .env.example .env.local
```

Gere os segredos e cole em `.env.local` (um comando por variável):

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
```

```bash
openssl rand -base64 32   # CREDENTIALS_ENCRYPTION_KEY
```

```bash
openssl rand -hex 16      # AUDIT_SALT
```

Suba os serviços locais e aplique as migrations:

```bash
docker compose up -d
```

```bash
npm run db:migrate
```

Instale a fila de jobs (pg-boss, schema `pgboss`; roda com `DIRECT_URL` e é idempotente):

```bash
npm run jobs:install
```

Crie os dados de exemplo (proprietário da plataforma, planos e o tenant `acme`). Defina antes
`SEED_PASSWORD` no `.env.local` (mínimo de 10 caracteres). É idempotente e recusa produção
sem `SEED_ALLOW_PRODUCTION=1`:

```bash
npm run db:seed
```

```bash
npm run dev
```

Todo e-mail passa por essa fila e, em desenvolvimento, é capturado pelo Mailpit em
`http://localhost:8025`. Para revisar os templates sem enviar nada:
`npm run email:preview` (grava `.tmp/emails/index.html`).

| Serviço | Endereço |
|---|---|
| App em desenvolvimento | `http://localhost:5173` |
| Postgres | `localhost:15432`, banco `bizu` |
| Mailpit (e-mails capturados) | `http://localhost:8025` |

### Postgres e papéis

O `docker compose up` cria dois papéis no primeiro start (`docker/postgres/init.sql`):

| Papel | Usado por | Permissão |
|---|---|---|
| `bizu_owner` | `DIRECT_URL`: migrations, seed e instalação da fila | Dono das tabelas |
| `bizu_app` | `DATABASE_URL`: aplicação em runtime | Sem `BYPASSRLS`; o Row Level Security vale para ele |

Em um Postgres próprio, rode o mesmo SQL de `docker/postgres/init.sql` como
superusuário antes do `db:migrate`. Se você vinha do Bizu Starter, o volume antigo
usa o banco `portal`: rode `docker compose down -v` antes de subir de novo.

### Autenticação

Better Auth com sessão em cookie, sobre o mesmo Postgres. Antes do primeiro acesso, troque
`BETTER_AUTH_SECRET` no `.env.local` (`openssl rand -base64 32`) e rode as migrations.

**Primeiro acesso com o seed:**

| Conta | Entra em | Papel |
|---|---|---|
| `owner@bizu.local` | `/admin` | proprietário da plataforma |
| `suporte@bizu.local` | `/admin` | suporte (só leitura) |
| `acme.owner@bizu.local` | `/app` | owner do tenant `acme`, em teste no plano Pro |
| `acme.admin@bizu.local`, `acme.membro@bizu.local` | `/app` | admin e membro do `acme` |
| `julia@cliente.local` | `/portal/login?org=acme` | cliente ativa nos tenants `acme` e `beta` |
| `lead@cliente.local` | não entra | lead do `acme`, sem senha, à espera do envio de acesso |

A senha é a de `SEED_PASSWORD`. Em `/admin` você vê organizações, usuários, planos e as
configurações do período de teste (dias, plano padrão e carência). Uma organização nova
(cadastro, confirmação do e-mail e onboarding) já nasce em teste no plano padrão, com o aviso
no topo de `/app`; `/precos` lista os planos ativos. Os `provider_price_ref` dos preços
ficam vazios até você ligar um provedor (veja [Pagamentos](#pagamentos)).

**Portal do cliente:** clientes e leads têm login próprio, separado da equipe. Em
`/app/clientes`, cadastre alguém e clique em "Enviar acesso ao portal"; o convite cai no Mailpit
(`http://localhost:8025`) e abre `/portal/entrar`, onde um botão faz a entrada. Depois disso, a
pessoa pede um link de 10 minutos em `/portal/login?org=<slug>` ou define uma senha em
`/portal/conta`. Quem é cliente de mais de um tenant escolhe em `/portal/escolher`.

**Primeiro acesso sem o seed:**

1. Com `npm run dev` no ar, cadastre-se em `http://localhost:5173/cadastro`.
2. Abra o Mailpit em `http://localhost:8025` e clique no link recebido.
3. Na página aberta, clique em **Confirmar meu e-mail**.
4. Em `/app/onboarding`, crie sua organização (nome e identificador). Você vira proprietário
   dela e entra em `/app`.

O link vale por 1 hora e só pode ser usado uma vez; abrir a página não o consome. Sem
confirmar, o login responde como senha incorreta, e a tela de login oferece o reenvio do link.
Para testar a recuperação de senha, use `/esqueci-senha`;
a troca de e-mail fica em `/app/configuracoes`.

**Convidar a equipe:**

1. Em `/app/equipe`, informe o e-mail e o papel e clique em **Enviar convite**.
2. Em outro navegador ou aba anônima, abra o link que chegou no Mailpit. A página mostra o
   convite; abri-la não o consome.
3. Cadastre-se com o e-mail do convite e confirme. O onboarding mostra o convite aberto.
4. Clique em **Aceitar convite**. A pessoa entra em `/app` com as permissões do papel.

O convite vale 48 horas. Papéis personalizados ficam em `/app/configuracoes`.

Sem o seed, promova sua conta a proprietário da plataforma:

```sql
update "user" set role = 'platform_owner' where email = 'voce@empresa.com';
```

Detalhes em `docs/context/tech/08-auth.md` e `docs/context/tech/21-tenant-rbac.md`.

### Testes

```bash
npm test
```

```bash
npm run test:db
```

`test:db` precisa do Postgres do Docker no ar e das migrations aplicadas.

**Se `db:migrate` falhar:**

| Problema | Solução |
|---|---|
| `drizzle-kit` não encontrado | Rode `npm install` antes do migrate |
| Erro de conexão | Confira `docker compose ps` e se `.env.local` aponta para `localhost:15432` (no Windows a porta 5432 costuma estar reservada) |
| `role "bizu_owner" does not exist` | O volume é antigo: `docker compose down -v` e suba de novo |

**Servidor de produção local:**

```bash
npm run build
```

```bash
npm run start
```

`npm run start` força `NODE_ENV=production` (sem isso o servidor não escuta) e lê o
`.env.local` se existir. Em produção os segredos de exemplo são recusados: gere
`BETTER_AUTH_SECRET`, `CREDENTIALS_ENCRYPTION_KEY` e `AUDIT_SALT` antes.

---

## Variáveis Principais

| Variável | Descrição |
|---|---|
| `APP_URL` | URL pública do app; base dos links de e-mail e dos cookies |
| `DATABASE_URL` | Conexão runtime (`bizu_app`) |
| `DIRECT_URL` | Conexão do Drizzle Kit e do seed (`bizu_owner`) |
| `BETTER_AUTH_SECRET` | Assinatura de tokens e cookies da autenticação |
| `CREDENTIALS_ENCRYPTION_KEY` | Criptografia de credenciais de provedores por tenant |
| `AUDIT_SALT` | Hash de IP no log de auditoria |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_*` | Envio de e-mail; `smtp` com Mailpit no dev |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Com `EMAIL_PROVIDER=resend`; webhook em `/api/webhooks/email/resend` |
| `JOBS_MODE` | `inline` (workers no servidor), `worker` (`node build/server/index.js --worker`) ou `off` (só enfileira) |
| `PORT` | Porta do servidor único em produção |
| `TRUSTED_PROXY_HOPS` | Reverse proxies na frente do app; use `1` atrás de um proxy |

A lista completa, com os módulos de pagamento, está em `.env.example`.

## Pagamentos

Com `PAYMENT_PROVIDERS` vazio, o sistema funciona só com planos gratuitos e trial. Cada provedor é um
módulo em `src/lib/payments/providers/<id>/` e entra pela variável.

Para ligar o Stripe em modo de teste:

1. Pegue a chave `sk_test_...` no painel e rode a [Stripe CLI](https://docs.stripe.com/stripe-cli):

   ```bash
   stripe listen --forward-to localhost:5173/api/webhooks/payments/stripe
   ```

2. Preencha o `.env.local` com `PAYMENT_PROVIDERS=stripe`, `STRIPE_SECRET_KEY` e o `whsec_...`
   impresso pelo comando em `STRIPE_WEBHOOK_SECRET`.
3. Crie os preços recorrentes no Stripe e cole cada `price_...` em `/admin/planos`.
4. Em `/app/assinatura`, preencha os dados de faturamento e assine com o cartão `4242 4242 4242 4242`.

O passo a passo, com o endpoint de produção e o checklist antes de um release, está no
[README do módulo](src/lib/payments/providers/stripe/README.md). Para escrever outro módulo, siga o
[checklist de módulos](src/lib/payments/providers/README.md). Assinaturas e webhooks recebidos
aparecem em `/admin/assinaturas` e `/admin/webhooks`.

---

## Scripts Úteis

```bash
npm run dev          # dev server: React Router + Hono
npm run build        # build de produção
npm run start        # roda build/server/index.js
npm run lint         # lint com Biome
npm run typecheck    # typegen + TypeScript
npm test             # testes unitários e de API (sem banco)
npm run test:db      # testes contra o Postgres do Docker
npm run db:generate  # gera migrations Drizzle
npm run db:migrate   # aplica migrations
npm run db:studio    # abre Drizzle Studio
npm run jobs:install # tabelas e filas do pg-boss (rode após db:migrate)
npm run db:seed      # dados de exemplo (SEED_PASSWORD); idempotente
npm run email:preview # renderiza os e-mails em .tmp/emails/
```

---

## Documentação

| Arquivo | Conteúdo |
|---|---|
| `docs/context/INDEX.md` | Mapa de todo o contexto: ponto de partida para pessoas e agentes |
| `docs/context/core.md` | Objetivo, arquitetura e regras de decisão |
| `docs/context/status.md` | O que está pronto e o que falta, por fase |
| `docs/specs/saas-foundation/` | PRD e SPEC da transformação em SaaS |
| `docs/context/receitas.md` | Passo a passo das tarefas comuns |
| `docs/context/ai-engineering.md` | Método de trabalho, economia de tokens e adaptação do template |
| `docs/context/tech/` | Especificação técnica, um arquivo por seção |
| `docs/context/infra-deploy.md` | Topologia, credenciais e riscos de deploy |
| `.claude/rules/`, `.cursor/rules/` | Regras por domínio para agentes |
| `.claude/skills/` | Skills de contexto e de fluxo |

---

## Autor

**Bruno Pelatieri Goulart**
Enterprise Automation Architect • AI • DevOps • n8n Specialist
