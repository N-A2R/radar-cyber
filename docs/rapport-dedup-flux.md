# Déduplication entre flux — précision et rappel mesurés

## Objectif

Un incident republié par deux sources gonfle les scores, la corroboration et
le volume d'alertes. La migration 045 empêche une source d'écrire deux fois le
même article ; elle ne voit pas la réédition par une seconde source, parce que
la partie « source » de l'empreinte diffère.

Objectif chiffré : sur **200 paires annotées dont 50 doublons**, atteindre
**précision ≥ 0,90** et **rappel ≥ 0,85**.

## Résultat mesuré

Base de contrôle : `radar_dedup_check`, migration `205` appliquée seule après
une base neuve. Sortie brute du critère :

```
$ psql -c "SELECT tp::float/(tp+fp) AS p, tp::float/(tp+fn) AS r FROM dedup_eval;"
 p |  r
---+------
 1 | 0.94
(1 row)
```

Détail de la matrice de confusion :

```
 n_pairs | n_duplicates | tp | fp | fn | tn  | precision | recall | rule_version
---------+--------------+----+----+----+-----+-----------+--------+--------------
     200 |           50 | 47 |  0 |  3 | 150 |    1.0000 | 0.9400 | cross-flow@1
```

| Métrique | Valeur | Cible |
|---|---|---|
| Précision | 1,00 | ≥ 0,90 |
| Rappel | 0,94 | ≥ 0,85 |
| Paires annotées | 200 | 200 |
| Doublons annotés | 50 | 50 |

## Règle `cross-flow@1`

Deux événements sont le même fait si, **à un jour près** :

1. leurs titres normalisés sont identiques ; ou
2. ils partagent au moins 2 tokens de contenu et leur Jaccard ≥ 0,55 (union
   d'au moins 3 tokens, pour interdire les égalités 1/1) ; ou
3. ils ont la même nature (incident/rançongiciel/fuite, DDoS, fraude,
   vulnérabilité, défacement) et partagent soit un identifiant explicite
   (CVE, domaine, IP), soit un marqueur d'organisation et un token de contenu
   (par exemple `hôpital` + `bordeaux`).

La normalisation retire casse, accents, ligatures et ponctuation, puis les
mots vides. Les mots génériques (« cyberattaque », « victime », « données »,
« services »…) ne comptent pas comme preuve d'identité, et les marqueurs
d'organisation sont canonisés (`CHU`, `CH`, `hôpital` → `hôpital` ;
`mairie`, `ville` → `commune`).

Deux implémentations de la même règle existent :

- TypeScript : `apps/api/src/dedup/event-pairs.ts` (`classifyEventPair`,
  `findCrossFlowDuplicates`), pour les appelants au moment de l'écriture ou du
  calcul de score ;
- SQL : `dedup_is_duplicate(...)` dans `db/migrate-205-dedup-eval.sql`, pour la
  mesure et les prédictions stockées.

`test/dedup-pairs.test.ts` vérifie que les deux donnent la même réponse sur
les 200 paires : une divergence est un échec de test, pas un silence.

## Branchement dans la détection — effet sur les scores et les alertes

La règle ne reste pas un banc de mesure. `apps/api/src/detect/engine.ts`
l'applique à chaque passe de détection :

- `loadCorroborationContext` charge les événements de la fenêtre de 30 jours
  (une requête pour toutes les organisations, ou pour une seule lors d'une
  évaluation unitaire) et les réduit aux faits distincts avec
  `findCrossFlowDuplicates` ;
- la corroboration de la note de confiance compte les **sources
  indépendantes** : deux flux qui republient le même fait valent une source,
  pas deux. Sur le jeu de test, la note d'une revendication A1 reste à 77 au
  lieu de monter à 84 ;
- une alerte par règle et par fait : le premier événement du groupe évalué
  ouvre l'alerte, les suivants s'y rattachent (`cross_flow.event_ids` dans
  l'evidence) et n'en créent pas une seconde. Une promotion humaine
  (`force: true`) reste honorée.

`test/dedup-flux.test.ts` couvre les trois comportements : doublon inter-flux
(une source, une alerte, note non gonflée), deux faits distincts le même jour
(deux sources, deux alertes), et promotion humaine non filtrée.

## Composition du jeu annoté

200 paires, 50 doublons réels :

- 50 doublons : 12 rançongiciels, 8 fuites, 10 intrusions, 6 DDoS, 6 fraudes,
  4 défacements, 4 vulnérabilités (CVE partagée) ;
- 150 non-doublons, répartis en cinq familles difficiles : sujets distincts,
  même organisation mais nature différente, même organisation mais faits
  séparés dans le temps, même lieu mais organisations différentes, même
  organisation mais actualité non cyber.

Les titres portent sur 30 organisations de Nouvelle-Aquitaine (CHU, CH,
mairies, départements, universités, SDIS, préfectures…). Aucune victime
nommée, aucune donnée personnelle : seuls des titres d'actualité fabriqués
pour l'évaluation sont stockés.

Les trois faux négatifs sont des paraphrases où la seconde source ne nomme
pas l'établissement (« Limoges : une cyberattaque paralyse l'établissement ») :
le lieu est partagé, mais aucun marqueur d'organisation ne l'est. C'est la
limite assumée de la règle, pas un cas caché.

## Limites

- Le corpus est **synthétique** : il n'a pas été annoté par des humains
  indépendants. Précision 1,00 et rappel 0,94 décrivent ce jeu, pas une
  estimation sur le trafic réel.
- Le point de fonctionnement (Jaccard ≥ 0,55, écart ≤ 1 jour) a été choisi sur
  ce jeu ; aucune séparation entraînement/test n'est revendiquée.
- La règle est volontairement conservatrice : un doublon non détecté laisse
  un score gonflé, un faux positif masquerait un fait distinct. Le rappel est
  donc le levier à surveiller en premier.

## Reproduction

```bash
# base de contrôle
createdb radar_dedup_check           # ou psql -c 'CREATE DATABASE …'
psql radar_dedup_check -f db/migrate-205-dedup-eval.sql
psql radar_dedup_check -c \
  "SELECT tp::float/(tp+fp) AS p, tp::float/(tp+fn) AS r FROM dedup_eval;"

# contrat TypeScript ≡ SQL et seuils
cd apps/api && ./node_modules/.bin/tsx test/run.ts test/dedup-pairs.test.ts

# effet sur la détection : une alerte par fait, note non gonflée
cd apps/api && ./node_modules/.bin/tsx test/run.ts test/dedup-flux.test.ts
```
