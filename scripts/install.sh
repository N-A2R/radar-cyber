#!/usr/bin/env bash
# install.sh — déploiement reproductible en une commande sur Debian/Ubuntu neuve.
#
# Installe PostgreSQL 18 (dépôt PGDG), restaure optionnellement un dump, crée
# le schéma, applique les migrations, installe les dépendances, construit le
# front servi par l'API à `/`, installe l'unité radar-api, la démarre et prouve
# que `/` et `/api/health` répondent 200. `--check` rejoue la preuve sans root.
# Rejouable sans duplication ; `--uninstall` retire l'installation
# (les données restent sauf `--purge-data`).
#
#   sudo bash scripts/install.sh --admin-password 'MOT-DE-PASSE' \
#        [--dump /srv/sauvegardes/radar.dump]
#   sudo bash scripts/install.sh --uninstall [--purge-data]
#
# Les secrets ne sont jamais écrits dans l'état : seulement dans l'EnvironmentFile
# du service (0640 root:radar). Les réglages peuvent aussi venir de l'environnement
# (RADAR_DB_PORT, RADAR_DB_NAME, RADAR_DB_USER, RADAR_DB_PASSWORD, RADAR_API_PORT,
# RADAR_REPO_URL, RADAR_REF, RADAR_DB_URL pour une base déjà existante).
set -Eeuo pipefail

VERSION="1.0.0"
PG_VERSION="18"
REPO_URL="${RADAR_REPO_URL:-https://github.com/j0ltdevv/radar-cyber.git}"
REF="${RADAR_REF:-main}"
DB_NAME="${RADAR_DB_NAME:-radar}"
DB_USER="${RADAR_DB_USER:-radar}"
DB_PASSWORD="${RADAR_DB_PASSWORD:-}"
DB_PORT="${RADAR_DB_PORT:-${RADAR_PG_PORT:-5432}}"
DB_URL="${RADAR_DB_URL:-}"
API_PORT="${RADAR_API_PORT:-8080}"
ADMIN_EMAIL="${RADAR_ADMIN_EMAIL:-admin@radar.local}"
ADMIN_PASSWORD="${RADAR_ADMIN_PASSWORD:-}"
SOURCE_DIR="${RADAR_SOURCE_DIR:-}"
INSTALL_DIR="${RADAR_INSTALL_DIR:-/opt/radar-cyber}"
STATE_DIR="${RADAR_STATE_DIR:-/var/lib/radar-cyber}"
UNIT_DIR="${RADAR_UNIT_DIR:-/etc/systemd/system}"
ENV_FILE="${RADAR_ENV_FILE:-/etc/radar-cyber/radar.env}"
SERVICE_USER="${RADAR_SERVICE_USER:-radar}"
DUMP=""
FORCE_RESTORE=0
MODE="install"
PURGE_DATA=0
PNPM_BIN=""
NODE_BIN=""
CLUSTER=""
START_EPOCH="$(date +%s)"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { log "ERREUR: $*"; exit "${2:-1}"; }
usage() {
  cat <<'EOF'
Usage : sudo bash scripts/install.sh [options]

  --source DIR            dépôt local à déployer (défaut : celui du script, sinon clone)
  --repo-url URL          dépôt à cloner si aucun --source (RADAR_REPO_URL)
  --ref REF               branche/tag du clone (RADAR_REF, défaut main)
  --dump FILE             dump .dump (pg_restore) ou .sql (psql) à restaurer
                          avant les migrations ; alias : --restore FILE
  --force-restore         rejoue le dump même si son empreinte est déjà appliquée
  --db-name NAME          base PostgreSQL (défaut radar)
  --db-user USER          rôle PostgreSQL (défaut radar)
  --db-password PWD       mot de passe (défaut : généré, 48 hex)
  --db-port N             port PostgreSQL 18 (défaut 5432)
  --api-port N            port de l'API (défaut 8080)
  --admin-password PWD    crée/aligne le compte admin (optionnel)
  --admin-email EMAIL     e-mail de ce compte (défaut admin@radar.local)
  --uninstall             retire le service et les fichiers installés
  --purge-data            avec --uninstall : supprime aussi base, rôle et cluster
  --check                 vérifie seulement / et /api/health (aucun root requis)
  --help                  cette aide

Variables utiles : RADAR_DB_URL (base existante, aucun paquet/cluster créé),
RADAR_DB_PORT, RADAR_API_PORT, RADAR_INSTALL_DIR, RADAR_STATE_DIR.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE_DIR="${2:-}"; shift 2 ;;
    --repo-url) REPO_URL="${2:-}"; shift 2 ;;
    --ref) REF="${2:-}"; shift 2 ;;
    --dump|--restore) DUMP="${2:-}"; shift 2 ;;
    --force-restore) FORCE_RESTORE=1; shift ;;
    --db-name) DB_NAME="${2:-}"; shift 2 ;;
    --db-user) DB_USER="${2:-}"; shift 2 ;;
    --db-password) DB_PASSWORD="${2:-}"; shift 2 ;;
    --db-port) DB_PORT="${2:-}"; shift 2 ;;
    --api-port) API_PORT="${2:-}"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="${2:-}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:-}"; shift 2 ;;
    --uninstall) MODE="uninstall"; shift ;;
    --purge-data) PURGE_DATA=1; shift ;;
    --check) MODE="check"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "option inconnue : $1 (voir --help)" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || [ "$MODE" = "check" ] || die "cette installation doit être lancée en root (sudo)"
