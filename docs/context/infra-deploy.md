# Infra e deploy

- **Escopo:** Topologia, endpoints, credenciais, convenções e riscos do deploy.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-testes-operacao.md`
- **Paths do código:** `src/server.ts`, `src/lib/env.ts`, `docker-compose.yml`, `docker/postgres/init.sql`
- **Detalhe completo:** `docs/context/tech/14-deploy.md`

## Topologia

Destino planejado, ainda sem stack de produção versionada:

- VPS própria com Ubuntu, Docker Engine e Portainer.
- Reverse proxy com TLS: Traefik, Caddy ou Nginx Proxy Manager (não escolhido).
- Processo Node único: serve assets, `/api/*` e SSR.
- Postgres em container na mesma rede Docker ou gerenciado, via Drizzle.

A demo em `https://bizu.bru.ia.br` roda na Vercel a partir de outro repositório
(`bizu-saas-vercel`, nome mantido). Este repositório é o alvo VPS/Docker.

## Endpoints

| Ambiente | Aplicação | Banco |
|---|---|---|
| Dev | `http://localhost:5173` | `localhost:15432` (Mailpit em `localhost:8025`) |
| Container | Porta `3000` (`PORT`) | `DATABASE_URL` |

- Healthcheck: `GET /api/health`, usado pelo `HEALTHCHECK` do `Dockerfile`.
- Sem CORS: API e frontend compartilham origem.

## Credenciais

- Em produção, as variáveis de runtime são injetadas pelo Portainer/container.
- Variável `VITE_*` é fixada no build e vai para o navegador; nunca a use em segredos.
- Em dev, ficam em `.env.local` (ignorado pelo git).
- Só `.env.example` é versionado, sempre com valores de exemplo.
- `src/lib/env.ts` valida tudo na inicialização e, em produção, recusa os segredos de
  exemplo (`change-me...`) e `EMAIL_PROVIDER=memory`.
- `NODE_ENV=production` faz o servidor ignorar `.env.local`.
- NUNCA escreva chaves, senhas ou URLs reais de banco em arquivos versionados.

## Convenções

- Imagem multi-stage em Node 22 Alpine; o runtime leva só deps de produção e `build/`.
- Comando do container: `node build/server/index.js`.
- `DATABASE_URL` é usada em runtime (`bizu_app`, sem `BYPASSRLS`); `DIRECT_URL`, pelo
  Drizzle Kit e seed (`bizu_owner`). Os papéis vêm de `docker/postgres/init.sql`.
- `docker-compose.yml` sobe Postgres e Mailpit de desenvolvimento.
- Migrations rodam fora do container da aplicação, como etapa separada.
- Atrás de reverse proxy, defina `TRUSTED_PROXY_HOPS=1` (um valor por proxy na frente).
- HSTS é configurado no reverse proxy, não no app. Só inclua subdomínios se todos usarem HTTPS.

## Riscos e pendências

Somente listados; nenhum foi resolvido aqui.

- **Rate limit:** produção exige `RATE_LIMIT_STORE=postgres`; memória é recusada na subida
  (`tech/26-seguranca.md`).
- **CSP:** `CSP_REPORT_ONLY=true` só relata. Valide nas telas reais e mude para `false`.
- **Dependências:** alertas moderados restantes; veja RISK-004 no mesmo arquivo.
- **Autenticação:** Better Auth com sessão em cookie. Em produção, `APP_URL` com HTTPS, `BETTER_AUTH_SECRET` gerado e `TRUSTED_PROXY_HOPS=1`; sem isso, os limites por IP contam o proxy.
- **Migrations:** o runtime não inclui `drizzle-kit` nem `drizzle/`; o serviço `migrate`
  entra com `docker/compose.prod.yml` na fase 11.
- **Stack Portainer:** ainda não existe stack com app, Postgres e reverse proxy.
- **Backup:** faltam backup e restore documentados para a VPS.
- **Observabilidade:** sem logs estruturados.
