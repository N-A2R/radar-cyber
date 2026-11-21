# Rapport — Langues régionales : sources en occitan et en basque

Date : 2026-11-21 · Branche : `ext/chantier-b8` · Périmètre : les 12 départements
de la Nouvelle-Aquitaine (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87).
Rapport en français ; code, tests et interface en anglais.

## Chiffre livré

**13 sources en occitan ou en basque intégrées** : 5 en occitan (`oc`) et 8 en
basque (`eu`), toutes actives, toutes basées en Nouvelle-Aquitaine.

Mesure publiée dans `bench/results/regional-language-sources.json`.
Commande reproductible (lecture seule, 1,7 s sur la base locale) :

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-regional-language-sources.mts \
  --json=bench/results/regional-language-sources.json
```

Le script ne fait que des `SELECT` sur PostgreSQL et lit le corpus versionné
`bench/corpus/sources-langues-regionales-na.jsonl` : aucun réseau payant, aucune
écriture en base, aucune donnée personnelle de victime. Il échoue si le corpus
et la base ne concordent pas, ce qui rend le chiffre auditsable.

Règle comptée à la lettre :

```sql
SELECT count(*) FROM source
 WHERE language IN ('oc', 'eu')
   AND region = 'nouvelle-aquitaine'
   AND enabled;
```

## État réel de départ

| Compteur | Valeur observée avant intégration | Après intégration |
|---|---:|---:|
| Organisations | 1 673 221 | 1 673 221 |
| Sources | 418 | 431 |
| Événements | 27 882 | 27 882 |

Les compteurs diffèrent du repère de la consigne (1 673 151 organisations,
312 sources) : la mesure porte sur la base réellement présente au moment du
travail, pas sur un chiffre recopié. Aucune organisation ni aucun événement
n'a été ajouté ou modifié : seul le registre des sources évolue.

## Étapes testables

1. **Règles pures** — `apps/api/src/regionalLanguages/index.ts` : normalisation
   des codes (`oc`/`occitan`, `eu`/`basque`/`euskara`), contrôle des 12
   départements NA, URL HTTPS obligatoire, rejet de toute donnée personnelle
   dans les métadonnées, décompte par identifiant distinct. Aucune dépendance
   réseau ni base. **13 tests, un par comportement**, dans
   `apps/api/test/regional-languages.test.ts`.
2. **Corpus vérifié** — `bench/corpus/sources-langues-regionales-na.jsonl` :
   13 sources, chacune avec son code langue, son département, son URL, la date
   de vérification, le code HTTP observé et un extrait de preuve. Les 13 URL
   ont répondu **HTTP 200** le 2026-11-21 avec du contenu dans la langue
   déclarée (contrôle indépendant en `curl`, suivi des redirections).
3. **Intégration** — `db/migrate-062-sources-regional-languages.sql` ajoute
   trois colonnes auditable sur `source` (`language`, `region`, `department`),
   une contrainte `CHECK` sur la langue et un index partiel, puis insère les
   13 sources de façon idempotente (`ON CONFLICT (id) DO UPDATE`).
4. **Mesure** — `scripts/measure-regional-language-sources.mts` publie le
   total, la répartition, l'état de départ et la concordance corpus/base.
   La migration a aussi été rejouée sur une base de test neuve : les 25 tests
   ciblés (`regional-languages`, `language`, `filter`) passent, dont les 13
   nouveaux.

Commande de vérification (base de test éphémère, 1,7 s) :

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx apps/api/test/run.ts \
  apps/api/test/regional-languages.test.ts \
  apps/api/test/language.test.ts \
  apps/api/test/filter.test.ts
```

## Répartition

| Langue | Département | Sources |
|---|---|---:|
| Basque (`eu`) | 64 — Pyrénées-Atlantiques | 8 |
| Occitan (`oc`) | 64 — Pyrénées-Atlantiques | 5 |
| **Total** | | **13** |

Sources intégrées : EKE, Gure Irratia, Xiberoko Botza, Euskal Irratiak,
Irulegiko Irratia, Kanaldude, Seaska et Kazeta (basque) ; Ràdio País, Cap'òc,
Escòla Gaston Fèbus, Reclams et L'Arraton deu Castèth (occitan/gascon).
Il s'agit de radios associatives, d'associations culturelles, de réseaux
scolaires et de médias locaux : **sources grises autorisées**, toutes publiques
et sans abonnement.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : les 13 éditeurs sont établis dans les
  Pyrénées-Atlantiques (64). Les candidats hors région (Jornalet à Toulouse,
  Hamaika et Ikastolak au Pays basque espagnol, bibliothèque Gaston Fèbus à
  Mauvezin) ont été écartés malgré leur pertinence linguistique.
- **Sources grises autorisées** : radios communautaires et associations
  acceptées, sans service payant ni clé d'API.
- **Aucune donnée personnelle de victime** : seules des métadonnées
  institutionnelles (nom, URL, langue, département) sont stockées ; le module
  de validation rejette explicitement courriels et numéros de téléphone.
- **Code et interface en anglais** : identifiants, commentaires, colonnes
  (`language`, `region`, `department`), messages et tests en anglais ; seul ce
  rapport est en français.
- **`server.ts` ≤ 10 lignes** : `apps/api/src/server.ts` est inchangé
  (diff de 0 ligne). L'ajout de colonnes sur `source` ne touche ni le cycle de
  collecte ni l'ingestion des événements.
- **Aucune commande > 60 s** : la plus longue vérification exécutée a duré
  moins de 12 s ; la mesure complète 1,7 s.

## Limites

Les 13 sources sont concentrées dans le département 64 : c'est là que se
trouve l'écosystème basque et gascon vérifiable en Nouvelle-Aquitaine. Le
chantier mesure des **sources intégrées**, pas des événements produits : le
rendement en items cyber de ces flux reste à observer sur les prochains cycles.
`event.langue` garde son contrat `fr`/`en` et le détecteur existant classe les
titres ingérés ; la langue régionale est une propriété de la source, pas une
nouvelle valeur d'événement.

**CHANTIER TERMINÉ**
