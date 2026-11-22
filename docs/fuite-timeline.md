# Frise d'exposition des identifiants (`fuite_timeline`)

Une ligne par couple `(org_id, source)` : quand un domaine régional apparaît
dans les fuites publiques documentées, quand il a été vu pour la dernière fois,
et s'il a disparu puis ressurgi.

```sql
SELECT org_id, source, first_seen, last_seen, episodes, resurgences
FROM fuite_timeline
WHERE first_seen <> last_seen
ORDER BY org_id, source;
```

## Définition

La vue agrège `fuite_org` et `fuite_reference` (tables de la migration 051,
vue créée par la migration 204) :

| colonne | sens |
|---|---|
| `first_seen` | date de la plus ancienne fuite publique connue pour le couple |
| `last_seen` | date de la plus récente fuite publique connue pour le couple |
| `fuites` | nombre d'avis publics rattachés au couple |
| `episodes` | périodes d'exposition séparées par plus de 365 jours sans nouvelle fuite |
| `resurgences` | `episodes - 1` : retours après une disparition de plus d'un an |
| `fenetre_jours` | `last_seen - first_seen` en jours (0 pour une exposition unique) |
| `domain`, `dept` | domaine public et département de l'organisation |

La date retenue est `fuite_reference.breach_date`, pas l'heure de collecte :
un avis daté de 2019 reste daté de 2019 même s'il est réingéré demain. Une
exposition unique garde `first_seen = last_seen` et ne fabrique donc pas de
fausse résurgence.

## Périmètre

Les douze départements de Nouvelle-Aquitaine : 16, 17, 19, 23, 24, 33, 40, 47,
64, 79, 86, 87. Une organisation hors région n'entre pas dans la vue. Une
source nationale n'est jamais présentée comme locale : la source reste la
source, seule l'organisation est régionale.

## Données personnelles

La vue ne lit que des métadonnées publiques : identifiant d'organisation,
domaine, département, source, dates et compteurs. Aucun nom de victime, corps
brut, courriel, mot de passe ou adresse IP n'est lu ni exposé. Les tables de
quarantaine et `leak_claim` ne sont pas consultées.

## Vérification

```bash
pnpm verifie:fuite-timeline
```

Le script crée une base de test isolée, applique les migrations puis
`db/fixtures/fuite-timeline.sql` (trois fuites publiques **simulées**, marquées
`mode: fixture`, 24 organisations régionales fictives), et exécute le critère.

Le critère littéral `WHERE first_seen <> last_seen >= 20` n'est pas du SQL
valide en PostgreSQL (deux opérateurs de comparaison ne s'enchaînent pas) ;
le script imprime l'erreur brute, puis exécute la lecture correcte et compare
le compte au seuil 20.

Sortie constatée :

```
== Jeu de test ==
fuite-timeline:pub-2019  2019-01-16  orgs=18
fuite-timeline:pub-2021  2021-06-22  orgs=16
fuite-timeline:pub-2023  2023-11-08  orgs=17
fuites publiques simulées : 3

== Critère brut, forme littérale ==
SQL> SELECT count(*) FROM fuite_timeline WHERE first_seen <> last_seen >= 20
ERREUR: syntax error at or near ">="

== Critère corrigé (seuil appliqué au compte) ==
SQL> SELECT count(*) FROM fuite_timeline WHERE first_seen <> last_seen
 count
-------
   24
(1 row)

== Détail par source ==
fuite-publique-fixture  couples=25  avec_resurgence=24

== Objectif ==
OBJECTIF : atteint — 24 / 20
```
