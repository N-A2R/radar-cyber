#!/usr/bin/env bash
# install.sh — installation de production Radar Cyber en une commande.
#
# Pensé pour une machine Debian/Ubuntu neuve : il installe les paquets,
# PostgreSQL, le schéma, les migrations, l'éventuelle restauration, le build,
# les unités systemd, la sonde de santé, puis il consigne un état permettant le
# retour en arrière. Relançable à volonté (idempotent) ; chaque passage crée
# une release immuable sous /opt/radar-cyber/releases et conserve un dump de la
# base avant toute migration ou restauration.
#
#   sudo bash scripts/deploy/install.sh --admin-password '...' [--restore DUMP]
#
# Le script peut aussi être pipé depuis curl : sans --source, il clone
# RADAR_REPO_URL (défaut : dépôt officiel) sur RADAR_REF (défaut : main).
#
# Modes : install (défaut), --rollback [--to ID], --check, --dry-run.
set -Eeuo pipefail

INSTALLER_VERSION="1.0.0"

# --- Valeurs par défaut ----------------------------------------------------
MODE="install"
SOURCE=""
REPO_URL="${RADAR_REPO_URL:-https://github.com/N-A2R/radar-cyber.git}"
REF="${RADAR_REF:-main}"
DB_NAME="${RADAR_DB_NAME:-radar}"
DB_USER="${RADAR_DB_USER:-radar}"
DB_PASSWORD="${RADAR_DB_PASSWORD:-}"
DB_HOST="127.0.0.1"
PG_PORT="${RADAR_PG_PORT:-5432}"
API_PORT="${RADAR_API_PORT:-8080}"
WEB_PORT="${RADAR_WEB_PORT:-5173}"
PUBLIC=0
ADMIN_EMAIL="${RADAR_ADMIN_EMAIL:-admin@radar.local}"
ADMIN_PASSWORD="${RADAR_ADMIN_PASSWORD:-}"
RESTORE=""
PASSPHRASE_FILE="${PASSPHRASE_FILE:-}"
STRICT_DATA=0
COLLECT=1
AUTO_ROLLBACK=1
DRY_RUN=0
ROLLBACK_TO=""
INSTALL_ACTIVE=0
FAILURE_HANDLED=0
RELEASE_DIR=""

RELEASE_ROOT="/opt/radar-cyber"
STATE_DIR="/var/lib/radar-cyber"
STATE_FILE="$STATE_DIR/state.json"
BACKUP_DIR="$STATE_DIR/backups"
CONFIG_DIR="/etc/radar-cyber"
ENV_FILE="$CONFIG_DIR/radar.env"
RADAR_HOME="/var/lib/radar-cyber"
SERVICE_USER="radar"
LOG_FILE=""
PNPM_BIN=""
DB_URL=""
CURRENT_STEP="démarrage"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_EPOCH="$(date +%s)"

declare -a STEP_TIMINGS=()

# --- Utilitaires -----------------------------------------------------------
log() {
  local line
  line="$(printf '[%s] %s' "$(date '+%Y-%m-%d %H:%M:%S')" "$*")"
  if [ -n "$LOG_FILE" ]; then
    printf '%s\n' "$line" | tee -a "$LOG_FILE"
  else
    printf '%s\n' "$line"
  fi
}
log_plain() { printf '%s\n' "$*" >> "$LOG_FILE" 2>/dev/null || true; }
die() {
  log "ERREUR: $*"
  if [ "$FAILURE_HANDLED" -eq 1 ] || [ "$INSTALL_ACTIVE" -eq 0 ]; then exit "${2:-1}"; fi
  FAILURE_HANDLED=1
  handle_failure "${2:-1}"
}
usage() {
  cat <<'EOF'
Usage : sudo bash install.sh [options]

Installation :
  --source DIR            dépôt local à déployer (défaut : celui du script, sinon clone)
  --repo-url URL          dépôt à cloner si aucun --source (RADAR_REPO_URL)
  --ref REF               branche/tag à cloner (RADAR_REF, défaut main)
  --admin-password PWD    mot de passe admin (défaut : généré, 48 hex)
  --admin-email EMAIL     e-mail admin (défaut admin@radar.local)
  --db-password PWD       mot de passe PostgreSQL (défaut : généré, 48 hex)
  --db-name NAME          base (défaut radar)      --db-user USER (défaut radar)
  --pg-port N             port PostgreSQL (défaut 5432)
  --api-port N            port API (défaut 8080)   --web-port N (défaut 5173)
  --public                écoute API/web sur 0.0.0.0 (défaut 127.0.0.1)
  --restore ARCHIVE       dump .dump/.sql (ou .gpg) à restaurer avant bootstrap
  --passphrase-file FILE  phrase secrète d'une archive .gpg
  --strict-data           échoue si la restauration ne contient aucun événement
  --no-collect            démarre l'API avec RADAR_COLLECT=0
  --no-rollback           ne restaure pas automatiquement en cas d'échec
  --dry-run               affiche le plan sans rien modifier

Autres modes :
  --check                 vérifie une installation existante (aucune écriture)
  --rollback [--to ID]    revient à la release précédente ou à l'ID indiquée
  --help                  cette aide
EOF
}

