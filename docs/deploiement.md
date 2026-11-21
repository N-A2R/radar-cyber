# Déploiement de production — une commande

Procédure complète pour installer Radar Cyber sur une machine Debian/Ubuntu
neuve : paquets, PostgreSQL, schéma, migrations, catalogues, référentiel,
restauration optionnelle, build, unités systemd, sonde de santé et retour en
arrière. Tout est idempotent : le rejeu ne duplique ni source, ni organisation.

## Une commande

Depuis une machine neuve avec `curl` et `sudo` (le script clone le dépôt lui-même) :

```bash
curl -fsSL https://raw.githubusercontent.com/j0ltdevv/radar-cyber/main/scripts/deploy/install.sh \
  | sudo bash -s -- --admin-password 'MOT-DE-PASSE-ADMIN' \
       --restore /srv/sauvegardes/radar-2026-11-20.dump
```

Sans sauvegarde, on part d'une base vide (0 événement, catalogue de sources et
référentiel peuplés) — c'est un état supporté, pas une erreur :

```bash
curl -fsSL https://raw.githubusercontent.com/j0ltdevv/radar-cyber/main/scripts/deploy/install.sh \
  | sudo bash -s -- --admin-password 'MOT-DE-PASSE-ADMIN'
```

Sur une machine où le dépôt est déjà présent (cas testé ici, et cas d'un
déploiement hors réseau sortant) :

```bash
sudo bash scripts/deploy/install.sh --source "$PWD" \
  --admin-password 'MOT-DE-PASSE-ADMIN' --db-password 'MOT-DE-PASSE-DB'
```

Les mots de passe sont générés (hexadécimal 48 caractères) s'ils ne sont pas
fournis. Ils ne sont jamais écrits dans `state.json`.

### Entrée courte : `scripts/install.sh` (PostgreSQL 18)

Pour une machine neuve où l'on veut uniquement l'API (pas le front, pas de
release immuable), `scripts/install.sh` est le chemin court. Il installe
PostgreSQL **18** depuis le dépôt PGDG, restaure un dump optionnel, applique
`db/init.sql` et les migrations, installe les dépendances, construit le front,
installe l'unité système `radar-api` et prouve `/api/health` en HTTP 200.

```bash
sudo bash scripts/install.sh --admin-password 'MOT-DE-PASSE' \
  [--dump /srv/sauvegardes/radar.dump]
```

Il est idempotent : un rejeu réutilise la release et n'applique que les
migrations manquantes. Désinstallation (données conservées par défaut) :

```bash
sudo bash scripts/install.sh --uninstall
sudo bash scripts/install.sh --uninstall --purge-data   # supprime aussi base, rôle, cluster
```

> URL et branche du clone : `RADAR_REPO_URL` (défaut
> `https://github.com/j0ltdevv/radar-cyber.git`) et `RADAR_REF` (défaut `main`).
> Pour déployer une branche non fusionnée : `RADAR_REF=ma-branche ... bash -s -- ...`.

## Options

| Option | Effet |
|---|---|
| `--source DIR` | dépôt local à déployer (défaut : celui du script, sinon clone) |
| `--repo-url URL`, `--ref REF` | dépôt/branche à cloner en l'absence de `--source` |
| `--admin-password PWD`, `--admin-email EMAIL` | compte administrateur créé par le socle |
| `--db-password PWD`, `--db-name NAME`, `--db-user USER`, `--pg-port N` | connexion PostgreSQL |
| `--api-port N`, `--web-port N` | ports d'écoute (8080 / 5173) |
| `--public` | écoute sur `0.0.0.0` au lieu de `127.0.0.1` |
| `--restore ARCHIVE` | dump `.dump`, `.sql` ou `.gpg` restauré avant le socle |
| `--passphrase-file FILE` | phrase secrète d'une archive chiffrée (obligatoire pour `.gpg`) |
| `--strict-data` | refuse une archive sans événement |
| `--no-collect` | `RADAR_COLLECT=0` (utile en environnement sans réseau sortant) |
| `--no-rollback` | laisse l'état en cas d'échec, pour diagnostic |
| `--dry-run` | affiche le plan sans rien modifier |
| `--check` | vérifie une installation existante, sans écriture applicative |
| `--rollback [--to ID]` | revient à la release précédente ou à un ID précis |

## Ce que fait l'installateur

Chaque étape est chronométrée et consignée dans
`/var/lib/radar-cyber/state.json` et `/var/lib/radar-cyber/install.log`.

