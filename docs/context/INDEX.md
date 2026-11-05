# Índice de Contexto

Mapa de roteamento: identifique o domínio da tarefa e leia só o arquivo indicado.
Caminhos relativos a `docs/context/`. Nunca carregue tudo de uma vez.

## Fundações

| Domínio | Arquivo | Quando ler | Paths do código |
|---|---|---|---|
| Núcleo | `core.md` | Decisão de arquitetura; dúvida sobre regras; atualização de contexto | `src/server.ts`, `src/api/app.ts` |
| Status | `status.md` | Saber o que está pronto e o que está pendente | — |
| Onboarding | `onboarding.md` | Primeira execução; erro de setup local, Docker ou migrate | `drizzle.config.ts`, `docker-compose.yml` |
| Método | `ai-engineering.md` | Planejar feature, escolher modelo, reduzir tokens, adaptar o template | — |
| Specs | `docs/specs/README.md` | Escrever PRD/SPEC ou retomar feature em andamento | `docs/specs/` |
| Infra e deploy | `infra-deploy.md` | Topologia, credenciais, riscos de VPS, Docker e Portainer | `Dockerfile`, `docker-compose.yml`, `.dockerignore` |

## Domínios técnicos

| Domínio | Arquivo | Quando ler | Paths do código |
|---|---|---|---|
| Visão geral | `tech/01-visao-geral.md` | Entender a proposta e a decisão SSR × dashboard | `src/root.tsx` |
| Stack | `tech/02-stack.md` | Escolher ou trocar dependência; conferir versões | `package.json` |
| Estrutura | `tech/03-estrutura-pastas.md` | Decidir onde um arquivo novo deve ficar | `src/` |
| Scripts | `tech/04-scripts.md` | Rodar dev, build, typecheck ou comandos de banco | `package.json` |
| Rotas e SSR | `tech/05-react-router.md` | Criar rota, loader, `meta` ou mexer no blog | `src/routes.ts`, `src/routes/`, `src/root.tsx` |
| API | `tech/06-hono-api.md` | Criar ou alterar endpoint `/api/*` | `src/api/app.ts`, `src/server.ts`, `src/lib/schemas/` |
| Banco (Drizzle) | `tech/07-banco-drizzle.md` | Alterar schema, migration ou query | `src/db/`, `drizzle/`, `drizzle.config.ts` |
| Supabase e Auth | `tech/08-supabase.md` | Mexer em login, sessão, Storage, Edge Functions ou Realtime | `src/lib/supabase/`, `src/lib/auth/`, `src/providers/auth-provider.tsx`, `src/components/auth/` |
| Tema e CSS | `tech/09-tema-css.md` | Alterar tokens, Tailwind ou dark/light mode | `src/index.css`, `src/styles/`, `src/stores/` |
| Site público | `tech/10-site-publico.md` | Alterar landing, header ou páginas públicas | `src/components/landing/`, `src/components/layout/`, `src/pages/` |
| Dashboard | `tech/11-dashboard.md` | Alterar a área autenticada `/dashboard/**` | `src/components/layout/`, `src/pages/dashboard-page.tsx`, `src/lib/constants/` |
| shadcn/ui | `tech/12-shadcn-ui.md` | Adicionar ou ajustar componentes base | `src/components/ui/`, `components.json` |
| Skills e rules | `tech/13-skills-rules.md` | Consultar o histórico de rules e skills | `.cursor/rules/` |
| Deploy | `tech/14-deploy.md` | Docker, Portainer, VPS ou variáveis de ambiente | `Dockerfile`, `docker-compose.yml` |
| Qualidade | `tech/15-qualidade.md` | Definir como validar uma entrega | — |
| Bugs e riscos | `tech/16-bugs-riscos.md` | Investigar problema conhecido ou risco aberto | — |
| Roadmap | `tech/17-roadmap.md` | Planejar evolução técnica | — |
| Conclusão | `tech/18-conclusao.md` | Raramente; síntese do posicionamento técnico | — |

## Skills sob demanda

A `description` de cada skill fica sempre carregada; o corpo só entra ao invocar.

| Domínio | Skill | Quando invocar | Arquivo |
|---|---|---|---|
| banco-drizzle | `ctx-banco-drizzle` | Use ao alterar schema, migrations ou queries Drizzle. | `docs/context/tech/07-banco-drizzle.md` |
| supabase-auth | `ctx-supabase-auth` | Use ao mexer em login, sessão, Storage, Edge Functions ou Realtime. | `docs/context/tech/08-supabase.md` |
| api-hono | `ctx-api-hono` | Use ao criar ou alterar endpoints /api/* e contratos Zod. | `docs/context/tech/06-hono-api.md` |
| dashboard | `ctx-dashboard` | Use ao alterar a área autenticada /dashboard. | `docs/context/tech/11-dashboard.md` |
| infra-deploy | `ctx-infra-deploy` | Use em tarefas de Docker, Portainer, VPS ou variáveis de ambiente. | `docs/context/infra-deploy.md` |

Fluxo: `prd` e `spec` criam documentos em `docs/specs/`; `context-budget` mede o baseline.

## Arquivo morto

Ler só sob demanda explícita.

| Domínio | Arquivo | Quando ler | Paths do código |
|---|---|---|---|
| Migração | `archive/MIGRATION_NOTES.md` | Só sob demanda explícita: história da migração para Framework Mode | — |
| Leitura legada | `archive/ai-context-leitura-legada.md` | Só sob demanda explícita: lista antiga de leitura | — |
