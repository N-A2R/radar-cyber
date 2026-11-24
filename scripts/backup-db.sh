#!/usr/bin/env bash
# backup-db.sh — Sauvegarde quotidienne de la base radar-cyber.
# Format custom PostgreSQL compressé, rotation 14, vérification d'intégrité.
# DATABASE_URL est obligatoire : aucune cible implicite, aucun secret dans les logs.
set -euo pipefail
umask 077

if [[ -z "${DATABASE_URL:-}" ]]; then
  printf '[%s] ERREUR: DATABASE_URL est obligatoire.\n' "$(date '+%Y-%m-%d %H:%M:%S')" >&2
  exit 1
fi

DB_URL="$DATABASE_URL"
BACKUP_DIR="${BACKUP_DIR:-$HOME/.local/share/radar-cyber/backups}"
RETENTION="${RETENTION:-14}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# N'importe quelle forme d'URL peut porter identifiants, token ou mot de passe.
# On n'affiche que host:port/base, jamais la partie userinfo ni les paramètres.
target_sans_secret() {
  local cible="${1#*://}"
  cible="${cible##*@}"
  cible="${cible%%\?*}"
  printf '%s' "$cible"
}

if ! command -v pg_dump >/dev/null 2>&1; then
  log "ERREUR: pg_dump introuvable. Installez postgresql-client."
  exit 1
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  log "ERREUR: pg_restore introuvable. Installez postgresql-client."
  exit 1
fi
if ! command -v sha256sum >/dev/null 2>&1; then
  log "ERREUR: sha256sum introuvable."
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date '+%Y-%m-%d-%H%M')"
OUT="$BACKUP_DIR/radar-$STAMP.dump"

log "Dump de $(target_sans_secret "$DB_URL") vers $OUT"
pg_dump "$DB_URL" --format=custom --compress=9 --file="$OUT"

# Vérification d'intégrité : table des contenus ET empreinte de l'archive.
if pg_restore --list "$OUT" >/dev/null 2>&1; then
  log "Intégrité OK: archive lisible (pg_restore --list)."
else
  log "ERREUR: archive illisible, suppression."
  rm -f "$OUT"
  exit 1
fi

# Rotation : garder les $RETENTION plus récents (archives et empreintes)
rotate() {
  mapfile -t files < <(ls -1t "$BACKUP_DIR"/radar-*.dump "$BACKUP_DIR"/radar-*.dump.gpg 2>/dev/null)
  if (( ${#files[@]} > RETENTION )); then
    for f in "${files[@]:RETENTION}"; do
      log "Rotation: suppression $f"
      rm -f "$f" "$f.sha256"
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
#                                      son empreinte SHA-256 à distance
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
  # La comparaison porte sur l'empreinte, pas seulement sur une taille : un
  # fichier tronqué de même longueur n'était pas détecté auparavant.
  PLAIN_SHA="$(sha256sum "$OUT" | cut -d' ' -f1)"
  gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 \
      --passphrase-file "$PASSPHRASE_FILE" --output "$ENC" "$OUT"
  DECRYPTED_SHA="$(gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$PASSPHRASE_FILE" --decrypt "$ENC" 2>/dev/null | sha256sum | cut -d' ' -f1)"
  if [[ "$PLAIN_SHA" != "$DECRYPTED_SHA" ]]; then
    log "ERREUR: déchiffrement incomplet ($DECRYPTED_SHA/$PLAIN_SHA), suppression."
    rm -f "$ENC"
    exit 1
  fi
  log "Chiffrement vérifié: SHA256 $PLAIN_SHA."
  # Le clair ne survit pas au chiffrement : c'est le point de la manœuvre.
  rm -f "$OUT"
  OUT="$ENC"
fi

# Empreinte locale de l'archive effectivement conservée (clair ou chiffrée).
LOCAL_SHA="$(sha256sum "$OUT" | cut -d' ' -f1)"
printf '%s  %s\n' "$LOCAL_SHA" "$(basename "$OUT")" > "$OUT.sha256"
log "Empreinte locale: SHA256 $LOCAL_SHA."

if [[ -n "${OFFSITE:-}" ]]; then
  if [[ -z "${PASSPHRASE_FILE:-}" ]]; then
    log "ERREUR: OFFSITE est défini sans PASSPHRASE_FILE — refus de copier en clair."
    exit 1
  fi
  # Les sandboxes InstaBox du plan gratuit s'auto-pausent après une trentaine de
  # minutes d'inactivité. Sans réveil explicite, une sauvegarde quotidienne
  # tomberait sur une machine endormie et échouerait presque tous les jours :
  # la copie hors site existerait sur la papier et jamais sur le disque.
  if [[ -n "${OFFSITE_SANDBOX:-}" ]] && command -v instabox >/dev/null 2>&1; then
    log "Réveil de la sandbox $OFFSITE_SANDBOX"
    if ! instabox wake "$OFFSITE_SANDBOX" >/dev/null 2>&1; then
      # Un cooldown du plan gratuit peut durer des dizaines de minutes : on le
      # dit, on n'abandonne pas la sauvegarde locale pour autant.
      log "AVERTISSEMENT: réveil de $OFFSITE_SANDBOX impossible — la copie hors site peut échouer."
    fi
    # Le certificat SSH InstaBox expire avant la prochaine sauvegarde : le
    # renouveler explicitement évite un échec « Permission denied (publickey) ».
    if command -v instabox >/dev/null 2>&1; then
      instabox ssh-cert "$OFFSITE_SANDBOX" >/dev/null
    fi
  fi
  if [[ "$OFFSITE" == *:* ]]; then
    HOST="${OFFSITE%%:*}"
    REMOTE_DIR="${OFFSITE#*:}"
    log "Copie hors site vers $HOST:$REMOTE_DIR"
    ssh "$HOST" "mkdir -p '$REMOTE_DIR'"
    scp -q "$OUT" "$OUT.sha256" "$HOST:$REMOTE_DIR/"
    REMOTE_SHA="$(ssh "$HOST" "sha256sum '$REMOTE_DIR/$(basename "$OUT")'" | cut -d' ' -f1)"
    if [[ "$LOCAL_SHA" != "$REMOTE_SHA" ]]; then
      log "ERREUR: SHA256 distant ($REMOTE_SHA) ≠ local ($LOCAL_SHA)."
      exit 1
    fi
    # Rétention bornée côté tiers : les dumps chiffrés contiennent des données
    # personnelles et ne doivent pas s'accumuler indéfiniment.
    ssh "$HOST" "find '$REMOTE_DIR' -maxdepth 1 -type f \( -name 'radar-*.dump' -o -name 'radar-*.dump.gpg' \) -printf '%T@ %p\\n' \
      | sort -rn | tail -n +$((RETENTION + 1)) | cut -d' ' -f2- \
      | while IFS= read -r f; do rm -f -- \"\$f\" \"\$f.sha256\"; done"
    log "Hors site vérifié: SHA256 $REMOTE_SHA (rétention $RETENTION)."
  else
    log "Copie hors site vers $OFFSITE"
    mkdir -p "$OFFSITE"
    rsync -a --partial "$OUT" "$OUT.sha256" "$OFFSITE/"
    if ! (cd "$OFFSITE" && sha256sum -c "$(basename "$OUT.sha256")" >/dev/null 2>&1); then
      log "ERREUR: copie hors site différente de la source (SHA256)."
      exit 1
    fi
    log "Hors site vérifié: SHA256 $LOCAL_SHA."
  fi
fi

rotate
log "Terminé: $OUT"
