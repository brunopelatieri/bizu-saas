---
description: "Claude Code context file for this project"
---

# Bizu SaaS - AI Software Engineering Context

Este projeto é um boilerplate full-stack para iniciar rapidamente SaaS, portais,
sites, blogs, dashboards e sistemas web usando metodologia de **AI Software
Engineering**: especificação primeiro, contexto vivo para LLMs e decisões
técnicas documentadas.

## Leia primeiro

Antes de mudanças técnicas relevantes:

- `AI_CONTEXT.md`
- `PROJECT_TECHNICAL_SPEC.md`
- `MIGRATION_NOTES.md`
- `.cursor/rules/*.mdc`

## Arquitetura atual

- React Router v7 Framework Mode com `ssr: true`.
- Hono API em `src/api/app.ts`, montado por `src/server.ts`.
- Processo único em dev/prod (`react-router dev`, `node build/server/index.js`).
- Drizzle/Postgres como fonte de dados.
- Supabase apenas auxiliar (Auth, Storage, Functions, Realtime).
- Dashboard client-only por convenção: sem loaders server-side com dados sensíveis.

## Regra de contexto vivo

Se alterar arquitetura, rotas, stack, deploy, banco, auth, billing, dashboard
ou rules, atualize também:

- `AI_CONTEXT.md`
- `PROJECT_TECHNICAL_SPEC.md`
- `README.md` se afetar onboarding
- `.cursor/rules/*.mdc` se afetar decisões futuras de agentes

## Project Memory
@AI_CONTEXT.md
@PROJECT_TECHNICAL_SPEC.md
@MIGRATION_NOTES.md
