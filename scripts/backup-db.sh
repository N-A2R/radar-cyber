#!/usr/bin/env bash
# backup-db.sh — Sauvegarde quotidienne de la base radar-cyber.
# Format custom PostgreSQL compressé, rotation 14, vérification d'intégrité.
set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://radar:radar@localhost:5432/radar}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/.local/share/radar-cyber/backups}"
RETENTION="${RETENTION:-14}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

if ! command -v pg_dump >/dev/null 2>&1; then
  log "ERREUR: pg_dump introuvable. Installez postgresql-client."
  exit 1
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  log "ERREUR: pg_restore introuvable. Installez postgresql-client."
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date '+%Y-%m-%d-%H%M')"
OUT="$BACKUP_DIR/radar-$STAMP.dump"

log "Dump de $DB_URL vers $OUT"
pg_dump "$DB_URL" --format=custom --compress=9 --file="$OUT"

# Vérification d'intégrité
if pg_restore --list "$OUT" >/dev/null 2>&1; then
  log "Intégrité OK: archive lisible (pg_restore --list)."
else
  log "ERREUR: archive illisible, suppression."
  rm -f "$OUT"
  exit 1
fi

# Rotation : garder les $RETENTION plus récents
rotate() {
  mapfile -t files < <(ls -1t "$BACKUP_DIR"/radar-*.dump* 2>/dev/null)
  if (( ${#files[@]} > RETENTION )); then
    for f in "${files[@]:RETENTION}"; do
      log "Rotation: suppression $f"
      rm -f "$f"
    done
  fi
}

# ── Chiffrement et sortie hors site (roadmap phase 6) ────────────────────
#
# Deux variables suffisent, et rien ne s'active par défaut : sans elles le
# comportement reste la sauvegarde locale d'avant.
#
#   PASSPHRASE_FILE=/chemin/secret   → chiffre l'archive en AES-256 (gpg
#                                      symétrique) puis supprime le clair
#   OFFSITE=hermes:/srv/backups/radar → copie l'archive chiffrée et vérifie
#                                      sa taille à distance
#
# Refus explicite : une sauvegarde hors site non chiffrée sortirait des
# données TLP:RED en clair. Si OFFSITE est posé sans PASSPHRASE_FILE, on
# s'arrête au lieu de copier.

if [[ -n "${PASSPHRASE_FILE:-}" ]]; then
  if [[ ! -r "$PASSPHRASE_FILE" ]]; then
    log "ERREUR: PASSPHRASE_FILE illisible ($PASSPHRASE_FILE)."
    exit 1
  fi
  ENC="$OUT.gpg"
  log "Chiffrement AES-256 vers $ENC"
  gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 \
      --passphrase-file "$PASSPHRASE_FILE" --output "$ENC" "$OUT"
  # Vérification réelle : on déchiffre et on compare le nombre d'octets.
  # `--list-packets` ne suffit pas — il réclame la phrase secrète et échoue
  # en mode batch, ce qui faisait supprimer une archive pourtant valide.
  PLAIN_SIZE="$(stat -c %s "$OUT")"
  DECRYPTED_SIZE="$(gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$PASSPHRASE_FILE" --decrypt "$ENC" 2>/dev/null | wc -c)"
  if [[ "$PLAIN_SIZE" != "$DECRYPTED_SIZE" ]]; then
    log "ERREUR: déchiffrement incomplet ($DECRYPTED_SIZE/$PLAIN_SIZE octets), suppression."
    rm -f "$ENC"
    exit 1
  fi
  log "Chiffrement vérifié: $DECRYPTED_SIZE octets déchiffrés."
  # Le clair ne survit pas au chiffrement : c'est le point de la manœuvre.
  rm -f "$OUT"
  OUT="$ENC"
fi

if [[ -n "${OFFSITE:-}" ]]; then
  if [[ -z "${PASSPHRASE_FILE:-}" ]]; then
    log "ERREUR: OFFSITE est défini sans PASSPHRASE_FILE — refus de copier en clair."
    exit 1
  fi
  if [[ "$OFFSITE" == *:* ]]; then
    HOST="${OFFSITE%%:*}"
    REMOTE_DIR="${OFFSITE#*:}"
    log "Copie hors site vers $HOST:$REMOTE_DIR"
    ssh "$HOST" "mkdir -p '$REMOTE_DIR'"
    scp -q "$OUT" "$HOST:$REMOTE_DIR/"
    LOCAL_SIZE="$(stat -c %s "$OUT")"
    REMOTE_SIZE="$(ssh "$HOST" "stat -c %s '$REMOTE_DIR/$(basename "$OUT")'")"
    if [[ "$LOCAL_SIZE" != "$REMOTE_SIZE" ]]; then
      log "ERREUR: taille distante ($REMOTE_SIZE) ≠ locale ($LOCAL_SIZE)."
      exit 1
    fi
    log "Hors site vérifié: $REMOTE_SIZE octets."
  else
    log "Copie hors site vers $OFFSITE"
    mkdir -p "$OFFSITE"
    rsync -a --partial "$OUT" "$OFFSITE/"
    if ! cmp -s "$OUT" "$OFFSITE/$(basename "$OUT")"; then
      log "ERREUR: copie hors site différente de la source."
      exit 1
    fi
    log "Hors site vérifié (cmp)."
  fi
fi

rotate
log "Terminé: $OUT"
