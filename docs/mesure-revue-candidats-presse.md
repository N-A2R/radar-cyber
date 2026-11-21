# File de revue des candidats presse — mesure d'une passe

Le corpus `bench/corpus/articles-presse-na.jsonl` contient **925 articles datés**,
dont **56 candidats incidents cyber** (`cyber: true`). Ce sont des candidats à
revue, pas des incidents confirmés.

## Ce qui a été construit

- `db/migrate-051-presse-candidats.sql` — `presse_candidat` (projection : extrait,
  URL, date, source, organisation proposée, score de confiance expliqué par
  `signaux`) et `presse_candidat_decision` (décisions append-only avec auteur,
  horodatage, passe, motif et organisation retenue).
- `GET /api/presse/candidats` — file des en attente, triée par score décroissant.
  `statut` et `passe` permettent de lire l'historique ; le rejeu est dans
  `GET /api/presse/candidats/replay` et l'audit dans
  `GET /api/presse/candidats/decisions`.
- `POST /api/presse/candidats/:cle/decision` — `confirmer`, `refuser` ou
  `reclasser`, avec motif obligatoire et organisation requise pour reclasser.
  Auteur `humain:<email>`, horodatage, écriture atomique de la décision, de la
  projection et d'un fait `review.decided` dans le journal (append-only).
- Écran « Candidats presse » (`#/presse`) : tableau des candidats, décision par
  ligne, mesure affichée quand la file est vide, journal de la passe dépliable.

Le score de confiance est une priorité de revue déterministe, calculée à
l'import : signal d'incident dans le titre (+0,30) ou l'extrait (+0,12),
multiples mots-clés (+0,08), organisation nommée (+0,10), date lue dans la page
(+0,05), puis pénalité des signaux de prévention/sensibilisation (−0,15 chacun,
plafonné à −0,35). Chaque signal est stocké dans `signaux` : la décision est
explicable et le score recalculable depuis l'article.

## Rejouer la mesure

```sh
pnpm setup
apps/api/node_modules/.bin/tsx scripts/importer-candidats-presse.mts
apps/api/node_modules/.bin/tsx scripts/passe-revue-presse.mts \
  --passe passe-2026-11-21 --auteur agent:regle-signaux@1 \
  --out bench/results/revue-candidats-presse-2026-11-21.json
```

La règle de la passe automatisée est explicite :

> confirmer si au moins un signal d'incident et aucun signal de prévention,
> sinon refuser.

**Ce n'est pas une décision humaine** : l'auteur est `agent:regle-signaux@1`,
et le taux obtenu mesure cette règle, pas le jugement d'un analyste. Les
décisions humaines passent par l'écran et portent `humain:<email>`. La passe est
rejouable : décisions et journal conservent le motif, le score, l'organisation
proposée et l'URL au moment de la décision.

## Résultat observé (21 novembre 2026)

| Mesure | Valeur |
|---|---|
| Candidats chargés depuis le corpus | 56 |
| Candidats traités en une passe | **56** |
| Décisions enregistrées | 56 |
| Confirmés | 43 |
| Refusés | 13 |
| Reclassés | 0 |
| Taux de confirmation observé | **76,8 %** |
| Faits `review.decided` dans le journal | 56 |
| Divergences au rejeu de la projection | 0 |

Résultat brut : `bench/results/revue-candidats-presse-2026-11-21.json`.

Le taux de 76,8 % est ceux de la règle ci-dessus, pas une estimation de la
précision réelle du corpus : des articles de prévention dont les signaux sont
mal couverts peuvent être confirmés à tort. La revue humaine reste la source de
vérité ; le taux se recalcule après chaque passe via
`GET /api/presse/candidats/stats?passe=<id>`.

## Tests

```sh
pnpm -F @radar/api exec tsx test/run.ts test/presse-candidats.test.ts
pnpm -F @radar/web test:presse
pnpm typecheck
```
