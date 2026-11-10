# Opérations

Runbook Radar Cyber : installation, services systemd, supervision, mise à jour,
sauvegarde et restauration.

## Vue d'ensemble

| Composant | Rôle | Port par défaut |
|---|---|---|
| `radar-api` | API Fastify, collecteurs, quarantaine | 8080 |
| `radar-web` | Interface React (dist de production via `vite preview`) | 5173 |
| PostgreSQL | Stockage (events, indicateurs, orgs, quarantaine) | 5432 |

Fichiers d'exploitation :

- `scripts/systemd/` — modèles d'unités, config `vite preview`, installateur
- `scripts/healthcheck.sh` — sonde de supervision
- `scripts/verify-all.sh` — vérification locale complète
- `scripts/backup-db.sh` — sauvegarde quotidienne de la base
- `.github/workflows/ci.yml` — typecheck, tests, build à chaque push/PR

## Prérequis

- Linux avec systemd et **session utilisateur** (`systemctl --user`)
- Node.js ≥ 20.19 (24 recommandé) et pnpm 12
- PostgreSQL 17+ accessible via `DATABASE_URL`
- Client `psql`, `curl`, `jq`

Par défaut, l'API se connecte à `postgres://radar:radar@localhost:5432/radar`
(variable `DATABASE_URL`, voir `apps/api/src/db.ts`).

## Installation initiale

```bash
cd ~/radar-cyber
pnpm install

# Base : schéma, migrations, sources et règles de détection
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
for f in db/migrate-*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/sources.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/detection-rules.sql

# Référentiel des organisations (optionnel)
ORGS_CSV=/chemin/orgs-na.csv pnpm tsx db/seed.ts
```

Les migrations sont idempotentes (`IF NOT EXISTS`) : les rejouer sans risque.

## Services systemd

Les unités sont **utilisateur** : elles vivent dans la session, sans `sudo`, et
meurent à la déconnexion sauf si linger est activé.

```bash
# Génère les unités dans ~/.config/systemd/user/, les active et les démarre
scripts/systemd/install.sh
```

L'installateur est idempotent : il peut être relancé après chaque mise à jour
(les unités sont réécrites depuis les modèles). Il :

