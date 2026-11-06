#!/bin/sh
# Teste de restauração: decifra um backup, restaura num banco descartável e confere que as
# tabelas e as linhas voltaram. Rode todo mês: backup que nunca foi restaurado é só esperança.
#
#   docker compose --profile backup run --rm --entrypoint restore-test.sh \
#     -v /caminho/da/chave:/key:ro backup /backups/bizu-AAAAMMDD-HHMMSS.dump.age /key/identity.txt
#
# Argumentos: arquivo .dump.age e arquivo com a chave PRIVADA age. O banco de teste é
# `bizu_restore_test` no mesmo servidor, apagado ao final.
set -eu

DUMP="${1:?informe o arquivo .dump.age}"
IDENTITY="${2:?informe o arquivo com a chave privada age}"
TARGET="bizu_restore_test"
WORK="$(mktemp -d)"

cleanup() {
  psql -d postgres -qc "DROP DATABASE IF EXISTS $TARGET" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

age --decrypt --identity "$IDENTITY" --output "$WORK/db.dump" "$DUMP"

psql -d postgres -qc "DROP DATABASE IF EXISTS $TARGET"
psql -d postgres -qc "CREATE DATABASE $TARGET"
pg_restore --no-owner --no-privileges --dbname="$TARGET" "$WORK/db.dump"

tables="$(psql -d "$TARGET" -Atc "select count(*) from information_schema.tables where table_schema = 'public'")"
users="$(psql -d "$TARGET" -Atc 'select count(*) from "user"')"
migrations="$(psql -d "$TARGET" -Atc 'select count(*) from drizzle.__drizzle_migrations')"

echo "restauração ok: $tables tabelas, $users usuários, $migrations migrations"

if [ "$tables" -lt 20 ] || [ "$migrations" -lt 1 ]; then
  echo "restauração SUSPEITA: poucas tabelas ou nenhuma migration" >&2
  exit 1
fi
