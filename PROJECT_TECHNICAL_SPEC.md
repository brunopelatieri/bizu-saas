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

> **Este arquivo virou stub.** A especificação foi dividida em
> `docs/context/tech/`, um arquivo por seção. Use o `docs/context/INDEX.md` para
> escolher o que ler.

## Onde está cada seção

| Seções | Local em `docs/context/tech/` |
|---|---|
| 1 a 4 | `01-visao-geral.md`, `02-stack.md`, `03-estrutura-pastas.md`, `04-scripts.md` |
| 5 e 6 | `05-react-router.md`, `06-hono-api.md` |
| 7 e 8 | `07-banco-drizzle.md`, `08-supabase.md` |
| 9 a 12 | `09-tema-css.md`, `10-site-publico.md`, `11-dashboard.md`, `12-shadcn-ui.md` |
| 13 a 15 | `13-skills-rules.md`, `14-deploy.md`, `15-qualidade.md` |
| 16 a 18 | `16-bugs-riscos.md`, `17-roadmap.md`, `18-conclusao.md` |

## Regra de contexto vivo

Mudança de código em um domínio exige atualizar, no mesmo trabalho, o arquivo
correspondente em `docs/context/`. Se o escopo do domínio mudar, atualize também
`docs/context/INDEX.md`. Não adicione conteúdo novo neste stub.
