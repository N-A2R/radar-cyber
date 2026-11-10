# Déploiement Hermes — armée de bots de veille (instabox)

Document de référence pour déployer des profils Hermes de veille sur la box
`instabox-hermes`, pilotés depuis le dépôt `radar-cyber`. **Aucun déploiement réel
n'a été effectué** lors de la rédaction : ce document ne consigne que des faits
vérifiés par commande exécutée (voir inventaire), le plan cible, et le script
`scripts/deploy-hermes.sh` (livré, non exécuté sur la box).

## 1. Inventaire constaté (commandes à l'appui)

Toutes les observations ci-dessous proviennent de commandes exécutées le
2026-11-10 sur la box via `ssh instabox-hermes '<cmd>'` (ou de lectures du dépôt
local indiqué).

### 1.1 Système, ressources, identité

| Constat | Commande | Résultat observé |
|---|---|---|
| OS | `cat /etc/os-release \| head -20` | Debian GNU/Linux 13 (trixie), `VERSION_ID="13"` |
| CPU | `nproc` | `4` |
| Mémoire | `free -h` | Mem total `7.8Gi`, used `5.3Gi`, free `2.2Gi`, swap `2.0Gi` (quasi plein) |
| Disque `/` | `df -h /` | `/dev/root 16G`, `8.0G` utilisés, `6.9G` dispo (54 %) |
| Utilisateur | `whoami; id` | `jolt`, `uid=1000(jolt) gid=1000(jolt) groups=1000(jolt),27(sudo),991(docker)` |
| Node | `node --version` | `v22.23.3` |
| CLI `omp` | `omp --version` | `bash: ... omp: command not found` |
| CLI `hermes` (PATH interactif) | `command -v hermes` / `hermes --help` (dans un shell non-login copié) | `hermes: command not found` dans ce shell ; binaire présent en chemin absolu (cf. ci-dessous) |
| Binaire Hermes | `readlink -f ~/.local/bin/hermes` ; `~/.local/bin/hermes --version` | `~/.local/bin/hermes` résout vers lui-même ; `Hermes Agent v0.22.5 (2026.9.24) · stable · local bf0203a794a0`, install dir `/data/home/.hermes/hermes-agent`, méthode `git`, Python `3.14.9` |

> Note : la présence de `~/.local/bin/hermes` et la version ont été vérifiées
> par chemin explicite ; `command -v hermes` a renvoyé vide dans le sous-shell
> SSH copié utilisé pour l'inspection.

### 1.2 Arborescence Hermes et profils

| Constat | Commande | Résultat observé |
|---|---|---|
| Racine Hermes | `ls -la ~/.hermes` | Répertoire très fourni : `config.yaml`, `SOUL.md`, `.env`, `cron/`, `profiles/`, `skills/`, `sessions/`, `state.db`, `shared-state.db`, `hermes-agent/`, `auth.json`, `gateway.*`, etc. |
| Profils existants | `ls -la ~/.hermes/profiles` | 15 profils listés : `architecte`, `boite`, `briefing`, `ctf`, `finance`, `guetteur`, `lecteur`, `pearl`, `phd`, `pronote`, `radar-cyber`, `sentinel`, `test`, `xveille`, + 1 autre entrée (17 répertoires au total dont `.`/`..`) |
| Profil `radar-cyber` | `find ~/.hermes/profiles/radar-cyber -maxdepth 4` | Profil présent avec `config.yaml`, `SOUL.md`, `.env`, `auth.json`, `state.db`, `cron/` (vide de `jobs.json`), `out/` (vide), `skills/` (nombreux skills installés), `logs/`, `sessions/`, `backups/`, etc. |
| `out/` radar-cyber | `ls -la ~/.hermes/profiles/radar-cyber/out` | Répertoire vide (seulement `.` et `..`) |
| `SOUL.md` radar-cyber | `sed -n '1,120p' ~/.hermes/profiles/radar-cyber/SOUL.md` | SOUL « Radar Cyber Nouvelle-Aquitaine — bot de veille » : collecte passive OSINT/CTI publique, briefing JSON structuré, jamais de scan/brute-force/.onion implicite interdit, sorties dans `out/briefing-<date>.json` |
| Cron profil radar-cyber | `cat ~/.hermes/profiles/radar-cyber/cron/jobs.json` | Fichier absent (`No such file or directory`) |
| Exemples d'autres profils | `find ~/.hermes/profiles/sentinel -maxdepth 2` ; `find ~/.hermes/profiles/guetteur -maxdepth 3` | Structures similaires (config, cron, logs, state, skills, `profile.yaml`, `.env`, etc.). `guetteur/cron/jobs.json` contient 1 job `guetteur-check` (`0 * * * *`) en état `paused` |