STATE_FILE="$STATE_DIR/install.env"
BACKUP_DIR="$STATE_DIR/backups"

state_get() {
  local key="$1"
  [ -f "$STATE_FILE" ] || return 0
  sed -n "s/^${key}=//p" "$STATE_FILE" | tail -n 1
}
state_set() {
  local key="$1" value="$2"
  mkdir -p "$STATE_DIR"
  umask 077
  if [ -f "$STATE_FILE" ] && grep -q "^${key}=" "$STATE_FILE"; then
    local tmp="$STATE_FILE.tmp"
    awk -v k="$key" -v v="$value" '$0 ~ "^" k "=" {print k "=" v; next} {print}' "$STATE_FILE" > "$tmp"
    mv "$tmp" "$STATE_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$STATE_FILE"
  fi
  chmod 0600 "$STATE_FILE"
  umask 022
}

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
owned_api_port() {
  systemctl is-active --quiet radar-api.service 2>/dev/null || return 1
  grep -Eq "^PORT=${API_PORT}$" "$ENV_FILE" 2>/dev/null
}
check_os() {
  [ -r /etc/os-release ] || die "/etc/os-release absent : distribution non prise en charge"
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-} ${ID_LIKE:-}" in
    debian*|ubuntu*|*debian*|*ubuntu*) ;;
    *) die "distribution non prise en charge : ${PRETTY_NAME:-inconnue} (Debian/Ubuntu attendu)" ;;
  esac
  CODENAME="${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}"
  [ -n "$CODENAME" ] || CODENAME="$(lsb_release -cs 2>/dev/null || true)"
  [ -n "$CODENAME" ] || die "nom de distribution indéterminé (VERSION_CODENAME absent)"
}
preflight() {
  check_os
  [[ "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]] || die "nom de base invalide : $DB_NAME"
  [[ "$DB_USER" =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]] || die "nom de rôle invalide : $DB_USER"
  case "$DB_PORT$API_PORT" in (*[!0-9]*) die "ports invalides : $DB_PORT / $API_PORT" ;; esac
  [ -z "$DUMP" ] || [ -r "$DUMP" ] || die "dump illisible : $DUMP"
  if [ -z "$DB_URL" ] && port_open "$DB_PORT" && [ -z "$(pg_cluster_for_port 2>/dev/null || true)" ]; then
    die "port PostgreSQL $DB_PORT déjà occupé par un autre service"
  fi
  if port_open "$API_PORT" && ! owned_api_port; then
    die "port API $API_PORT déjà occupé par un autre processus"
  fi
}

# --- Paquets ----------------------------------------------------------------
add_repo_key() {
  local key="$1" url="$2" tmp
  [ -s "$key" ] && return 0
  tmp="$key.tmp"
  curl -fsSL "$url" | gpg --dearmor > "$tmp"
  install -m 0644 "$tmp" "$key"
  rm -f "$tmp"
}
ensure_packages() {
  [ "${RADAR_SKIP_PACKAGES:-0}" = "1" ] && { log "Paquets ignorés (RADAR_SKIP_PACKAGES=1)"; return 0; }
  export DEBIAN_FRONTEND=noninteractive
  log "Installation des paquets système…"
  apt-get update -qq >/dev/null
  apt-get install -y -qq ca-certificates curl gnupg jq git procps iproute2 rsync lsb-release openssl >/dev/null

  local key="/usr/share/keyrings/postgresql-archive-keyring.gpg"
  local list="/etc/apt/sources.list.d/radar-postgresql.list"
  local line="deb [signed-by=$key] https://apt.postgresql.org/pub/repos/apt ${CODENAME}-pgdg main"
  add_repo_key "$key" "https://www.postgresql.org/media/keys/ACCC4CF8.asc"
  if [ ! -f "$list" ] || ! grep -Fxq "$line" "$list"; then
    printf '%s\n' "$line" > "$list"
    log "Dépôt PGDG ajouté (${CODENAME}-pgdg)."
  fi
  apt-get update -qq >/dev/null
  apt-get install -y -qq "postgresql-${PG_VERSION}" "postgresql-client-${PG_VERSION}" >/dev/null

  local ok=0 major minor
  if command -v node >/dev/null 2>&1; then
    major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    minor="$(node -v | sed 's/^v//' | cut -d. -f2)"
    if [ "$major" -gt 20 ] || { [ "$major" -eq 20 ] && [ "$minor" -ge 19 ]; }; then ok=1; fi
  fi
  if [ "$ok" -eq 0 ]; then
    local nkey="/usr/share/keyrings/nodesource.gpg"
    local nlist="/etc/apt/sources.list.d/radar-nodesource.list"
    add_repo_key "$nkey" "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key"
    printf '%s\n' "deb [signed-by=$nkey] https://deb.nodesource.com/node_22.x nodistro main" > "$nlist"
    apt-get update -qq >/dev/null
    apt-get install -y -qq nodejs >/dev/null
    log "Node $(node -v) installé depuis NodeSource."
  fi
  if ! command -v pnpm >/dev/null 2>&1 || [ "$(pnpm -v 2>/dev/null || true)" != "12.15.0" ]; then
    npm install -g --silent pnpm@12.15.0 >/dev/null
  fi
  PNPM_BIN="$(command -v pnpm)"
  NODE_BIN="$(command -v node)"
  [ -n "$PNPM_BIN" ] && [ -n "$NODE_BIN" ] || die "node/pnpm introuvables après installation"
  log "Versions : PostgreSQL $(psql --version | awk '{print $3}'), $(node -v), pnpm $(pnpm -v)"
}

# --- PostgreSQL -------------------------------------------------------------
pg_clusters() { pg_lsclusters -h 2>/dev/null || true; }
pg_cluster_for_port() {
  pg_clusters | awk -v v="$PG_VERSION" -v p="$DB_PORT" '$1 == v && $3 == p {print $2; exit}'
}
pg_cluster_exists() {
  pg_clusters | awk -v v="$PG_VERSION" -v c="$1" '$1 == v && $2 == c {found=1} END {exit !found}'
}
ensure_postgres() {
  [ -z "$DB_URL" ] || { log "Base externe fournie : aucun cluster créé."; return 0; }
  if [ -n "${RADAR_PG_CLUSTER:-}" ]; then
    CLUSTER="$RADAR_PG_CLUSTER"
  else
    CLUSTER="$(pg_cluster_for_port)"
    [ -n "$CLUSTER" ] || CLUSTER="radar"
  fi

  if ! pg_cluster_exists "$CLUSTER"; then
    # Sur un port non standard on isme dans un cluster dédié ; sur 5432 on
    # utilise le cluster main créé par le paquet quand il est libre.
    if [ "$DB_PORT" = "5432" ] && [ -z "${RADAR_PG_CLUSTER:-}" ]; then CLUSTER="main"; fi
    log "Création du cluster PostgreSQL ${PG_VERSION}/${CLUSTER} sur ${DB_PORT}…"
    pg_createcluster "$PG_VERSION" "$CLUSTER" -p "$DB_PORT" >/dev/null
    state_set OWNED_CLUSTER 1
  else
    local current
    current="$(pg_clusters | awk -v v="$PG_VERSION" -v c="$CLUSTER" '$1 == v && $2 == c {print $3}')"
    if [ "$current" != "$DB_PORT" ]; then
      log "Alignement du port du cluster ${PG_VERSION}/${CLUSTER} : $current → $DB_PORT"
      pg_conftool "$PG_VERSION" "$CLUSTER" set port "$DB_PORT"
    fi
  fi
  state_set PG_CLUSTER "$CLUSTER"
  state_set DB_PORT "$DB_PORT"

  if ! pg_clusters | awk -v v="$PG_VERSION" -v c="$CLUSTER" '$1 == v && $2 == c && $4 == "online" {found=1} END {exit !found}'; then
    pg_ctlcluster "$PG_VERSION" "$CLUSTER" start
  fi
  systemctl enable "postgresql@${PG_VERSION}-${CLUSTER}.service" >/dev/null 2>&1 || true
  local i
  for i in $(seq 1 30); do
    if pg_isready -h /var/run/postgresql -p "$DB_PORT" -q; then
      log "PostgreSQL ${PG_VERSION} prêt sur ${DB_PORT} (cluster ${CLUSTER})."
      return 0
    fi
    sleep 1
  done
  die "PostgreSQL ${PG_VERSION} ne répond pas sur ${DB_PORT} (journal : journalctl -u postgresql@${PG_VERSION}-${CLUSTER})"
}
admin_psql() {
  runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -At -h /var/run/postgresql -p "$DB_PORT" -d postgres "$@"
}
ensure_role_db() {
  [ -z "$DB_URL" ] || return 0
  if [ "$(admin_psql -c "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" 2>/dev/null || true)" != "1" ]; then
    admin_psql -v role="$DB_USER" -v pass="$DB_PASSWORD" >/dev/null <<'SQL'
CREATE ROLE :"role" LOGIN PASSWORD :'pass';
SQL
    state_set OWNED_ROLE 1
    log "Rôle $DB_USER créé."
  else
    admin_psql -v role="$DB_USER" -v pass="$DB_PASSWORD" >/dev/null <<'SQL'
ALTER ROLE :"role" WITH LOGIN PASSWORD :'pass';
SQL
    log "Rôle $DB_USER existant (mot de passe aligné)."
  fi
  if [ "$(admin_psql -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || true)" != "1" ]; then
    admin_psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER" >/dev/null
    state_set OWNED_DB 1
    log "Base $DB_NAME créée."
  else
    log "Base $DB_NAME existante (propriétaire aligné)."
  fi
  admin_psql -c "ALTER DATABASE $DB_NAME OWNER TO $DB_USER" >/dev/null
  local encoded
  encoded="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$DB_PASSWORD")"
  DB_URL="postgres://$DB_USER:$encoded@127.0.0.1:$DB_PORT/$DB_NAME"
  state_set DB_NAME "$DB_NAME"
  state_set DB_USER "$DB_USER"
}
db_psql() { psql -X -v ON_ERROR_STOP=1 "$DB_URL" "$@"; }
db_has_schema() {
  local n
  n="$(db_psql -At -c "SELECT count(*) FROM pg_catalog.pg_class WHERE relname IN ('event','org','source') AND relkind='r'" 2>/dev/null || echo 0)"
  [ "${n:-0}" -ge 3 ]
}

# --- Code, dépendances, build ------------------------------------------------
resolve_source() {
  if [ -z "$SOURCE_DIR" ]; then
    local here
    here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)"
    if [ -n "$here" ] && [ -f "$here/package.json" ] && [ -f "$here/scripts/install.sh" ]; then
      SOURCE_DIR="$here"
    else
      SOURCE_DIR="$INSTALL_DIR/source"
      if [ -d "$SOURCE_DIR/.git" ]; then
        git -C "$SOURCE_DIR" fetch --quiet --depth 1 origin "$REF"
        git -C "$SOURCE_DIR" checkout --quiet --force FETCH_HEAD
      else
        mkdir -p "$(dirname "$SOURCE_DIR")"
        git clone --quiet --depth 1 --branch "$REF" "$REPO_URL" "$SOURCE_DIR"
      fi
    fi
  fi
  SOURCE_DIR="$(realpath "$SOURCE_DIR")"
  for f in package.json pnpm-lock.yaml db/init.sql scripts/migrate.mts scripts/create-admin.mts scripts/deploy/systemd/radar-api.service; do
    [ -f "$SOURCE_DIR/$f" ] || die "source invalide : $f absent dans $SOURCE_DIR"
  done
  log "Source : $SOURCE_DIR"
}
ensure_code() {
  local sha tmp
  sha="$(git -C "$SOURCE_DIR" rev-parse --short HEAD 2>/dev/null || printf 'local')"
  RELEASE_DIR="$INSTALL_DIR/releases/$sha"
  if [ -f "$RELEASE_DIR/apps/api/node_modules/.bin/tsx" ] && [ -f "$RELEASE_DIR/apps/web/dist/index.html" ]; then
    log "Release $sha déjà construite ; réutilisation."
  else
    tmp="$RELEASE_DIR.tmp.$$"
    rm -rf "$tmp"
    mkdir -p "$tmp"
    tar -C "$SOURCE_DIR" --exclude='./.git' --exclude='./node_modules' --exclude='./apps/*/node_modules' \
        --exclude='./.smoke-out' -cf - . | tar -C "$tmp" -xf -
    rm -rf "$RELEASE_DIR"
    mv "$tmp" "$RELEASE_DIR"
    log "Release $sha copiée."
  fi
  ln -sfn "$RELEASE_DIR" "$INSTALL_DIR/current"
  CURRENT_DIR="$INSTALL_DIR/current"
  (cd "$CURRENT_DIR" && "$PNPM_BIN" install --frozen-lockfile)
  (cd "$CURRENT_DIR" && "$PNPM_BIN" -F @radar/web build)
  [ -f "$CURRENT_DIR/apps/web/dist/index.html" ] || die "front non construit : apps/web/dist/index.html absent"
  log "Dépendances installées et front construit ($CURRENT_DIR/apps/web/dist)."
}