1. substitue le chemin du dépôt, le binaire pnpm et un `PATH` explicite
   (systemd n'hérite pas du shell : mise, pnpm global…) dans les modèles ;
2. active le **linger** si nécessaire (`loginctl enable-linger`) ;
3. `enable` les deux unités, puis les démarre **si le port est libre** ;
4. vérifie avec `systemctl --user is-active`.

Ports : `RADAR_API_PORT` (défaut 8080) et `RADAR_WEB_PORT` (défaut 5173).

> Si un processus est déjà en cours et tient le port (lancement manuel), les
> unités restent activées mais ne sont pas démarrées — l'installateur n'y
> touche pas. Pour passer sous systemd : arrêter le processus manuel, puis
> `systemctl --user restart radar-api.service`.

### Cycle de vie

```bash
systemctl --user status  radar-api.service radar-web.service
systemctl --user start   radar-api.service
systemctl --user stop    radar-web.service
systemctl --user restart radar-api.service radar-web.service
systemctl --user enable  radar-api.service   # démarrage à la session
systemctl --user disable radar-web.service
```

Les deux services ont `Restart=on-failure` : crash → redémarrage après 5 s,
mais un `systemctl --user stop` reste un arrêt volontaire.

### Logs

```bash
journalctl --user -u radar-api.service -f          # temps réel
journalctl --user -u radar-api.service -n 200      # dernières lignes
journalctl --user -u radar-api.service --since "1 hour ago"
```

L'API écrit des logs JSON Fastify (niveau info) : collecteurs, erreurs,
requêtes lentes.

### Rôle précis des unités

- `radar-api.service` — `pnpm -F @radar/api start` depuis la racine du dépôt,
  avec `DATABASE_URL` et `PORT`. La boucle de collecte est active (désactivable
  via `RADAR_COLLECT=0`).
- `radar-web.service` — `vite preview` depuis `apps/web`, qui sert
  `apps/web/dist` **et** proxie `/api` vers l'API
  (`scripts/systemd/preview.config.mjs`) : l'UI appelle `/api` en same-origin,
  comme en développement.

## Vérification

```bash
scripts/verify-all.sh
```

Enchaîne, en comptant les échecs et en rendant un code de sortie non nul :

1. `pnpm -F @radar/api typecheck`
2. `pnpm -F @radar/web typecheck`
3. `pnpm -F @radar/api test`
4. `pnpm -F @radar/web build`
5. `scripts/healthcheck.sh`

Le healthcheck utilise l'API et le web **déjà en cours** ; sinon il en démarre
un exemplaire temporaire (API avec `RADAR_COLLECT=0`, web avec `vite preview`),
puis le nettoie en fin de script. Aucun fichier persistant n'est laissé dehors
des sorties de build.

Variables : `API_URL`, `WEB_URL`, `VERIFY_API_PORT`, `VERIFY_WEB_PORT`.

## Supervision

`scripts/healthcheck.sh` teste trois signaux et sort **non nul au premier
échec** :

| Sonde | Attendu |
|---|---|
| `GET /api/health` | `{ "ok": true, "sources": <nombre> }` |
| `GET /api/stats` | compteurs `orgs`, `events`, `indicators`, `sources` |
| racine web | shell React (`id="root"`) **et** point d'entrée JS servi (`/assets/*.js` en build, `/src/*.tsx` en dev) |

`/api/health` est volontairement allégé : une seule requête `count(*)` sur la
table `source`, aucun join, aucun cache à invalider — c'est la sonde à polling
fréquent. Les compteurs sont dans `/api/stats`, qui sert un cache de 20 s pour
absorber les chargements concurrents de l'UI.

Exemple de timer systemd optionnel (toutes les 5 min) :

```ini
# ~/.config/systemd/user/radar-healthcheck.service
[Unit]
Description=Radar Cyber — healthcheck

[Service]
Type=oneshot
ExecStart=%h/radar-cyber/scripts/healthcheck.sh

# ~/.config/systemd/user/radar-healthcheck.timer
[Unit]
Description=Radar Cyber — healthcheck toutes les 5 min

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now radar-healthcheck.timer
```

## Mise à jour

```bash
cd ~/radar-cyber
git pull
pnpm install --frozen-lockfile

# Nouvelles migrations éventuelles
for f in db/migrate-*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

# Le web sert dist/ : reconstruire si le front a changé
pnpm -F @radar/web build

# Réécrire les unités (chemins, ports) puis redémarrer
scripts/systemd/install.sh
systemctl --user restart radar-api.service radar-web.service
```

Vérifier ensuite : `scripts/verify-all.sh`.

## Tor (collecte `.onion`)

Les pages de revendication `.onion` passent par un proxy SOCKS5 local. Tor est
installé sur la machine mais le service système lit `/etc/tor/torrc`, qui exige
root (`User tor`). Radar Cyber utilise donc une configuration dédiée:

```bash
# ~/.config/radar-cyber/torrc
SocksPort 127.0.0.1:9050
DataDirectory ~/.local/share/radar-cyber/tor
Log notice file ~/.local/share/radar-cyber/tor/notices.log
```

et un service utilisateur `tor-radar.service` :

```bash
systemctl --user enable --now tor-radar.service
systemctl --user is-active tor-radar.service   # active
ss -ltn | grep 9050                            # LISTEN 127.0.0.1:9050
```

Vérification de bout en bout, mesurée le 10 novembre 2026 :

```bash
curl --socks5-hostname 127.0.0.1:9050 -o /dev/null -w '%{http_code}\n' \
  https://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion/
# 200 (43 s : premier circuit, les suivants sont plus rapides)
```

Le collecteur ne sort **jamais** une URL `.onion` vers le clearnet : sans
`RADAR_TOR_SOCKS`, la requête échoue immédiatement avec un message explicite.



## Sauvegarde et restauration

`scripts/backup-db.sh` réalise un dump custom compressé
(`pg_dump --format=custom --compress=9`), vérifie son intégrité
(`pg_restore --list`) et rotate les 14 derniers dumps.

```bash
scripts/backup-db.sh
# Dumps dans ~/.local/share/radar-cyber/backups/radar-<horodatage>.dump
BACKUP_DIR=/mnt/sauvegardes RETENTION=30 scripts/backup-db.sh
```

### Chiffrement et sortie hors site

Deux variables, désactivées par défaut — sans elles le script se comporte
exactement comme avant :

| Variable | Effet |
|---|---|
| `PASSPHRASE_FILE` | chiffre l'archive en AES-256 (gpg symétrique) et supprime le clair |
| `OFFSITE` | copie l'archive chiffrée (`hôte:répertoire` par scp, sinon rsync) et vérifie sa taille à distance |
| `OFFSITE_SANDBOX` | réveille la sandbox InstaBox nommée avant la copie (`instabox wake`) |

```bash
PASSPHRASE_FILE=~/.config/radar-cyber/backup.pass \
OFFSITE=hermes:/srv/backups/radar \
  scripts/backup-db.sh
```

Le chiffrement est **vérifié par déchiffrement** : le script déchiffre dans un
tube et compare le nombre d'octets avec l'original. `gpg --list-packets` ne
suffit pas — il ne lit que les en-têtes, et il déclenche pinentry en mode batch.
Les appels gpg passent donc par `--pinentry-mode loopback` : jamais de dialogue.

`OFFSITE` sans `PASSPHRASE_FILE` est refusé : une sauvegarde hors site en clair
sortirait des données TLP:RED, ce que le roadmap interdit.

**Les sandboxes du plan gratuit s'endorment** après une trentaine de minutes
d'inactivité. Sans `OFFSITE_SANDBOX`, une sauvegarde quotidienne tomberait sur
une machine en pause et échouerait presque tous les jours — le hors site
n'existerait que sur le papier. Le script réveille donc la cible avant de
copier, et se contente d'un avertissement si un cooldown l'empêche : la
sauvegarde locale reste faite.

```bash
PASSPHRASE_FILE=~/.config/radar-cyber/backup.pass \
OFFSITE=instabox-compute-3:/data/home/backups/radar \
OFFSITE_SANDBOX=compute-3 \
  scripts/backup-db.sh
```

La configuration vit dans `~/.config/radar-cyber/backup.env`, chargée par
`radar-backup.service` (timer quotidien).

### Preuve de restauration

`scripts/restore-verify.sh` restaure réellement une archive dans une base
jetable (`radar_restore_<pid>`), compte `event`, `org`, `source` et
`indicator`, puis supprime la base. Il accepte une archive claire ou `.gpg`.

```bash
PASSPHRASE_FILE=~/.config/radar-cyber/backup.pass scripts/restore-verify.sh
# [22:12:37] Restauré: event=6166 org=613 source=463 indicator=28255
# [22:12:37] Restauration vérifiée
```

C'est le seul contrôle qui prouve qu'une sauvegarde vaut quelque chose ; il
coûte quelques secondes et ne touche jamais la base `radar`.

Sur cette machine, un timer utilisateur `radar-backup.timer` (quotidien, 03:17)
appelle déjà ce script ; ses fichiers sont locaux, pas dans le dépôt. Pour le
reproduire :

```ini
# ~/.config/systemd/user/radar-backup.service
[Unit]
Description=Radar Cyber daily DB backup

[Service]
Type=oneshot
ExecStart=%h/radar-cyber/scripts/backup-db.sh
Environment=DATABASE_URL=postgres://radar:radar@localhost:5432/radar

# ~/.config/systemd/user/radar-backup.timer
[Unit]
Description=Radar Cyber daily DB backup timer

[Timer]
OnCalendar=*-*-* 03:17:00
Persistent=true
Unit=radar-backup.service

[Install]
WantedBy=timers.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now radar-backup.timer
```

### Restauration

Restauration complète sur une base vide (le dump contient le schéma) :

```bash
BACKUP="$HOME/.local/share/radar-cyber/backups/radar-2026-11-10-0317.dump"

dropdb --if-exists "$DATABASE_URL"
createdb "$DATABASE_URL"
pg_restore --no-owner -d "$DATABASE_URL" "$BACKUP"

# Ou, sans recreer la base (contenu remplacé) :
pg_restore --clean --no-owner -d "$DATABASE_URL" "$BACKUP"
```

Après restauration : `systemctl --user restart radar-api.service` (les pools
de connexions et caches sont à recréer), puis `scripts/healthcheck.sh`.

## Rapport hebdomadaire

`radar-report.timer` déclenche chaque lundi à 07:00 (`Persistent=true` : rattrapage si
la machine était éteinte) `radar-report.service`, qui appelle `scripts/report-weekly.sh`
et écrit `out/rapport-AAAA-MM-JJ.{html,md}` (répertoire `out/` ignoré par git). Unités
sans jeton `@...@`, à installer telles quelles :

```bash
install -m 644 scripts/systemd/radar-report.{service,timer} ~/.config/systemd/user/ && systemctl --user daemon-reload && systemctl --user enable --now radar-report.timer
bash scripts/report-weekly.sh                        # test manuel
journalctl --user -u radar-report.service -n 50      # logs
```

## Dépannage

| Symptôme | Piste |
|---|---|
| `radar-api.service` en `failed` | `journalctl --user -u radar-api.service -n 50` ; vérifier `psql "$DATABASE_URL" -c 'select 1'` |
| `bind: Address already in use` | un processus manuel tient 8080 : `ss -ltnp \| grep 8080` ; l'arrêter ou changer `RADAR_API_PORT` |
| L'UI charge mais `/api` renvoie 404 | le web n'est pas servi par `radar-web.service` (proxy `/api` absent) : `systemctl --user restart radar-web.service` |
| L'API ne démarre qu'en manuel | linger désactivé : `loginctl show-user "$USER" -p Linger` ; `loginctl enable-linger "$USER"` |
| `pnpm introuvable` dans les logs | le `PATH` figé de l'unité est périmé (changement d'install node/pnpm) : relancer `scripts/systemd/install.sh` |
| Tests en échec en local | la base doit contenir le schéma, les migrations, `db/sources.sql` et `db/detection-rules.sql` (voir ci-dessus) |

