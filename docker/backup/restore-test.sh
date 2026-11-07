#!/bin/sh
# Teste de restauração: decifra um backup, restaura num banco descartável e confere que as
# tabelas, as linhas e o acesso do runtime (`bizu_app`) voltaram. Rode todo mês: backup que nunca
# foi restaurado é só esperança.
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

# As entradas `DEFAULT ACL` são de `ALTER DEFAULT PRIVILEGES FOR ROLE bizu_owner`: o papel do backup
# não pode recriá-las (e elas só valem para tabelas futuras). Pulá-las deixa o código de saída do
# pg_restore significar o que deve: qualquer outro erro derruba o teste.
pg_restore --list "$WORK/db.dump" | grep -v ' DEFAULT ACL ' > "$WORK/db.list"
pg_restore --no-owner --use-list="$WORK/db.list" --dbname="$TARGET" "$WORK/db.dump"

tables="$(psql -d "$TARGET" -Atc "select count(*) from information_schema.tables where table_schema = 'public'")"
users="$(psql -d "$TARGET" -Atc 'select count(*) from "user"')"
migrations="$(psql -d "$TARGET" -Atc 'select count(*) from drizzle.__drizzle_migrations')"

echo "restauração ok: $tables tabelas, $users usuários, $migrations migrations"

if [ "$tables" -lt 20 ] || [ "$migrations" -lt 1 ]; then
  echo "restauração SUSPEITA: poucas tabelas ou nenhuma migration" >&2
  exit 1
fi

# O runtime volta a funcionar? has_*_privilege responde por `bizu_app` sem precisar logar como ele.
# Conta o que falta: tabelas de public sem SELECT/INSERT/UPDATE/DELETE, a leitura das migrations
# (o app a confere na subida) e o USAGE nos schemas de public e drizzle.
missing="$(psql -d "$TARGET" -Atc "
  select
    (select count(*) from pg_tables
      where schemaname = 'public'
        and not (has_table_privilege('bizu_app', format('%I.%I', schemaname, tablename), 'SELECT')
             and has_table_privilege('bizu_app', format('%I.%I', schemaname, tablename), 'INSERT')
             and has_table_privilege('bizu_app', format('%I.%I', schemaname, tablename), 'UPDATE')
             and has_table_privilege('bizu_app', format('%I.%I', schemaname, tablename), 'DELETE')))
  + (case when has_table_privilege('bizu_app', 'drizzle.__drizzle_migrations', 'SELECT') then 0 else 1 end)
  + (case when has_schema_privilege('bizu_app', 'public', 'USAGE') then 0 else 1 end)
  + (case when has_schema_privilege('bizu_app', 'drizzle', 'USAGE') then 0 else 1 end)")"

if [ "$missing" -ne 0 ]; then
  echo "restauração SEM ACESSO do bizu_app ($missing itens): este dump não traz os GRANTs." >&2
  echo "Backup feito com --no-privileges (versões antigas do backup.sh)? Siga 'Dump antigo' em docs/context/tech/14-deploy.md." >&2
  exit 1
fi

echo "acesso do bizu_app ok (public, drizzle.__drizzle_migrations)"
