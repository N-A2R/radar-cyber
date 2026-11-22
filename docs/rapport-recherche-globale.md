# Rapport — Recherche globale en moins de 200 ms

Date : 2026-11-22. Branche : `ext/chantier-f1`.

## Objectif et état de départ

Objectif chiffré : **latence de la recherche globale sur le corpus complet < 200 ms**.

État réel mesuré au départ sur la base de travail `postgres://radar:radar@localhost:5433/radar` :

| Table | Lignes |
|---|---:|
| `org` | 1 673 151 |
| `event` | 26 394 |
| `source` | 312 |

La PR #113 (« Recherche plein texte organisations ») avait introduit un index
`tsvector` et un classement `ts_rank_cd`, puis le commit `edeb163` avait remplacé
`ts_rank_cd` par `ts_rank` après avoir relevé environ 780 ms sur un terme commun.
Aucun chiffre final reproductible n'avait été publié, et la migration
`migrate-045-search-tsvector.sql` n'était pas appliquée au corpus : la route
`/api/search` échouait donc sur la base réelle. L'objectif n'était pas livré.

Deux mesures de cadrage, en lecture seule, ont motivé le choix technique :
une recherche `ILIKE` enveloppante sur trois termes fréquents prenait **185,8 ms**
sur `org`, et la normalisation des titres/résumés d'événements à chaque requête
prenait **2,1 s** sur 26 394 événements.

## Ce qui a été livré

- `db/migrate-065-search-normalized.sql` : deux colonnes générées
  (`event.title_search`, `event.summary_search`) et leurs index GIN trigramme.
  La normalisation est faite une fois à l'écriture, plus jamais pendant la
  recherche. Appliquée au corpus en **8,7 s**.
- `apps/api/src/search/tokens.ts` : découpage en jetons sans accents, sans mots
  vides français, avec échappement des caractères SQL `LIKE` et plafond de huit
  jetons.
- `apps/api/src/routes/search.ts` : recherche par intersections pondérées de
  jetons. Chaque jeton ne visite au plus 300 candidats via les index trigramme
  existants (`org_name_norm_trgm`, `org_domain_trgm` et les deux nouveaux index
  d'événement), puis les candidats sont regroupés et classés par nombre de
  jetons trouvés. Les trois sections (organisations, événements, indicateurs)
  restent requêtées en parallèle et la réponse garde exactement le même contrat.
- `apps/api/scripts/measure-global-search.mts` : sonde reproductible, en lecture
  seule, qui vérifie la taille du corpus, échoue si le p95 dépasse 200 ms et écrit
  les résultats bruts dans `bench/results/NA-global-search.json`.
- `apps/api/test/search.test.ts` et `apps/api/test/search-tokens.test.ts` :
  **11 tests**, un par comportement (classement, accents, événements,
  indicateurs, limite 50, unicité, mots vides, jetons, etc.).

`apps/api/src/server.ts` n'a **aucune ligne modifiée** : la route était déjà
enregistrée, aucun câblage supplémentaire n'était nécessaire.

## Protocole de mesure

1. Appliquer la migration 065 au corpus (une seule fois, 8,7 s).
2. Lancer la sonde sur la base réelle :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx apps/api/scripts/measure-global-search.mts \
  --json=bench/results/NA-global-search.json
```

3. Cinq requêtes représentatives : `hopital`, `bordeaux`,
   `hopital universitaire rennes`, `saint pierre bordeaux` (cas large),
   `ransomware nouvelle aquitaine`. Deux échauffements puis onze répétitions
   chronométrées par requête, soit **55 mesures**. Le chronomètre entoure
   l'appel `GET /api/search` complet via `Fastify.inject` : SQL, classement et
   sérialisation JSON inclus. Aucun appel réseau externe, aucun service payant,
   aucune donnée personnelle de victime, aucune écriture dans le corpus.

## Résultat

**Latence mesurée sur le corpus complet (1 673 151 organisations) :
p50 = 8,28 ms, p95 = 18,96 ms, maximum = 22,33 ms.**

Objectif < 200 ms : **atteint**, avec une marge d'un facteur 10 sur le p95.

| Requête | p50 (ms) | p95 (ms) | max (ms) |
|---|---:|---:|---:|
| `hopital` | 2,94 | 9,11 | 9,11 |
| `bordeaux` | 5,23 | 8,09 | 8,09 |
| `hopital universitaire rennes` | 8,18 | 11,91 | 11,91 |
| `saint pierre bordeaux` | 16,61 | 18,96 | 18,96 |
| `ransomware nouvelle aquitaine` | 10,77 | 22,33 | 22,33 |
| **Ensemble (55 mesures)** | **8,28** | **18,96** | **22,33** |

Le pire cas large (`saint pierre bordeaux`, des dizaines de milliers de
correspondances partielles) reste à 18,96 ms au p95, contre 185,8 ms pour
l'ancien chemin `ILIKE` non borné.

## Vérifications

- `search.test.ts` + `search-tokens.test.ts` : **11/11** réussis sur une base de
  test isolée créée par `test/run.ts`.
- Tests de contrat touchant la route (`api-publique`, `contrat-routes`,
  `enrichissement-referentiel`) : **48/48** réussis.
- Typecheck API : **0 erreur**.
- Chaque commande exécutée pendant ce chantier a été bornée à 55 s ; la plus
  longue (migration sur le corpus) a duré 8,7 s.

## Limites assumées

- Le plafond de 300 candidats par jeton borne le coût mais peut écarter une
  correspondance tardive dans l'ordre physique quand un jeton très fréquent est
  seul saisi. Le classement multi-jetons, lui, n'est pas affecté dans les cas
  mesurés.
- La recherche reste une correspondance de sous-chaînes de jetons : elle ne
  fait pas de stemming (« hopital » ne trouve pas « hôpitaux »). C'était déjà
  le comportement utile des index trigramme du référentiel ; la migration
  `tsvector` historique reste en place pour les bases qui l'ont adoptée.
- Les sources grises déjà présentes dans le corpus sont inchangées ; aucun
  nouveau périmètre géographique n'a été ajouté, la Nouvelle-Aquitaine restant
  le seul périmètre du projet.
