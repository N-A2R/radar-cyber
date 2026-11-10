#!/usr/bin/env bash
# report-weekly.sh — Génère le rapport hebdomadaire daté de Radar Cyber.
#
# Écrit deux fichiers dans <repo>/out/ :
#   rapport-AAAA-MM-JJ.html  (page autonome, imprimable)
#   rapport-AAAA-MM-JJ.md    (Markdown, pour archive/diff)
#
# Le nom de fichier est calculé ici : scripts/weekly-report.mts reçoit un chemin
# littéral (il fait writeFile) et non un gabarit strftime.
#
# Usage :
#   scripts/report-weekly.sh
#   REPORT_DAYS=30 scripts/report-weekly.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_DIR/out"
DAYS="${REPORT_DAYS:-7}"
STAMP="$(date '+%Y-%m-%d')"
HTML="$OUT_DIR/rapport-$STAMP.html"
MD="$OUT_DIR/rapport-$STAMP.md"

# systemd --user n'hérite pas du PATH de la session (node installé via mise).
if ! command -v node >/dev/null 2>&1; then
  export PATH="${MISE_DATA_DIR:-$HOME/.local/share/mise}/shims:$HOME/.local/share/mise/installs/node/latest/bin:$PATH"
fi
command -v node >/dev/null 2>&1 || { echo "ERREUR: node introuvable dans PATH." >&2; exit 1; }

mkdir -p "$OUT_DIR"

cd "$REPO_DIR/apps/api"

./node_modules/.bin/tsx ../../scripts/weekly-report.mts --days "$DAYS" --html --out "$HTML"
./node_modules/.bin/tsx ../../scripts/weekly-report.mts --days "$DAYS" --out "$MD"

for f in "$HTML" "$MD"; do
  [ -s "$f" ] || { echo "ERREUR: fichier vide ou absent : $f" >&2; exit 1; }
done

printf 'rapport hebdomadaire : %s (%s octets)\n' "$HTML" "$(stat -c %s "$HTML")"
printf 'rapport hebdomadaire : %s (%s octets)\n' "$MD" "$(stat -c %s "$MD")"