## Diffusion des alertes

Le module `apps/api/src/notify/alert-delivery.ts` diffuse les alertes non encore
envoyées vers les canaux configurés. Il ne démarre **aucune diffusion** et ne
produit **aucune erreur** si aucune variable n'est définie.

### Configuration

Variables d'environnement (voir `.env.example`) :

| Variable | Rôle |
|---|---|
| `RADAR_ALERT_WEBHOOK_URL` | URL recevant un `POST` JSON (`Content-Type: application/json`) |
| `RADAR_ALERT_TELEGRAM_BOT_TOKEN` | Jeton Bot Telegram (`sendMessage`) |
| `RADAR_ALERT_TELEGRAM_CHAT_ID` | Identifiant du chat Telegram cible (requis avec le jeton) |
| `RADAR_WEB_BASE_URL` | Base publique du front pour construire un lien d'alerte (optionnel) |
| `RADAR_ALERT_DELIVERY_TICK_MS` | Cadence de la boucle, en ms (défaut : 120000) |

Au moins un canal doit être complet : webhook seul, ou couple jeton+chat
Telegram, ou les deux. Sans canal complet, la boucle n'est pas enregistrée.

### Comportement

- Sélection : alertes avec `delivered_at IS NULL`, `attempts < 10` et
  `next_attempt_at` échu ou nul, par ancienneté (lot de 50 max par passage).
