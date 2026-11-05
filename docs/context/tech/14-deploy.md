# Deploy em VPS

- **Escopo:** Demo, modelo de deploy, container, compose e variáveis de ambiente.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** não declarado

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L610-688 -->
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

`docker-compose.yml` atual contem apenas Postgres local:

- `postgres:16-alpine`
- Porta local `15432` publicada para `5432` dentro do container.
- Usuario/senha/db: `portal`.
- Volume `postgres_data`.

Para producao via Portainer, recomenda-se stack com:

- Container app (`bizu-starter`).
- Container Postgres ou Postgres externo/gerenciado.
- Rede Docker compartilhada.
- Reverse proxy com TLS.
- Variaveis injetadas pelo Portainer (nunca comitar secrets).

### Variaveis de Ambiente

Runtime:

- `NODE_ENV=production`
- `PORT=3000`
- `TRUSTED_PROXY_HOPS` (quantidade de reverse proxies; 1 com um proxy)
- `DATABASE_URL`

Build (`--build-arg`, fixadas no bundle):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Migrations:

- `DIRECT_URL`

E-mail, quando adicionado ao projeto: credenciais SMTP, como variaveis de runtime.

---

