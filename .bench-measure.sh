#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PGPASSWORD=radar
BENCH_DB=$(cat .bench-db-name)
PSQL="psql -h localhost -p 5433 -U radar -d $BENCH_DB -At -v ON_ERROR_STOP=1"

run_ms() {
  local sql="$1" json
  json=$($PSQL -c "EXPLAIN (ANALYZE, TIMING OFF, FORMAT JSON) $sql")
  printf '%s' "$json" | jq -r '.[0]."Execution Time"'
}

median3() { printf '%s\n' "$1" "$2" "$3" | sort -n | awk 'NR==2'; }

printf '%-22s %12s %12s %8s\n' 'requête' 'ILIKE (ms)' 'tsvector (ms)' 'lignes'
for term in 'hôpital' 'bordeaux' 'grayan hôpital'; do
  old="SELECT o.id, o.name, o.slug, o.kind, o.city, o.dept, o.domain, o.lat, o.lon FROM org o WHERE o.name ILIKE '%$term%' OR o.domain ILIKE '%$term%' LIMIT 50"
  new="SELECT o.id, o.name, o.slug, o.kind, o.city, o.dept, o.domain, o.lat, o.lon, ts_rank_cd(o.search_tsv, tsq.q) AS relevance FROM websearch_to_tsquery('french', french_search_input('$term')) AS tsq(q), org o WHERE o.search_tsv @@ tsq.q ORDER BY CASE WHEN french_search_input(o.name) = french_search_input('$term') THEN 1 ELSE 0 END DESC, relevance DESC, o.id LIMIT 50"
  $PSQL -c "$old" > /dev/null
  $PSQL -c "$new" > /dev/null
  o1=$(run_ms "$old"); o2=$(run_ms "$old"); o3=$(run_ms "$old")
  n1=$(run_ms "$new"); n2=$(run_ms "$new"); n3=$(run_ms "$new")
  rows=$($PSQL -c "SELECT count(*) FROM (SELECT o.id FROM websearch_to_tsquery('french', french_search_input('$term')) AS tsq(q), org o WHERE o.search_tsv @@ tsq.q LIMIT 50) s")
  printf '%-22s %12.2f %12.2f %8s\n' "$term" "$(median3 "$o1" "$o2" "$o3")" "$(median3 "$n1" "$n2" "$n3")" "$rows"
done
