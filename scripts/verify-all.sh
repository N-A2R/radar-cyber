#!/usr/bin/env bash
# verify-all.sh — Vérification locale complète de Radar Cyber.
#
# Enchaîne : socle (diagnostic), contrat hors base, typecheck API et web,
# tests API, tests front (rendu + interactions), build web, healthcheck.
# Idempotent : les éventuels serveurs de test sont arrêtés en fin de script,
# aucun fichier n'est laissé derrière soi (hors sorties de build).
#
# Usage :
#   scripts/verify-all.sh
#   API_URL=http://127.0.0.1:8080 WEB_URL=http://127.0.0.1:5173 scripts/verify-all.sh
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

API_URL="${API_URL:-http://127.0.0.1:8080}"
TMP_API_PORT="${VERIFY_API_PORT:-18080}"
TMP_WEB_PORT="${VERIFY_WEB_PORT:-15173}"
WEB_URL="${WEB_URL:-http://127.0.0.1:5173}"
log()  { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
step() { printf '\n=== %s ===\n' "$*"; }

failures=0

run_step() {
  local label="$1"
  shift
  step "$label"
  if "$@"; then
    log "OK: $label"
  else
    log "FAIL: $label"
    failures=$((failures + 1))
  fi
}

# Attend qu'une URL réponde en HTTP 200 (délai en secondes).
wait_up() {
  local url="$1" timeout="$2" i
  for ((i = 0; i < timeout; i++)); do
    if curl -sS -o /dev/null --max-time 2 "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# Démarre une commande en arrière-plan, dans un nouveau groupe de processus,
# et renvoie le PID du chef de groupe (pour kill -- -PID).
# setsid peut forker : on ne peut pas utiliser $!, donc le processus écrit son
# propre PID ($$ = PGID du groupe) dans un fichier temporaire.
start_bg() {
  local log="$1" cwd="$2" pidfile pid i
  shift 2
  pidfile="$(mktemp "${TMPDIR:-/tmp}/radar-verify-bg.XXXXXX")"
  setsid sh -c 'echo $$ > "$1"; shift; cd "$1" && shift && exec "$@"' _ "$pidfile" "$cwd" "$@" >"$log" 2>&1 &
  for ((i = 0; i < 50; i++)); do
    [ -s "$pidfile" ] && break
    sleep 0.1
  done
  pid=""
  [ -s "$pidfile" ] && pid="$(cat "$pidfile")"
  rm -f "$pidfile"
  echo "$pid"
}

TMP_API_PID=""
TMP_WEB_PID=""
cleanup() {
  [ -n "$TMP_API_PID" ] && kill -- "-$TMP_API_PID" 2>/dev/null || true
  [ -n "$TMP_WEB_PID" ] && kill -- "-$TMP_WEB_PID" 2>/dev/null || true
  [ -n "$PNPM_WRAPPER" ] && rm -f "$PNPM_WRAPPER"
}
trap cleanup EXIT

# pnpm n'est pas toujours installé globalement (sandbox) : on retombe sur npx
# avec la version épinglée par le dépôt, sans rien installer d'autre.
# Il faut un vrai exécutable, pas une fonction shell : start_bg fait `exec`
# dans un sous-shell, où les fonctions du script parent n'existent pas.
PNPM_BIN="$(command -v pnpm || true)"
PNPM_WRAPPER=""
if [ -z "$PNPM_BIN" ]; then
  PNPM_WRAPPER="$(mktemp "${TMPDIR:-/tmp}/radar-verify-pnpm.XXXXXX")"
  printf '#!/bin/sh\nexec npx --yes pnpm@12.15.0 "$@"\n' > "$PNPM_WRAPPER"
  chmod +x "$PNPM_WRAPPER"
  PNPM_BIN="$PNPM_WRAPPER"
fi
TSX="$REPO_DIR/apps/api/node_modules/.bin/tsx"

# Le contrat est une fonction pure : il se vérifie sans PostgreSQL. On le passe
# avant le reste pour rendre un échec de contrat immédiatement lisible.
run_step "contrat (hors base)" "$TSX" --test \
  apps/api/test/contract-admit.test.ts \
  apps/api/test/contract-families.test.ts

# Diagnostic du socle : n'écrit rien. Une base absente n'est pas un échec de
# vérification (les tests API créent la leur) ; on le signale seulement.
step "socle (diagnostic)"
if "$TSX" scripts/bootstrap.mts --check; then
  log "OK: socle en place"
else
  log "INFO: socle incomplet ou base absente — voir docs/socle.md (pnpm db:up && pnpm setup)"
fi

run_step "typecheck api"  "$PNPM_BIN" -F @radar/api typecheck
run_step "typecheck web" "$PNPM_BIN" -F @radar/web typecheck
run_step "tests api"     "$PNPM_BIN" -F @radar/api test
run_step "tests rendu"   "$PNPM_BIN" -F @radar/web run test:render
run_step "tests dom"     "$PNPM_BIN" -F @radar/web run test:dom
run_step "tests sources" "$PNPM_BIN" -F @radar/web run test:sources
run_step "tests inspecteur" "$PNPM_BIN" -F @radar/web run test:inspecteur
run_step "tests fil"      "$PNPM_BIN" -F @radar/web run test:fil
run_step "tests corroboration" "$PNPM_BIN" -F @radar/web run test:corroboration
run_step "build web"     "$PNPM_BIN" -F @radar/web build

step "healthcheck local"

# API : réutilise l'instance déjà en cours ; sinon en lance une temporaire
# (RADAR_COLLECT=0 : pas de boucle de collecte, la base doit être présente).
if wait_up "$API_URL/api/health" 3; then
  log "API détectée sur $API_URL."
else
  log "API absente de $API_URL : démarrage temporaire (RADAR_COLLECT=0, port $TMP_API_PORT)."
  tmp_api_log="$(mktemp "${TMPDIR:-/tmp}/radar-verify-api.XXXXXX")"
  TMP_API_PID="$(start_bg "$tmp_api_log" "$REPO_DIR" env RADAR_COLLECT=0 PORT="$TMP_API_PORT" "$PNPM_BIN" -F @radar/api start)"
  if wait_up "http://127.0.0.1:$TMP_API_PORT/api/health" 40; then
    API_URL="http://127.0.0.1:$TMP_API_PORT"
    log "API temporaire prête sur $API_URL."
  else
    log "FAIL: l'API temporaire n'a pas répondu. Journal :"
    tail -n 20 "$tmp_api_log" >&2 2>/dev/null || true
    failures=$((failures + 1))
  fi
fi

# Web : idem avec vite preview, le build venant d'être produit.
if wait_up "$WEB_URL/" 3; then
  log "Web détecté sur $WEB_URL."
else
  log "Web absent de $WEB_URL : démarrage temporaire de vite preview (port $TMP_WEB_PORT)."
  tmp_web_log="$(mktemp "${TMPDIR:-/tmp}/radar-verify-web.XXXXXX")"
  TMP_WEB_PID="$(start_bg "$tmp_web_log" "$REPO_DIR/apps/web" env WEB_PORT="$TMP_WEB_PORT" API_PROXY_TARGET="$API_URL" "$PNPM_BIN" -F @radar/web exec vite preview --config ../../scripts/systemd/preview.config.mjs)"
  if wait_up "http://127.0.0.1:$TMP_WEB_PORT/" 20; then
    WEB_URL="http://127.0.0.1:$TMP_WEB_PORT"
    log "Web temporaire prêt sur $WEB_URL."
  else
    log "FAIL: le web temporaire n'a pas répondu. Journal :"
    tail -n 20 "$tmp_web_log" >&2 2>/dev/null || true
    failures=$((failures + 1))
  fi
fi

if API_URL="$API_URL" WEB_URL="$WEB_URL" bash "$REPO_DIR/scripts/healthcheck.sh"; then
  log "OK: healthcheck local"
else
  log "FAIL: healthcheck local"
  failures=$((failures + 1))
fi

printf '\n'
if [ "$failures" -eq 0 ]; then
  log "Vérification complète OK."
  exit 0
fi
log "$failures étape(s) en échec."
exit 1
