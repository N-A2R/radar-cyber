#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
DATABASE_URL="${DATABASE_URL:-}"

check_endpoint() {
  local path="$1"
  local code
  code=$(curl -sS -o /tmp/smoke_body -w '%{http_code}' "${BASE_URL}${path}")
  if [ "$code" != "200" ]; then
    echo "FAIL ${path}: HTTP ${code}" >&2
    exit 1
  fi
  jq -e . /tmp/smoke_body >/dev/null
  echo "OK ${path} (200, valid JSON)"
}

check_endpoint "/api/health"
check_endpoint "/api/orgs"
check_endpoint "/api/events?limit=1"
check_endpoint "/api/graph"

if [ -n "$DATABASE_URL" ]; then
  psql "$DATABASE_URL" -f db/checks.sql
else
  psql -f db/checks.sql
fi
