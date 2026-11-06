# Deploy em VPS

- **Escopo:** Demo, modelo de deploy, container, compose e variáveis de ambiente.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** não declarado


## 14. Deploy em VPS Ubuntu + Docker + Portainer

### Demo em Producao

- URL: `https://bizu.bru.ia.br`
- Hospedagem: **Vercel** (demo publica).
- Repositório Vercel (arquitetura otimizada para serverless): `https://github.com/brunopelatieri/bizu-saas-vercel`
- Repositório principal (este repo): **VPS + Docker + Node unico** via `react-router-hono-server` + Hono + SSR.
- Objetivo: demo como referencia visual; codigo de producao self-hosted permanece neste template.

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

`docker-compose.yml` e so de desenvolvimento:

- `postgres:16-alpine`, porta local `15432`, superusuario `postgres`, volume `postgres_data`.
  `docker/postgres/init.sql` roda no primeiro start do volume e cria o banco `bizu` e os
  papeis `bizu_owner` (migrations) e `bizu_app` (runtime, sem `BYPASSRLS`).
- `axllent/mailpit`: SMTP `1025`, interface `8025`; captura todo e-mail de dev.
- Porta ocupada por outro projeto: crie `docker-compose.override.yml` (ignorado pelo git)
  com `ports: !override` e ajuste `.env.local`.

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
- `APP_URL`, `TRUSTED_PROXY_HOPS=1` (um por reverse proxy)
- `DATABASE_URL` (`bizu_app`), `DIRECT_URL` (`bizu_owner`)
- `BETTER_AUTH_SECRET`, `CREDENTIALS_ENCRYPTION_KEY` (32 bytes em base64), `AUDIT_SALT`:
  valores gerados; os de exemplo derrubam o processo em producao
- `RATE_LIMIT_STORE=postgres`: `memory` derruba o processo em producao
- `CSP_REPORT_ONLY`: `true` relata em `/api/csp-report`; `false` bloqueia
- `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_*` ou `RESEND_*`

A lista completa esta em `.env.example`; a validacao, em `src/lib/env.ts`.

Migrations rodam em etapa separada (`npm run db:migrate` com `DIRECT_URL`), antes de
subir a nova imagem. Em Postgres proprio, rode `docker/postgres/init.sql` com `psql`
como superusuario uma vez, antes da primeira migration.

---

