# Réparations DB résiduelles (SEC-14, DB-M8, DB-M9, F11)

Références : `database.md` M8/M9/F11 et `security-ops.md` SEC-14 de l'audit
complet. Les corrections sont versionnées (`migrate-239` à `migrate-246`) et
enregistrées dans `REPAIR_VERSIONS`. 239–243 ont été appliquées à la base
live ; 244–246 sont les corrections consécutives aux vérifications live et
au test de schéma neuf, à appliquer sans réécrire les versions déjà appliquées.

## SEC-14 — `access_log` append-only

- État audité : un seul trigger `BEFORE UPDATE` (`migrate-049`), aucun
  `BEFORE DELETE`, alors que le message d'erreur affirmait que seule la
  rétention pouvait supprimer. Rôle applicatif encore superutilisateur (SEC-11).
- `migrate-239` ajoute `access_log_no_delete` et une exception contrôlée :
  `purger_access_log()` insère un jeton `(pg_backend_pid(), pg_current_xact_id())`
  dans `access_log_purge_token`, puis efface les lignes et retire le jeton.
  Le trigger ne laisse passer le DELETE que si ce jeton existe dans la même
  transaction. Un `SET` de session ne suffit pas : le jeton n'est pas un GUC.
- Le jeton n'est pas falsifiable par un appelant ordinaire : la table est
  possédée par le rôle NOLOGIN `radar_retention`, `REVOKE ... FROM PUBLIC` et
  au rôle `radar` ; les deux fonctions sont `SECURITY DEFINER` exécutées sous
  ce rôle. L'appelant peut invoquer `purger_access_log()` (chemin prévu et
  borné à 1–3650 jours), pas fabriquer de jeton. Le jeton est supprimé en fin
  de fonction, y compris quand la purge ne supprime aucune ligne : un appel
  `purger_access_log(1)` suivi d'un DELETE direct dans la même transaction ne
  donne aucun laissez-passer.
- `migrate-244` corrige l'état live où `relacl` ne contenait que `radar_app` :
  `radar_retention` reçoit explicitement `SELECT, DELETE` sur `access_log` et
  `SELECT, INSERT, DELETE` sur `access_log_purge_token`, plus `USAGE` sur
  `public`. Sans ces droits, `purger_access_log()` échouait malgré un jeton
  valide (`SELECT` est requis par le `WHERE recorded_at < ...`).
- L'exception d'anonymisation compare la ligne entière :
  `(to_jsonb(NEW) - 'acteur' - 'user_id' - 'role')` doit égaler la même
  expression sur `OLD`. Modifier `route`, `ip_hash`, `statut`, `motif` ou
  tout autre champ sous couvert d'effacement est rejeté.
- Dépendance : la protection suppose SEC-11 (retrait de `SUPERUSER`). Un
  superutilisateur, ou le propriétaire de table pouvant `DISABLE TRIGGER`,
  contourne tout mécanisme SQL. Si la migration est appliquée après SEC-11,
  elle doit être exécutée avec un rôle disposant de `CREATEROLE` ou de
  l'adhésion à `radar_retention` (le créateur de rôles de la base).
- Vérification : tests statiques dans `tests/migrations.test.mts` ; le test
  d'intégration (`RADAR_DB_INTEGRATION=1`) vérifie trigger, propriétaire des
  fonctions, droits via `has_table_privilege` et `SET LOCAL ROLE
  radar_retention`, puis appelle réellement `purger_access_log(1)` dans une
  transaction annulée (ligne supprimée, jeton consommé). Un DELETE direct et
  une anonymisation modifiant `route` ou `ip_hash` sont rejetés.

## DB-M8 — disponibilité ≠ prêt à collecter

- `source.pret_a_collecter boolean NULL` (migration 240). `NULL` = non évalué,
  comportement historique conservé ; `false` = collecteur non branché ;
  `true` = collecteur branché et source déjà collectée avec succès.
