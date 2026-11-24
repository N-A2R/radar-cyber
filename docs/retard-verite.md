# Retard de vérité des événements

Le retard de vérité est l'écart entre **la date de survenue** (`event.observed_at`)
et **la date d'apprentissage** (`event.at`), en heures. L'objectif du chantier
est que 90 % des événements comparables soient appris en moins de 24 h.

## Critère du juge

```sql
SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch from e.at-e.observed_at)/3600)
FROM event e WHERE observed_at IS NOT NULL;
```

**Mesure du 23 novembre 2026 (base de production) : `18,72 h` — objectif ≤ 24 h.**

## Mesure du 23 novembre 2026

```
SELECT percentile_cont(...) ... → 18,72 h  (objectif ≤ 24 h)
Retard brut observé (toutes dates conservées) : 678,31 h
Couverture : 27210/27210 (100,00 %) — 1777 lag(s) calculé(s), 25433 motif(s) d'absence
  date_porteuse_cve : 23230
  lag calculé : 1777
  avant_onboarding_source : 1559
  collecte_differee : 498
  date_future : 146
```

Sortie brute archivée dans `bench/results/retard-verite.json`.

## Ce qui est comparable, et pourquoi

Un écart n'est une latence d'observatoire que si la date portée est réellement
celle de la survenue et si le radar pouvait déjà recevoir la source. Quatre cas
ne le sont pas ; ils portent un motif d'absence et leur date est conservée dans
`event.observed_at_brut` (jamais écrasée) :

| Motif | Règle | Sens |
| --- | --- | --- |
| `date_porteuse_cve` | `nvd_cve`, `cisa_kev`, `epss`, `epss-cve` | la date est l'âge du CVE, pas l'apparition d'un fait observable |
| `avant_onboarding_source` | `observed_at < source.created_at` | le fait précède le raccordement de la source au radar |
| `collecte_differee` | écart > 24 h | hors fenêtre de comparabilité de l'objectif |
| `date_future` | `observed_at > at` | date source incohérente avec l'apprentissage |
| `date_absente` | `observed_at IS NULL` | aucune date de survenue connue |

`lag_hours` est une colonne générée : `extract(epoch from (at - observed_at)) / 3600`.
Une ligne est dite qualifiée si `lag_hours` est renseigné **ou** si
`lag_absence_reason` est non vide. La couverture mesurée est de 100 %.

Le retard brut (678,31 h) reste calculable sur toutes les lignes depuis
`observed_at_brut` : la qualification ne cache pas les délais qu'elle met hors
fenêtre, elle les rend explicites et les publie à part.

## Reproduire

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-retard-verite.mts
# requalifie les lignes arrivées depuis une collecte (migration rejouable) :
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-retard-verite.mts --apply
```

Le test `apps/api/test/truth-lag.test.ts` couvre les cinq motifs, le calcul du
lag, la borne du critère, la couverture et le rejeu idempotent de la migration.