- Traçabilité (`db/migrate-024-alerte-diffusion.sql`) : `delivered_at`,
  `attempts`, `last_error`, `next_attempt_at`.
- Message : titre (événement/alerte), organisation, source, date, lien.
- Retry : back-off exponentiel (1, 2, 4… min, plafonné à 60 min) après échec
  réseau ; abandon après 10 tentatives (`last_error` conservé). Aucun échec
  réseau n'interrompt la collecte.
- Boucle périodique dans `apps/api/src/server.ts` (modèle `setInterval` existant),
  protégée par la garde de ré-entrance `guarded`.

### Aperçu sans envoi (dry-run)

Affiche les messages qui seraient envoyés, sans modifier la base ni appeler un
canal :

```bash
cd apps/api
./node_modules/.bin/tsx scripts/dry-run-alert-delivery.mts        # 3 messages
./node_modules/.bin/tsx scripts/dry-run-alert-delivery.mts 5      # N messages
```

Nécessite `DATABASE_URL` pointant vers une base contenant les migrations.

### Rétention — attention à la date utilisée

La rétention tourne **au démarrage de l'API** puis périodiquement. La fenêtre
est `RADAR_RETENTION_DAYS` (90 jours par défaut) et elle s'applique à
`observed_at` : la date de l'**événement**, pas celle de son ingestion.

Conséquence mesurée le 11 novembre : un redémarrage a purgé **4 245
événements**. Ce n'était pas une perte accidentelle — c'étaient des éléments
datés d'avant la fenêtre (fuites anciennes, CVE historiques) ingérés en
rattrapage. Mais le total affiché avant le redémarrage les comptait, ce qui
donne l'illusion d'une chute.

Deux points à garder en tête :

- Un événement ingéré aujourd'hui avec une date d'il y a trois mois sera purgé
  au prochain redémarrage.
- `SELECT count(*) FROM event` juste après une grosse collecte de rattrapage
  surestime donc ce que le produit conserve réellement.

Pour un observatoire, une revendication de quatre mois reste une information
utile : la fenêtre est un choix produit, pas une évidence technique.
