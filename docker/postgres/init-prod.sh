#!/bin/sh
# Primeiro start do volume do Postgres de produção (docker/compose.prod.yml).
# O entrypoint da imagem executa este script uma vez (ou o carrega com `source`, se o arquivo
# não tiver o bit de execução) e o psql do próprio container roda o init.sql com as senhas que
# vêm do ambiente, em vez das de desenvolvimento.
#
# Tudo roda num subshell: carregado por `source`, o script não pode mexer nas opções nem nos
# parâmetros do entrypoint.
(
  set -eu

  : "${BIZU_OWNER_PASSWORD:?defina BIZU_OWNER_PASSWORD}"
  : "${BIZU_APP_PASSWORD:?defina BIZU_APP_PASSWORD}"

  for name in BIZU_OWNER_PASSWORD BIZU_APP_PASSWORD BIZU_BACKUP_PASSWORD; do
    eval "value=\${$name:-}"
    case "$value" in
      change-me*) echo "init-prod: $name ainda tem o valor de exemplo; gere uma senha (openssl rand -hex 24)." >&2; exit 1 ;;
    esac
    # Mesmo piso de src/lib/env.ts: aqui a recusa vem antes de a senha entrar no volume. Vazia
    # só chega neste ponto na do backup, que é opcional.
    if [ -n "$value" ] && [ "${#value}" -lt 16 ]; then
      echo "init-prod: $name tem menos de 16 caracteres; gere uma senha (openssl rand -hex 24)." >&2
      exit 1
    fi
  done

  # Sem BIZU_BACKUP_PASSWORD, o papel de backup não é criado (o serviço `backup` é opcional).
  if [ -n "${BIZU_BACKUP_PASSWORD:-}" ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
      -v "bizu_owner_password=$BIZU_OWNER_PASSWORD" \
      -v "bizu_app_password=$BIZU_APP_PASSWORD" \
      -v "bizu_backup_password=$BIZU_BACKUP_PASSWORD" \
      -f /opt/bizu/init.sql
  else
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
      -v "bizu_owner_password=$BIZU_OWNER_PASSWORD" \
      -v "bizu_app_password=$BIZU_APP_PASSWORD" \
      -f /opt/bizu/init.sql
  fi
)
