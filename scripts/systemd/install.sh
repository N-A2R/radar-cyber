#!/usr/bin/env bash
# install.sh — Installe et active les services systemd utilisateur Radar Cyber.
#
# Idempotent : relançable à volonté, il réécrit les unités depuis les modèles de
# scripts/systemd/ puis active (enable) et démarre les services si le port n'est
# pas déjà tenu par un processus hors systemd.
#
# Usage :
#   scripts/systemd/install.sh
#   RADAR_API_PORT=8080 RADAR_WEB_PORT=5173 scripts/systemd/install.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
API_PORT="${RADAR_API_PORT:-8080}"
WEB_PORT="${RADAR_WEB_PORT:-5173}"
USER_NAME="${USER:-$(id -un)}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { log "ERREUR: $*"; exit 1; }

for cmd in pnpm node systemctl; do
  command -v "$cmd" >/dev/null 2>&1 || die "$cmd introuvable dans PATH."
done

PNPM_BIN="$(command -v pnpm)"
NODE_BIN_DIR="$(dirname "$(command -v node)")"
PNPM_BIN_DIR="$(dirname "$PNPM_BIN")"
# systemd user n'hérite pas du PATH de la session shell (mise, pnpm global…) :
# on fige un PATH explicite dans l'unité.
PATH_ENV="$PNPM_BIN_DIR:$NODE_BIN_DIR:/usr/local/bin:/usr/bin:/bin"

mkdir -p "$UNIT_DIR"

render_unit() {
  local src="$1" dst="$2"
  sed -e "s|@REPO@|$REPO_DIR|g" \
      -e "s|@PNPM@|$PNPM_BIN|g" \
      -e "s|@PATH@|$PATH_ENV|g" \
      -e "s|@API_PORT@|$API_PORT|g" \
      -e "s|@WEB_PORT@|$WEB_PORT|g" \
      "$src" > "$dst"
  log "Unité écrite : $dst"
}

render_unit "$REPO_DIR/scripts/systemd/radar-api.service" "$UNIT_DIR/radar-api.service"
render_unit "$REPO_DIR/scripts/systemd/radar-web.service" "$UNIT_DIR/radar-web.service"

systemctl --user daemon-reload
log "daemon-reload effectué."

# Linger : sans lui, systemd --user arrête tout à la déconnexion de la session.
if command -v loginctl >/dev/null 2>&1; then
  linger="$(loginctl show-user "$USER_NAME" -p Linger --value 2>/dev/null || true)"
  if [ "$linger" = "yes" ]; then
    log "Linger déjà actif pour $USER_NAME."
  elif [ "$(id -u)" -ne 0 ]; then
    if loginctl enable-linger "$USER_NAME" 2>/dev/null; then
      log "Linger activé pour $USER_NAME."
    else
      log "AVERTISSEMENT: enable-linger a échoué — les services s'arrêteront à la déconnexion."
    fi
  fi
fi

systemctl --user enable radar-api.service radar-web.service >/dev/null
log "Unités activées au démarrage (enable)."

# Un port déjà tenu sur 127.0.0.1 signifie qu'un processus hors systemd sert
# déjà l'application : on n'y touche pas, l'unité reste activée mais inactive.
port_busy() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -qE "127\.0\.0\.1:${port}[[:space:]]"
  else
    (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null
  fi
}

declare -A skipped=()

start_unit() {
  local unit="$1" port="$2"
  if systemctl --user is-active --quiet "${unit}.service"; then
    log "${unit}.service est déjà actif."
    return 0
  fi
  if port_busy "$port"; then
    log "127.0.0.1:${port} occupé par un processus hors systemd : ${unit}.service laissé inactif."
    skipped["$unit"]=1
    return 0
  fi
  log "Démarrage de ${unit}.service…"
  systemctl --user start "${unit}.service"
}

start_unit radar-api "$API_PORT"
start_unit radar-web "$WEB_PORT"

# Vérification : systemctl --user is-active sur chaque unité.
fail=0
for unit in radar-api radar-web; do
  state="$(systemctl --user is-active "${unit}.service" 2>/dev/null || true)"
  log "is-active ${unit}.service → ${state:-inconnu}"
  case "$state" in
    active) ;;
    inactive)
      if [ "${skipped[$unit]:-0}" = "1" ]; then
        log "  inactif volontairement : le port est déjà servi hors systemd."
      else
        log "ERREUR: ${unit}.service aurait dû démarrer."
        fail=1
      fi
      ;;
    *) log "ERREUR: état inattendu « ${state} »."; fail=1 ;;
  esac
done

if [ "$fail" -ne 0 ]; then
  log "Journal des 30 dernières lignes :"
  journalctl --user -n 30 --no-pager -u radar-api.service -u radar-web.service 2>/dev/null || true
  exit 1
fi

log "Radar Cyber est supervisé par systemd (utilisateur)."
log "Arrêt/démarrage : systemctl --user {stop,start,restart} radar-api.service radar-web.service"
log "Logs : journalctl --user -u radar-api.service -f"
