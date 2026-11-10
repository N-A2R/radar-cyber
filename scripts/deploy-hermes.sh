#!/usr/bin/env bash
# Déploiement idempotent de l'« armée » de bots de veille Hermes sur une box instabox
# Debian 13 (trixie), profilée pour ~4 vCPU / 7 Go RAM.
#
# IMPORTANT : ce script NE déploie rien tant qu'il n'est pas exécuté explicitement
# sur la box cible. Il est livré pour relecture/exécution par l'opérateur.
#
# Usage (sur la box cible, en utilisateur non-root disposant de sudo) :
#   bash scripts/deploy-hermes.sh --radar-host <hôte-ou-ip-radar> [--dry-run]
#
# Ce que fait le script :
#   - installe Node.js (LTS) et le CLI Hermes/omp si absents (idempotent) ;
#   - crée/maintient les 4 profils Hermes de veille, leur SOUL.md et un
#     config.yaml minimal (modèle + compression) pour que les jobs cron aient
#     un modèle résolu (sinon « no model configured ») ;
#   - installe les jobs cron Hermes (collecte par famille, livrée locale en out/) ;
#   - installe le pipeline de remontée (hermes-briefing.mts + hermes-push.mts) ;
#   - installe des timers systemd --user (santé + pipeline) sans activer de
#     services non désirés ;
#   - vérifie l'état final et affiche les commandes de contrôle.
#
# Garde-fous intégrés au plan (voir docs/hermes.md) :
#   - collecte passive uniquement, jamais de .onion, pas de scan/contournement ;
#   - cadence espacée + rate limits (un profil par famille, pas de rafale) ;
#   - remontée vers l'API radar par fichier JSON dans <profil>/out/ (rapatrié par
#     hermes.collector.ts via SSH) ; pas d'écriture directe en base depuis la box.

set -euo pipefail

RADAR_HOST=""
DRY_RUN=0
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
HERMES_BIN="${HERMES_BIN:-$HOME/.local/bin/hermes}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(command -v node || true)"
# Modèle de secours des profils : fournisseur « nous » vérifié opérationnel
# (HTTP 200) et modèle petit/format compact, pour éviter les erreurs de type
# « conversation too large » rencontrées avec qwen/qwen3.8-27b.
HERMES_MODEL="${HERMES_MODEL:-stepfun/step-3.7-flash:free}"
HERMES_PROVIDER="${HERMES_PROVIDER:-nous}"
COMPRESSION_THRESHOLD="${COMPRESSION_THRESHOLD:-30000}"
PROFILES=(radar-vuln radar-ransom radar-presse radar-cert)
# Familles : vulnérabilités, rançongiciels, presse/institutions régionales, certificats

usage() {
  cat <<'USAGE'
Usage: deploy-hermes.sh --radar-host <hote-radar> [--dry-run]
  --radar-host  Hôte (DNS/IP tailnet) du radar qui rapatrie les briefings via SSH.
  --dry-run     Affiche les actions sans rien modifier.
USAGE
}

log() { printf '[deploy-hermes] %s\n' "$*"; }
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] %s\n' "$*"
  else
    eval "$@"
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --radar-host) RADAR_HOST="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Option inconnue: $1" >&2; usage; exit 1 ;;
  esac
done

if [ -z "$RADAR_HOST" ] && [ "$DRY_RUN" -eq 0 ]; then
  echo "Erreur: --radar-host est requis (ou utiliser --dry-run)." >&2
  usage
  exit 1
fi

# --- 0. Pré-requis système -------------------------------------------------
log "Vérification OS/ressources"
uname -a || true
if [ -f /etc/os-release ]; then . /etc/os-release; log "OS: ${PRETTY_NAME:-unknown}"; fi
command -v nproc >/dev/null 2>&1 && log "vCPU: $(nproc)" || true
command -v free >/dev/null 2>&1 && free -h | sed -n '1,2p' || true

run "sudo apt-get update -y"
run "sudo apt-get install -y --no-install-recommends ca-certificates curl git jq openssh-client"

# --- 1. Node.js (LTS) ------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  log "Node déjà présent: $(node --version)"
else
  log "Installation de Node.js (NodeSource LTS) si absent"
  run "curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -"
  run "sudo apt-get install -y nodejs"
fi

