#!/usr/bin/env bash
# backup-db.sh — Sauvegarde quotidienne de la base radar-cyber.
# Format custom PostgreSQL compressé, rotation 14, vérification d'intégrité.
set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://radar:radar@localhost:5432/radar}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/.local/share/radar-cyber/backups}"
RETENTION="${RETENTION:-14}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

if ! command -v pg_dump >/dev/null 2>&1; then
  log "ERREUR: pg_dump introuvable. Installez postgresql-client."
  exit 1
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  log "ERREUR: pg_restore introuvable. Installez postgresql-client."
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date '+%Y-%m-%d-%H%M')"
OUT="$BACKUP_DIR/radar-$STAMP.dump"

log "Dump de $DB_URL vers $OUT"
pg_dump "$DB_URL" --format=custom --compress=9 --file="$OUT"

# Vérification d'intégrité
if pg_restore --list "$OUT" >/dev/null 2>&1; then
  log "Intégrité OK: archive lisible (pg_restore --list)."
else
  log "ERREUR: archive illisible, suppression."
  rm -f "$OUT"
  exit 1
fi

# Rotation : garder les $RETENTION plus récents
mapfile -t files < <(ls -1t "$BACKUP_DIR"/radar-*.dump 2>/dev/null)
if (( ${#files[@]} > RETENTION )); then
  for f in "${files[@]:RETENTION}"; do
    log "Rotation: suppression $f"
    rm -f "$f"
  done
fi

log "Terminé: $OUT"
