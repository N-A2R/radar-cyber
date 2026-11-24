#!/usr/bin/env bash
# smoke-startup.sh — preuve de démarrage réel et jetable de l'API Radar Cyber.
#
# Vérifie, sans toucher au service installé :
#   1. le registre de routes n'inscrit chaque couple MÉTHODE + chemin qu'une fois
#      (apps/api/scripts/smoke-routes.mts, échoue sur doublon) ;
#   2. GET / renvoie le shell web servi par server.ts ;
#   3. GET /api/health renvoie { ok: true, sources: <nombre> }.
#
# Le serveur tourne sur un port temporaire, RADAR_COLLECT=0, avec un dist web
# jetable passé par RADAR_WEB_DIST : aucun build, aucune écriture dans le dépôt,
# aucun service live modifié. Le groupe de processus est tué et le temporaire
# supprimé sur EXIT, INT et TERM — aucune sortie forcée de processus de test.
#
# Usage :
#   DATABASE_URL=postgres://... bash scripts/smoke-startup.sh
#   SMOKE_PORT=18099 DATABASE_URL=postgres://... bash scripts/smoke-startup.sh
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

TSX="$REPO_DIR/apps/api/node_modules/.bin/tsx"
HOST="${SMOKE_HOST:-127.0.0.1}"
WAIT_SECONDS="${SMOKE_WAIT:-40}"
DATABASE_URL="${DATABASE_URL:-postgres://radar:radar@127.0.0.1:5433/radar}"
PORT="${SMOKE_PORT:-}"
if [ -z "$PORT" ]; then
  PORT="$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>console.log(p))})')"
fi
BASE="http://$HOST:$PORT"

log()  { printf 'OK   %s\n' "$*"; }
fail() { printf 'FAIL %s\n' "$*" >&2; }
die()  { fail "$*"; exit 1; }
step() { printf '\n=== %s ===\n' "$*"; }

for cmd in curl jq node; do
  command -v "$cmd" >/dev/null 2>&1 || die "commande requise absente : $cmd"
done
[ -x "$TSX" ] || die "tsx introuvable : $TSX (pnpm install ?)"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/radar-smoke-startup.XXXXXX")"
API_PGID=""
cleanup() {
  if [ -n "$API_PGID" ]; then
    kill -TERM -- "-$API_PGID" 2>/dev/null || true
    for _ in $(seq 1 30); do
      kill -0 -- "-$API_PGID" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL -- "-$API_PGID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM

failures=0

step "1. registre de routes (une seule inscription par méthode + chemin)"
if "$TSX" apps/api/scripts/smoke-routes.mts; then
  log "registre de routes sans doublon"
else
  fail "registre de routes : doublon ou enregistrement refusé"
  failures=$((failures + 1))
fi

step "2. démarrage réel sur $BASE (RADAR_COLLECT=0)"
mkdir -p "$WORK/web-dist"
printf '%s\n' '<!doctype html><html><body><div id="root"></div></body></html>' > "$WORK/web-dist/index.html"

pidfile="$WORK/api.pid"
setsid sh -c 'echo $$ > "$1"; shift; exec "$@"' _ "$pidfile" \
  env DATABASE_URL="$DATABASE_URL" RADAR_COLLECT=0 HOST="$HOST" PORT="$PORT" \
  RADAR_WEB_DIST="$WORK/web-dist" "$TSX" apps/api/src/server.ts >"$WORK/api.log" 2>&1 &
for _ in $(seq 1 50); do
  [ -s "$pidfile" ] && break
  sleep 0.1
done
[ -s "$pidfile" ] || die "API non lancée (journal : $WORK/api.log)"
API_PGID="$(cat "$pidfile")"

ready=0
for _ in $(seq 1 "$WAIT_SECONDS"); do
  body="$(curl -sS --max-time 2 "$BASE/api/health" 2>/dev/null || true)"
  if printf '%s' "$body" | jq -e 'type == "object" and .ok == true and (.sources | type == "number")' >/dev/null 2>&1; then
    ready=1
    break
  fi
  kill -0 -- "-$API_PGID" 2>/dev/null || break
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  fail "API non prête sur $BASE — journal :"
  tail -n 20 "$WORK/api.log" >&2 2>/dev/null || true
  failures=$((failures + 1))
fi

step "3. routes HTTP : / et /api/health"
index="$(curl -sS --max-time 5 "$BASE/" 2>/dev/null || true)"
if printf '%s' "$index" | grep -q 'id="root"'; then
  log "/ → shell web servi par l'API"
else
  fail "/ → shell web absent"
  failures=$((failures + 1))
fi

body="$(curl -sS --max-time 5 "$BASE/api/health" 2>/dev/null || true)"
if printf '%s' "$body" | jq -e 'type == "object" and .ok == true and (.sources | type == "number")' >/dev/null 2>&1; then
  log "/api/health → $(printf '%s' "$body" | jq -c '{ok, sources}')"
else
  fail "/api/health → réponse invalide (${body:-aucune})"
  failures=$((failures + 1))
fi

printf '\n'
if [ "$failures" -eq 0 ]; then
  log "Smoke OK : registre unique, / et /api/health servis sur le port temporaire $PORT."
  exit 0
fi
fail "$failures contrôle(s) en échec (port temporaire $PORT)."
exit 1
