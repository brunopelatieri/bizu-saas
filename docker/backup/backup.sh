#!/bin/sh
# Backup cifrado do banco e dos arquivos locais.
#
#   backup.sh loop   um backup por BACKUP_INTERVAL_HOURS (padrão 24), para sempre
#   backup.sh once   um backup e sai (é o que se roda para testar)
#
# Saída em /backups, dois arquivos por rodada, cifrados com `age` para a chave PÚBLICA em
# BACKUP_AGE_RECIPIENT (a chave privada nunca entra aqui: quem a tem restaura):
#   bizu-AAAAMMDD-HHMMSS.dump.age      pg_dump -Fc do banco
#   bizu-AAAAMMDD-HHMMSS.storage.tar.age   /storage (STORAGE_LOCAL_DIR), se houver arquivos
#
# O usuário do banco precisa atravessar o RLS: superusuário ou um papel com BYPASSRLS e
# pg_read_all_data (veja docs/context/tech/14-deploy.md). Sem isso o pg_dump falha, em vez de
# gerar um backup vazio em silêncio.
#
# Cada etapa confere o próprio resultado: `set -e` não vale dentro de uma função chamada com
# `||`, e é assim que o modo `loop` chama `run_once`. Os arquivos temporários em claro (`.dump.*`,
# `.storage.*`) saem em qualquer desfecho, inclusive se o processo for encerrado.
set -eu

: "${BACKUP_AGE_RECIPIENT:?defina BACKUP_AGE_RECIPIENT com a chave pública age (age-keygen)}"
: "${PGHOST:?defina PGHOST}"
: "${PGUSER:?defina PGUSER}"
: "${PGPASSWORD:?defina PGPASSWORD}"
: "${PGDATABASE:?defina PGDATABASE}"

OUT_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
STORAGE_DIR="${BACKUP_STORAGE_DIR:-/storage}"

# Nada em claro sobra no volume: nem desta rodada, nem de uma que foi morta no meio.
cleanup_plain() {
  rm -f "$OUT_DIR"/.dump.* "$OUT_DIR"/.storage.* "$OUT_DIR"/*.partial
}
trap cleanup_plain EXIT
sleeper=
trap 'kill "$sleeper" 2>/dev/null || true; exit 143' TERM INT

backup_database() {
  stamp="$1"
  plain="$OUT_DIR/.dump.$stamp"
  final="$OUT_DIR/bizu-$stamp.dump.age"

  pg_dump --format=custom --no-owner --no-privileges --file="$plain" || return 1
  age --recipient "$BACKUP_AGE_RECIPIENT" --output "$final.partial" "$plain" || return 1
  rm -f "$plain"
  mv "$final.partial" "$final" || return 1
  echo "backup: banco em $final"
}

backup_files() {
  stamp="$1"
  plain="$OUT_DIR/.storage.$stamp"
  final="$OUT_DIR/bizu-$stamp.storage.tar.age"

  # Sem arquivos locais (provedor s3, ou nada enviado ainda), não há o que guardar.
  if [ ! -d "$STORAGE_DIR" ] || [ -z "$(ls -A "$STORAGE_DIR" 2>/dev/null)" ]; then
    return 0
  fi

  tar -C "$STORAGE_DIR" -cf "$plain" . || return 1
  age --recipient "$BACKUP_AGE_RECIPIENT" --output "$final.partial" "$plain" || return 1
  rm -f "$plain"
  mv "$final.partial" "$final" || return 1
  echo "backup: arquivos em $final"
}

run_once() {
  mkdir -p "$OUT_DIR"
  cleanup_plain
  stamp="$(date -u +%Y%m%d-%H%M%S)"

  if ! backup_database "$stamp" || ! backup_files "$stamp"; then
    cleanup_plain
    echo "backup: FALHOU" >&2
    return 1
  fi

  find "$OUT_DIR" -name 'bizu-*.age' -mtime "+$KEEP_DAYS" -print -delete
}

case "${1:-loop}" in
  once)
    run_once
    ;;
  loop)
    while true; do
      # Uma rodada que falha não derruba o serviço: tenta de novo no próximo intervalo.
      run_once || echo "backup: nova tentativa em ${INTERVAL_HOURS}h" >&2
      sleep "$((INTERVAL_HOURS * 3600))" &
      sleeper=$!
      wait "$sleeper"
    done
    ;;
  *)
    echo "uso: backup.sh [loop|once]" >&2
    exit 2
    ;;
esac
