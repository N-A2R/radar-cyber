#!/usr/bin/env bash
# healthcheck.sh — Sonde de supervision locale Radar Cyber.
#
# Teste :
#   1. GET /api/health  → { ok: true, sources: N }
#   2. GET /api/stats   → compteurs orgs / events / indicators / sources
#   3. La carte        → racine web servie (shell React) + point d'entrée JS servi
#
# Code de sortie : 0 si tout est OK, 1 sinon.
#
# Usage :
#   scripts/healthcheck.sh
#   API_URL=http://127.0.0.1:8080 WEB_URL=http://127.0.0.1:5173 scripts/healthcheck.sh
set -uo pipefail

API_URL="${API_URL:-http://127.0.0.1:8080}"
WEB_URL="${WEB_URL:-http://127.0.0.1:5173}"
TIMEOUT="${HEALTHCHECK_TIMEOUT:-10}"

failures=0

log_ok()  { printf 'OK   %s\n' "$*"; }
log_fail() { printf 'FAIL %s\n' "$*" >&2; }

for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log_fail "commande requise absente : $cmd"
    exit 1
  fi
done

# 1. Santé de l'API : le serveur répond { ok: true, sources: <nombre> }.
body="$(curl -sS --max-time "$TIMEOUT" "$API_URL/api/health" 2>/dev/null || true)"
if printf '%s' "$body" | jq -e 'type == "object" and .ok == true and (.sources | type == "number")' >/dev/null 2>&1; then
  log_ok "/api/health → $(printf '%s' "$body" | jq -c '{ok, sources}')"
else
  log_fail "/api/health : réponse invalide (${body:-aucune})"
  failures=$((failures + 1))
fi

# 2. Statistiques : les compteurs clés sont présents.
body="$(curl -sS --max-time "$TIMEOUT" "$API_URL/api/stats" 2>/dev/null || true)"
if printf '%s' "$body" | jq -e 'type == "object" and has("orgs") and has("events") and has("indicators") and has("sources")' >/dev/null 2>&1; then
  log_ok "/api/stats → $(printf '%s' "$body" | jq -c '{orgs, events, indicators}')"
else
  log_fail "/api/stats : réponse invalide (${body:-aucune})"
  failures=$((failures + 1))
fi

# 3. Carte : la racine web renvoie le shell React et le point d'entrée JS est
# servi. En build de production c'est /assets/*.js ; en dev vite, /src/*.tsx.
index="$(curl -sS --max-time "$TIMEOUT" "$WEB_URL/" 2>/dev/null || true)"
if printf '%s' "$index" | grep -q 'id="root"'; then
  asset="$(printf '%s' "$index" | grep -oE '/assets/[A-Za-z0-9._-]+\.js' | head -n1 || true)"
  if [ -z "$asset" ]; then
    asset="$(printf '%s' "$index" | grep -oE '/src/[A-Za-z0-9._/-]+\.tsx?' | head -n1 || true)"
  fi
  if [ -z "$asset" ]; then
    log_fail "carte : point d'entrée JS absent de la page racine"
    failures=$((failures + 1))
  else
    code="$(curl -sS -o /dev/null --max-time "$TIMEOUT" -w '%{http_code}' "$WEB_URL$asset" 2>/dev/null || echo 000)"
    if [ "$code" = "200" ]; then
      log_ok "carte : shell web + point d'entrée servis ($asset)"
    else
      log_fail "carte : point d'entrée $asset en HTTP $code"
      failures=$((failures + 1))
    fi
  fi
else
  log_fail "carte : shell web absent (${WEB_URL}/)"
  failures=$((failures + 1))
fi

if [ "$failures" -gt 0 ]; then
  log_fail "$failures test(s) en échec."
  exit 1
fi
log_ok "Tous les tests de supervision sont OK."
exit 0
