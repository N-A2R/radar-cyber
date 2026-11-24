# Chaîne d'approvisionnement — politiques appliquées

## Épinglage

- Images Docker : `tag@sha256:…` partout (Dockerfiles, `docker-compose.yml`,
  services PostgreSQL de CI). Le tag reste lisible, le digest fait foi.
- Actions GitHub : SHA complet, jamais `@vN`. Le SHA de `pnpm/action-setup`
  v6.1.1 a été résolu via l'API GitHub `/repos/pnpm/action-setup/tags`.
- Digests résolus le 2026-11-24 via l'API Docker Hub (`auth.docker.io/token`,
  puis `registry-1.docker.io/v2/<repo>/manifests/<tag>` avec l'en-tête
  `Docker-Content-Digest`). Ne jamais inventer un hash : le résoudre à nouveau
  avant chaque montée de version et remplacer toutes les occurrences du tag.

## Dépendances npm (`pnpm-workspace.yaml`)

- `minimumReleaseAge: 4320` (72 h) : aucune publication récente n'est éligible.
- `minimumReleaseAgeExclude` : exceptions nominatives, déjà épinglées dans
  `pnpm-lock.yaml` ; toute nouvelle exception doit être justifiée ici.
- `allowBuilds` limité aux scripts nécessaires : `esbuild` (binaire natif de
  Vite/tsx), `@embedded-postgres/linux-x64` (réhydratation des liens natifs) et
  `@astryxdesign/core` (postinstall non interactif qui affiche uniquement le
  rappel `astryx init`, sans téléchargement ni compilation).

## Portes CI

`pnpm audit --prod --audit-level=high` (bloquant), validation des deux profils
Compose et `docker build --check` sur les trois Dockerfiles, en plus du gate de
provenance existant (`pnpm provenance:measure` puis `pnpm provenance:check`).

## Conteneur Tor

Paquets installés au build, utilisateur non root, rootfs en lecture seule,
état dans un tmpfs. `SocksPort` écoute sur l'interface du conteneur, sans
publication de port sur l'hôte : le proxy n'est joignable que depuis le réseau
Compose (`socks5h://tor:9050`).

## Migration d'un volume PostgreSQL 17 vers le montage PostgreSQL 18

L'image officielle `postgres:18-alpine` utilise par défaut
`PGDATA=/var/lib/postgresql/18/docker`. Un ancien volume monté uniquement sur
`/var/lib/postgresql/data` ne doit **pas** être remplacé en place par le nouveau
montage `/var/lib/postgresql` : le serveur pourrait initialiser une base vide.

Avant `docker compose up -d`, sauvegarder puis migrer avec un conteneur jetable :

```bash
docker compose stop api web migrate db
docker run --rm -v radar-cyber_pgdata:/ancien -v radar-cyber_pgdata18:/nouveau \
  postgres:18-alpine@sha256:0115267ab5a509022df9319c77be365cef335adb71556c75f60f5360ee247e71 \
  sh -ec 'test -f /ancien/PG_VERSION || test -f /ancien/18/docker/PG_VERSION; mkdir -p /nouveau/18/docker; if test -f /ancien/PG_VERSION; then cp -a /ancien/. /nouveau/18/docker/; else cp -a /ancien/18/docker/. /nouveau/18/docker/; fi'
```

Remplacer ensuite le nom du volume `pgdata` par `pgdata18` dans le fichier
`.env`/override Compose, démarrer `db`, vérifier `pg_isready` et le nombre de
tables, puis lancer `migrate`, `api` et `web`. Ne supprimer l'ancien volume
qu'après une restauration de contrôle. Le volume actuel de ce poste est déjà
monté aux deux emplacements et contient `18/docker` : il ne nécessite pas cette
migration.