- Backfill : `enabled AND last_ok_at IS NULL` et préfixe `sitemap`,
  `source-feed`, `regional` ou `forum` (les 95 sources de l'audit) passent à
  `false` ; les sources des mêmes familles avec `last_ok_at IS NOT NULL`
  passent à `true`. Aucune source n'est désactivée, aucune autre famille
  n'est modifiée. L'index partiel `source_en_attente_idx` ne couvre que les
  `false`.
- Contrat d'usage : les collecteurs doivent exclure `pret_a_collecter = false`
  de leurs sélections (`NULL` reste autorisé) ; un run réussi doit positionner
  `true`. Les tableaux de bord doivent afficher `false` comme « en attente de
  branchement », pas comme « désactivée ». Les API/UI qui lisent `enabled`
  seules ne changent pas de comportement : l'adoption est progressive et
  explicite, sans bascule silencieuse.

## DB-M9 — FK sans index leading

Les 18 cas du catalogue ont été confrontés aux définitions de tables et aux
statistiques de l'audit. Une seule justification survive :

| Candidat | Décision | Motif |
| --- | --- | --- |
| `collector_run(source_id)` | **indexé** | ~10,3 M tuples lus en 1 195 seq scans (871 idx scans) ; requêtes fréquentes par source. Index composite `(source_id, started_at DESC)`, créé seulement si aucun index ordinaire n'a déjà `source_id` en tête. |
| `event(asset_id, source_id)` | rejeté | 11,8 M lignes : index de plusieurs centaines de Mo et verrou long en transaction ; aucun plan mesuré justifiant un accès par `asset_id`/`source_id`. À réévaluer avec `EXPLAIN` si une requête lente apparaît. |
| `attachment_confidence(org_id)` | rejeté | PK `(event_id, org_id)` couvre le chemin de cascade principal ; effacement d'org rare et manuel. |
| `stix_object(pap)` | rejeté | code de faible cardinalité, table d'export réduite. |
| `watchlist_match(item_id)` | rejeté | suppression d'item de liste rare, table réduite ; index `event_id`, `fuite_id`, `org_id` déjà présents. |
| `retrieval_hit(event_id)` | rejeté | jeu d'évaluation tuple par requête (~100 cas × 10) ; cascade sur `event` peu fréquente. |
| `retrieval_query(expected_event_id, query_event_id)` | rejeté | table d'annotation, contrainte d'unicité et volumes réduits. |
| `onion_lead(confirmed_event_id, mention_event_id, source_id)` | rejeté | bench, faible volume ; pas de seq scan mesuré, cascade rare. |
| `leak_link_eval(claim_id, event_id)` | rejeté | jeu d'or de 100 cas. |
| `second_victim_pair(second_event_key)`, `second_victim_prediction(first_event_key)` | rejeté | tables de benchmark, petites ; cascades rares. |
| `source_live_item(event_id)` | rejeté | flux live récent, index `source_id, recorded_at` déjà présent. |
| `app_session(user_id)` | rejeté | sessions éphémères, INDEX `expires_at` existant ; cascade sur suppression de compte rare. |
| `dns_change(current_snapshot_id)` | rejeté | pas de purge mesurée de `dns_snapshot` ; index `domain`, `detected_at`, `kind` déjà présents. |
| `droit_reponse(demandeur_user_id)` | rejeté | table de demandes RGPD, faible volume. |
| `exposition_service_detection(org_id)` | rejeté | `UNIQUE (service_id)` et volume réduit ; suppression d'org rare. |
| `prestataire_qualifie(extrait_id)` | rejeté | référentiel PACS/PASSI, très faible volume. |
| `watchlist_item(org_id)` | rejeté | petites listes, suppression d'org rare. |

La méthode d'audit ne détecte pas les index partiels ni les FK en position 2 ;
le garde-fou catalogique de `migrate-241` empêche de dupliquer un index déjà
présent au moment de l'application.

## F11 — inversion temporelle (`at < valid_at`)

Convention retenue : `valid_at` est la date du fait, `at` la date
d'apprentissage (migration 046). Les trois writers actuels la respectent
(`apps/api/src/collectors/generic.ts`, `apps/api/src/collecte/cycle.ts`,
`apps/api/src/communiques/store.ts`) : `valid_at = observedAt` et
`at = fetchedAt`, ou les deux égaux à la date de publication. Le `+1 h` exact
sur 218 événements `cti` n'est donc **pas** une règle métier active : aucune
recherche dans le code, les scripts ou les migrations ne le produit. C'est une
convention historique non documentée.

**Contrat de suivi (API, hors de ce changement).** Le writer historique qui a
écrit `valid_at = at + 1 h` doit encore être corrigé pour aligner `valid_at`
sur la date de publication réelle : une publication différée réelle devrait
être modélisée explicitement, pas encodée dans une inversion silencieuse.
Aucune source API n'a été modifiée ici.

`migrate-242` ajoute d'abord `event_at_not_before_valid_at` en `NOT VALID`
(tolérance 2 s, aucun balayage initial). `migrate-243` normalise ensuite les
218 lignes `cti` au motif exact `valid_at = at + 1 h`, sans toucher aux
`ransomware`, et consigne les comptes dans `event_temporal_normalisation`.
La vérification live laisse 307 inversions intentionnelles : 198 `cti` de
sources `precision-eval-*` (2–20 h), 108 `ransomware` de sources `bench-*`
(jusqu'à 192 j) et un écart d'horloge réel de 3,280262 s sur `ransomlook`.
`migrate-245` remplace donc la contrainte par une tolérance de 5 s et
l'exemption explicite de `source_id LIKE 'bench-%'`, `'precision-eval-%'` et
`'zz-fixture-%'`, puis la valide. Le test de schéma neuf a révélé 15 fixtures
`migrate-200` (`zz-fixture-*`) avec `at` ancien et `valid_at = now()` :
`migrate-246` les normalise à `valid_at = at`, sans toucher aux scénarios
`bench-%` / `precision-eval-%`, et consigne ses comptes dans
`event_temporal_normalisation`. Sur la base live ces lignes n'existent pas :
246 y est un no-op. Contrôle :

```sql
SELECT family, count(*), max(valid_at - at) AS ecart_max
  FROM public.event
 WHERE at < valid_at - interval '5 seconds'
   AND source_id NOT LIKE 'bench-%'
   AND source_id NOT LIKE 'precision-eval-%'
   AND source_id NOT LIKE 'zz-fixture-%'
 GROUP BY family;
```
