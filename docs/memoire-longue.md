# Mémoire longue — preuve du chantier 2

Critère de sortie (`docs/chantiers.md` §2) : *« Une requête répond sur 12 mois
glissants alors que le brut est purgé à 90 jours ; le rejeu d'une période donne
le même résultat qu'à l'époque (au moteur près). »*

Le test `apps/api/test/memoire-longue.test.ts` le prouve sur la base de test
isolée, avec des événements portant un `dedup_key` et une horloge uniques : il
ne compte donc que ses propres lignes. Il insère une organisation, son alias
actif, un événement vieux de **100 jours** dont le fait était vrai à cette date
et connu trois jours plus tard, le fait `event.rattachement` correspondant, puis
appelle la vraie `runRetention({ days: 90 })`.

```bash
RADAR_TEST_ADMIN_URL=postgres://radar:radar@localhost:5433/postgres \
  pnpm -F @radar/api test -- test/memoire-longue.test.ts
```

`RADAR_TEST_ADMIN_URL` pointe sur le cluster qui fournit `pg_trgm` ; le cluster
par défaut du port 5432 ne l'a pas et la création de la base de test échoue.

## Ce qui compose la mémoire

| Brique | Rôle |
|---|---|
| migration 028 — `event_archive` | résumé des faits purgés, alimente `v_event_all` et la mesure |
| migration 046 — `archive_event` | copie intégrale : titre, résumé, preuves, géographie |
| migration 046 — `event.valid_at`, `event.at` | date de vérité et date de connaissance du brut |
| migration 049 | les deux horloges survivent dans les deux archives et dans la vue unifiée |
| `GET /api/history` | douze mois glissants sur `valid_at`, brut et archive confondus |
| `scripts/rejeu-periode.mts` | rejeu de la période avec diff nominatif et mesure d'idempotence |

La rétention garde sa politique sur le brut — 90 jours de texte intégral — et
archive **avant** de supprimer. Les deux horloges sont copiées telles quelles :
un fait centenaire retrouvé dans l'archive reste daté de sa vérité et de sa
découverte, pas de sa purge.

## Preuve 1 — archivé, pas supprimé

Après rétention, l'événement centenaire a disparu du brut mais figure dans les
deux archives, avec le même `org_id`, le même `valid_at` et le même `at`. Le
titre et les preuves ne survivent que dans `archive_event`.

| Mesure | valeur observée |
|---|---:|
| Âge de l'événement | 100 jours |
| Seuil de purge du brut | 90 jours |
| Lignes restantes dans `event` | 0 |
| Lignes dans `event_archive` / `archive_event` | 1 / 1 |
| Horloges conservées dans les deux | `valid_at` = observation, `at` = collecte |

## Preuve 2 — 12 mois retrouvés par `/api/history`

`GET /api/history?from=<12 mois>&to=<fin du mois>&org=<id>` répond sur **12 mois**
et retrouve l'événement : il est compté dans son mois d'observation, uniquement
depuis l'archive. Sans la vue unifiée `v_event_all`, la réponse aurait été vide :
le brut ne contient plus la ligne. La réponse porte `horloge: "valid_at"` pour
rendre le calcul auditable.

| Mesure | valeur observée |
|---|---:|
| Mois dans la réponse (`parMois`) | 12, mois vides inclus |
| Total / depuis l'archive / depuis le brut | 1 / 1 / 0 |
| Filtre `org` (id et slug) | isole les faits de l'organisation |
| Organisation sans fait | 12 mois à zéro, HTTP 200 |

## Preuve 3 — rejeu de la période, même rattachement

Le test lance le vrai `scripts/rejeu-periode.mts` sur une fenêtre d'une minute
autour de l'observation, avec `--mesurer-idempotence`. Le moteur courant
(`gazetteer@4`) représenté avec le seul `org_name` archivé choisit **le même**
`org_id`. L'événement est recréé en brut avec ses deux horloges d'origine, la
provenance `rejeu: event_archive`, et le dernier fait du journal reste la
décision d'époque. Un second rejeu n'écrit rien ; les empreintes du diff et de
la projection sont identiques.

| Mesure | valeur observée |
|---|---:|
| Archives lues | 1 (1 avec organisation archivée) |
| Rattachements identiques / changés | 1 / 0 |
| Écritures à la première passe | 1 inséré, 0 mis à jour |
| Écritures à la seconde passe | 0 |
| `IDEMPOTENT` | oui |

Un second jeu prouve le **diff nominatif des rattachements corrigés** : une
archive sans `org_id` mais avec un nom d'organisation est rejouée ; le diff
imprime `nom archivé (#null) → nom retenu (#id)`, la projection reçoit le bon
`org_id`, le fait est journalisé, et le second passage n'écrit plus rien.

## Cas d'erreur et états vides

- `/api/history` : date illisible, mois inexistant (`2026-13`), jour inexistant
  (`2026-02-30`), `from > to` ou période de plus de 120 mois → **400** ;
  organisation inconnue → **404** ; aucune donnée → douze mois à zéro.
- `rejeu-periode.mts` : période absente, date illisible ou borne inversée/égale
  → sortie en code 1 avant toute écriture ; période sans archive → message
  explicite, zéro écriture, idempotence vérifiée.

## Résultat

6/6 tests du fichier verts ; suite API complète : 678 tests, 0 échec ;
`pnpm typecheck` OK. La purge à 90 jours ne détruit plus l'information : douze
mois de questions ont douze mois de réponses, et la période rejouée redonne le
rattachement conservé dans l'archive et le journal.
