# Infra e deploy

- **Escopo:** Topologia, endpoints, credenciais, convenções e riscos do deploy.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/server.ts`, `src/lib/supabase/config.ts`
- **Detalhe completo:** `docs/context/tech/14-deploy.md`

## Topologia

Destino planejado, ainda sem stack de produção versionada:

- VPS própria com Ubuntu, Docker Engine e Portainer.
- Reverse proxy com TLS: Traefik, Caddy ou Nginx Proxy Manager (não escolhido).
- Processo Node único: serve assets, `/api/*` e SSR.
- Postgres em container na mesma rede Docker, ou externo/gerenciado.
- Supabase externo, só para Auth, Storage, Edge Functions e Realtime.

A demo em `https://bizu.bru.ia.br` roda na Vercel a partir de outro repositório
(`bizu-saas-vercel`). Este repositório é o alvo VPS/Docker.

## Endpoints

| Ambiente | Aplicação | Banco |
|---|---|---|
| Dev | `http://localhost:3000` (ou a porta exibida pelo dev server) | `localhost:15432` |
| Container | Porta `3000` (`PORT`) | `DATABASE_URL` |

- Healthcheck: `GET /api/health`, usado pelo `HEALTHCHECK` do `Dockerfile`.
- Sem CORS: API e frontend compartilham origem.

## Credenciais

- Em produção, as variáveis são injetadas pelo Portainer/container.
- Em dev, ficam em `.env.local` (ignorado pelo git).
- Só `.env.example` é versionado, sempre com valores de exemplo.
- `NODE_ENV=production` faz o servidor ignorar `.env.local`.
- NUNCA escreva chaves, senhas ou URLs reais de banco em arquivos versionados.

## Convenções

- Imagem multi-stage em Node 22 Alpine; o runtime leva só deps de produção e `build/`.
- Comando do container: `node build/server/index.js`.
- `DATABASE_URL` é usada em runtime; `DIRECT_URL`, pelo Drizzle Kit.
- `docker-compose.yml` sobe só o Postgres de desenvolvimento.
- Migrations rodam fora do container da aplicação, como etapa separada.

## Riscos e pendências

Somente listados; nenhum foi resolvido aqui.

- **Variáveis `VITE_*` no build Docker:** o cliente lê `VITE_SUPABASE_*` por
  `import.meta.env`, valor fixado pelo Vite no build. O `Dockerfile` não declara
  `ARG` e o `.dockerignore` exclui `.env.*`, então injetá-las só em runtime não deve
  alcançar o bundle. Inferido do código; não confirmado com um build real.
- **Migrations:** o runtime não inclui `drizzle-kit` nem `drizzle/`; falta documentar
  o job ou pipeline.
- **Stack Portainer:** ainda não existe stack com app, Postgres e reverse proxy.
- **Backup:** faltam backup e restore documentados para a VPS.
- **Observabilidade e CI:** sem logs estruturados nem pipeline de typecheck/build/test.