# --- Données -----------------------------------------------------------------
restore_dump() {
  [ -n "$DUMP" ] || { log "Aucun dump fourni."; return 0; }
  local hash marker
  hash="$(sha256sum "$DUMP" | awk '{print $1}')"
  marker="$STATE_DIR/dump.sha256"
  if [ "${FORCE_RESTORE:-0}" != "1" ] && [ "$(cat "$marker" 2>/dev/null || true)" = "$hash" ] && db_has_schema; then
    log "Dump déjà restauré (sha256=$hash) ; restoration ignorée."
    return 0
  fi
  mkdir -p "$BACKUP_DIR"
  if db_has_schema; then
    local snap="$BACKUP_DIR/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"
    pg_dump "$DB_URL" -Fc -f "$snap"
    chmod 0600 "$snap"
    log "Snapshot avant restauration : $snap"
  fi
  log "Restauration de $DUMP (sha256=$hash)…"
  if [ "$(head -c 5 "$DUMP")" = "PGDMP" ]; then
    pg_restore --exit-on-error --clean --if-exists --no-owner --no-privileges -d "$DB_URL" "$DUMP"
  else
    db_psql -f "$DUMP" >/dev/null
  fi
  db_has_schema || die "dump restauré sans tables event/org/source : $DUMP"
  printf '%s\n' "$hash" > "$marker"
  chmod 0600 "$marker"
  log "Restauration vérifiée (empreinte enregistrée)."
}
ensure_schema() {
  restore_dump
  if ! db_has_schema; then
    log "Schéma de base absent : application de db/init.sql…"
    db_psql -f "$CURRENT_DIR/db/init.sql" >/dev/null
  fi
  (cd "$CURRENT_DIR" && DATABASE_URL="$DB_URL" "$CURRENT_DIR/apps/api/node_modules/.bin/tsx" scripts/migrate.mts)
  local applied total
  applied="$(db_psql -At -c 'SELECT count(*) FROM schema_migrations' 2>/dev/null || echo 0)"
  total="$(find "$CURRENT_DIR/db" -maxdepth 1 -name 'migrate-*.sql' | wc -l)"
  log "Migrations : $applied/$total appliquées."
  if [ -n "$ADMIN_PASSWORD" ]; then
    (cd "$CURRENT_DIR" && DATABASE_URL="$DB_URL" RADAR_ADMIN_EMAIL="$ADMIN_EMAIL" RADAR_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
      "$CURRENT_DIR/apps/api/node_modules/.bin/tsx" scripts/create-admin.mts "$ADMIN_EMAIL")
    log "Compte administrateur $ADMIN_EMAIL vérifié."
  fi
}