# --- 2. Hermes CLI ---------------------------------------------------------
# Le CLI Hermes est la cible constatée sur la box actuelle (~/.local/bin/hermes,
# agent installé sous ~/.hermes/hermes-agent). On ne force pas omp : on installe
# hermes si absent, de façon idempotente, et on signale omp seulement s'il existe.
if [ -x "$HERMES_BIN" ]; then
  log "Hermes CLI déjà présent: $HERMES_BIN"
  run "$HERMES_BIN --version || true"
else
  log "Hermes CLI absent : installation via le script officiel (idempotent) à valider par l'opérateur"
  # Le bootstrap exact peut évoluer ; on tente le chemin documenté/public le plus courant.
  # En cas d'échec, l'opérateur doit installer hermes manuellement puis relancer.
  run "curl -fsSL https://hermes.nousresearch.com/install.sh | bash" || \
    log "ATTENTION: installation hermes échouée ou non disponible hors-ligne ; installer manuellement puis relancer."
fi

if command -v omp >/dev/null 2>&1; then
  log "omp détecté: $(command -v omp 2>/dev/null || echo present)"
else
  log "omp non détecté (non requis pour ce déploiement Hermes) : ignoré"
fi

# --- 3. Profils Hermes (un par famille) ------------------------------------
mkdir_p() { [ "$DRY_RUN" -eq 1 ] && printf '[dry-run] mkdir -p %s\n' "$1" || mkdir -p "$1"; }

write_if_changed() {
  # write_if_changed <dest> <contenu-stdin-via-heredoc-appelant> — idempotent
  local dest="$1" tmp
  tmp="$(mktemp)"
  cat >"$tmp"
  if [ -f "$dest" ] && cmp -s "$tmp" "$dest"; then
    rm -f "$tmp"
    log "inchangé: $dest"
  else
    if [ "$DRY_RUN" -eq 1 ]; then
      printf '[dry-run] écrire %s\n' "$dest"
      rm -f "$tmp"
    else
      mkdir -p "$(dirname "$dest")"
      mv "$tmp" "$dest"
      log "écrit: $dest"
    fi
  fi
}

