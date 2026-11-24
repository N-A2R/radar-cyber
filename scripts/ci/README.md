# CI — référence opérationnelle

Le seul workflow est `.github/workflows/ci.yml`. **Aucun fichier « proposé » ne
doit être copié par-dessus** : l'ancien `ci.proposed.yml` ciblait `master`,
utilisait des actions flottantes `@v4` et supprimait le gate de provenance.
Il a été supprimé.

## Ce que la CI vérifie

**Job `verify`** (PostgreSQL 17, 30 min) : contrat hors base, typechecks API /
web / tests / SDK, tests de migration et d'outillage, suite API, suites web
(Vitest, PWA hors-ligne, rendu, DOM, Storybook, Playwright), SDK TypeScript et
Python, test Python du socle, measure + check de provenance sur artifact frais,
build web.

**Job `socle`** (45 min) : rejoue `pnpm setup` depuis une base vide, vérifie
`pnpm setup:check`, rejoue pour l'idempotence (`+0` sources, orgs inchangés),
puis crée une **base copiée** (`CREATE DATABASE … TEMPLATE socle`) sur laquelle
le runner doit annoncer « Aucune migration en attente » et où les contrôles de
dérive tournent avec `RADAR_DB_INTEGRATION=1`.

**Job `supply-chain`** : `pnpm audit --prod --audit-level=high`, validation de
`docker-compose.yml` (profil `tor` inclus) et `docker build --check` des images
API, web et tor.

## Pourquoi le job socle existe

Le job `verify` prépare sa base avec `db/init.sql` puis `pnpm migrate`, comme
les tests et Docker. Le socle vérifie en plus le chemin humain complet :
bootstrap, sources, référentiel, règles de détection, puis rejeu. C'est ce
contrôle qui a révélé l'amorçage qui marquait 17 migrations « appliquées »
sans les exécuter.

## Reproduction locale

```bash
pnpm install --frozen-lockfile
pnpm db:up                 # PostgreSQL local (ou DATABASE_URL existant)
DATABASE_URL=postgres://… pnpm setup
pnpm setup:check
pnpm typecheck:tests && pnpm typecheck:sdk
pnpm test:migrations
RADAR_DB_INTEGRATION=1 DATABASE_URL=postgres://… pnpm test:migrations
```