| Étape | Détail |
|---|---|
| Prérequis | `apt-get` : postgresql, client, curl, jq, git, openssl, npm, rsync, iproute2 ; Node ≥ 20.19 ; pnpm 12.15.0 |
| Source | `--source`, ou clone peu profond de `RADAR_REPO_URL@RADAR_REF` |
| Utilisateur | compte système `radar`, `/opt/radar-cyber`, `/var/lib/radar-cyber`, `/etc/radar-cyber` |
| PostgreSQL | rôle + base, mot de passe aligné, service `postgresql` activé |
| Snapshot | `pg_dump -Fc` de la base courante avant toute migration/restauration |
| Restauration | `pg_restore` (custom/tar) ou `psql` (SQL), puis contrôle des tables `event`, `org`, `source` |
| Build | `pnpm install --frozen-lockfile`, typecheck API, build web, release immuable + symlink `current` |
| Socle | `scripts/bootstrap.mts` : schéma, **53 migrations**, catalogues de sources, règles, référentiel NA, journal, compte admin |
| systemd | unités système `radar-api`/`radar-web`, `EnvironmentFile` 0640, `enable` + `restart` |
| Santé | `scripts/healthcheck.sh` : `/api/health`, `/api/stats`, shell web + asset JS, 40 tentatives / 80 s |

Répertoires :

```
/opt/radar-cyber/current -> releases/<horodatage>-<sha>   # code immuable
/var/lib/radar-cyber/state.json                          # état + historique (0600)
/var/lib/radar-cyber/install.log                         # journal daté
/var/lib/radar-cyber/backups/pre-*.dump                  # snapshots avant changement (0600)
/etc/radar-cyber/radar.env                               # secrets (0640 root:radar)
/etc/systemd/system/radar-{api,web}.service              # unités rendues
```

## Temps mesurés

Mesuré sur l'InstaBox (4 vCPU, 8 Gio, Debian 13) dans une machine neuve isolée :
conteneur Docker avec **systemd pour PID 1**, PostgreSQL 17.12, Node 20.19.2,
pnpm 12.15.0. Le contenant diffère d'une VM InstaBox souvent endormie : la
procédure elle-même n'appelle aucun service InstaBox propriétaire.

| Scénario | Temps mesuré (harnais + tests complémentaires) |
|---|---:|
| Installation neuve, base vide, `--no-collect` | **114,8 s** (114 778 ms) |
| Rejeu idempotent (`--prefer-offline`, store pnpm chaud) | **19,4 s** (19 406 ms) |
| Réinstallation avec restauration d'un dump sans événement | **26,4 s** (26 413 ms) |
| Échec sur dump corrompu + retour en arrière automatique | **11,9 s** (11 896 ms) |
| Retour en arrière manuel | **8,2 s** (8 160 ms) |
| Restauration d'une archive `.gpg` (AES-256, phrase secrète) | **16,6 s** (16 597 ms) |
| `--strict-data` sur une archive vide : refus + rollback auto | **8,3 s** |
| Refus d'un port occupé (avant toute mutation) | **145 ms** |
| `--check` sur une installation en place | ~3 s |

Détail de l'installation neuve : prérequis/apt **74,1 s** (dont l'installation
des paquets), `pnpm install` **20,4 s**, typecheck API **4,9 s**, build web
**1,4 s**, socle/migrations **8,1 s**, sonde de santé **2,2 s**. Au rejeu,
`pnpm install` tombe à **293 ms**. Les mesures ont été relevées à l'appel
(harnais) et dans `state.json` (installateur) ; une exécution intermédiaire a
pris 148 s au rejeu sur un ralentissement du registre npm, d'où
`--prefer-offline`.

Sortie de santé attendue :

```
OK   /api/health → {"ok":true,"sources":311}
OK   /api/stats → {"orgs":4462,"events":0,"indicators":0}
OK   carte : shell web + point d'entrée servis (/assets/index-…js)
OK   Tous les tests de supervision sont OK.
```

## Vérifier après installation

```bash
sudo bash /opt/radar-cyber/current/scripts/deploy/install.sh --check
curl -fsS http://127.0.0.1:8080/api/health | jq .
curl -fsS http://127.0.0.1:8080/api/stats  | jq '{orgs,events,indicators,sources}'
systemctl status radar-api radar-web --no-pager
journalctl -u radar-api -u radar-web -n 100 --no-pager
sudo -u postgres psql -d radar -At -c \
  "SELECT (SELECT count(*) FROM event), (SELECT count(*) FROM org), (SELECT count(*) FROM source)"
```

Le port 5173 sert l'UI et proxie `/api` vers 8080. Sans `--public`, les deux
services n'écoutent que sur la boucle locale : face à un reverse proxy (Caddy,
cf. `Caddyfile`) ou à un tunnel SSH, c'est ce dernier qui publie le service.