# --- Analyse des arguments -------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE="${2:-}"; shift 2 ;;
    --repo-url) REPO_URL="${2:-}"; shift 2 ;;
    --ref) REF="${2:-}"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="${2:-}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:-}"; shift 2 ;;
    --db-password) DB_PASSWORD="${2:-}"; shift 2 ;;
    --db-name) DB_NAME="${2:-}"; shift 2 ;;
    --db-user) DB_USER="${2:-}"; shift 2 ;;
    --pg-port) PG_PORT="${2:-}"; shift 2 ;;
    --api-port) API_PORT="${2:-}"; shift 2 ;;
    --web-port) WEB_PORT="${2:-}"; shift 2 ;;
    --restore) RESTORE="${2:-}"; shift 2 ;;
    --passphrase-file) PASSPHRASE_FILE="${2:-}"; shift 2 ;;
    --to) ROLLBACK_TO="${2:-}"; shift 2 ;;
    --public) PUBLIC=1; shift ;;
    --strict-data) STRICT_DATA=1; shift ;;
    --no-collect) COLLECT=0; shift ;;
    --no-rollback) AUTO_ROLLBACK=0; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --check) MODE="check"; shift ;;
    --rollback) MODE="rollback"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "option inconnue : $1 (voir --help)" ;;
  esac
done

# --- Contrôles avant toute mutation ---------------------------------------
if [ "$EUID" -ne 0 ]; then
  echo "ERREUR: cette installation doit être lancée en root (sudo bash ...)." >&2
  exit 1
fi
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    debian|ubuntu) ;;
    *) echo "ERREUR: distribution non prise en charge (${ID:-inconnue}); Debian 12+ ou Ubuntu 22.04+ attendu." >&2; exit 1 ;;
  esac
