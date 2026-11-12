# CI proposée — à copier dans `.github/workflows/ci.yml`

## Pourquoi ce fichier n'est pas appliqué

Le jeton GitHub de cette session n'a pas la permission `workflows` :

```
! [remote rejected] refusing to allow a GitHub App to create or update workflow
  `.github/workflows/ci.yml` without `workflows` permission
```

Impossible de pousser une modification de workflow. Le contenu validé est donc
livré ici, à appliquer par un mainteneur :

```bash
cp scripts/ci/ci.proposed.yml .github/workflows/ci.yml
git commit -am "ci: rejouer le socle depuis une base vide"
```

En attendant, **`pnpm verify` couvre les mêmes contrôles en local** (contrat hors
base, diagnostic du socle, typechecks, tests API, tests front, build,
healthcheck).

## Ce que la CI proposée ajoute

**Job `verify`** — deux ajouts :

- **contrat hors base en premier** : `contract-admit` + `contract-families`,
  21 tests sans PostgreSQL. Placé tôt pour qu'un échec de contrat soit
  immédiatement lisible ;
- **tests de rendu et jsdom**, qui n'étaient pas exécutés en CI.

**Job `socle`** — rejoue l'installation par le chemin qu'emprunte un humain :

| Étape | Contrôle |
|---|---|
| `pnpm setup` | Bootstrap sur base vide |
| `pnpm setup:check` | Code de sortie 0 = toutes les étapes en place |
| `pnpm setup` (rejeu) | `+0` source et compte d'organisations inchangé |
| `load-referentiel-na --plan-only` | Plan sans écriture ni connexion |

## Pourquoi un job séparé était nécessaire

Le job `verify` applique le schéma via `psql`, **en contournant
`scripts/migrate.mts`**. C'est précisément pourquoi il n'a jamais vu l'amorçage
qui marquait 17 migrations « appliquées » sur une base neuve sans les jouer, ni
les scripts racine incapables de résoudre `pg` depuis la racine du monorepo.

Un socle ne se vérifie qu'en le rejouant depuis le vide, puis une seconde fois
pour l'idempotence. Les tests unitaires ne suffisent pas : ils créent leur base
par un autre chemin.

## Vérification locale de la CI proposée

Le job a été simulé avant livraison, sur une base `socle` créée vide comme le
fait le service PostgreSQL du workflow :

- `pnpm setup` → **8/8 étapes en place** ;
- `pnpm setup:check` → exit 0 ;
- rejeu → `✓ sources 265 en base (+0)` et `4462 orgs` inchangés, les deux
  assertions `grep`/`test` passent ;
- `--plan-only` → aucune connexion à la base.

Le YAML a été parsé pour valider sa structure (jobs `verify` et `socle`).
