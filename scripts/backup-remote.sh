#!/usr/bin/env bash
# backup-remote.sh — Sauvegarde de la base de production, hébergée sur une box.
#
# La base vit sur compute-2 (conteneur `radar-db18`, publié sur 127.0.0.1:5433
# de la box). Le tailnet ne laisse pas passer 5433 (ACL) : on passe donc par un
# tunnel SSH, monté et refermé par ce script. Les clés et la phrase de chiffrement
# restent sur le ThinkBook — rien n'est copié sur les sandboxes.
#
# Variables lues dans ~/.config/radar-cyber/backup.env :
#   BOX_HOST       hôte ssh de la box (défaut : instabox-compute-2)
#   BOX_DB_PASS_FILE   fichier contenant le mot de passe de la base (600)
#   BACKUP_DIR, RETENTION, PASSPHRASE_FILE, OFFSITE, OFFSITE_SANDBOX
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOX_HOST="${BOX_HOST:-instabox-compute-2}"
PASS_FILE="${BOX_DB_PASS_FILE:-$HOME/.config/radar-cyber/db-box.pass}"
TUNNEL_PORT="${TUNNEL_PORT:-55433}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

if [[ ! -r "$PASS_FILE" ]]; then
  log "ERREUR: mot de passe introuvable ($PASS_FILE)"
  exit 1
fi

log "Ouverture du tunnel vers $BOX_HOST:$TUNNEL_PORT"
ssh -o ExitOnForwardFailure=yes -o BatchMode=yes -N \
    -L "127.0.0.1:${TUNNEL_PORT}:127.0.0.1:5433" "$BOX_HOST" &
TUNNEL_PID=$!
trap 'kill "$TUNNEL_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 20); do
  if (exec 3<>"/dev/tcp/127.0.0.1/${TUNNEL_PORT}") 2>/dev/null; then break; fi
  sleep 1
done

export DATABASE_URL="postgres://radar:$(cat "$PASS_FILE")@127.0.0.1:${TUNNEL_PORT}/radar"
log "Dump via le tunnel"
"$HERE/backup-db.sh"
