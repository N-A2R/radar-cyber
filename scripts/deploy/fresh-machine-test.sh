#!/usr/bin/env bash
# fresh-machine-test.sh — rejoue la procédure sur une machine Debian 13 neuve.
#
# La « machine neuve » est un conteneur Docker avec systemd pour PID 1 : le
# DDQ, les unités, PostgreSQL et le retour en arrière y sont réels, mais aucun
# état applicatif n'est hérité de la machine hôte. Nécessite Docker sur
# l'InstaBox et l'image radar-debian13-systemd (construite ci-dessous si absent).
#
#   bash scripts/deploy/fresh-machine-test.sh
#   RADAR_TEST_KEEP=1 bash scripts/deploy/fresh-machine-test.sh   # garder la box
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONTAINER="${RADAR_TEST_CONTAINER:-radar-fresh-test}"
IMAGE="${RADAR_TEST_IMAGE:-radar-debian13-systemd}"
KEEP="${RADAR_TEST_KEEP:-0}"
ADMIN_PWD="${RADAR_TEST_ADMIN_PWD:-Admin-Test-2026!}"
DB_PWD="${RADAR_TEST_DB_PWD:-Db-Test-2026!}"

log() { printf '\n=== %s ===\n' "$*"; }
measure() {
  local label="$1" t0 t1 rc
  shift
  t0="$(date +%s%N)"
  set +e
  "$@"
  rc=$?
  set -e
  t1="$(date +%s%N)"
  printf '[MESURE] %-38s %6d ms\n' "$label" "$(( (t1 - t0) / 1000000 ))"
  return "$rc"
}
fail() { echo "ÉCHEC DU TEST: $*" >&2; exit 1; }
expect_fail() {
  local label="$1"; shift
  if "$@"; then fail "$label devait échouer"; else echo "OK: $label refusé"; fi
}

install_cmd() {
  local label="$1"; shift
  measure "$label" docker exec -i "$CONTAINER" bash -s -- --source /src \
    --no-collect --admin-password "$ADMIN_PWD" --db-password "$DB_PWD" "$@" \
    < "$ROOT/scripts/deploy/install.sh"
}
db_query() {
  local sql="$1"
  docker exec "$CONTAINER" bash -lc '
    PW=$(sed -n "s|.*://[^:]*:\([^@]*\)@.*|\1|p" /etc/radar-cyber/radar.env)
    PGPASSWORD=$PW psql -h 127.0.0.1 -U radar -d radar -At -v ON_ERROR_STOP=1 -c "'"$sql"'"
  '
}
state() { docker exec "$CONTAINER" jq -c "$1" /var/lib/radar-cyber/state.json; }

log "0. Image et machine vierge"
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker run -d --name radar-image-build debian:13 sleep infinity >/dev/null
  docker exec radar-image-build bash -c 'export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq systemd systemd-sysv ca-certificates curl procps python3 >/dev/null'
  docker commit radar-image-build "$IMAGE" >/dev/null
  docker rm -f radar-image-build >/dev/null
fi
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" --hostname radar-fresh --privileged --cgroupns=host \
  -v /sys/fs/cgroup:/sys/fs/cgroup:rw --tmpfs /run --tmpfs /run/lock \
  -e container=docker "$IMAGE" /sbin/init >/dev/null
for _ in $(seq 1 30); do
  [ "$(docker exec "$CONTAINER" systemctl is-system-running 2>/dev/null || true)" = "running" ] && break
  sleep 1
done
docker exec "$CONTAINER" mkdir -p /src
tar --exclude=node_modules --exclude=.git -C "$ROOT" -cf - . \
  | docker exec -i "$CONTAINER" tar -xf - -C /src
echo "Machine vierge prête : $(docker exec "$CONTAINER" cat /etc/os-release | head -1)"

log "1. Installation neuve (état vide : 0 événement)"
install_cmd "installation neuve"
docker exec "$CONTAINER" bash /opt/radar-cyber/current/scripts/deploy/install.sh --check || fail "--check"
[ "$(db_query 'SELECT count(*) FROM event')" = "0" ] || fail "base neuve non vide"
[ "$(db_query 'SELECT count(*) FROM source')" -gt 100 ] || fail "catalogue de sources manquant"
state '.current.status' | grep -q '"ok"' || fail "état non ok"

log "2. Idempotence (rejeu)"
sources_avant="$(db_query 'SELECT count(*) FROM source')"
install_cmd "réinstallation"
[ "$(db_query 'SELECT count(*) FROM source')" = "$sources_avant" ] || fail "sources dupliquées au rejeu"
[ "$(state '.history | length')" -ge 2 ] || fail "historique non conservé"

log "3. Restauration d'une archive sans événement"
docker exec "$CONTAINER" bash -lc '
  PW=$(sed -n "s|.*://[^:]*:\([^@]*\)@.*|\1|p" /etc/radar-cyber/radar.env)
  PGPASSWORD=$PW pg_dump -h 127.0.0.1 -U radar -d radar -Fc \
    --exclude-table-data=event --exclude-table-data=alert \
    --exclude-table-data=indicator --exclude-table-data=quarantine_raw \
    -f /tmp/empty.dump >/dev/null
'
install_cmd "restauration état vide" --restore /tmp/empty.dump
[ "$(db_query 'SELECT count(*) FROM event')" = "0" ] || fail "restauration vide non vide"
state '.current.restore.verified' | grep -q true || fail "restauration non tracée"

log "4. Cas d'erreur"
expect_fail "archive inexistante" docker exec -i "$CONTAINER" bash -s -- \
  --source /src --restore /tmp/introuvable.dump < "$ROOT/scripts/deploy/install.sh"
expect_fail "utilisateur non root" docker exec -u nobody -i "$CONTAINER" bash -s -- \
  --source /src --check < "$ROOT/scripts/deploy/install.sh"

db_query "CREATE TABLE test_marker (id int); INSERT INTO test_marker VALUES (42)" >/dev/null
echo 'garbage not a dump' | docker exec -i "$CONTAINER" tee /tmp/corrupt.dump >/dev/null
expect_fail "dump corrompu" install_cmd "restauration corrompue (rollback auto)" --restore /tmp/corrupt.dump
[ "$(db_query 'SELECT count(*) FROM test_marker')" = "1" ] || fail "snapshot non restauré après échec"
docker exec "$CONTAINER" bash /opt/radar-cyber/current/scripts/deploy/install.sh --check || fail "santé après rollback auto"
state '.current.rollback_label' | grep -q automatique || fail "rollback auto non tracé"

docker exec -d "$CONTAINER" python3 -m http.server 8099 --bind 127.0.0.1
sleep 1
expect_fail "port API occupé" docker exec -i "$CONTAINER" bash -s -- --source /src \
  --api-port 8099 --web-port 5199 < "$ROOT/scripts/deploy/install.sh"
docker exec "$CONTAINER" pkill -f 'http.server 8099' || true

log "5. Retour en arrière manuel"
measure "rollback manuel" docker exec -i "$CONTAINER" bash -s -- --rollback \
  < "$ROOT/scripts/deploy/install.sh"
[ "$(db_query "SELECT count(*) FROM pg_class WHERE relname='test_marker'")" = "0" ] || fail "table témoin toujours présente"
docker exec "$CONTAINER" bash /opt/radar-cyber/current/scripts/deploy/install.sh --check || fail "santé après rollback manuel"

log "Fin des tests — tout est vert."
if [ "$KEEP" != "1" ]; then docker rm -f "$CONTAINER" >/dev/null; echo "Conteneur supprimé (RADAR_TEST_KEEP=1 pour le garder)."; fi
