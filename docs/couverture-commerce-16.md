# Couverture commerce — Charente (16)

Mesure du 2026-11-22. Objectif : au moins 5 sources d'information du secteur `commerce` dans le département 16, vérifiées en HTTP 200 (même cible que les tranches commerce sœurs des autres départements). La livraison n'avait pas déclaré ce chiffre dans le dépôt ; ce rapport le déclare sans toucher au corpus ni aux tests.

## Mesure reproductible

```sh
jq -s '{sources: length, commerce_16_200: (map(select((.secteur|startswith("commerce")) and .departement=="16" and .code_http==200))|length)}' bench/corpus/sources-commerce-16.jsonl
# → {"sources": 12, "commerce_16_200": 12}
```

- 12 lignes distinctes, toutes `commerce` / `16` / `code_http=200` ; 9 d'entre elles portent un flux RSS.
- `db/migrate-065-sources-commerce-16.sql` : 12 identifiants `corpus:commerce16-*` et 12 traces de vérification HTTP 200 (29 URLs contrôlées le 2026-11-22).
- Empreinte du corpus consolidé recalculée avec la logique de `scripts/corpus-hash.mts` : `705bf563983b2c4507bc4b30eae00645331d69a4719e5a9cd6c1aa63fae2cdc3`, identique à `bench/corpus/HASH`.

OBJECTIF : atteint — 12 / 5
