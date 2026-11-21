# Mémoire longue — preuve du chantier 2

Critère de sortie (`docs/chantiers.md` §2) : *« Une requête répond sur 12 mois
glissants alors que le brut est purgé à 90 jours ; le rejeu d'une période donne
le même résultat qu'à l'époque (au moteur près). »*

Le test `apps/api/test/memoire-longue.test.ts` le prouve en trois temps sur la
base de test isolée, avec un événement portant un `dedup_key` unique et une
horloge unique : il ne compte donc que ses propres lignes. Il insère une
organisation, son alias actif, un événement vieux de **100 jours** et le fait
`event.rattachement` correspondant dans le journal, puis appelle la vraie
`runRetention({ days: 90 })`.

```bash
RADAR_TEST_ADMIN_URL=postgres://radar:radar@localhost:5433/postgres \
  pnpm -F @radar/api test -- test/memoire-longue.test.ts
```

`RADAR_TEST_ADMIN_URL` pointe sur le cluster qui fournit `pg_trgm` ; le cluster
par défaut du port 5432 ne l'a pas et la création de la base de test échoue.

## Preuve 1 — archivé, pas supprimé

Après rétention, l'événement centenaire a disparu du brut mais figure dans les
deux archives : le résumé qui alimente la mesure (`event_archive`, migration
028) et la copie intégrale qui garde titre et preuves (`archive_event`,
migration 046). Le rattachement (`org_id`) survit dans les deux.

| Mesure | valeur observée |
|---|---|
| Âge de l'événement | 100,00 jours |
| Seuil de purge du brut | 90 jours |
| Lignes restantes dans `event` | 0 |
| Lignes dans `event_archive` | 1 |
| Lignes dans `archive_event` | 1 |
| Durée de la preuve | 109,69 ms |

## Preuve 2 — 12 mois retrouvés par `/api/history`

`GET /api/history?from=2025-12-01&to=2026-11-30&org=<id>` répond sur **12 mois**
et retrouve l'événement : il est compté dans `2026-08`, uniquement depuis
l'archive. Sans la vue unifiée `v_event_all`, la réponse aurait été vide : le
brut ne contient plus la ligne.

| Mesure | valeur observée |
|---|---|
| Mois dans la réponse (`parMois`) | 12 |
| Total | 1 |
| Depuis l'archive (`archive`) | 1 |
| Depuis le brut (`brut`) | 0 |
| Mois porteur | 2026-08 |
| Durée de la preuve | 23,19 ms |

## Preuve 3 — rejeu de la période, même rattachement

Le test lance le vrai `scripts/rejeu-periode.mts` sur une fenêtre d'une minute
autour de l'observation, avec `--mesurer-idempotence`. Le moteur courant
(`gazetteer@4`) représenté avec le seul `org_name` archivé choisit **le même**
`org_id` : aucun changement, l'événement est recréé en brut avec ce
rattachement, la provenance `rejeu: event_archive`, et le dernier fait du
journal reste la décision d'époque. Un second rejeu n'écrit rien ; l'empreinte
de la projection est identique.

| Mesure | valeur observée |
|---|---|
| Archives lues | 1 (1 avec organisation archivée) |
| Rattachements identiques / changés | 1 / 0 |
| Écritures à la première passe | 1 inséré, 0 mis à jour |
| Écritures à la seconde passe | 0 |
| `IDEMPOTENT` | oui |
| Empreinte de la projection (sha256/16) | `5280441ceddf87fe` |
| Durée de la preuve | 272,94 ms |

L'empreinte dépend du `dedup_key` généré à chaque exécution : ce qui est
significatif, c'est son égalité entre les deux rejeux du même test, pas sa
valeur absolue.

## Résultat

`3/3` tests verts, `748,46 ms` au total. La purge à 90 jours ne détruit plus
l'information : douze mois de questions ont douze mois de réponses, et la
période rejouée redonne le rattachement conservé dans l'archive et le journal.
