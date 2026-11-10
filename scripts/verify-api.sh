#!/usr/bin/env bash
# Vérification d'intégrité de l'API Radar Cyber NA.
#
# Lancement de l'API (si elle n'est pas déjà en cours) :
#   cd /home/jolt/radar-cyber
#   pnpm --filter @radar/api dev
# (ou : pnpm --filter @radar/api build && node apps/api/dist/server.js)
# Elle écoute sur http://localhost:8080 par défaut (PORT surchargeable).
#
# Usage : BASE_URL=http://localhost:8080 scripts/verify-api.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"

fail() {
  echo "FAIL $1: $2" >&2
  exit 1
}

# check <chemin> <filtre jq appliqué à la réponse>
check() {
  local path="$1" filter="$2" body
  body=$(curl -sS --max-time 10 "${BASE_URL}${path}") || fail "$path" "requête impossible (API lancée ?)"
  echo "$body" | jq -e "$filter" >/dev/null 2>&1 || fail "$path" "structure inattendue: $(echo "$body" | head -c 300)"
  echo "OK $path"
}

# 1. Santé
check "/api/health" 'type == "object" and (has("status") or has("ok"))'

# 2. Statistiques globales
check "/api/stats" 'type == "object" and length > 0'

# 3. Organisations : tableau non vide
check "/api/orgs" 'type == "array" and length > 0'

# 4. Détail d'une organisation (slug pris dans la réponse précédente)
SLUG=$(curl -sS --max-time 10 "${BASE_URL}/api/orgs" | jq -r '[.[] | select(.slug != null)] | first | .slug // empty')
[ -n "$SLUG" ] || fail "/api/orgs/<slug>" "aucun slug trouvé dans la réponse /api/orgs"
check "/api/orgs/$SLUG" 'type == "object" and has("slug")'

# 5. Événements : tableau
check "/api/events?limit=5" 'type == "array" and length <= 5'

# 6. Graphe sur 7 jours
check "/api/graph?days=7" 'type == "object"'

# 7. Sources
check "/api/sources" 'type == "array"'

# 8. Recherche plein-texte
check "/api/search?q=bordeaux" 'type == "object"'

echo "Tous les endpoints OK."
