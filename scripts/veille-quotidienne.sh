#!/usr/bin/env bash
# veille-quotidienne.sh — cycle de veille du matin : collecte, incidents,
# confiance, campagnes et résumé daté dans <repo>/out/.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_DIR/out"
STAMP="$(date -u '+%Y-%m-%d')"
RAPPORT="$OUT_DIR/veille-quotidienne-$STAMP.json"

# systemd --user n'hérite pas du PATH de la session (node installé via mise).
if ! command -v node >/dev/null 2>&1; then
  export PATH="${MISE_DATA_DIR:-$HOME/.local/share/mise}/shims:$HOME/.local/share/mise/installs/node/latest/bin:$PATH"
fi
command -v node >/dev/null 2>&1 || { echo "ERREUR: node introuvable dans PATH." >&2; exit 1; }

mkdir -p "$OUT_DIR"
export RADAR_VEILLE_OUT="$OUT_DIR"

cd "$REPO_DIR/apps/api"
./node_modules/.bin/tsx ../../scripts/veille-quotidienne.mts

[ -s "$RAPPORT" ] || { echo "ERREUR: résumé vide ou absent : $RAPPORT" >&2; exit 1; }
printf 'veille quotidienne : %s (%s octets)\n' "$RAPPORT" "$(stat -c %s "$RAPPORT")"
