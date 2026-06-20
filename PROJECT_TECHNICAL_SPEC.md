# Bizu SaaS — Especificacao Tecnica do Template

Este documento descreve o estado tecnico atual do projeto `bizu-saas` como
boilerplate full-stack para iniciar rapidamente projetos de diferentes portes:
SaaS, portal de clientes, site institucional, landing page, blog, dashboard
admin e sistemas web de aplicacao.

O objetivo do template e ser uma base moderna, robusta e reutilizavel, com boa
separacao de responsabilidades, SSR nas rotas publicas, area autenticada
client-side, API server-side e deploy simples em VPS propria com Ubuntu Linux,
Docker e Portainer.

---

## 1. Visao Geral

### Proposta do Template

O projeto e um template full-stack opinativo para acelerar criacao de produtos
web com:

- Landing page pronta e responsiva.
- Blog com SSR e meta tags/Open Graph.
- Area de login com Supabase Auth.
- Dashboard/admin inicial com layout, sidebar e rotas placeholder.
- API Hono no mesmo processo Node do servidor SSR.
- Postgres proprio via Drizzle ORM.
- Supabase apenas como servico auxiliar para Auth, Storage, Edge Functions e
  Realtime broadcast/presence.
- Base visual shadcn/ui + Tailwind v4 com tema inspirado no `shadcn-admin`.
- Deploy planejado para VPS propria com Docker e Portainer.

### Arquitetura Atual

```text
Node process unico: react-router-hono-server
  |
  |-- /api/*                    Hono API
  |     |-- GET  /api/health
  |     `-- POST /api/contact   Drizzle -> Postgres proprio
  |
  |-- /                         React Router Framework Mode + SSR
  |-- /sobre                    SSR
  |-- /projetos                 SSR
  |-- /contato                  SSR + form client-side chamando /api/contact
  |-- /blog                     SSR + loader
  |-- /blog/:slug               SSR + loader + meta Open Graph dinamica
  |
  |-- /login                    auth standalone, noindex
  |-- /auth/callback            callback Supabase, noindex
  |
  `-- /dashboard/**             shell SSR sem loader de servidor;
                                dados e gate de auth no cliente
```

### Decisao Importante: SSR e Dashboard

O React Router v7 nao tem flag de SSR por rota. O `ssr` em
`react-router.config.ts` e global. A estrategia adotada e:

- `ssr: true` global.
- Rotas publicas usam SSR real para SEO e Open Graph.
- Dashboard nao possui `loader` de servidor.
- `ProtectedRoute` faz o gate de autenticacao no cliente.
- Nenhum dado sensivel do usuario e serializado no HTML inicial.

Isso entrega o beneficio pratico desejado: paginas publicas indexaveis e area
logada simples, client-side e sem exposicao de dados no SSR.

---

## 2. Stack Principal

### Runtime e Linguagem

| Camada | Ferramenta | Uso |
|--------|------------|-----|
| Runtime | Node.js 22 | Runtime do build Docker e servidor de producao |
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
| Vite | 7.2 | Build tool por baixo do Framework Mode |
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
| TanStack Query | Server state, cache, loading/error states |
| React Hook Form | Formularios performaticos |
| Zod | Validacao compartilhavel front/back |
| `@hookform/resolvers` | Integracao React Hook Form + Zod |
| TanStack Table | Tabelas de admin/dashboard |
| Recharts | Graficos do dashboard |
| date-fns | Datas, formatacao e manipulacao |

### Backend / API / Banco

| Ferramenta | Uso |
|------------|-----|
| Hono | API HTTP em `src/api/app.ts` |
| `@hono/zod-validator` | Validacao Zod nas rotas Hono (instalado; ainda nao aplicado) |
| Drizzle ORM | ORM tipado para Postgres |
| Drizzle Kit | Migrations, generate, studio |
| postgres.js | Driver Postgres |
| Postgres 16 | Banco proprio da aplicacao |
| dotenv | Carregamento de `.env.local` em desenvolvimento |

### Auth, Storage e Servicos Externos

| Ferramenta | Uso |
|------------|-----|
| Supabase JS | Auth, Storage, Edge Functions e Realtime auxiliar |
| Stripe | API server-side de pagamentos |
| `@stripe/stripe-js` | Checkout/Stripe.js no browser |
| Nodemailer | E-mails transacionais server-side |

Importante: Stripe server-side e Nodemailer nao devem ser importados em
componentes React client-side. Use em `src/api/`, loaders/actions server-side ou
servicos server-only.