create_profile() {
  local name="$1" soul="$2"
  local dir="$HERMES_HOME/profiles/$name"
  mkdir_p "$dir/out"
  mkdir_p "$dir/cron"

  # Création du profil côté Hermes si le CLI le supporte (idempotent : ignore si existe).
  if [ -x "$HERMES_BIN" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      printf '[dry-run] %s profile show %s || %s profile create %s\n' "$HERMES_BIN" "$name" "$HERMES_BIN" "$name"
    else
      "$HERMES_BIN" profile show "$name" >/dev/null 2>&1 || "$HERMES_BIN" profile create "$name" || true
    fi
  fi

  # SOUL minimal et factuel, spécifique à la famille.
  printf '%s\n' "$soul" | write_if_changed "$dir/SOUL.md"

  # config.yaml minimal : sans modèle résolu, les jobs cron du profil échouent
  # avec « Cron job … has no model configured (config.yaml model.default missing) ».
  # Le seuil de compression est volontairement bas (30 k tokens) pour éviter
  # l'erreur « conversation too large » observée sur qwen/qwen3.8-27b.
  {
    printf 'model:\n'
    printf '  provider: %s\n' "$HERMES_PROVIDER"
    printf '  default: %s\n' "$HERMES_MODEL"
    printf 'agent:\n  reasoning_effort: none\n'
    printf 'compression:\n  threshold_tokens: %s\n  enabled: true\n' "$COMPRESSION_THRESHOLD"
  } | write_if_changed "$dir/config.yaml"

  # .env.EXAMPLE (jamais de secret écrit par le script).
  cat <<'ENV' | write_if_changed "$dir/.env.EXAMPLE"
# Secrets à renseigner manuellement (ne jamais committer de valeurs réelles).
# Exemple : clé API du fournisseur de modèle configuré dans config.yaml.
# PROVIDER_API_KEY=
ENV
}

create_profile "radar-vuln" "# radar-vuln — veille vulnérabilités
Collecte passive uniquement (bulletins publics : CERT-FR, CISA KEV, advisories éditeurs, NVD).
Produit des événements factuels (CVE, sévérité, statut correctif/KEV, source primaire).
Ne jamais scanner, ne jamais accéder à une ressource .onion, ne jamais inventer d'exploitation.
Écris le briefing du run dans out/briefing-<date>.json au schéma attendu par le Radar."

create_profile "radar-ransom" "# radar-ransom — veille rançongiciels
Collecte passive de revendications publiques (flux/fuites publiques autorisées, jamais .onion).
Toute revendication reste une allégation (assertion_type adapté) tant que non recoupée.
Ne jamais contacter un acteur, ne jamais payer, ne jamais accéder à un service illicite.
Écris le briefing du run dans out/briefing-<date>.json au schéma attendu par le Radar."

create_profile "radar-presse" "# radar-presse — veille presse/institutions régionales
Collecte passive des communiqués et articles publics concernant la cybersécurité en Nouvelle-Aquitaine.
Privilégie les sources primaires/institutionnelles ; cite toujours la source et l'URL.
Ne rapporte que les faits vérifiables ; pas de spéculation.
Écris le briefing du run dans out/briefing-<date>.json au schéma attendu par le Radar."

create_profile "radar-cert" "# radar-cert — veille certificats/CT
Collecte passive des signaux de certificats (CT logs publics, alertes de délivrance suspecte).
Rattache à un périmètre organisationnel uniquement si étayé ; sinon pas d'attribution.
Ne jamais tenter de validation active intrusive. Pas de .onion.
Écris le briefing du run dans out/briefing-<date>.json au schéma attendu par le Radar."

# --- 4. Jobs cron Hermes (cadence espacée, rate limit implicite) ------------
# Chaque famille tourne à une cadence distincte pour lisser la charge (4 profils,
# ~4 vCPU) : vuln 2h, ransom 3h, presse 4h, cert 6h. Le modèle et le fournisseur
# sont épinglés sur le job (--model/--provider) : sans cela, le job hérite d'un
# config.yaml de profil absent et échoue avec « no model configured » (constaté).
install_job() {
  local profile="$1" name="$2" expr="$3" prompt="$4"
  if [ ! -x "$HERMES_BIN" ]; then
    log "cron $profile/$name : hermes absent, à créer manuellement (voir docs)"
    return 0
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] %s -p %s cron create --name %s "%s" %q --deliver local --model %s --provider %s\n' \
      "$HERMES_BIN" "$profile" "$name" "$expr" "$prompt" "$HERMES_MODEL" "$HERMES_PROVIDER"
    return 0
  fi
  # Idempotent : si un job porte déjà ce nom dans le profil, on le met à jour
  # (modèle/prompt/cadence) au lieu de tenter une création qui échouerait.
  local existing
  existing="$("$HERMES_BIN" -p "$profile" cron list 2>/dev/null | grep -F "Name:      $name" || true)"
  if [ -n "$existing" ]; then
    local jid
    jid="$(python3 - "$HERMES_HOME/profiles/$profile/cron/jobs.json" "$name" <<'PY' 2>/dev/null || true
import json, sys
path, name = sys.argv[1], sys.argv[2]
try:
    data = json.load(open(path))
except Exception:
    sys.exit(1)
jobs = data.get("jobs", data) if isinstance(data, dict) else data
if isinstance(jobs, dict):
    jobs = list(jobs.values())
for j in jobs:
    if j.get("name") == name:
        print(j.get("id", ""))
        break
PY
)"
    if [ -n "$jid" ]; then
      "$HERMES_BIN" -p "$profile" cron edit "$jid" --schedule "$expr" --prompt "$prompt" \
        --model "$HERMES_MODEL" --provider "$HERMES_PROVIDER" --deliver local >/dev/null 2>&1 || \
        log "cron $profile/$name : mise à jour ignorée (syntaxe CLI différente)"
      log "cron $profile/$name : job existant mis à jour (id $jid)"
    else
      log "cron $profile/$name : déjà présent (id introuvable dans jobs.json) — inchangé"
    fi
    return 0
  fi
  "$HERMES_BIN" -p "$profile" cron create --name "$name" "$expr" "$prompt" \
    --deliver local --model "$HERMES_MODEL" --provider "$HERMES_PROVIDER" 2>/dev/null || \
    log "cron $profile/$name : création ignorée (déjà présent ou syntaxe CLI différente) — vérifier avec: $HERMES_BIN -p $profile cron list"
}