## Restauration

```bash
# Dump custom de la base courante
sudo -u postgres pg_dump -Fc -d radar -f /srv/sauvegardes/radar.dump

# Restauration chiffrée
sudo bash scripts/deploy/install.sh --restore /srv/sauvegardes/radar.dump.gpg \
  --passphrase-file /etc/radar-cyber/backup.pass
```

L'archive est restaurée dans la base `radar` recréée, vérifiée (présence des
tables, comptages journalisés), puis le socle rejoue les migrations manquantes
et complète les catalogues sans dupliquer. Une archive sans événement est
acceptée avec un avertissement ; `--strict-data` la refuse. Une archive dont
les tables `event`/`org`/`source` sont absentes est rejetée.

## Retour en arrière

Automatique : si une étape échoue après `init_state`, l'installateur restaure
le snapshot pris au début du passage, rebascule le symlink `current` vers la
release précédente, réécrit l'environnement et les unités, redémarre les
services et rejoue la sonde de santé. Le code de sortie reste non nul pour
que l'appelant (CI, cron) voie l'échec.

Manuel :

```bash
sudo jq -r '.history[] | [.id, .status] | @tsv' /var/lib/radar-cyber/state.json
sudo bash /opt/radar-cyber/current/scripts/deploy/install.sh --rollback --to <ID>
# ou, sans ID : release précédente dans l'historique
sudo bash /opt/radar-cyber/current/scripts/deploy/install.sh --rollback
```

Ce qui revient en arrière : le code (`current`), la base (snapshot `pg_restore`),
`/etc/radar-cyber/radar.env`, les unités systemd et les ports. Ce qui ne revient
pas : les paquets système installés et les fichiers hors des répertoires gérés.
Sur une toute première installation en échec, le nettoyage supprime base, rôle,
unités et release créés.

## Cas d'erreur traités

| Situation | Comportement mesuré |
|---|---|
| Commande lancée sans root | `ERREUR: cette installation doit être lancée en root`, code 1 |
| Distribution non Debian/Ubuntu | refus avant `apt-get` |
| Port 8080/5173 déjà pris | `ERREUR: port API … déjà occupé par un autre processus`, avant toute mutation (145 ms) |
| `--restore` sur fichier absent | refus avant installation des paquets ; base inchangée |
| `.gpg` sans `--passphrase-file` | refus avant mutation |
| Dump corrompu | `ÉCHEC … pendant : Restauration optionnelle`, puis retour en arrière automatique (11,9 s mesurées) |
| `--strict-data` sur un dump sans événement | refus après journalisation des comptages, rollback auto (8,3 s) |
| Archive `.gpg` avec bonne phrase secrète | déchiffrement en lot (`--pinentry-mode loopback`), restauration vérifiée (16,6 s) |
| PostgreSQL injoignable | message explicite + `journalctl -u postgresql`, code 1 |
| État `in-progress` hérité d'un crash | refus de rejouer ; lancer `--rollback` d'abord |
| `--rollback --to ID-INCONNU` | `ERREUR: ID de release inconnu`, code 1, aucun changement |
| `--dry-run` | `Plan affiché … aucune modification effectuée`, empreinte de `state.json` identique |
| Sonde de santé rouge | 40 tentatives, journal des unités dans `install.log`, retour en arrière |
| Base vide / dump vide | installation réussie, compteurs à 0, santé verte (avertissement explicite) |

## Rejouer le test sur une InstaBox neuve

Le dépôt contient un harnais qui provisionne une Debian 13 avec systemd PID 1,
copie le dépôt, puis enchaîne installation, idempotence, restauration vide, cas
d'erreur, retour en arrière automatique et manuel :

```bash
bash scripts/deploy/fresh-machine-test.sh
RADAR_TEST_KEEP=1 bash scripts/deploy/fresh-machine-test.sh   # garder la machine
```

L'image `radar-debian13-systemd` est construite automatiquement depuis
`debian:13` si elle n'existe pas. Le harnais affiche une ligne `[MESURE]`
par scénario et échoue à la première assertion non respectée.

## Limites connues

- Un seul nœud : ni réplication PostgreSQL ni bascule automatique. Le snapshot
  local n'est pas une sauvegarde hors site (`scripts/backup-db.sh` reste
  nécessaire).
- `--public` expose directement `vite preview` : le reverse proxy/Caddy et le
  TLS restent à configurer séparément.
- Le retour en arrière restaure la base et le code, pas les événements collectés
  après le snapshot pris au début du passage (fenêtre de perte = durée du
  déploiement).
