# Provenance et licence de chaque fait publié

## Objectif

Le contrôle externe porte sur la base de données, sur les faits effectivement
publiés :

```sql
SELECT count(*) FROM event e LEFT JOIN source s ON s.id=e.source_id
 WHERE e.id IN (SELECT event_id FROM export_public_event)
   AND (e.source_url IS NULL OR e.at IS NULL OR s.license IS NULL OR e.collected_at IS NULL);
```

Résultat attendu : `0`. Cent lignes d'un export daté sont vérifiées à la main.

## Livraison

- `db/migrate-200-export-public-provenance.sql` crée `export_public_event`
  (colonnes `NOT NULL` : URL source, horloge de connaissance, horloge de
  collecte, licence) et la vue de contrôle `export_public_event_provenance`.
  La migration comble les chaînes incomplètes et publie les faits dont la
  provenance est renseignée ; elle est idempotente.
- `scripts/export-public-provenance.mts` rejoue ce comblement pour les faits
  écrits depuis la migration, publie un lot daté et écrit l'export CSV daté.
  `--with-sample` promeut 100 revendications publiques et versionnées du jeu
  `bench/fixtures/claims-sample.json` (joshhighet/ransomwatch, Unlicense)
  quand la base ne contient pas encore 100 faits publics. `--check` rejoue le
  critère exact et vérifie l'artefact daté.
- `apps/api/test/export-public-provenance.test.ts` couvre le cas dégradé
  (source sans licence, fait sans URL) et le rejet d'une export incomplète.
- Scripts racine : `pnpm export:provenance` et `pnpm export:provenance:check`.

Aucune donnée personnelle n'est stockée. Les cent faits de l'échantillon sont
des revendications de tiers non vérifiées, explicitement marquées
`source internationale : aucun rattachement local revendiqué` et `CLEAR`.
La licence `Unlicense` est celle du miroir public d'origine ; le texte de
repli appliqué aux sources muettes est la politique de réutilisation de la
compilation, pas une licence concédée par l'éditeur source.

## Mesure reproductible

Base locale neuve (`pnpm db:up` sur le port 5434, `pnpm setup`, puis
`pnpm export:provenance`), exécutée le 2026-11-22 :

```
faits promus depuis l'échantillon : 100
lignes publiées : 100
export daté : bench/results/export-public-provenance-2026-11-22.csv (100 lignes)
CRITERE: 0
EXPORT_LIGNES: 100
ECHANTILLON_100_INCOMPLET: 0
CSV_100_LIGNES: 100
```

Critère exécuté tel quel avec `psql` :

```
 count
-------
     0
(1 row)
```

Contrôle manuel des 100 lignes datées : `wc -l` donne 101 lignes (en-tête plus
100 faits), une seule date d'export (`2026-11-22`), une source
(`https://github.com/joshhighet/ransomwatch`), une licence (`Unlicense`), et
aucune ligne incomplète dans la vue `export_public_event_provenance`.
`pnpm export:provenance:check` rejoue la mesure et sort `0`.

OBJECTIF : atteint — 0 / 0 fait publié sans provenance (export daté : 100 / 100 lignes).
