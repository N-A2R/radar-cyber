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

## Sauvegarde et restauration

`scripts/backup-db.sh` réalise un dump custom compressé
(`pg_dump --format=custom --compress=9`), vérifie son intégrité
(`pg_restore --list`) et rotate les 14 derniers dumps.

```bash
scripts/backup-db.sh
# Dumps dans ~/.local/share/radar-cyber/backups/radar-<horodatage>.dump
BACKUP_DIR=/mnt/sauvegardes RETENTION=30 scripts/backup-db.sh
```

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
