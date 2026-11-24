#!/usr/bin/env bash
# backup-remote.sh — Sauvegarde de la base Radar Cyber configurée.
#
# Si DATABASE_URL est fournie (cas systemd et installations locales), elle est
# utilisée directement par backup-db.sh. Sinon, le script conserve le repli
# historique : tunnel SSH vers la base d'une box distante, mot de passe lu dans
# un fichier 0600 et jamais exposé dans l'URL ou la ligne de commande.
#
# Variables lues dans ~/.config/radar-cyber/backup.env :
#   DATABASE_URL  cible explicite de la base à sauvegarder
#   BOX_HOST       hôte ssh de la box (défaut : instabox-compute-2)
#   BOX_DB_PASS_FILE   fichier contenant le mot de passe de la base (600)
#   TUNNEL_PORT        port local du tunnel (défaut : 55433)
#   BACKUP_DIR, RETENTION, PASSPHRASE_FILE, OFFSITE, OFFSITE_SANDBOX
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOX_HOST="${BOX_HOST:-instabox-compute-2}"
PASS_FILE="${BOX_DB_PASS_FILE:-$HOME/.config/radar-cyber/db-box.pass}"
TUNNEL_PORT="${TUNNEL_PORT:-55433}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

if [[ -n "${DATABASE_URL:-}" ]]; then
  log "Sauvegarde de la base configurée (DATABASE_URL)"
  exec "$HERE/backup-db.sh"
fi


if [[ ! -r "$PASS_FILE" ]]; then
  log "ERREUR: mot de passe introuvable ($PASS_FILE)"
  exit 1
fi

# Le mot de passe ne doit apparaître NI dans une URL (journaux, `ps`) NI sur
# la ligne de commande. `.pgpass` est le seul support prévu par PostgreSQL.
PGPASS="$(mktemp "${TMPDIR:-/tmp}/radar-backup-pgpass.XXXXXX")"
chmod 600 "$PGPASS"
PASS="$(tr -d '\n' < "$PASS_FILE")"
PASS="${PASS//\\/\\\\}"
PASS="${PASS//:/\\:}"
printf '127.0.0.1:%s:radar:radar:%s\n' "$TUNNEL_PORT" "$PASS" > "$PGPASS"
unset PASS

log "Ouverture du tunnel vers $BOX_HOST:$TUNNEL_PORT"
ssh -o ExitOnForwardFailure=yes -o BatchMode=yes -N \
    -L "127.0.0.1:${TUNNEL_PORT}:127.0.0.1:5433" "$BOX_HOST" &
TUNNEL_PID=$!

nettoyer() {
  rm -f "$PGPASS"
  kill "$TUNNEL_PID" 2>/dev/null || true
}
trap nettoyer EXIT

pret=0
for _ in $(seq 1 20); do
  if (exec 3<>"/dev/tcp/127.0.0.1/${TUNNEL_PORT}") 2>/dev/null; then pret=1; break; fi
  sleep 1
done
if [[ "$pret" -ne 1 ]]; then
  log "ERREUR: tunnel SSH ouvert mais PostgreSQL injoignable sur $TUNNEL_PORT."
  exit 1
fi

export PGPASSFILE="$PGPASS"
export DATABASE_URL="postgres://radar@127.0.0.1:${TUNNEL_PORT}/radar"
log "Dump via le tunnel (identifiants lus depuis PGPASSFILE)"
"$HERE/backup-db.sh"