# --- Service ----------------------------------------------------------------
ensure_user_dirs() {
  if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --home-dir "$STATE_DIR" --shell /usr/sbin/nologin --user-group "$SERVICE_USER"
    state_set OWNED_USER 1
    log "Utilisateur système $SERVICE_USER créé."
  fi
  mkdir -p "$STATE_DIR" "$INSTALL_DIR" "$(dirname "$ENV_FILE")"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR" "$STATE_DIR"
  chmod 0750 "$STATE_DIR"
}
write_env_file() {
  local path
  path="$(dirname "${NODE_BIN:-$(command -v node)}"):$(dirname "$PNPM_BIN")"
  umask 077
  cat > "$ENV_FILE" <<EOF
# Généré par scripts/install.sh v$VERSION — $(date -u +%Y-%m-%dT%H:%M:%SZ)
DATABASE_URL=$DB_URL
NODE_ENV=production
HOME=$STATE_DIR
PATH=$path:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
PORT=$API_PORT
HOST=127.0.0.1
RADAR_API_PORT=$API_PORT
RADAR_COLLECT=${RADAR_COLLECT:-1}
EOF
  chown "root:$SERVICE_USER" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  umask 022
}
install_unit() {
  local tpl="$CURRENT_DIR/scripts/deploy/systemd/radar-api.service"
  [ -f "$tpl" ] || die "modèle systemd absent : $tpl"
  sed -e "s|@PNPM@|$PNPM_BIN|g" \
      -e "s|/opt/radar-cyber/current|$CURRENT_DIR|g" \
      -e "s|/opt/radar-cyber|$INSTALL_DIR|g" \
      -e "s|/var/lib/radar-cyber|$STATE_DIR|g" \
      -e "s|/etc/radar-cyber/radar.env|$ENV_FILE|g" \
      -e "s|^User=radar\$|User=$SERVICE_USER|" \
      -e "s|^Group=radar\$|Group=$SERVICE_USER|" \
      "$tpl" > "$UNIT_DIR/radar-api.service"
  chmod 0644 "$UNIT_DIR/radar-api.service"
  systemctl daemon-reload
  systemctl enable radar-api.service >/dev/null
  systemctl reset-failed radar-api.service 2>/dev/null || true
  systemctl restart radar-api.service
  log "Unité radar-api installée et démarrée."
}
verify_endpoints() {
  local i code body tmp asset asset_code health_ok=0
  for cmd in curl jq; do
    command -v "$cmd" >/dev/null 2>&1 || die "commande requise absente : $cmd"
  done
  tmp="$(mktemp)"
  for i in $(seq 1 30); do
    if [ "$MODE" = "check" ] || systemctl is-active --quiet radar-api.service 2>/dev/null; then
      code="$(curl -sS -o "$tmp" -w '%{http_code}' --max-time 5 "http://127.0.0.1:$API_PORT/api/health" 2>/dev/null || echo 000)"
      body="$(cat "$tmp")"
      if [ "$code" = "200" ] && printf '%s' "$body" | jq -e '.ok == true' >/dev/null 2>&1; then
        health_ok=1
        break
      fi
    fi
    sleep 2
  done
  if [ "$health_ok" -ne 1 ]; then
    rm -f "$tmp"
    journalctl -u radar-api.service -n 50 --no-pager 2>/dev/null || true
    die "/api/health ne répond pas 200"
  fi
  log "PREUVE : GET http://127.0.0.1:$API_PORT/api/health → HTTP $code $body"

  code="$(curl -sS -o "$tmp" -w '%{http_code}' --max-time 5 "http://127.0.0.1:$API_PORT/" 2>/dev/null || echo 000)"
  body="$(cat "$tmp")"
  asset="$(printf '%s' "$body" | grep -oE '/assets/[A-Za-z0-9._-]+\.js' | head -n 1 || true)"
  if [ "$code" = "200" ] && printf '%s' "$body" | grep -q 'id="root"' && [ -n "$asset" ]; then
    asset_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$API_PORT$asset" 2>/dev/null || echo 000)"
    if [ "$asset_code" = "200" ]; then
      log "PREUVE : GET http://127.0.0.1:$API_PORT/ → HTTP 200 (shell React, $asset → HTTP 200)"
      rm -f "$tmp"
      return 0
    fi
    log "Point d'entrée $asset en HTTP $asset_code"
  else
    log "Racine en HTTP $code, shell React ou point d'entrée JS absent"
  fi
  rm -f "$tmp"
  journalctl -u radar-api.service -n 50 --no-pager 2>/dev/null || true
  die "/ ne sert pas l'interface (front non construit ou API obsolète ?)"
}

