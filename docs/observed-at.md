# Dates d'observation manquantes (`event.observed_at`)

## Le problème

2 100 événements sur 7 251 n'ont pas de `observed_at`, et **tous** sont de la
famille `vuln`. Le rapport hebdomadaire (`scripts/weekly-report.mts`) filtre sur
`coalesce(e.observed_at, e.collected_at) >= $1` : un CVE publié en 2000, collecté
hier, est donc compté comme « de cette semaine ». C'est ce qui gonfle la synthèse.

## Diagnostic mesuré (2026-11-10)

Champs des 2 100 événements sans date :

| Colonne | Renseignée | Utilisable comme date ? |
|---|---|---|
| `collected_at` | 2 100 / 2 100 | oui, mais c'est la date de collecte, pas de publication |
| `summary` | **0** | non (toujours NULL) |
| `source_url` | 100 | non (URL de flux, sans date) |
| `evidence` | 2 100 | non : seules les clés `feed` (2 000) et `epss` / `percentile` (100) |
| `title` | 2 100 | **oui, l'année du CVE** |

- Dates ISO (`AAAA-MM-JJ`) dans `evidence` : **0**. Dans `summary` : **0**.
- Titres : 100 % de la forme `CVE-AAAA-NNNN`. Année présente : 2 100
  (1999 : 1 538 · 2000 : 461 · 2001 : 1 · 2026 : 100).
- Sources : `feed:nist:cveid:…` (2 000) et `epss` (100).

Conclusion : aucune date au jour près n'existe en base. La seule information
réelle est l'année, et elle ne permet pas de poser un jour.

## Règles du backfill (`scripts/backfill-observed-at.mts`)

Ordre de préférence, une seule règle par événement, tracée dans
`event.observed_at_source` :

| Règle | Source | Écrit dans `observed_at` |
|---|---|---|
| `evidence-iso` | date ISO valide dans `evidence` | la date |
| `summary-iso` | date ISO valide dans `summary` | la date |
| `year-only` | année seule dans le titre | **NULL** (provenance seule) |
| `collected` | à défaut | `collected_at` |

- La regex ISO demandée — `\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b` —
  est écrite `\m…\M` en SQL, la syntaxe de frontière de mot de Postgres
  (`\b` y désigne un backspace dans les classes de caractères).
- Une date ISO syntaxiquement correcte mais impossible (`2023-02-31`) est
  rejetée : contrôle `jour <= dernier jour du mois` via `make_date`, donc la
  ligne retombe sur la règle suivante.
- `year-only` accepte les deux siècles (`19xx` et `20xx`), parce que les CVE
  d'avant 2000 existent : 1 538 cas réels.
- **Aucune date inventée** : pour `year-only`, `observed_at` reste NULL. Un
  1er janvier serait un mensonge ; `observed_at_source = 'year-only'` suffit à
  dire « on connaît l'année, pas le jour ».

## Résultat mesuré

```
observed_at_source : présente
Déjà tracés sans date (year-only) : 2100
Événements restant à traiter : 0
```

Écriture réelle : 2 100 lignes marquées `year-only` (0 `evidence-iso`,
0 `summary-iso`, 0 `collected` — ce jeu de données n'offre aucune date au jour).
Aucune date existante n'a bougé : 5 151 événements datés avant = 5 151 après.

## Usage

```sh
pnpm exec tsx scripts/backfill-observed-at.mts          # --dry-run par défaut
pnpm exec tsx scripts/backfill-observed-at.mts --apply  # écriture
```

- `--apply` ajoute `event.observed_at_source` si la colonne est absente
  (`ADD COLUMN IF NOT EXISTS`, donc pas besoin de migration séparée), puis écrit
  dans **une seule transaction**, avec `WHERE observed_at IS NULL AND
  observed_at_source IS NULL` : ni une date ni une provenance existante ne peut
  être écrasée. Rejouer `--apply` écrit 0 ligne.
- Coût : 4 ms sur 2 100 lignes, sans index dédié.

## Suite recommandée (hors de ce script)

Le rapport hebdomadaire continue d'utiliser `coalesce(observed_at, collected_at)`,
donc les 2 100 lignes `year-only` y restent « du jour de la collecte ». Le
correctif consiste à exclure les lignes `observed_at_source = 'year-only'` (et
`'collected'`) du comptage « de cette semaine », ou à afficher leur année CVE à
part. La colonne de provenance est là pour ça ; ce script ne fournit que la
brique.
