#!/usr/bin/env bash
# restore-verify.sh — Preuve de restauration d'une sauvegarde.
#
# `backup-db.sh` vérifie qu'une archive se déchiffre. Ce script va plus loin :
# il la restaure réellement dans une base jetable, compte les tables, puis
# supprime la base. Un dump qui ne se restaure pas n'est pas une sauvegarde.
#
# Usage :
#   scripts/restore-verify.sh                          # dernier dump local
#   scripts/restore-verify.sh chemin/vers/radar.dump   # archive précise
#   PASSPHRASE_FILE=~/.config/radar/backup.pass \
#     scripts/restore-verify.sh radar.dump.gpg         # archive chiffrée
#
# La base créée s'appelle radar_restore_<pid> : elle ne touche jamais `radar`.
set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://radar:radar@localhost:5432/radar}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/.local/share/radar-cyber/backups}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" ]]; then
  ARCHIVE="$(ls -1t "$BACKUP_DIR"/radar-*.dump* 2>/dev/null | head -1 || true)"
fi
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  log "ERREUR: aucune archive trouvée (cherché dans $BACKUP_DIR)."
  exit 1
fi

# Base de maintenance : on s'y connecte pour créer la base jetable.
MAINT_URL="${DB_URL%/*}/postgres"
RESTORE_DB="radar_restore_$$"
TMP_DIR="$(mktemp -d)"

cleanup() {
  psql "$MAINT_URL" -q -c "DROP DATABASE IF EXISTS $RESTORE_DB" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

PLAIN="$ARCHIVE"
case "$ARCHIVE" in
  *.gpg)
    if [[ -z "${PASSPHRASE_FILE:-}" ]]; then
      log "ERREUR: archive chiffrée sans PASSPHRASE_FILE."
      exit 1
    fi
    PLAIN="$TMP_DIR/restore.dump"
    log "Déchiffrement de $(basename "$ARCHIVE")"
    gpg --batch --quiet --pinentry-mode loopback \
        --passphrase-file "$PASSPHRASE_FILE" --decrypt --output "$PLAIN" "$ARCHIVE"
    ;;
esac

log "Création de la base jetable $RESTORE_DB"
psql "$MAINT_URL" -q -c "CREATE DATABASE $RESTORE_DB" >/dev/null

log "Restauration de $(basename "$ARCHIVE")"
TARGET_URL="${DB_URL%/*}/$RESTORE_DB"
pg_restore --dbname "$TARGET_URL" --no-owner --no-privileges --exit-on-error "$PLAIN"

# Invariants : une base restaurée sans ses tables est un échec silencieux.
read -r events orgs sources indicators <<<"$(psql "$TARGET_URL" -At -F' ' -c "
  SELECT (SELECT count(*) FROM event),
         (SELECT count(*) FROM org),
         (SELECT count(*) FROM source),
         (SELECT count(*) FROM indicator)")"

log "Restauré: event=$events org=$orgs source=$sources indicator=$indicators"

fail=0
(( events > 0 )) || { log "ERREUR: aucun événement restauré."; fail=1; }
(( orgs > 0 )) || { log "ERREUR: aucune organisation restaurée."; fail=1; }
(( sources > 0 )) || { log "ERREUR: aucune source restaurée."; fail=1; }

if (( fail )); then
  exit 1
fi

log "Restauration vérifiée: $ARCHIVE"
