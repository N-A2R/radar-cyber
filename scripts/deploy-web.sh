#!/usr/bin/env bash
# Build apps/web et le publie sur instabox (web statique + proxy /api vers ce PC).
set -euo pipefail
HOST="${HOST:-instabox-compute-hermes}"
REMOTE_DIR="${REMOTE_DIR:-radar-web}"
cd "$(dirname "$0")/.."

echo "→ build"
pnpm -F @radar/web build >/dev/null

echo "→ envoi vers $HOST:$REMOTE_DIR/dist"
rsync -az --delete apps/web/dist/ "$HOST:$REMOTE_DIR/dist/"

echo "→ redémarrage du service distant"
ssh -o BatchMode=yes "$HOST" 'systemctl --user restart radar-web.service && sleep 1 && systemctl --user is-active radar-web.service'

echo "✓ https://100.88.44.41:8090 (tailnet)"
