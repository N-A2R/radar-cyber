# Banc d'essai — évaluation continue des modèles

Mesure du 2026-11-22. Rapport généré par `scripts/evaluate-models.mts`.

## Objectif et résultat

**2 modèles locaux évalués sur 100 cas réels de Nouvelle-Aquitaine : 200 décisions mesurées et publiées.**

Le banc d'essai est reproductible : même corpus gelé, mêmes modèles, mêmes métriques, et une commande `--check` qui refuse une régression. Le chiffre ci-dessus est celui obtenu à l'exécution, pas une cible.

## État réel de la base

| Organisations | Sources | Événements | Dernier fait observé |
| ---: | ---: | ---: | --- |
| 1 673 151 | 312 | 26 259 | 2026-11-21 |

Ces compteurs viennent de la même base que les métadonnées des cas. Les ordres de grandeur annoncés (1 673 151 organisations, 312 sources, ~28 000 événements) sont confirmés ; le nombre d'événements est relu à chaque mesure.

## Ce qui est livré

- `apps/api/src/eval/binary-bench.ts` : moteur de scoring binaire (matrice de confusion, abstentions, précision, rappel, taux de faux positifs, empreinte du corpus, comparaison à une référence) ;
- `apps/api/src/eval/models.ts` : adaptateurs des deux modèles de production `relevance-gate` et `false-event-gate` ;
- `apps/api/src/eval/corpus.ts` : lecture du corpus gelé et construction des cas à partir des métadonnées réelles ;
- `scripts/evaluate-models.mts` : commande de mesure en lecture seule, écriture du JSON et de ce rapport, option `--check` ;
- `apps/api/test/model-bench.test.ts` : un test par comportement du banc d'essai.

## Protocole

Le corpus gelé `bench/pertinence/corpus-100.json` contient 100 titres réels extraits du flux de Nouvelle-Aquitaine (table `event`), choisis par `md5(id || graine)`, étiquetés à la lecture : 70 cyber explicites, 30 hors sujet. Il couvre la presse locale, les flux d'information régionaux et une source grise autorisée. Aucun texte n'est synthétique.

À chaque mesure, le script relit les identifiants dans la base réelle : les cas absents sont exclus et comptés dans `matchedInDatabase` (100/100 attendus ici). Empreinte du corpus : `dc11af73ef79ddc2b359f671ba050a956a015a4b02b1d5d10495292056089ba3`. L'empreinte ne contient que les identifiants et les étiquettes : changer un titre sans changer l'étiquette ne la modifie pas, ajouter ou retirer un cas la modifie.

- **relevance-gate** : décision d'admission du moteur `evaluatePertinence` sur le titre seul, sans organisation ni département fournis, pour isoler la porte lexicale. Cas positif = titre étiqueté cyber.
- **false-event-gate** : décision du moteur de détection de faux `detectFalseEvent`, avec l'ancrage Nouvelle-Aquitaine réel de l'événement (`org_id` ou drapeau `regional`). Cas positif = événement à conserver : cyber **ou** ancré dans la région. Un titre hors sujet mais ancré ne doit donc pas être déclaré faux.

Une abstention (`null`) est comptée à part et retirée du dénominateur des taux : un 0/0 est publié « non calculable », jamais 0 %. Aucun modèle payant ni appel réseau n'est utilisé.

## Résultats

| Modèle | Cas | Évalués | Abstentions | TP | FP | TN | FN | Précision | Rappel | Taux de faux positifs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `relevance-gate` | 100 | 100 | 0 | 69 | 0 | 30 | 1 | 100,0 % | 98,6 % | 0,0 % |
| `false-event-gate` | 100 | 100 | 0 | 80 | 0 | 20 | 0 | 100,0 % | 100,0 % | 0,0 % |

Les versions des modèles sont enregistrées dans le JSON de mesure avec la configuration active (`keywords`, `exclusions`, seuil). Le résultat complet, décision par décision, est dans `bench/results/model-eval.json` (ou le chemin passé à `--json=`).

## Contrainte de confidentialité et périmètre

Le JSON publié ne contient aucun titre, résumé ni nom de victime : seulement des identifiants numériques d'événements, des étiquettes et des prédictions. Aucune donnée personnelle de victime n'est lue ou écrite. Les sources grises sont autorisées : le périmètre est géographique (Nouvelle-Aquitaine), jamais une sélection de famille de source. Le code et l'interface sont en anglais ; ce rapport est en français. `server.ts` n'est pas modifié (diff : 0 ligne).

## Commande reproductible

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/evaluate-models.mts
```

Rejeu sans réécrire le rapport, avec échec si une métrique régresse :

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/evaluate-models.mts \
  --check=bench/results/model-eval.json
```
OBJECTIF : atteint — 200 / 200
