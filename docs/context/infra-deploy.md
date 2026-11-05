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
- Postgres em container na mesma rede Docker, gerenciado ou o do Supabase, via Drizzle.
- Supabase externo para Auth, Storage, Edge Functions e Realtime.

A demo em `https://bizu.bru.ia.br` roda na Vercel a partir de outro repositório
(`bizu-saas-vercel`, nome mantido). Este repositório é o alvo VPS/Docker.

## Endpoints

| Ambiente | Aplicação | Banco |
|---|---|---|
| Dev | `http://localhost:5173` | `localhost:15432` |
| Container | Porta `3000` (`PORT`) | `DATABASE_URL` |

- Healthcheck: `GET /api/health`, usado pelo `HEALTHCHECK` do `Dockerfile`.
- Sem CORS: API e frontend compartilham origem.

## Credenciais

- Em produção, as variáveis de runtime são injetadas pelo Portainer/container.
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` são de build: passe com
  `--build-arg` (ou `build.args` na stack). Trocar o valor exige rebuild da imagem.
- Variável `VITE_*` vai para o navegador; nunca coloque segredo nesse prefixo.
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
- A role da `DATABASE_URL` deve ser dona das tabelas, porque elas têm RLS sem policies.
- Atrás de reverse proxy, defina `TRUSTED_PROXY_HOPS=1` (um valor por proxy na frente).
- HSTS é configurado no reverse proxy, não no app. Só inclua subdomínios se todos usarem HTTPS.

## Riscos e pendências

Somente listados; nenhum foi resolvido aqui.

- **Rate limit:** fica em memória de um processo; veja RISK-005 em `tech/16-bugs-riscos.md`.
- **Dependências:** alertas moderados restantes; veja RISK-004 no mesmo arquivo.
- **Migrations:** o runtime não inclui `drizzle-kit` nem `drizzle/`; falta documentar
  o job ou pipeline.
- **Stack Portainer:** ainda não existe stack com app, Postgres e reverse proxy.
- **Backup:** faltam backup e restore documentados para a VPS.
- **Observabilidade:** sem logs estruturados.