### 1.3 Cron / jobs Hermes (racine `~/.hermes/cron`)

| Constat | Commande | Résultat observé |
|---|---|---|
| Jobs racine | `python3 -c 'import json; ...'` sur `~/.hermes/cron/jobs.json` ; `tail -120 ~/.hermes/cron/jobs.json` | Plusieurs jobs : `box-operator` (intervalle 5m, enabled, `last_status ok`), `veille-pearl` (30m, enabled mais `blocked_config` provider `river` inconnu, streak échecs), `veille-xveille` (30m, **paused** « auth xurl à migrer… »), `salle-gepo` (20:00, **paused**), **`radar-cyber veille quotidienne`** |
| Job `radar-cyber veille quotidienne` (`c35aee605a34`) | extraction JSON de `~/.hermes/cron/jobs.json` | `enabled: true`, `state: scheduled`, cron `0 6 * * *`, `next_run_at: 2026-11-11T06:00:00+00:00`, `last_status: "error"`, `last_error: "RuntimeError: This conversation ... too large ... qwen/qwen3.8-27b ..."`, `failure_streak: 1`, `deliver: "local"`, `skill/skills: ["radar-cyber"]` |
| Ticker cron | `ls -la ~/.hermes/cron` | Présence de `jobs.json`, `executions.db`, `deliveries.db`, `ticker_heartbeat`, `ticker_last_success`, `.tick.lock` |

### 1.4 Timers / services systemd --user observés