fi
for pair in "pg:$PG_PORT" "api:$API_PORT" "web:$WEB_PORT"; do
  port="${pair#*:}"; name="${pair%%:*}"
  [[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || die "port $name invalide : $port"
done
[[ "$DB_NAME" =~ ^[a-zA-Z][a-zA-Z0-9_]*$ ]] || die "nom de base invalide : $DB_NAME"
[[ "$DB_USER" =~ ^[a-zA-Z][a-zA-Z0-9_]*$ ]] || die "nom d'utilisateur invalide : $DB_USER"
[[ "$ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || die "e-mail admin invalide : $ADMIN_EMAIL"
if [ -n "$RESTORE" ]; then
  [ -r "$RESTORE" ] || die "archive de restauration illisible : $RESTORE"
  case "$RESTORE" in
    *.gpg)
      [ -n "$PASSPHRASE_FILE" ] || die "archive chiffrée : --passphrase-file est obligatoire"
      [ -r "$PASSPHRASE_FILE" ] || die "fichier de phrase secrète illisible : $PASSPHRASE_FILE"
      ;;
  esac
fi
if [ "$MODE" = "install" ] && [ "$DRY_RUN" -eq 0 ] && [ "$AUTO_ROLLBACK" -eq 1 ] && [ -f "$STATE_FILE" ]; then
  running="$(jq -r '.current.status // empty' "$STATE_FILE" 2>/dev/null || true)"
  [ "$running" != "in-progress" ] || die "une installation est en cours ou interrompue ; relancer avec --no-rollback ou --rollback"
fi

# Un port déjà occupé par un processus tiers est refusé avant tout changement :
# mieux vaut un message clair qu'un service systemd en boucle de redémarrage.
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
owned_port() {
  # Un service radar actif ne légitime le port que s'il écoute déjà dessus :
  # comparer les ports configurés évite de confondre « actif sur 8080 » et
  # « port 8099 libre ».
  local unit="$1" var="$2" port="$3" configured=""
  [ -f "$ENV_FILE" ] && configured="$(sed -n "s/^$var=//p" "$ENV_FILE" | head -1)"
  systemctl is-active --quiet "$unit.service" 2>/dev/null && [ "$configured" = "$port" ]
}
if [ "$MODE" = "install" ] && [ "$DRY_RUN" -eq 0 ]; then
  if port_open "$API_PORT" && ! owned_port radar-api PORT "$API_PORT"; then
    die "port API $API_PORT déjà occupé par un autre processus"
  fi
  if port_open "$WEB_PORT" && ! owned_port radar-web WEB_PORT "$WEB_PORT"; then
    die "port web $WEB_PORT déjà occupé par un autre processus"
  fi
fi

# --- Journal ---------------------------------------------------------------
if [ "$MODE" != "check" ] && [ "$DRY_RUN" -eq 0 ]; then
  mkdir -p "$STATE_DIR" "$BACKUP_DIR"
  LOG_FILE="$STATE_DIR/install.log"
  : >> "$LOG_FILE"
else
  LOG_FILE="$(mktemp /tmp/radar-install.XXXXXX.log)"
fi

log "Radar Cyber installateur v$INSTALLER_VERSION — mode=$MODE dry_run=$DRY_RUN pid=$$"
log "Cible : DB $DB_USER@$DB_HOST:$PG_PORT/$DB_NAME — API $API_PORT — web $WEB_PORT — public=$PUBLIC"
if [ -n "$RESTORE" ]; then log "Restauration demandée : $RESTORE"; fi

# --- Mesure de temps -------------------------------------------------------
step() {
  local name="$1"; shift
  local t0 t1 ms
  CURRENT_STEP="$name"
  t0="$(date +%s%3N)"
  log "→ $name"
  if [ "$DRY_RUN" -eq 1 ]; then
    log "  (dry-run : $name non exécuté)"
    STEP_TIMINGS+=("$name"$'\t'"0")
    return 0
  fi
  "$@"
  t1="$(date +%s%3N)"
  ms=$((t1 - t0))
  STEP_TIMINGS+=("$name"$'\t'"$ms")
  log "✓ $name (${ms} ms)"
}

# --- Paquets et versions ---------------------------------------------------
ensure_packages() {
  export DEBIAN_FRONTEND=noninteractive
  local packages="postgresql postgresql-client curl jq git ca-certificates openssl npm rsync procps iproute2"
  case "$RESTORE" in *.gpg) packages="$packages gnupg" ;; esac
  apt-get update -qq >/dev/null
  # shellcheck disable=SC2086
  apt-get install -y -qq $packages >/dev/null

  local node_major node_minor
  node_major="$(node -v | sed 's/^v//' | cut -d. -f1)"
  node_minor="$(node -v | sed 's/^v//' | cut -d. -f2)"
  [ "$node_major" -gt 20 ] || { [ "$node_major" -eq 20 ] && [ "$node_minor" -ge 19 ]; } || die "Node >= 20.19 requis, trouvé $(node -v)"
  if ! command -v pnpm >/dev/null 2>&1 || [ "$(pnpm -v 2>/dev/null || true)" != "12.15.0" ]; then
    npm install -g --silent pnpm@12.15.0 >/dev/null
  fi
  PNPM_BIN="$(command -v pnpm)"
  [ -n "$PNPM_BIN" ] || die "pnpm introuvable après installation"
  log "  node=$(node -v) pnpm=$(pnpm -v) psql=$(psql --version | awk '{print $3}')"
}

# --- Source ----------------------------------------------------------------
resolve_source() {
  if [ -n "$SOURCE" ]; then
    SOURCE="$(realpath "$SOURCE")"
  elif [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  else
    # Mode pipé (curl | sudo bash) : on clone dans un répertoire Stable.
    SOURCE="$RELEASE_ROOT/source"
    if [ -d "$SOURCE/.git" ]; then
      git -C "$SOURCE" fetch --quiet --depth 1 origin "$REF"
      git -C "$SOURCE" checkout --quiet --force FETCH_HEAD
    else
      mkdir -p "$(dirname "$SOURCE")"
      git clone --quiet --depth 1 --branch "$REF" "$REPO_URL" "$SOURCE"
    fi
  fi
  [ -f "$SOURCE/package.json" ] && [ -f "$SOURCE/scripts/bootstrap.mts" ] && [ -f "$SOURCE/scripts/healthcheck.sh" ] \
    || die "source invalide : $SOURCE (package.json / scripts/bootstrap.mts / scripts/healthcheck.sh attendus)"
  log "  source : $SOURCE"
}

# --- Utilisateur, répertoires, secrets ------------------------------------
ensure_user_dirs() {
  if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --home-dir "$RADAR_HOME" --shell /usr/sbin/nologin --user-group "$SERVICE_USER"
    log "  utilisateur système $SERVICE_USER créé"
  else
    log "  utilisateur système $SERVICE_USER déjà présent"
  fi
  mkdir -p "$RELEASE_ROOT/releases" "$RADAR_HOME" "$RADAR_HOME/.local/share" "$CONFIG_DIR" "$BACKUP_DIR"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$RELEASE_ROOT" "$RADAR_HOME"
  chmod 0755 "$RELEASE_ROOT" "$RELEASE_ROOT/releases"
  chmod 0750 "$CONFIG_DIR" "$BACKUP_DIR"
}

write_env_file() {
  local target="$1" api="$2" web="$3" collect="${4:-$COLLECT}" public="${5:-$PUBLIC}"
  local api_host="127.0.0.1" web_host="127.0.0.1"
  [ "$public" -eq 1 ] && { api_host="0.0.0.0"; web_host="0.0.0.0"; }
  umask 077
  cat > "$target" <<EOF
# Généré par radar installateur v$INSTALLER_VERSION — $(date -u +%Y-%m-%dT%H:%M:%SZ)
DATABASE_URL=$DB_URL
NODE_ENV=production
HOME=$RADAR_HOME
PATH=/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin
PORT=$api
HOST=$api_host
WEB_PORT=$web
WEB_HOST=$web_host
API_PROXY_TARGET=http://127.0.0.1:$api
RADAR_COLLECT=$collect
RADAR_ADMIN_EMAIL=$ADMIN_EMAIL
RADAR_ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF
  chown root:"$SERVICE_USER" "$target"
  chmod 0640 "$target"
  umask 022
}

# --- PostgreSQL ------------------------------------------------------------
psql_admin() { runuser -u postgres -- psql -v ON_ERROR_STOP=1 -At -d postgres "$@"; }
psql_db() { PGPASSWORD="$DB_PASSWORD" psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$PG_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"; }

ensure_postgres() {
  systemctl enable --now postgresql.service >/dev/null
  local i ready=0
  for i in $(seq 1 40); do
    if pg_isready -h "$DB_HOST" -p "$PG_PORT" -q; then ready=1; break; fi
    sleep 1
  done
  [ "$ready" -eq 1 ] || die "PostgreSQL ne répond pas sur $DB_HOST:$PG_PORT (journal : journalctl -u postgresql)"

  local role db
  role="$(psql_admin -c "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" || true)"
  if [ -z "$role" ]; then
    psql_admin -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD'" >/dev/null
    jq --argjson v true '.current.created_role = $v' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    log "  rôle $DB_USER créé"
  else
    psql_admin -c "ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD'" >/dev/null
    log "  rôle $DB_USER existant (mot de passe aligné)"
  fi
  db="$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" || true)"
  if [ -z "$db" ]; then
    psql_admin -c "CREATE DATABASE $DB_NAME OWNER $DB_USER" >/dev/null
    jq --argjson v true '.current.created_db = $v' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    log "  base $DB_NAME créée"
  else
    psql_admin -c "ALTER DATABASE $DB_NAME OWNER TO $DB_USER" >/dev/null
    log "  base $DB_NAME existante"
  fi
  DB_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$PG_PORT/$DB_NAME"
}

db_has_schema() {
  local n
  n="$(psql_db -At -c "SELECT count(*) FROM pg_catalog.pg_class WHERE relname IN ('event','org','source') AND relkind='r'" 2>/dev/null || echo 0)"
  [ "${n:-0}" -ge 3 ]
}

snapshot_db() {
  if ! db_has_schema; then
    log "  base neuve : aucun snapshot à prendre"
    return 0
  fi
  local snap="$BACKUP_DIR/pre-$(date -u +%Y%m%dT%H%M%SZ).dump"
  PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$PG_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc -f "$snap"
  chmod 0600 "$snap"
  jq --arg s "$snap" '.current.snapshot = $s' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
  log "  snapshot de sécurité : $snap ($(stat -c%s "$snap") octets)"
}

drop_and_recreate_db() {
  psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid()" >/dev/null || true
  psql_admin -c "DROP DATABASE IF EXISTS $DB_NAME" >/dev/null
  psql_admin -c "CREATE DATABASE $DB_NAME OWNER $DB_USER" >/dev/null
}

restore_archive() {
  [ -n "$RESTORE" ] || { log "  aucune archive fournie"; return 0; }
  local plain="$RESTORE" tmp=""
  if [[ "$RESTORE" == *.gpg ]]; then
    tmp="$(mktemp /tmp/radar-restore.XXXXXX.dump)"
    gpg --batch --yes --quiet --pinentry-mode loopback \
      --passphrase-file "$PASSPHRASE_FILE" --decrypt --output "$tmp" "$RESTORE" \
      || die "déchiffrement impossible : $RESTORE"
    plain="$tmp"
  fi
  local fmt="inconnu"
  if pg_restore --list "$plain" >/dev/null 2>&1; then fmt="custom/tar"; else fmt="sql"; fi
  log "  format détecté : $fmt"

  drop_and_recreate_db
  if [ "$fmt" = "custom/tar" ]; then
    pg_restore --dbname "$DB_URL" --no-owner --no-privileges --exit-on-error "$plain" \
      || die "pg_restore a échoué sur $RESTORE"
  else
    psql_db -v ON_ERROR_STOP=1 -f "$plain" >/dev/null || die "psql a échoué sur $RESTORE"
  fi
  [ -z "$tmp" ] || rm -f "$tmp"

  local tables
  tables="$(psql_db -At -c "SELECT count(*) FROM pg_catalog.pg_class WHERE relname IN ('event','org','source') AND relkind='r'" || echo 0)"
  [ "${tables:-0}" -ge 3 ] || die "archive restaurée sans tables event/org/source : $RESTORE"

  read -r events orgs sources <<<"$(psql_db -At -F' ' -c \
    "SELECT (SELECT count(*) FROM event), (SELECT count(*) FROM org), (SELECT count(*) FROM source)")"
  log "  restauré : event=$events org=$orgs source=$sources"
  if [ "$STRICT_DATA" -eq 1 ] && [ "${events:-0}" -eq 0 ]; then
    die "restauration strictement vide (0 événement) et --strict-data demandé"
  fi
  if [ "${events:-0}" -eq 0 ]; then
    log "  AVERTISSEMENT: archive sans événement — installation poursuivie (état vide autorisé)"
  fi
  jq -n --arg a "$RESTORE" --argjson e "${events:-0}" --argjson o "${orgs:-0}" --argjson s "${sources:-0}" \
    '{archive:$a, events:$e, orgs:$o, sources:$s, verified:true}' > "$STATE_DIR/restore.json"
}

# --- Build -----------------------------------------------------------------
as_radar() { runuser -u "$SERVICE_USER" -- env HOME="$RADAR_HOME" PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin" PNPM_HOME="$RADAR_HOME/.pnpm" "$@"; }

build_release() {
  local sha rel
  if [ -d "$SOURCE/.git" ]; then sha="$(git -C "$SOURCE" rev-parse --short HEAD 2>/dev/null || echo nogit)"; else sha="nogit"; fi
  rel="$(date -u +%Y%m%dT%H%M%SZ)-$sha"
  RELEASE_DIR="$RELEASE_ROOT/releases/$rel"
  mkdir -p "$RELEASE_DIR"
  rsync -a --delete \
    --exclude='.git' --exclude='node_modules' --exclude='pgdata' --exclude='pgdata-*' \
    --exclude='.pnpm-store' --exclude='dist' --exclude='.smoke-out' \
    "$SOURCE/" "$RELEASE_DIR/"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$RELEASE_DIR"
  local t0 t1
  t0="$(date +%s%3N)"
  as_radar bash -c "cd '$RELEASE_DIR' && '$PNPM_BIN' install --frozen-lockfile --prefer-offline --reporter=append-only >/dev/null"
  t1="$(date +%s%3N)"; log "  pnpm install : $((t1 - t0)) ms"
  t0="$(date +%s%3N)"
  as_radar bash -c "cd '$RELEASE_DIR' && '$PNPM_BIN' -F @radar/api typecheck >/dev/null"
  t1="$(date +%s%3N)"; log "  typecheck api : $((t1 - t0)) ms"
  t0="$(date +%s%3N)"
  as_radar bash -c "cd '$RELEASE_DIR' && '$PNPM_BIN' -F @radar/web build >/dev/null"
  t1="$(date +%s%3N)"; log "  build web : $((t1 - t0)) ms"

  ln -sfn "$RELEASE_DIR" "$RELEASE_ROOT/current.next"
  mv -Tf "$RELEASE_ROOT/current.next" "$RELEASE_ROOT/current"
  jq --arg id "$rel" --arg dir "$RELEASE_DIR" --arg sha "$sha" \
    '.current.id = $id | .current.release_dir = $dir | .current.git_sha = $sha' \
    "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
  log "  release $rel activée"
}

# --- Socle de données ------------------------------------------------------
bootstrap_db() {
  [ -n "${RELEASE_DIR:-}" ] || RELEASE_DIR="$(jq -r '.current.release_dir // empty' "$STATE_FILE")"
  [ -n "$RELEASE_DIR" ] && [ -d "$RELEASE_DIR" ] || die "release introuvable pour le bootstrap"
  as_radar env DATABASE_URL="$DB_URL" RADAR_ADMIN_EMAIL="$ADMIN_EMAIL" RADAR_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    "$RELEASE_DIR/apps/api/node_modules/.bin/tsx" "$RELEASE_DIR/scripts/bootstrap.mts"
  local n m
  n="$(psql_db -At -c 'SELECT count(*) FROM source')"
  m="$(psql_db -At -c 'SELECT count(*) FROM schema_migrations')"
  log "  sources=$n migrations=$m"
}

# --- systemd ---------------------------------------------------------------
render_units() {
  local tpl="$RELEASE_ROOT/current/scripts/deploy/systemd"
  [ -f "$tpl/radar-api.service" ] && [ -f "$tpl/radar-web.service" ] \
    || die "modèles systemd absents de la release"
  sed "s|@PNPM@|$PNPM_BIN|g" "$tpl/radar-api.service" > /etc/systemd/system/radar-api.service
  sed "s|@PNPM@|$PNPM_BIN|g" "$tpl/radar-web.service" > /etc/systemd/system/radar-web.service
  chmod 0644 /etc/systemd/system/radar-api.service /etc/systemd/system/radar-web.service
  systemctl daemon-reload
}

install_units() {
  write_env_file "$ENV_FILE" "$API_PORT" "$WEB_PORT"
  cp -f "$ENV_FILE" "$CONFIG_DIR/env.$(jq -r '.current.id' "$STATE_FILE")"
  chmod 0600 "$CONFIG_DIR"/env.*
  render_units
  systemctl enable radar-api.service radar-web.service >/dev/null
  log "  unités radar-api / radar-web activées au boot"
}

port_busy() {
  local port="$1"
  ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${port}$"
}

start_services() {
  # L'env file vient d'être réécrit avec les ports cibles : owned_port refuse
  # un port occupé par un tiers, mais accepte celui déjà tenu par nos unités.
  if port_busy "$API_PORT" && ! owned_port radar-api PORT "$API_PORT"; then
    die "port API $API_PORT déjà occupé par un autre processus"
  fi
  if port_busy "$WEB_PORT" && ! owned_port radar-web WEB_PORT "$WEB_PORT"; then
    die "port web $WEB_PORT déjà occupé par un autre processus"
  fi
  systemctl reset-failed radar-api.service radar-web.service 2>/dev/null || true
  systemctl restart radar-api.service radar-web.service
  local i
  for i in $(seq 1 20); do
    if systemctl is-active --quiet radar-api.service && systemctl is-active --quiet radar-web.service; then
      log "  radar-api et radar-web actifs"
      return 0
    fi
    sleep 1
  done
  die "les services ne sont pas actifs (journal : journalctl -u radar-api -u radar-web -n 50)"
}

verify_health() {
  local i out=""
  for i in $(seq 1 40); do
    if out="$(API_URL="http://127.0.0.1:$API_PORT" WEB_URL="http://127.0.0.1:$WEB_PORT" \
      HEALTHCHECK_TIMEOUT=5 bash "$RELEASE_ROOT/current/scripts/healthcheck.sh" 2>&1)"; then
      printf '%s\n' "$out" | while IFS= read -r line; do log "  $line"; done
      return 0
    fi
    sleep 2
  done
  log_plain "$out"
  log "  dernière sonde : $(printf '%s' "$out" | tail -3 | tr '\n' ' ')"
  return 1
}

# --- État ------------------------------------------------------------------
init_state() {
  mkdir -p "$STATE_DIR" "$BACKUP_DIR"
  # Appelé APRÈS ensure_packages : jq est disponible. L'historique des releases
  # est conservé d'un passage à l'autre, c'est lui qui rend le rollback possible.
  local new_state
  new_state="$(jq -n \
    --arg v "$INSTALLER_VERSION" --arg started "$STARTED_AT" \
    --arg db "$DB_NAME" --arg user "$DB_USER" \
    --argjson pg "$PG_PORT" --argjson api "$API_PORT" --argjson web "$WEB_PORT" \
    --argjson public "$PUBLIC" --argjson collect "$COLLECT" \
    '{version:$v, current:{id:"pending", status:"in-progress", started_at:$started,
       created_db:false, created_role:false, snapshot:null, release_dir:null, git_sha:null,
       db:$db, db_user:$user, pg_port:$pg, api_port:$api, web_port:$web,
       public:$public, collect:$collect}, history:[]}')"
  if [ -f "$STATE_FILE" ]; then
    printf '%s' "$new_state" | jq --slurpfile old "$STATE_FILE" \
      '.history = (($old[0].history // [])[-10:])' > "$STATE_FILE.tmp"
  else
    printf '%s' "$new_state" > "$STATE_FILE.tmp"
  fi
  mv "$STATE_FILE.tmp" "$STATE_FILE"
  chmod 0600 "$STATE_FILE"
}

save_state() {
  local status="$1" duration="$2"
  local steps_json
  steps_json="$(printf '%s\n' "${STEP_TIMINGS[@]}" | jq -R 'split("\t") | {name:.[0], duration_ms:(.[1]|tonumber)}' | jq -s '.')"
  local restore_json="null"
  [ -f "$STATE_DIR/restore.json" ] && restore_json="$(cat "$STATE_DIR/restore.json")"
  jq --arg status "$status" --arg finished "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     --argjson duration "$duration" --argjson steps "$steps_json" --argjson restore "$restore_json" \
     '.current.status = $status | .current.finished_at = $finished | .current.duration_s = $duration |
      .current.steps = $steps | .current.restore = $restore |
      .history = ((.history // []) + [.current]) | .history = .history[-10:]' \
     "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
  chmod 0600 "$STATE_FILE"
}

# --- Retour en arrière -----------------------------------------------------
do_rollback() {
  local label="$1" target="$2"
  local cur_id target_id target_dir target_snapshot target_api target_web target_collect target_public
  cur_id="$(jq -r '.current.id // empty' "$STATE_FILE")"
  systemctl stop radar-api.service radar-web.service 2>/dev/null || true

  if [ "$target" = "clean" ] || [ -z "$target" ]; then
    log "  pas de release précédente : nettoyage de l'installation en échec"
    rm -f "$RELEASE_ROOT/current"
    systemctl disable radar-api.service radar-web.service >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/radar-api.service /etc/systemd/system/radar-web.service
    systemctl daemon-reload
    if [ "$(jq -r '.current.created_db // false' "$STATE_FILE")" = "true" ]; then
      psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid()" >/dev/null || true
      psql_admin -c "DROP DATABASE IF EXISTS $DB_NAME" >/dev/null || true
    fi
    if [ "$(jq -r '.current.created_role // false' "$STATE_FILE")" = "true" ]; then
      psql_admin -c "DROP ROLE IF EXISTS $DB_USER" >/dev/null || true
    fi
    jq '.current.status = "rolled-back-clean" | .history = ((.history // []) + [.current])' \
      "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    log "  installation nettoyée (aucune release antérieure)"
    return 0
  fi

  target_id="$(printf '%s' "$target" | jq -r '.id')"
  target_dir="$(printf '%s' "$target" | jq -r '.release_dir // empty')"
  target_snapshot="$(printf '%s' "$target" | jq -r '.snapshot // empty')"
  target_api="$(printf '%s' "$target" | jq -r '.api_port')"
  target_web="$(printf '%s' "$target" | jq -r '.web_port')"
  target_collect="$(printf '%s' "$target" | jq -r '.collect')"
  target_public="$(printf '%s' "$target" | jq -r '.public')"
  [ -n "$target_dir" ] && [ -d "$target_dir" ] || die "release $target_id introuvable sur disque"

  ln -sfn "$target_dir" "$RELEASE_ROOT/current.next"
  mv -Tf "$RELEASE_ROOT/current.next" "$RELEASE_ROOT/current"
  log "  code : $cur_id → $target_id"

  if [ -n "$target_snapshot" ] && [ -f "$target_snapshot" ]; then
    drop_and_recreate_db
    pg_restore --dbname "$DB_URL" --no-owner --no-privileges --exit-on-error "$target_snapshot" \
      || die "impossible de restaurer le snapshot $target_snapshot"
    log "  base restaurée depuis $target_snapshot"
  else
    log "  aucun snapshot pour $target_id : base conservée telle quelle"
  fi

  if [ -f "$CONFIG_DIR/env.$target_id" ]; then
    cp -f "$CONFIG_DIR/env.$target_id" "$ENV_FILE"
    chmod 0640 "$ENV_FILE"
    chown root:"$SERVICE_USER" "$ENV_FILE"
    ADMIN_EMAIL="$(sed -n 's/^RADAR_ADMIN_EMAIL=//p' "$ENV_FILE" | head -1)"
    ADMIN_PASSWORD="$(sed -n 's/^RADAR_ADMIN_PASSWORD=//p' "$ENV_FILE" | head -1)"
  fi
  PUBLIC="$target_public"
  API_PORT="$target_api"
  WEB_PORT="$target_web"
  write_env_file "$ENV_FILE" "$target_api" "$target_web" "$target_collect" "$target_public"
  render_units
  systemctl reset-failed radar-api.service radar-web.service 2>/dev/null || true
  systemctl start radar-api.service radar-web.service
  RELEASE_DIR="$target_dir"
  local health_status="ok"
  verify_health || { health_status="rollback-warning"; log "  AVERTISSEMENT: santé non confirmée après retour en arrière ($label)"; }
  # On consigne toujours la cible du retour en arrière, même si la sonde reste
  # rouge : un état « in-progress » piégerait les installations suivantes.
  jq --arg id "$target_id" --arg label "$label" --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     --arg status "$health_status" \
    '.current = (first(.history[] | select(.id == $id))) | .current.status = $status |
     .current.rollback_at = $now | .current.rollback_label = $label |
     .history = (((.history // []) | map(select(.id != $id))) + [.current]) |
     .history = .history[-10:]' \
    "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
  [ "$health_status" = "ok" ] || return 1
  log "✓ retour en arrière terminé vers $target_id"
}

rollback_mode() {
  [ -f "$STATE_FILE" ] || die "aucun état d'installation : $STATE_FILE"
  local history_len target
  history_len="$(jq -r '.history | length' "$STATE_FILE")"
  if [ -n "$ROLLBACK_TO" ]; then
    target="$(jq -c --arg id "$ROLLBACK_TO" '.history[] | select(.id == $id)' "$STATE_FILE" | tail -1)"
    [ -n "$target" ] || die "ID de release inconnu : $ROLLBACK_TO"
  elif [ "$history_len" -ge 2 ]; then
    target="$(jq -c '.history[-2]' "$STATE_FILE")"
  else
    target="clean"
  fi
  do_rollback "manuel" "$target"
}

check_mode() {
  [ -f "$STATE_FILE" ] || die "aucune installation enregistrée ($STATE_FILE absent)"
  local id api web db_user db_name pg
  id="$(jq -r '.current.id' "$STATE_FILE")"
  api="$(jq -r '.current.api_port' "$STATE_FILE")"
  web="$(jq -r '.current.web_port' "$STATE_FILE")"
  db_name="$(jq -r '.current.db' "$STATE_FILE")"
  db_user="$(jq -r '.current.db_user' "$STATE_FILE")"
  pg="$(jq -r '.current.pg_port' "$STATE_FILE")"
  echo "Release : $id"
  echo "Unités  : $(systemctl is-active radar-api.service) / $(systemctl is-active radar-web.service)"
  echo "DB      : $db_user@127.0.0.1:$pg/$db_name → $(pg_isready -h 127.0.0.1 -p "$pg" >/dev/null && echo prêt || echo hors service)"
  API_URL="http://127.0.0.1:$api" WEB_URL="http://127.0.0.1:$web" bash "$RELEASE_ROOT/current/scripts/healthcheck.sh"
}

handle_failure() {
  local rc="$1"
  trap - ERR
  log "ÉCHEC (code $rc) pendant : $CURRENT_STEP"
  journalctl -u radar-api.service -u radar-web.service -n 40 --no-pager >> "$LOG_FILE" 2>&1 || true
  if [ "$AUTO_ROLLBACK" -eq 1 ] && [ "$INSTALL_ACTIVE" -eq 1 ] && [ -f "$STATE_FILE" ]; then
    log "Retour en arrière automatique en cours…"
    local history_len target
    history_len="$(jq -r '.history | length' "$STATE_FILE" 2>/dev/null || echo 0)"
    if [ "$history_len" -ge 1 ]; then
      # Le snapshot pris au début de l'installation en échec décrit l'état à
      # retrouver ; il prime sur le snapshot plus ancien de la release cible.
      target="$(jq -c '. as $s | $s.history[-1] | .snapshot = ($s.current.snapshot // .snapshot)' "$STATE_FILE")"
    else
      target="clean"
    fi
    do_rollback "automatique" "$target" || log "AVERTISSEMENT: retour en arrière automatique incomplet — état conservé dans $STATE_FILE"
  else
    log "Aucun retour en arrière automatique (--no-rollback ou hors installation active)."
  fi
  INSTALL_ACTIVE=0
  log "Log complet : $LOG_FILE"
  exit "$rc"
}
trap 'handle_failure $?' ERR

# --- Orchestration ---------------------------------------------------------
case "$MODE" in
  check)
    ensure_packages
    check_mode
    ;;
  rollback)
    ensure_packages
    DB_URL="postgres://$DB_USER:${DB_PASSWORD:-$(jq -r '.current.db_password // empty' "$STATE_FILE" 2>/dev/null)}@$DB_HOST:$PG_PORT/$DB_NAME"
    # La phrase secrète DB est relue depuis l'unité (jamais stockée en clair dans state.json).
    if [ -f "$ENV_FILE" ]; then
      DB_URL="$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE" | head -1)"
    fi
    DB_PASSWORD="$(printf '%s' "$DB_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')"
    rollback_mode
    ;;
  install)
    if [ "$DRY_RUN" -eq 0 ]; then
      [ -n "$ADMIN_PASSWORD" ] || ADMIN_PASSWORD="$(openssl rand -hex 24)"
      [ -n "$DB_PASSWORD" ] || DB_PASSWORD="$(openssl rand -hex 24)"
    else
      [ -n "$ADMIN_PASSWORD" ] || ADMIN_PASSWORD="<généré>"
      [ -n "$DB_PASSWORD" ] || DB_PASSWORD="<généré>"
    fi

    step "Prérequis système (paquets, Node, pnpm)" ensure_packages
    if [ "$DRY_RUN" -eq 0 ]; then
      init_state
      INSTALL_ACTIVE=1
    fi

    step "Résolution du code source" resolve_source
    step "Utilisateur et répertoires" ensure_user_dirs
    step "PostgreSQL (rôle et base)" ensure_postgres
    step "Snapshot de sécurité" snapshot_db
    step "Restauration optionnelle" restore_archive
    step "Dépendances et build de production" build_release
    step "Schéma, migrations et socle" bootstrap_db
    step "Configuration et unités systemd" install_units
    step "Démarrage des services" start_services
    step "Vérification de santé" verify_health

    duration=$(( $(date +%s) - START_EPOCH ))
    if [ "$DRY_RUN" -eq 0 ]; then
      save_state "ok" "$duration"
      cp -f "$ENV_FILE" "$CONFIG_DIR/env.$(jq -r '.current.id' "$STATE_FILE")" 2>/dev/null || true
      INSTALL_ACTIVE=0
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
      log "✓ Plan affiché en ${duration}s — aucune modification effectuée"
    else
      log "✓ Installation terminée en ${duration}s — état : $STATE_FILE"
      log "  API   : http://127.0.0.1:$API_PORT/api/health"
      log "  Web   : http://127.0.0.1:$WEB_PORT/"
      log "  Retour en arrière : sudo bash $RELEASE_ROOT/current/scripts/deploy/install.sh --rollback"
    fi
    ;;
esac
