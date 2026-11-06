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

run_once() {
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  dump="$OUT_DIR/bizu-$stamp.dump.age"
  tmp="$dump.partial"

  mkdir -p "$OUT_DIR"

  # `pipefail` não existe no sh do Alpine: o pg_dump grava num arquivo e a cifra lê dele.
  pg_dump --format=custom --no-owner --no-privileges --file="$OUT_DIR/.dump.$stamp"
  age --recipient "$BACKUP_AGE_RECIPIENT" --output "$tmp" "$OUT_DIR/.dump.$stamp"
  rm -f "$OUT_DIR/.dump.$stamp"
  mv "$tmp" "$dump"
  echo "backup: banco em $dump"

  if [ -d "$STORAGE_DIR" ] && [ -n "$(ls -A "$STORAGE_DIR" 2>/dev/null)" ]; then
    files="$OUT_DIR/bizu-$stamp.storage.tar.age"
    tar -C "$STORAGE_DIR" -cf "$OUT_DIR/.storage.$stamp" .
    age --recipient "$BACKUP_AGE_RECIPIENT" --output "$files.partial" "$OUT_DIR/.storage.$stamp"
    rm -f "$OUT_DIR/.storage.$stamp"
    mv "$files.partial" "$files"
    echo "backup: arquivos em $files"
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
      run_once || echo "backup: FALHOU, nova tentativa em ${INTERVAL_HOURS}h" >&2
      sleep "$((INTERVAL_HOURS * 3600))"
    done
    ;;
  *)
    echo "uso: backup.sh [loop|once]" >&2
    exit 2
    ;;
esac