| Constat | Commande | Résultat observé |
|---|---|---|
| Timers actifs/listés | `systemctl --user list-timers --all` | 6 timers : `pronote-sync.timer`, `bookmark-watcher-morning.timer`, `bookmark-watcher-weekly.timer` (planifiés) ; `hermes-veille-pearl.timer`, `hermes-veille-sentinel.timer`, `hermes-veille-xveille.timer` (listés, colonnes NEXT/LAST vides `-`) |
| Unités hermes | `systemctl --user list-unit-files \| grep hermes` | La commande a échoué dans ce shell (`rg: command not found` utilisé dans le pipeline) — **non concluant** pour un inventaire exhaustif des unit-files |
| Définitions timers veille | `cat ~/.config/systemd/user/hermes-veille-sentinel.timer` ; `cat .../hermes-veille-xveille.timer` | `hermes-veille-sentinel.timer` : `OnCalendar=*-*-* *:00,15,30,45:00`, `AccuracySec=30s`. `hermes-veille-xveille.timer` : `OnCalendar=*-*-* *:00,30:00` |
| Services obsolètes | `ls ~/.config/systemd/user/obsolete` ; `cat .../obsolete/hermes-veille-*.service` | `hermes-veille-{pearl,sentinel,xveille}.service` marqués obsolètes : `Type=oneshot`, `ExecStart=/data/home/veille/<nom>/run.sh`, `TimeoutStartSec=300` |
| Cible scripts veille | `ls /data/home/veille` ; `sed ... /data/home/veille/sentinel/run.sh` | `/data/home/veille` absent ; `run.sh` introuvable (`No such file or directory`) |
| Gateway Hermes | `cat ~/.config/systemd/user/hermes-gateway.service` | Service `hermes gateway run`, `WorkingDirectory=/data/home/.hermes`, `Environment="HERMES_HOME=/data/home/.hermes"`, `Restart=always`, `WantedBy=default.target` |
| Processus Hermes | `ps aux --sort=-rss \| head -15` | Plusieurs processus Python sous `~/.hermes/tools/python-...` exécutant du code de `/data/home/.hermes/hermes-agent` (gateway/agent en cours d'exécution) |

### 1.5 Réseau / egress (re-vérification)

| Constat | Commande | Résultat observé |
|---|---|---|
| HTTPS sortant (GitHub API) | `curl -I --max-time 8 https://api.github.com` | `HTTP/2 200` |
| HTTPS sortant (CERT-FR) | `curl -sS -o /dev/null -w "%{http_code}" --max-time 8 https://www.cert.ssi.gouv.fr` | `301` |
| Binaire Tor | `command -v tor` | Aucun résultat |
| Service Tor | `systemctl status tor` | `Unit tor.service could not be found.` |
| Port OR/Tor (test TCP sortant) | `timeout 5 nc -zv 93.95.228.28 9001; echo RC=$?` | `RC=124` (timeout `nc`), sans ligne « succeeded/open » capturée ; résolution `getent hosts 93.95.228.28` → `vps-93-95-228-28.1984.is` |
| TCP 443 direct | `timeout 5 bash -lc "echo >/dev/tcp/1.1.1.1/443"; echo "RC=$?"` | `RC=124` |

**Interprétation prudente (faits vs limites)** : l'egress HTTPS vers des hôtes web
testés fonctionne (200/301). Aucun binaire/service Tor n'est installé. Le test
TCP vers `93.95.228.28:9001` s'est terminé par timeout (`RC=124`) ; combiné au
constat « Tor n'a pas bootstrappé, OR ports refusés » rapporté au préalable, cela
est cohérent avec un egress restreint/filtré vers les ports OR, mais ce test isolé
ne prouve pas à lui seul la cause (filtrage vs hôte distant). **À re-vérifier**
avant tout besoin d'accès Tor : tester plusieurs relais/ports OR connus et
`tor --verify-config`/bootstrap si Tor est installé un jour.

### 1.6 Intégration côté dépôt `radar-cyber` (local, lu)

| Constat | Fichier/commande | Résultat observé |
|---|---|---|
| Section Hermes | `README.md` (section « Intégration Hermes ») | « La box `hermes` héberge l'infrastructure de bots. Un profil `radar-cyber` y est configuré (SOUL, skill de veille, cron quotidien 06:00 UTC). Le collecteur `hermes.collector.ts` rapatrie les briefings via le tunnel SSH instabox. » |
| Collecteur | `apps/api/src/collectors/hermes.collector.ts` | Lit `ls -1 /data/home/.hermes/profiles/radar-cyber/out/*.json` via `execFile("instabox", ["ssh", "hermes", <cmd>])` (timeout 60s), parse chaque briefing `{events:[...]}`, normalise (`family`, `assertion_type`, `dedup_key`, sévérité 1-5, etc.), insère en base `event` (ON CONFLICT dedup_key DO NOTHING), rattache `org_id` par nom si trouvé. `SOURCE_ID = "hermes_radar_cyber"`. **Pas d'endpoint HTTP d'ingest** côté API trouvé ; remontée = fichiers `out/*.json` rapatriés par SSH. |
| Absence endpoint ingest | `rg -n "ingest|/api/ingest|import" apps/api/src README.md db` | Occurrences liées à `ingestQuery`/collecteurs internes ; aucune route `/api/ingest` identifiée |

## 2. Architecture cible (plan de déploiement)

### 2.1 Principes

- **Collecte passive uniquement** : sources publiques/OSINT autorisées, jamais de
  scan, brute-force ni contournement d'accès.
- **Aucun accès `.onion`** (interdit par politique et cohérent avec l'egress
  filtré observé). Toute revendication issue du dark web reste une *allégation* à
  qualifier (`assertion_type` approprié), jamais présentée comme incident confirmé.
- **Remontée des données** : chaque bot écrit un briefing JSON dans
  `~/.hermes/profiles/<profil>/out/briefing-<date>.json`. Le collecteur radar
  (`hermes.collector.ts`) rapatrie `.../profiles/radar-cyber/out/*.json` via le
  tunnel SSH `instabox ssh hermes` (constaté dans le code). Le pipeline
  `hermes-briefing.mts` → `hermes-push.mts` (section 7) normalise un texte brut
  et l'écrit au schéma collecteur ; le wrapper `radar-hermes-pipeline.sh` et le
  timer `radar-hermes-pipeline.timer` l'appliquent automatiquement.
  *Aucun endpoint HTTP `POST /api/ingest` n'existe dans l'API actuelle (vérifié
  par recherche) ; `hermes-push.mts --api-url` reste donc optionnel.*
- **Rate limit / charge** (box 4 vCPU / 7 Go, swap déjà saturé à l'inventaire) :
  1 profil = 1 famille, cadences décalées, pas de rafale parallèle, `deliver: local`.

### 2.2 Répartition proposée (armée de bots)

| Profil (cible) | Famille | Sources typiques (publiques) | Cadence proposée | Sortie |
|---|---|---|---|---|
| `radar-vuln` | Vulnérabilités | CERT-FR avis/alertes, CISA KEV, advisories éditeurs, NVD/EPSS (flux publics) | toutes les 2 h (décalée) | `out/briefing-<YYYY-MM-DDTHH>.json` |
| `radar-ransom` | Rançongiciels | Revendications publiques/flux communautaires **clearnet uniquement** (aucun `.onion`) | toutes les 3 h | idem |
| `radar-presse` | Presse / institutions régionales | Communiqués ANSSI/collectivités, presse locale cybersécurité NA, CERT-FR sectoriel | toutes les 4 h | idem |
| `radar-cert` | Certificats / CT | Journaux CT publics, signaux de délivrance anormale (collecte passive) | toutes les 6 h | idem |

> Le profil `radar-cyber` **existe déjà** sur la box (inventaire 1.2) avec un job
> quotidien racine en erreur de contexte ; le plan cible peut soit le conserver
> comme profil agrégateur/compatibilité (répertoire `out/` déjà lu par le
> collecteur), soit migrer vers les 4 profils ci-dessus — choix à valider avant
> exécution. Le script fournit la création idempotente des 4 profils dédiés.

### 2.3 Garde-fous

- Interdiction explicite `.onion` dans chaque SOUL de veille.
- Aucune revendication présentée comme incident confirmé sans recoupement.
- Aucune donnée personnelle / identifiant / secret dans les sorties.
- Pas de modification des services existants (`hermes-gateway`, `hermes-serve`,
  timers `pronote-*`, etc.) et pas d'arrêt de processus.
- Pas d'activation automatique de timers/services non désirés : le script installe
  les timers de santé et de pipeline mais ne les active pas (`enable --now`
  laissé à l'opérateur).

## 3. Commandes de déploiement

Script livré : `scripts/deploy-hermes.sh` (idempotent, commenté). **Non exécuté.**

```bash
# 1) Vérification syntaxique (réalisable en local, sans toucher la box)
bash -n scripts/deploy-hermes.sh

# 2) Exécution sur la box cible (à lancer par l'opérateur, après relecture)
#    Copier le script sur la box puis :
ssh instabox-hermes 'bash -s -- --radar-host <hote-radar-tailnet>' < scripts/deploy-hermes.sh

#    ou, simulation sans modification :
ssh instabox-hermes 'bash -s -- --dry-run' < scripts/deploy-hermes.sh
```

Le script : installe prérequis apt + Node LTS si absent, installe le CLI Hermes si
absent (bootstrap officiel, best-effort), crée les profils/SOUL/`config.yaml`/`out/`,
épingle un modèle résolu sur chaque job cron (`--model`/`--provider`), déclare les
jobs cron espacés (`deliver local`), installe le pipeline de remontée
(`hermes-briefing.mts`, `hermes-push.mts`, wrapper) et les timers `radar-hermes-health`
et `radar-hermes-pipeline` (non activés), puis affiche un état final. Les secrets
(`.env`) ne sont jamais écrits : renseigner manuellement si le fournisseur de
modèle l'exige.

`--dry-run` strict : n'écrit ni ne crée rien ; toutes les actions sont affichés
préfixées `[dry-run]`.

## 4. Procédure de vérification (post-déploiement)

À exécuter sur la box après déploiement réel :

```bash
# Versions / présence
node --version
~/.local/bin/hermes --version   # ou hermes --version si dans le PATH

# Profils, sorties et modèle résolu
for p in radar-vuln radar-ransom radar-presse radar-cert; do
  echo "--- $p"
  ls -la ~/.hermes/profiles/$p/{SOUL.md,config.yaml,out} 2>&1 | head -10
  grep -m1 'default:' ~/.hermes/profiles/$p/config.yaml 2>/dev/null || echo "  config.yaml sans modèle !"
  ~/.local/bin/hermes -p "$p" cron list 2>&1 | grep -E 'Name:|Last run:' | head -4
done

# Pipeline de remontée
ls -la ~/.hermes/scripts/{hermes-briefing.mts,hermes-push.mts,radar-hermes-pipeline.sh}
~/.local/bin/hermes -p radar-vuln cron list 2>&1 | head -12

# Timers (si activés manuellement)
systemctl --user list-timers --all | grep radar-hermes

# Jobs cron : modèle épinglé + dernier run
~/.local/bin/hermes cron doctor

# Contrat de sortie attendu par le collecteur radar (fichiers JSON dans out/)
find ~/.hermes/profiles/radar-cyber/out -maxdepth 1 -name '*.json' 2>&1 | head
```

Test fonctionnel du pipeline (fichier factice) :

```bash
printf '## CVE-2026-1234 — faille critique\n- url: https://www.cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-0001/\n- famille: vuln\n- sévérité: 5\n' > /tmp/b.txt
node --experimental-strip-types ~/.hermes/scripts/hermes-briefing.mts /tmp/b.txt --profile radar-vuln --out /tmp/b.json
node --experimental-strip-types ~/.hermes/scripts/hermes-push.mts /tmp/b.json --dry-run
```

Côté radar (sur l'hôte qui exécute l'API), le collecteur rapatrie via :
`instabox ssh hermes 'ls -1 /data/home/.hermes/profiles/radar-cyber/out/*.json'`
puis insère les événements (`hermes_radar_cyber`). Vérifier après un run :
présence de nouveaux fichiers `out/*.json` puis exécution/trace du collecteur.

## 5. Limites et points d'attention

- **Egress filtré / Tor** : HTTPS vers `api.github.com` (200) et
  `www.cert.ssi.gouv.fr` (301) fonctionne (re-vérifié 2026-11-10). `tor` absent,
  `tor.service` introuvable ; test TCP `nc -zv 93.95.228.28 9001` → timeout
  `RC=124` (re-vérifié). Cohérent avec « Tor n'a pas bootstrappé, OR ports
  refusés » mais cause exacte à re-confirmer (tester plusieurs relais). **Aucun
  accès `.onion` ne doit être tenté.**
- **Job radar-cyber existant en erreur** : le job racine `c35aee605a34` (quotidien
  06:00 UTC, `deliver: local`) a échoué au dernier run (`RuntimeError` contexte
  trop large, modèle `qwen/qwen3.8-27b`), profil `radar-cyber/out/` vide. Diagnostic
  complet et commandes de correction exactes : **section 6**.
- **Jobs des 4 profils en erreur « no model configured »** : les profils `radar-*`
  n'avaient pas de `config.yaml` ; le déploiement écrit désormais un `config.yaml`
  minimal (modèle + compression) et épingle `--model`/`--provider` sur chaque job.
  Voir **section 6**.
- **Jobs/infra veille historiques** : timers `hermes-veille-*` présents mais sans
  prochain déclenchement listé ; services associés déplacés en `obsolete/` pointant
  vers `/data/home/veille/<nom>/run.sh` (répertoire `/data/home/veille` absent).
  État hérité, à ne pas confondre avec le nouveau déploiement.
- **Mémoire/swap** : swap quasi saturé à l'inventaire (`2.0Gi` utilisés sur
  `2.0Gi`) — les cadences décalées et le faible parallélisme sont importants.
- **Chemin de remontée** : le collecteur lit uniquement
  `~/.hermes/profiles/radar-cyber/out/*.json` (chemin codé en dur dans
  `hermes.collector.ts`). Les profils famille livrés ici écrivent dans leur propre
  `out/` ; pour ingestion automatique, prévoir soit une copie/symlink vers
  `radar-cyber/out/`, soit une évolution du collecteur (modification code, hors
  déploiement exécuté ici).
- **CLI/cron** : les sous-commandes exactes `hermes profile create` /
  `hermes cron create` dépendent de la version (`v0.22.5` constatée) ; le script
  les appelle en best-effort et n'échoue pas si elles diffèrent — vérifier avec
  `hermes --help`, `hermes profile --help`, `hermes cron --help`.
- **Sécurité** : ne jamais committer de secrets ; renseigner les clés API dans les
  `.env` de profils manuellement sur la box.

## Exécution réelle

CLI confirmée sur la box : `~/.local/bin/hermes` (Hermes Agent v0.22.5 ; v0.23.0
observée en local). PATH non-interactif : utiliser
`HERMES_BIN=~/.local/bin/hermes` ou chemin absolu.

Syntaxe CLI vérifiée (`--help`) :
- `hermes -p <profil> cron create --name <nom> <schedule> <prompt> --deliver local --model <modèle> --provider <fournisseur>`
- `hermes -p <profil> cron edit <job_id> --model <modèle> --provider <fournisseur> --no-continuity --prompt <prompt>`
- `hermes profile show|create <nom>`
- `hermes cron list`
- `hermes sessions list|prune|delete`

Correctif job quotidien `c35aee605a34` : erreur « conversation too large » avec
`qwen/qwen3.8-27b`. Procédure exacte en **section 6** (épingle du modèle, seuil de
compression 30 k tokens, `--no-continuity`, reset de session).

## 3. Exécution réelle (2026-11-10)

Déploiement non dry-run effectué sur instabox-hermes via
`bash /data/home/radar-cyber/scripts/deploy-hermes.sh --radar-host localhost`.

- 4 profils créés : `radar-vuln`, `radar-ransom`, `radar-presse`, `radar-cert` dans `~/.hermes/profiles/`.
- Jobs cron actifs (un par profil) :
  - `radar-vuln` / `veille-vuln` — `17 */2 * * *`
  - `radar-ransom` / `veille-ransom` — `47 */3 * * *`
  - `radar-presse` / `veille-presse` — `23 */4 * * *`
  - `radar-cert` / `veille-cert` — `53 */6 * * *`
- Timer systemd `radar-hermes-health.timer` activé (`systemctl --user enable --now`).
- Vérification : `hermes -p radar-<profil> cron list` affiche 1 job actif par profil.
- Remontée : fichiers `out/briefing-*.json` rapatriés par le collecteur `hermes.collector.ts` via SSH (pas d'endpoint HTTP ingest).

## 6. Crash du job `radar-cyber` — diagnostic et correctif (2026-11-10)

### 6.1 Symptôme

`~/.local/bin/hermes cron runs c35aee605a34` :

```
6175991744ef40bd9fb838fc55a8ec25  failed  job=c35aee605a34  source=builtin  2026-11-10T06:00:36Z
RuntimeError: This conversation (including attachments) has grown too large to send to
qwen/qwen3.8-27b, and Hermes couldn't shrink it enough automatically. Start a new
session with /new (your history is kept), or try /compress once more.
```

### 6.2 Cause

- Le job racine `c35aee605a34` a `model: null` et `provider: null` dans
  `~/.hermes/cron/jobs.json` : le modèle est résolu au moment du tir.
- `~/.hermes/profiles/radar-cyber/config.yaml` déclare
  `model.default: stepfun/step-3.7-flash:free` (provider `nous`), avec une chaîne
  `fallback_providers` dont `qwen/qwen3.8-27b` (groq). La session du job a
  accumulé du contexte (attachments, multi-tours) ; le repli vers `qwen3.8-27b`
  a dépassé la fenêtre de contexte, et la compression automatique n'a pas suffi
  (`compression.threshold_tokens: 60000`).
- La cause n'est donc pas le seul prompt : c'est l'accumulation de contexte sur
  une session de cron + un modèle de repli à fenêtre trop courte.

### 6.3 Commandes de correction (à exécuter sur la box)

```bash
# 1) Épingler un modèle petit et le fournisseur vérifié opérationnel (HTTP 200)
~/.local/bin/hermes cron edit c35aee605a34 \
  --model stepfun/step-3.7-flash:free \
  --provider nous \
  --no-continuity \
  --prompt "Produis le briefing quotidien du Radar Cyber Nouvelle-Aquitaine : lance la skill radar-cyber et écris out/briefing-<date>.json. Faits uniquement, sources citées, périmètre Nouvelle-Aquitaine."

# 2) Baisser le seuil de compression (contexte plus court) dans
#    ~/.hermes/profiles/radar-cyber/config.yaml :
#      compression:
#        threshold_tokens: 30000
#        enabled: true
#    puis redémarrer le gateway : `~/.local/bin/hermes gateway restart`

# 3) Repartir d'une session propre sans perdre l'historique :
~/.local/bin/hermes -p radar-cyber sessions prune --older-than 7d --yes
#    (ou supprimer la session exacte : `hermes -p radar-cyber sessions delete <id>`)

# 4) Vérifier
~/.local/bin/hermes -p radar-cyber cron doctor
~/.local/bin/hermes -p radar-cyber cron run c35aee605a34
```

### 6.4 Jobs des 4 profils (« no model configured »)

`hermes -p radar-vuln cron list` affichait `error: GatewayRPCError: request_failed` ;
`~/.hermes/profiles/radar-vuln/logs/errors.log` donnait la cause :

```
RuntimeError: Cron job 'veille-vuln' has no model configured (job.model=None,
HERMES_MODEL='', config.yaml model.default missing or empty). Set a per-job model
via `hermes cron edit 4abbdadc797c --model <name>` or set a default with
`hermes model <name>`.
```

Correction (deux volets, le script `deploy-hermes.sh` l'applique désormais) :

```bash
# a) config.yaml minimal par profil (modèle + compression) :
#    ~/.hermes/profiles/<profil>/config.yaml
model:
  provider: nous
  default: stepfun/step-3.7-flash:free
agent:
  reasoning_effort: none
compression:
  threshold_tokens: 30000
  enabled: true

# b) épingle du modèle sur chaque job existant
for spec in "radar-vuln 4abbdadc797c" "radar-ransom c7ee13346af7" \
            "radar-presse cef98c682ec2" "radar-cert ea3fd38bd64b"; do
  set -- $spec
  ~/.local/bin/hermes -p "$1" cron edit "$2" \
    --model stepfun/step-3.7-flash:free --provider nous --no-continuity
done
```

## 7. Pipeline de remontée briefing → Radar

Deux scripts Node (zéro dépendance, type stripping natif) :

| Script | Rôle |
|---|---|
| `scripts/hermes-briefing.mts` | Texte de briefing (brut) → JSON normalisé `{profile, generated_at, items[]}` |
| `scripts/hermes-push.mts` | JSON normalisé → schéma collecteur `{generated_at, events[]}` → fichier `out/` (ou `POST /api/ingest`) |

### 7.1 Normalisation (sans LLM)

```bash
node --experimental-strip-types scripts/hermes-briefing.mts <briefing.txt> \
  --profile radar-vuln --out /tmp/briefing.json
```

Format d'entrée toléré : titre Markdown par item (`## Titre`) ou puces
(`-`/`*`/`1.`), métadonnées inline `url:`, `famille:`, `sévérité:`, `résumé:` ;
JSON déjà structuré (`items` ou `events`) accepté en idempotent.

Sortie :

```json
{ "profile": "radar-vuln", "generated_at": "2026-11-10T14:14:13Z",
  "items": [ { "title": "CVE-2026-1234 — faille critique", "url": "https://…",
               "summary": "…", "severity": 5, "family": "vuln" } ] }
```

### 7.2 Remontée

```bash
# Fichier (mode recommandé, lu par hermes.collector.ts via SSH)
node --experimental-strip-types scripts/hermes-push.mts /tmp/briefing.json \
  --profile radar-vuln

# Dry-run : affiche la charge utile sans écrire ni envoyer
node --experimental-strip-types scripts/hermes-push.mts /tmp/briefing.json --dry-run

# HTTP (seulement si la route est enregistrée côté API)
node --experimental-strip-types scripts/hermes-push.mts /tmp/briefing.json \
  --api-url http://radar:8080/api/ingest
```

Par défaut, le fichier est écrit dans
`~/.hermes/profiles/radar-cyber/out/briefing-<AAAA-MM-JJ>.json` (chemin lu par
`hermes.collector.ts`). `--out <chemin>` permet de choisir le profil.

### 7.3 Déploiement

`deploy-hermes.sh` copie les deux scripts dans `~/.hermes/scripts/`, installe le
wrapper `radar-hermes-pipeline.sh` (normalise les `out/briefing-*.txt` puis
remonte) et le timer `radar-hermes-pipeline.timer` (horaire). Aucune activation
automatique : `systemctl --user enable --now radar-hermes-pipeline.timer`.

Le wrapper écrit dans
`~/.hermes/profiles/radar-cyber/out/briefing-<profil>-<date>.json` (répertoire lu
par le collecteur), avec un suffixe de profil pour éviter les écrasements entre
familles.

### 7.4 Exemple complet (test réel)

```bash
cat > /tmp/briefing.txt <<'EOF'
# Briefing radar-vuln — 2026-11-10

## CVE-2026-1234 — faille critique dans Produit X
- url: https://www.cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-0001/
- famille: vuln
- sévérité: 5
- résumé: Correction disponible, présente dans le catalogue KEV CISA.
EOF

node --experimental-strip-types scripts/hermes-briefing.mts /tmp/briefing.txt \
  --profile radar-vuln --out /tmp/briefing.json
node --experimental-strip-types scripts/hermes-push.mts /tmp/briefing.json --dry-run
```

Résultat : `3 item(s)` → JSON valide, puis charge utile `events[]` avec
`dedup_key hermes:<sha256>` et `assertion_type third_party_claim` pour les
revendications rançongicielles (jamais `confirmed_incident`).
