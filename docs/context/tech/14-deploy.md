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

- `LOG_LEVEL` (`info` por padrao), `SENTRY_DSN` (opcional), `STORAGE_PROVIDER`
  (`local` ou `s3`), `STORAGE_LOCAL_DIR`, `S3_*` e `MAX_UPLOAD_MB`

A lista completa esta em `.env.example`; a validacao, em `src/lib/env.ts`.

Migrations rodam em etapa separada (`npm run db:migrate` com `DIRECT_URL`), antes de
subir a nova imagem. Em Postgres proprio, rode `docker/postgres/init.sql` com `psql`
como superusuario uma vez, antes da primeira migration.

---

### Logs, Sentry e prontidao (fase 10)

- Os logs saem em JSON no stdout (pino): uma linha por requisicao (`request`, com `req.path`,
  `status`, `duration_ms`) e uma por erro, todas com `request_id`. O `x-request-id` que o proxy
  mandar (8 a 64 caracteres seguros) e mantido e devolvido; sem ele, o app gera. Cookie, e-mail,
  documento, senha e token nunca aparecem (`redact`). Rotacione pelo driver do Docker
  (`max-size`/`max-file`) ou por um coletor; o prazo de retencao dos logs e de quem opera.
- `LOG_LEVEL=debug` inclui `/api/health`, `/api/ready` e `/assets/*`.
- `SENTRY_DSN` liga o envio de erros (`src/lib/monitoring/sentry/`); sem ele, nada e carregado.
  Define a variavel tambem no `worker`.
- `GET /api/health` (liveness) e `GET /api/ready` (banco e fila, 2 s); `/admin` mostra webhooks
  com falha e jobs mortos.

### Arquivos

- `STORAGE_PROVIDER=local` grava em `STORAGE_LOCAL_DIR` (`.data/storage`): em container, monte um
  volume ali, senao os arquivos somem a cada deploy. `s3` usa bucket privado (MinIO com
  `S3_ENDPOINT`); o app baixa os arquivos por conta propria, sem URL publica.
- O mesmo diretorio recebe as exportacoes LGPD (`exports/`), apagadas apos 7 dias.

### Backup e restauracao (fase 10)

Servico opcional do `docker-compose.yml`, perfil `backup` (`docker/backup/`):

1. `age-keygen -o chave.txt` **fora do servidor**; guarde a chave privada (gerenciador de senhas ou
   cofre). So a linha `public key` vai para o servidor.
2. Defina `BACKUP_AGE_RECIPIENT=age1...` (e, em producao, um usuario com `BYPASSRLS` e
   `pg_read_all_data`: `CREATE ROLE bizu_backup LOGIN PASSWORD '...' BYPASSRLS;`
   `GRANT pg_read_all_data TO bizu_backup;` e `BACKUP_PGUSER`/`BACKUP_PGPASSWORD`). Sem atravessar o
   RLS o `pg_dump` falha, em vez de gerar um backup vazio.
3. `docker compose --profile backup up -d backup` faz um dump por `BACKUP_INTERVAL_HOURS` (24),
   `bizu-AAAAMMDD-HHMMSS.dump.age` (`pg_dump -Fc`) e `.storage.tar.age` (de `STORAGE_LOCAL_DIR`) no
   volume `backups`, e apaga o que passar de `BACKUP_KEEP_DAYS` (14). Um backup agora:
   `docker compose --profile backup run --rm backup once`.
4. Copie o volume para fora da VPS (rsync, rclone, S3); backup so no mesmo disco nao e backup.

Restaurar (banco):

```bash
age --decrypt --identity chave.txt --output bizu.dump bizu-AAAAMMDD-HHMMSS.dump.age
createdb -h HOST -U postgres bizu_novo
pg_restore -h HOST -U postgres --no-owner --no-privileges --dbname bizu_novo bizu.dump
```

Depois rode `docker/postgres/init.sql` (papeis e grants) e `npm run db:migrate` se o dump for de
uma versao anterior. Restaurar arquivos: `age --decrypt --identity chave.txt ...storage.tar.age | tar -x -C /destino`.

**Teste de restauracao mensal:** `restore-test.sh` decifra o backup, restaura num banco
descartavel (`bizu_restore_test`) e confere tabelas, usuarios e migrations:

```bash
docker compose --profile backup run --rm -v /caminho/da/chave:/key:ro --entrypoint restore-test.sh   backup /backups/bizu-AAAAMMDD-HHMMSS.dump.age /key/chave.txt
```

**Depois de restaurar, reaplique as exclusoes**: quem foi anonimizado depois do backup volta com os
dados. Rode o job `lgpd.delete` com `deletion_request` executadas desde a data do backup em
`pending` de novo, ou anonimize as contas a mao (`docs/context/lgpd.md`).