---

## 3. Estrutura de Pastas

```text
.
|-- .claude/
|   |-- agents/               agentes especializados para revisao/implementacao
|   `-- commands/             comandos SpecifyX (/specify, /plan, /tasks...)
|-- .cursor/
|   `-- rules/                regras de contexto do workspace
|-- .specify/
|   |-- config.toml           config do SpecifyX
|   |-- memory/constitution.md
|   |-- scripts/
|   `-- templates/
|-- drizzle/                  migrations Drizzle
|-- src/
|   |-- api/app.ts            Hono API (/api/*)
|   |-- components/
|   |   |-- auth/
|   |   |-- contact/
|   |   |-- landing/
|   |   |-- layout/
|   |   |-- projects/
|   |   `-- ui/               shadcn/ui
|   |-- db/                   Drizzle schema + client
|   |-- lib/
|   |   |-- constants/
|   |   |-- content/
|   |   |-- supabase/
|   |   `-- theme.ts
|   |-- pages/                componentes de pagina reaproveitados por routes
|   |-- providers/
|   |-- routes/               route modules do React Router Framework Mode
|   |-- stores/
|   |-- styles/theme.css
|   |-- root.tsx              document/root app
|   |-- routes.ts             route config do RR
|   `-- server.ts             servidor Hono + RR SSR
|-- Dockerfile
|-- docker-compose.yml        Postgres local de desenvolvimento
|-- react-router.config.ts
|-- vite.config.ts
`-- PROJECT_TECHNICAL_SPEC.md
```

---

## 4. Scripts

| Script | Funcao |
|--------|--------|
| `npm run dev` | Inicia RR dev server com SSR + Hono + HMR |
| `npm run build` | Gera `build/client` e `build/server` |
| `npm run start` | Roda producao local: `node ./build/server/index.js` |
| `npm run typecheck` | `react-router typegen && tsc` |
| `npm run db:generate` | Gera migrations Drizzle |
| `npm run db:migrate` | Aplica migrations |
| `npm run db:push` | Push direto do schema |
| `npm run db:studio` | Abre Drizzle Studio |

---

## 5. React Router Framework Mode

### Arquivos Principais

- `react-router.config.ts`
  - `appDirectory: "src"`
  - `ssr: true`
- `src/root.tsx`
  - Define documento HTML.
  - Registra `<Meta />`, `<Links />`, `<Scripts />`, `<ScrollRestoration />`.
  - Monta `ThemeProvider`, `AuthProvider` e `Toaster`.
  - Injeta script anti-flash para tema dark/light.
- `src/routes.ts`
  - Configuracao declarativa das rotas.
  - Divide rotas publicas, auth standalone e dashboard.
- `src/routes/*.tsx`
  - Route modules com `meta`, `loader` quando necessario e componente default.

### Rotas Publicas com SSR

| Rota | Arquivo | SEO |
|------|---------|-----|
| `/` | `src/routes/home.tsx` | title, description, OG |
| `/sobre` | `src/routes/about.tsx` | title, description |
| `/projetos` | `src/routes/projects.tsx` | title, description |
| `/contato` | `src/routes/contact.tsx` | title, description |
| `/blog` | `src/routes/blog.tsx` | title, description, OG |
| `/blog/:slug` | `src/routes/blog-post.tsx` | title, description, OG dinamico |

### Blog

Estado anterior:

- Conteudo estatico em `src/lib/content/posts.ts`.
- `loader` de `/blog` retorna `getAllPosts()`.
- `loader` de `/blog/:slug` retorna `getPostBySlug(params.slug)`.
- `meta` do post usa dados do loader para gerar Open Graph dinamico.

Evolucao planejada:

- Criar tabela `posts` no Drizzle.
- Trocar implementacao de `getAllPosts()` e `getPostBySlug()` por queries
  Drizzle.
- Manter os loaders chamando as mesmas funcoes, sem HTTP interno.

---

## 6. Hono API

Arquivo: `src/api/app.ts`

Rotas atuais:

| Metodo | Rota | Funcao |
|--------|------|--------|
| GET | `/api/health` | Healthcheck |
| POST | `/api/contact` | Persiste mensagem em `contact_messages` |

Validacao:

- `src/lib/schemas/contact.ts` define `contactMessageSchema` com Zod.
- `src/api/app.ts` usa `@hono/zod-validator` em `/api/contact`.
- `src/components/contact/contact-form.tsx` reutiliza o mesmo schema antes do
  `fetch`, mantendo contrato consistente entre cliente e API.

O Hono e montado por `src/server.ts`:

```ts
export default await createHonoServer({
  configure(server) {
    server.route("/", api);
  },
});
```

Como tudo roda na mesma origem, o CORS antigo foi removido. Se o projeto expor a
API para outra origem no futuro (mobile app, CLI, integracoes externas), o CORS
deve voltar em escopo controlado.

---

## 7. Banco de Dados

### Drizzle

Arquivos:

- `src/db/schema.ts`
- `src/db/index.ts`
- `drizzle.config.ts`

Schema atual:

```text
contact_messages
  id uuid primary key defaultRandom
  name text not null
  email text not null
  message text not null
  created_at timestamp with timezone default now
```

Variaveis:

- `DATABASE_URL`: runtime/API.
- `DIRECT_URL`: Drizzle Kit/migrations.

Regra arquitetural:

- Dados da aplicacao ficam no Postgres proprio via Drizzle.
- Nao usar `supabase.from()` para CRUD da app.
- Supabase Auth `user.id` pode ser FK futura em tabelas Drizzle.

---

## 8. Supabase

Arquivos:

- `src/lib/supabase/client.ts`
- `src/lib/supabase/config.ts`
- `src/lib/supabase/storage.ts`
- `src/lib/supabase/functions.ts`
- `src/lib/supabase/realtime.ts`
- `src/providers/auth-provider.tsx`

Uso permitido:

- Auth.
- Storage.
- Edge Functions.
- Realtime broadcast/presence.

Uso proibido pelo projeto:

- Banco principal.
- CRUD via `supabase.from()`.
- Migrations/schema de dados da aplicacao.
- Realtime `postgres_changes` para tabelas da app.

Autenticacao atual:

- `AuthProvider` roda no cliente.
- Usa `supabase.auth.getUser()`.
- Escuta `onAuthStateChange`.
- `ProtectedRoute` protege `/dashboard/**` no cliente.

---

## 9. Tema, CSS e Template Visual

### Base Visual

O tema CSS foi inspirado no projeto `satnaing/shadcn-admin`, usando apenas a
base visual/variaveis CSS, sem instalar template de admin como dependencia.

Arquivos:

- `src/index.css`
- `src/styles/theme.css`

### Tailwind v4

`src/index.css`:

- `@import 'tailwindcss'`.
- `@import 'tw-animate-css'`.
- `@custom-variant dark (&:is(.dark *))`.
- Base styles para `body`, scrollbar e focus ring.
- Utilities customizadas:
  - `container`
  - `no-scrollbar`
  - `faded-bottom`
- Keyframes para Radix Collapsible:
  - `slideDown`
  - `slideUp`

### Design Tokens

`src/styles/theme.css` define:

- Radius tokens.
- Cores shadcn (`background`, `foreground`, `card`, `popover`, `primary`,
  `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`).
- Chart tokens (`chart-1` a `chart-5`), preparados para Recharts.
- Sidebar tokens (`sidebar-*`), preparados para layouts admin.
- Font tokens:
  - Inter
  - Manrope

### Dark/Light Mode

Arquivos:

- `src/lib/theme.ts`
- `src/stores/theme-store.ts`
- `src/providers/theme-provider.tsx`
- `src/components/theme-toggle.tsx`

Comportamento:

- Padrao: `system`.
- Toggle alterna entre `light` e `dark`.
- Persistencia via Zustand em `localStorage`.
- Classe `.dark` aplicada no `<html>`.
- Script inline anti-flash no SSR antes de hidratar.
- Sonner usa `useResolvedTheme()` para acompanhar o tema.

---

## 10. Landing Page e Site Publico

Home atual (`src/pages/home-page.tsx`) compoe secoes em
`src/components/landing/`:

- `HeroSection`
- `AboutSection`
- `FeaturesSection`
- `HowItWorksSection` (metodologia AI Software Engineering)
- `StackSection`
- `AudienceSection`
- `BlogSection`
- `FaqSection`
- `CtaSection`

Objetivo:

- Posicionar o Bizu SaaS como boilerplate full-stack com AI Software Engineering.
- Destacar tecnologias, metodologia e publico-alvo (empresas, investidores, empreendedores e devs).
- Servir como base para landing pages de projetos derivados.

Observacao:

- A `BlogSection` da landing e uma vitrine/preview estatica.
- O blog real com SSR esta em `/blog` e `/blog/:slug`.

---

## 11. Dashboard/Admin

Arquivos:

- `src/components/layout/dashboard-layout.tsx`
- `src/components/layout/dashboard-sidebar.tsx`
- `src/components/layout/dashboard-topbar.tsx`
- `src/pages/dashboard-page.tsx`
- `src/routes/dashboard.tsx`
- `src/routes/dashboard.coming-soon.tsx`

Rotas:

- `/dashboard`
- `/dashboard/projetos`
- `/dashboard/clientes`
- `/dashboard/arquivos`
- `/dashboard/relatorios`
- `/dashboard/configuracoes`

Estado anterior:

- Layout pronto com sidebar e topbar.
- Dashboard inicial com cards zerados e quick actions.
- Subrotas estao como "Em breve".
- Sem `loader` de servidor; dados devem ser buscados no cliente ou via TanStack
  Query conforme evolucao.

---

## 12. shadcn/ui

Config: `components.json`

Detalhes:

- Style: `base-nova`.
- CSS: `src/index.css`.
- Base color: `neutral`.
- CSS variables habilitadas.
- Alias:
  - `@/components`
  - `@/components/ui`
  - `@/lib`
  - `@/lib/utils`
  - `@/hooks`
- Icon library: `lucide`.

Componentes UI presentes:

- `badge`
- `button`
- `card`
- `input`
- `label`
- `separator`
- `tabs`
- `textarea`
- `sonner`

Componentes recomendados para proximas etapas:

- `dialog`
- `dropdown-menu`
- `avatar`
- `sheet`
- `table`
- `skeleton`
- `form`
- `select`
- `checkbox`
- `tooltip`
- `popover`
- `command`

---

## 13. SpecifyX, Skills e Rules Implantadas

### SpecifyX

Arquivos principais:

- `.specify/config.toml`
- `.specify/memory/constitution.md`
- `.specify/templates/`
- `.specify/scripts/`

Constituicao:

- Spec-Driven Development.
- Fluxo: Specify -> Clarify -> Plan -> Tasks -> Analyze -> Implement.
- TDD obrigatorio.
- Templates padronizados.
- Automacao Python cross-platform.
- Governanca por constituicao.

Comandos disponiveis em `.claude/commands/`:

- `/constitution`
- `/specify`
- `/clarify`
- `/plan`
- `/tasks`
- `/analyze`
- `/implement`
- `/guide`

Agentes definidos em `.claude/agents/`:

- `architecture-reviewer`
- `code-reviewer`
- `documentation-reviewer`
- `implementer`
- `spec-reviewer`
- `test-reviewer`

### Rules do Cursor

Arquivos:

- `.cursor/rules/karpathy-guidelines.mdc`
- `.cursor/rules/portal-scope.mdc`
- `.cursor/rules/portal-stack.mdc`
- `.cursor/rules/portal-supabase.mdc`

Regras ativas importantes:

- Mudancas cirurgicas.
- Simplicidade antes de abstracao.
- Assumir menos, validar mais.
- Supabase apenas auxiliar.
- Dados da app no Postgres proprio via Drizzle.
- Mobile-first.
- Novas paginas atualizam navegacao.

### Skill de Landing Page

Regra do usuario:

- Para landing pages/sales pages/marketing pages, ler e seguir
  `E:\Documentos\0004_GitHub\LLM-instructional-skills\landingpage\SKILL.md`.

Observacao operacional:

- O arquivo exato nao existia nesse caminho.
- O skill encontrado e usado foi:
  `E:\Documentos\0004_GitHub\LLM-instructional-skills\landingpage\skill_landingpage_claude_opus\SKILL.md`.

Principios desse skill:

- Antes de codigo, coletar contexto.
- Strategy Brief.
- Arquitetura de landing com hero, dores, solucao, beneficios, prova social,
  como funciona, oferta, FAQ, garantia e CTA.
- Copywriting orientado a conversao.

### Mecanismo de Contexto Vivo para LLMs

Arquivos criados/atualizados para orientar agentes de IA:

- `AI_CONTEXT.md` — contexto operacional curto, leitura obrigatoria inicial.
- `.cursor/rules/ai-context-governance.mdc` — rule always-on para manter o
  contexto tecnico atualizado.
- `CLAUDE.md` — aponta para `AI_CONTEXT.md`, `PROJECT_TECHNICAL_SPEC.md`,
  `MIGRATION_NOTES.md` e constituicao SpecifyX.
- `PROJECT_TECHNICAL_SPEC.md` — documento tecnico completo.
- `README.md` — onboarding humano e operacional.

Regra pratica:

- Mudou arquitetura, rota, stack, deploy, banco, auth, billing ou dashboard?
  Atualize `AI_CONTEXT.md` e `PROJECT_TECHNICAL_SPEC.md`.
- Mudou onboarding/comandos? Atualize `README.md`.
- Mudou decisao que agentes futuros devem respeitar? Atualize `.cursor/rules/`.

Objetivo:

- Reduzir perda de contexto entre sessoes.
- Evitar que LLMs reintroduzam arquitetura antiga.
- Tornar o projeto uma base confiavel para desenvolvimento com Engineer AI
  Software, onde humanos e agentes tomam decisoes com o mesmo mapa tecnico.

---

## 14. Deploy em VPS Ubuntu + Docker + Portainer

### Demo em Producao

- URL prevista: `https://bizu.bru.ia.br`
- Status: dominio reservado; deploy ainda nao publicado no momento desta spec.
- Objetivo: hospedar a demo publica do template (landing, blog, login e dashboard).

### Modelo de Deploy

Destino planejado:

- VPS propria.
- Ubuntu Linux.
- Docker Engine.
- Portainer para gerenciar containers/stacks.
- Reverse proxy recomendado: Traefik, Caddy ou Nginx Proxy Manager.

### Container da Aplicacao

`Dockerfile` multi-stage:

1. Stage `build`
   - Node 22 Alpine.
   - `npm ci`.
   - `npm run build`.
2. Stage `runtime`
   - Node 22 Alpine.
   - `npm ci --omit=dev`.
   - Copia `build/`.
   - Expõe `3000`.
   - Healthcheck em `/api/health`.
   - `CMD ["node", "build/server/index.js"]`.

### Compose Atual

`docker-compose.yml` atual contem apenas Postgres local:

- `postgres:16-alpine`
- Porta local `15432` publicada para `5432` dentro do container.
- Usuario/senha/db: `portal`.
- Volume `postgres_data`.

Para producao via Portainer, recomenda-se stack com:

- Container app (`bizu-saas`).
- Container Postgres ou Postgres externo/gerenciado.
- Rede Docker compartilhada.
- Reverse proxy com TLS.
- Variaveis injetadas pelo Portainer (nunca comitar secrets).

### Variaveis de Ambiente

Runtime:

- `NODE_ENV=production`
- `PORT=3000`
- `DATABASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Migrations:

- `DIRECT_URL`

Pagamentos/e-mail futuros:

- `STRIPE_SECRET_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`

---

## 15. Qualidade e Validacao

Verificacoes recentes realizadas:

- `npm run typecheck` passou.
- Smoke test de producao passou anteriormente:
  - `/api/health`
  - `/`
  - `/blog`
  - `/blog/reduzir-mensagens-de-status`
  - `/login`
  - `/dashboard` sem auth, confirmando shell sem dados sensiveis.

Comandos recomendados antes de cada entrega:

```bash
npm run typecheck
npm run build
```

Para smoke test local de producao:

```powershell
$env:NODE_ENV="production"
$env:PORT="3000"
node build/server/index.js
```

---

## 16. Bugs, Riscos e Ajustes Recomendados

### BUG-001 — `.env.example` ainda indicava `PORT=3001` (corrigido)

Estado anterior:

- O projeto migrou para processo unico.
- `Dockerfile` e runtime usam `PORT=3000`.
- `.env.example` ainda documenta `PORT=3001` como "API Hono".

Impacto:

- Confunde novos projetos criados a partir do template.
- Pode fazer o dev subir o app em porta diferente da documentada no Docker.

Status:

- Corrigido para `PORT=3000`.
- Comentario atualizado para "Servidor unico — React Router SSR + Hono API".

### BUG-002 — `README.md` estava desatualizado pos-migracao (corrigido)

Estado anterior:

- README ainda fala em Vite `:5173` + API `:3001`.
- Lista scripts que nao existem mais: `dev:client`, `dev:server`.
- Mostra estrutura antiga com `server/`.

Impacto:

- Onboarding incorreto.
- Template perde confiabilidade para novos projetos.

Status:

- README reescrito para Framework Mode, Hono unificado, metodologia AI Software
  Engineering, scripts atuais e deploy VPS/Docker/Portainer.

### BUG-003 — `.cursor/rules/portal-stack.mdc` estava desatualizada (corrigido)

Estado anterior:

- A rule diz que API Hono fica em `server/` e `/api` passa por proxy Vite.
- A arquitetura atual usa `src/api/app.ts` + `src/server.ts` em processo unico.

Impacto:

- Agentes futuros podem seguir instrucao antiga e recriar arquitetura errada.

Status:

- Rule atualizada para React Router Framework Mode + Hono integrado.
- Marcada como `alwaysApply: true`.

### BUG-004 — `.cursor/rules/portal-scope.mdc` conflitava com o estado atual (corrigido)

Estado atual:

- A rule diz "Nao adicionar auth de usuarios, dashboard ou pagamentos sem spec
  aprovada".
- O projeto ja possui login, dashboard inicial e dependencias de pagamentos.

Impacto:

- Agentes podem bloquear evolucoes legitimas do proprio template.

Status:

- Rule atualizada para o novo objetivo: template multiuso para SaaS, portal,
  site, blog, dashboard e sistemas web.

### BUG-005 — `next-themes` instalado mas nao usado (corrigido)

Estado atual:

- `next-themes` aparece em `package.json`.
- Nao ha imports de `next-themes` no codigo.
- O tema usa provider proprio com Zustand.

Impacto:

- Dependencia orfa.
- Aumenta superficie de manutencao sem beneficio.

Status:

- Dependencia removida com `npm uninstall next-themes`.

### RISK-001 — `/api/contact` ainda nao usava Zod (corrigido)

Estado atual:

- `@hono/zod-validator` e `zod` estao instalados.
- A rota ainda faz validacao manual simples.

Impacto:

- Menos consistencia entre forms e API.
- Risco de validacoes divergentes no futuro.

Status:

- Criado `src/lib/schemas/contact.ts`.
- Aplicado `zValidator("json", contactMessageSchema)` em `src/api/app.ts`.
- Formulario de contato reutiliza `contactMessageSchema.safeParse`.

### RISK-002 — Migrations nao estao no runtime Docker

Estado atual:

- `.dockerignore` exclui `drizzle/`.
- Runtime Docker usa `npm ci --omit=dev`, portanto nao inclui `drizzle-kit`.

Impacto:

- O container de app nao executa migrations.
- Isso e aceitavel se migrations forem uma etapa separada no deploy.

Acao recomendada:

- Documentar explicitamente no README/Portainer: migrations devem rodar em job
  separado ou pipeline.

### RISK-003 — Blog ainda e estatico

Estado atual:

- Blog SSR funcional, mas dados vivem em `src/lib/content/posts.ts`.

Impacto:

- Bom para template inicial.
- Ainda nao atende CMS/blog dinamico.

Acao recomendada:

- Criar tabela `posts` no Drizzle quando o blog virar feature real.

---

## 17. Roadmap Tecnico Recomendado

### Curto prazo

- Adicionar shadcn components essenciais: `dialog`, `dropdown-menu`, `sheet`,
  `table`, `form`, `select`, `skeleton`, `tooltip`, `avatar`.
- Criar stack Portainer completa para app + Postgres + reverse proxy.
- Documentar rotina de migrations como job/pipeline separado.

### Medio prazo

- Configurar TanStack Query Provider no `root.tsx`.
- Criar API client tipado para Hono ou helpers de fetch padronizados.
- Criar tabela `posts`.
- Criar modelos `clients`, `projects`, `project_updates`, `files`.
- Integrar Supabase Storage aos arquivos do dashboard.

### Longo prazo

- Multi-tenant/organizations.
- Billing Stripe.
- E-mails transacionais via Nodemailer.
- RBAC/permissoes.
- Observabilidade: logs estruturados, health/readiness, tracing.
- CI com typecheck/build/test.
- Backups e restore documentados para VPS.

---

## 18. Conclusao

O projeto esta bem posicionado como template moderno e reutilizavel para:

- Landing pages.
- Sites institucionais.
- Blogs com SEO/OG.
- Portais de clientes.
- SaaS com auth, dashboard e billing futuro.
- Sistemas web com admin.

A base tecnica esta consistente: React Router Framework Mode com SSR, Hono no
mesmo processo, Drizzle/Postgres como fonte de dados, Supabase auxiliar,
Tailwind/shadcn como design system e Docker para VPS.

Os principais ajustes agora sao de alinhamento documental/regras e limpeza de
dependencias, nao de arquitetura.