install_job "radar-vuln"   "veille-vuln"   "17 */2 * * *" "Produis un briefing vulnérabilités factuel (CERT-FR/CISA/advisories publics). Écris out/briefing-<date>.json. Collecte passive uniquement, aucune ressource .onion."
install_job "radar-ransom" "veille-ransom" "47 */3 * * *" "Produis un briefing rançongiciels (revendications publiques, allégations non confirmées sauf recoupement). Écris out/briefing-<date>.json. Collecte passive uniquement, aucune ressource .onion."
install_job "radar-presse" "veille-presse" "23 */4 * * *" "Produis un briefing presse/institutions cybersécurité Nouvelle-Aquitaine (sources publiques). Écris out/briefing-<date>.json. Collecte passive uniquement."
install_job "radar-cert"   "veille-cert"   "53 */6 * * *" "Produis un briefing signaux certificats/CT publics pertinents. Écris out/briefing-<date>.json. Collecte passive uniquement."

# --- 4b. Pipeline de remontée (briefing -> JSON collecteur) ----------------
# Les scripts .mts sont installés depuis le dépôt (présent sur la box) vers
# ~/.hermes/scripts/. Le wrapper bash permet de les lancer sans tsx (Node natif).
PIPELINE_SRC=""
for cand in "$SCRIPT_DIR" "$PWD/scripts" "$PWD" "/data/home/radar-cyber/scripts"; do
  if [ -f "$cand/hermes-briefing.mts" ] && [ -f "$cand/hermes-push.mts" ]; then
    PIPELINE_SRC="$cand"
    break
  fi
done
if [ -z "$PIPELINE_SRC" ]; then
  log "ATTENTION: hermes-briefing.mts/hermes-push.mts introuvables — pipeline non installé."
  log "  Copier les deux scripts dans scripts/ du dépôt sur la box puis relancer."
else
  log "Pipeline: source $PIPELINE_SRC"
  mkdir_p "$HERMES_HOME/scripts"
  install_file() {
    local src="$1" dest="$2"
    if [ "$DRY_RUN" -eq 1 ]; then
      printf '[dry-run] cp %s %s\n' "$src" "$dest"
    else
      cp -f "$src" "$dest"
      log "installé: $dest"
    fi
  }
  install_file "$PIPELINE_SRC/hermes-briefing.mts" "$HERMES_HOME/scripts/hermes-briefing.mts"
  install_file "$PIPELINE_SRC/hermes-push.mts" "$HERMES_HOME/scripts/hermes-push.mts"

  cat <<'WRAP' | write_if_changed "$HERMES_HOME/scripts/radar-hermes-pipeline.sh"
#!/usr/bin/env bash
# Pipeline de remontée des briefings Hermes : texte brut -> JSON normalisé ->
# schéma collecteur. Aucun LLM, idempotent. Voir docs/hermes.md.
set -euo pipefail
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
NODE_BIN="${NODE_BIN:-node}"
SCRIPTS_DIR="${HERMES_HOME}/scripts"
for profile in radar-vuln radar-ransom radar-presse radar-cert; do
  out_dir="${HERMES_HOME}/profiles/${profile}/out"
  [ -d "$out_dir" ] || continue
  # Le collecteur radar lit uniquement ~/.hermes/profiles/radar-cyber/out/*.json :
  # on y écrit, avec un suffixe de profil pour éviter les écrasements.
  dest_dir="${HERMES_HOME}/profiles/radar-cyber/out"
  mkdir -p "${dest_dir}" 2>/dev/null || true
  shopt -s nullglob
  for raw in "${out_dir}"/briefing-*.txt; do
    tmp="${out_dir}/.briefing-normalise.json"
    if ! "${NODE_BIN}" --experimental-strip-types "${SCRIPTS_DIR}/hermes-briefing.mts" \
        "${raw}" --profile "${profile}" --out "${tmp}" 2>/dev/null; then
      echo "pipeline: normalisation impossible pour ${raw}" >&2
      continue
    fi
    dest="${dest_dir}/briefing-${profile}-$(date +%F).json"
    if ! "${NODE_BIN}" --experimental-strip-types "${SCRIPTS_DIR}/hermes-push.mts" \
        "${tmp}" --profile "${profile}" --out "${dest}" 2>/dev/null; then
      echo "pipeline: remontée impossible pour ${raw}" >&2
      continue
    fi
    rm -f "${raw}" "${tmp}"
    echo "pipeline: ${raw} -> ${dest}"
  done
done
WRAP
  if [ "$DRY_RUN" -eq 0 ]; then chmod +x "$HERMES_HOME/scripts/radar-hermes-pipeline.sh" || true; fi
fi

# --- 5. Timers systemd --user (santé, optionnels) --------------------------
# On installe un timer de contrôle léger (journal/santé des sorties) sans lancer
# de collecte réseau supplémentaire. Les timers ne sont activés qu'à la demande
# explicite (pas d'activation automatique destructrice/non désirée).
UNIT_DIR="$HOME/.config/systemd/user"
mkdir_p "$UNIT_DIR"