# --- Désinstallation ---------------------------------------------------------
do_uninstall() {
  log "Désinstallation de radar-api…"
  if systemctl list-unit-files radar-api.service >/dev/null 2>&1; then
    systemctl stop radar-api.service 2>/dev/null || true
    systemctl disable radar-api.service >/dev/null 2>&1 || true
  fi
  rm -f "$UNIT_DIR/radar-api.service" "$ENV_FILE"
  rmdir "$(dirname "$ENV_FILE")" 2>/dev/null || true
  systemctl daemon-reload 2>/dev/null || true

  local owned_user owned_db owned_role owned_cluster cluster
  owned_user="$(state_get OWNED_USER || true)"
  owned_db="$(state_get OWNED_DB || true)"
  owned_role="$(state_get OWNED_ROLE || true)"
  owned_cluster="$(state_get OWNED_CLUSTER || true)"
  cluster="$(state_get PG_CLUSTER || true)"
  DB_PORT="$(state_get DB_PORT || printf '%s' "$DB_PORT")"
  DB_NAME="$(state_get DB_NAME || printf '%s' "$DB_NAME")"
  DB_USER="$(state_get DB_USER || printf '%s' "$DB_USER")"

  if [ "$PURGE_DATA" -eq 1 ] && [ -z "$DB_URL" ]; then
    if command -v pg_lsclusters >/dev/null 2>&1 && pg_cluster_exists "${cluster:-radar}"; then
      if [ "$owned_db" = "1" ]; then
        admin_psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid()" >/dev/null 2>&1 || true
        admin_psql -c "DROP DATABASE IF EXISTS $DB_NAME" >/dev/null
        log "Base $DB_NAME supprimée."
      fi
      if [ "$owned_role" = "1" ]; then
        admin_psql -c "DROP ROLE IF EXISTS $DB_USER" >/dev/null || log "AVERTISSEMENT: rôle $DB_USER non supprimé (objets dépendants)"
      fi
      if [ "$owned_cluster" = "1" ]; then
        pg_dropcluster --stop "$PG_VERSION" "$cluster"
        log "Cluster ${PG_VERSION}/${cluster} supprimé."
      fi
    fi
  else
    log "Données conservées (base $DB_NAME, rôle $DB_USER)."
    log "Pour les supprimer : sudo bash scripts/install.sh --uninstall --purge-data"
  fi

  if [ "$owned_user" = "1" ] && id -u "$SERVICE_USER" >/dev/null 2>&1; then
    userdel "$SERVICE_USER" 2>/dev/null || log "AVERTISSEMENT: utilisateur $SERVICE_USER non supprimé"
  fi
  rm -rf "$INSTALL_DIR" "$STATE_DIR"
  log "Désinstallation terminée."
  return 0
}

if [ "$MODE" = "check" ]; then
  verify_endpoints
  exit 0
fi
if [ "$MODE" = "uninstall" ]; then do_uninstall; exit 0; fi

if [ -z "$DB_PASSWORD" ]; then
  DB_PASSWORD="$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  log "Mot de passe PostgreSQL généré (non affiché)."
fi
preflight
T0="$(date +%s%N)"
ensure_packages
ensure_postgres
ensure_role_db
resolve_source
ensure_code
ensure_schema
ensure_user_dirs
write_env_file
install_unit
verify_endpoints
T1="$(date +%s%N)"
log "Installation terminée : $(( (T1 - T0) / 1000000 )) ms (total $(( $(date +%s) - START_EPOCH )) s)."
log "API : http://127.0.0.1:$API_PORT/api/health — interface : http://127.0.0.1:$API_PORT/"
log "Preuve rejouable : bash scripts/install.sh --check --api-port $API_PORT"