cat <<'UNIT' | write_if_changed "$UNIT_DIR/radar-hermes-health.service"
[Unit]
Description=Contrôle santé des sorties de veille Hermes (radar)

[Service]
Type=oneshot
ExecStart=/bin/sh -lc 'for p in radar-vuln radar-ransom radar-presse radar-cert; do d="$HOME/.hermes/profiles/$p/out"; echo "--- $p ---"; ls -1t "$d" 2>/dev/null | head -3 || echo "(aucune sortie)"; done'
UNIT

cat <<'UNIT' | write_if_changed "$UNIT_DIR/radar-hermes-health.timer"
[Unit]
Description=Timer de contrôle santé des sorties Hermes (radar)

[Timer]
OnCalendar=hourly
Persistent=true
AccuracySec=5min

[Install]
WantedBy=timers.target
UNIT

cat <<'UNIT' | write_if_changed "$UNIT_DIR/radar-hermes-pipeline.service"
[Unit]
Description=Pipeline de remontée des briefings Hermes (radar)

[Service]
Type=oneshot
ExecStart=%h/.hermes/scripts/radar-hermes-pipeline.sh
UNIT

cat <<'UNIT' | write_if_changed "$UNIT_DIR/radar-hermes-pipeline.timer"
[Unit]
Description=Timer du pipeline de remontée Hermes (radar)

[Timer]
OnCalendar=hourly
Persistent=true
AccuracySec=5min

[Install]
WantedBy=timers.target
UNIT

if command -v systemctl >/dev/null 2>&1; then
  run "systemctl --user daemon-reload || true"
  log "Timers installés (non activés automatiquement). Activer :"
  log "  systemctl --user enable --now radar-hermes-health.timer"
  log "  systemctl --user enable --now radar-hermes-pipeline.timer"
else
  log "systemctl non disponible : timers non chargés (installer/activer manuellement)."
fi

# --- 6. Vérification -------------------------------------------------------
log "Vérification finale"
if command -v node >/dev/null 2>&1; then run "node --version"; else log "node: absent"; fi
if [ -x "$HERMES_BIN" ]; then run "$HERMES_BIN --version || true"; else log "hermes: absent"; fi
for name in "${PROFILES[@]}"; do
  dir="$HERMES_HOME/profiles/$name"
  if [ -d "$dir" ]; then log "profil OK: $dir"; else log "profil MANQUANT: $dir"; fi
  [ -f "$dir/SOUL.md" ] && log "  SOUL.md présent" || log "  SOUL.md manquant"
  [ -d "$dir/out" ] && log "  out/ présent" || log "  out/ manquant"
  if [ -f "$dir/config.yaml" ] && grep -q 'default:' "$dir/config.yaml"; then
    log "  config.yaml: modèle résolu ($(grep -m1 'default:' "$dir/config.yaml" | sed 's/.*default: *//'))"
  else
    log "  config.yaml: MANQUANT ou sans modèle (jobs cron en échec)"
  fi
done
if [ -n "$PIPELINE_SRC" ]; then
  for f in hermes-briefing.mts hermes-push.mts radar-hermes-pipeline.sh; do
    [ -f "$HERMES_HOME/scripts/$f" ] && log "pipeline OK: $HERMES_HOME/scripts/$f" || log "pipeline MANQUANT: $f"
  done
fi
if command -v systemctl >/dev/null 2>&1; then
  systemctl --user list-timers --all 2>/dev/null | grep radar-hermes || log "timers radar-hermes: non listés (non activés)"
fi
if [ -x "$HERMES_BIN" ]; then
  log "Jobs cron (aperçu, profil courant) :"
  "$HERMES_BIN" cron list 2>/dev/null | head -20 || true
fi

log "Terminé. Cible radar (rappel): ${RADAR_HOST:-<non fourni en dry-run>}"
log "Remontée : le collecteur radar lit ~/.hermes/profiles/radar-cyber/out/*.json via SSH."
log "Pipeline : node --experimental-strip-types $HERMES_HOME/scripts/hermes-briefing.mts <briefing.txt> --profile <p> --out <json>"
log "           node --experimental-strip-types $HERMES_HOME/scripts/hermes-push.mts <json> --profile <p>"
log "Aucun secret n'a été écrit ; renseigner les .env des profils manuellement si nécessaire."
