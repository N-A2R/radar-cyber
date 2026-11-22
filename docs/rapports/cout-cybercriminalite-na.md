# Coût annuel de la cybercriminalité en Nouvelle-Aquitaine

Fenêtre mesurée : **1er novembre 2025 → 31 octobre 2026** (12 mois calendaires clos).
Date de mesure : 22 novembre 2026.

## Résultat chiffré

| Quantité | Valeur mesurée |
|---|---:|
| Incidents annuels estimés | **56,9** |
| Coût unitaire de remplacement | **61 422 €** |
| **Coût annuel estimé** | **3 495 110 € / an** |
| Intervalle de confiance 95 % (bootstrap) | **[2 459 805 € ; 7 024 134 €]** |
| Sensibilité basse (sans correction de détection) | 2 579 724 € / an |
| Sensibilité haute (plafonds budgétaires plutôt que montants attribués) | 13 656 774 € / an |

Lecture : entre **2,46 M€ et 7,02 M€** par an avec un niveau de confiance de 95 %,
la valeur centrale étant **3,50 M€**. Il s'agit d'un **minorant** : seuls les coûts
de remplacement directement observables sont comptés.

## État réel de départ

La base live `localhost:5433/radar`, interrogée en lecture seule au moment de la
mesure, contenait :

- **1 673 151 organisations**, dont **1 671 907** dans les 12 départements de
  Nouvelle-Aquitaine ;
- **312 sources** ;
- **26 259 événements**.

Ces trois compteurs sont vérifiés à chaque exécution par `pnpm measure:cybercrime-cost -- --check` ;
une dérive fait échouer la commande. Aucune donnée personnelle de victime n'est
lue ni écrite : seules des agrégats organisationnels, des dates de publication,
des indicateurs de détection et des montants de marchés publics entrent dans le
calcul.

## Méthode défendable, en quatre étapes

### 1. Périmètre

Seuls les 12 départements de Nouvelle-Aquitaine sont retenus (16, 17, 19, 23, 24,
33, 40, 47, 64, 79, 86, 87). Les événements rattachés à une organisation hors
région, y compris ceux marqués `regional` par erreur (75, 92, 44, 77, 93), sont
exclus. Les sources grises sont autorisées ; aucun service payant n'est appelé.

### 2. Nombre d'incidents

Le corpus témoin versionné (`bench/results/couverture-2026-11-21.json`) recense
**42 incidents publics de Nouvelle-Aquitaine** dont la publication tombe dans la
fenêtre. Le radar en a détecté **31**, soit un rappel mesuré de **73,8 %**.

Correction par l'inverse du rappel :

```
N = 42 / (31 / 42) = 56,90 incidents par an
```

Cette correction est celle d'une sous-détection du radar sur un corpus de
référence ; elle ne prétend pas mesurer les incidents jamais rendus publics.

### 3. Coût unitaire

Le coût d'un incident est approximé par le **montant réellement attribué** d'un
marché public cyber passé en Nouvelle-Aquitaine sur la même période. Les
montants estimatifs ou plafonds sont exclus : ce ne sont pas des dépenses
observées. Les quatre montants attribués retenus sont 43 189,09 €, 60 000 €,
62 844 € et 123 440 € ; leur médiane vaut **61 422 €**.

Source : BOAMP / DILA, données ouvertes sous licence ouverte Etalab,
`https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records`.
La projection minimale versionnée (`bench/fixtures/cyber-cost-anchors.json`,
dérivée du corpus de la PR #470) ne contient ni acheteur, ni attributaire, ni
objet de marché : uniquement la date, le département, le montant et sa nature.

Cette valeur est un **coût de remplacement** (forensique, remédiation, reprise
d'activité) : elle sert de proxy défendable, mesuré dans la région et dans la
période, là où les factures d'incidents ne sont pas publiques.

### 4. Intervalle de confiance

Un bootstrap percentile non paramétrique de **2 000 réplications** (graine
`20261122`) rééchantillonne simultanément :

- les 42 indicateurs de détection du corpus (incertitude sur le rappel) ;
- les 4 montants attribués (incertitude sur le coût unitaire).

Les percentiles 2,5 et 97,5 donnent l'intervalle **[2 459 805 € ; 7 024 134 €]**.
La graine est fixée : deux exécutions produisent exactement le même chiffre.

## Hypothèses et limites

1. Le corpus témoin est un échantillon commodément constitué à partir de
   sources ouvertes ; il n'est pas un recensement exhaustif. L'estimation est
   donc un plancher, pas un total.
2. Un marché public cyber n'est pas une facture d'incident : le coût unitaire
   est un proxy de remplacement. Les rançons, les interruptions d'activité et
   les préjudices diffus ne sont pas comptés.
3. Quatre montants attribués seulement : l'intervalle reflète cette petite
   taille d'échantillon. Le scénario « plafonds budgétaires » (13,66 M€) borne
   la sensibilité haute sans être retenu comme valeur centrale.
4. Le rappel de 73,8 % est mesuré sur des incidents déjà publics ; les incidents
   jamais signalés échappent à la correction.
5. Aucune donnée personnelle de victime, aucun service payant, aucune écriture
   en base : la commande est reproductible hors réseau.

## Commande reproductible

```bash
apps/api/node_modules/.bin/tsx scripts/estimate-cybercrime-cost.mts \
  --json=bench/results/cybercrime-cost-na-2026-11-22.json --check
```

Le résultat complet, y compris les compteurs de départ et les deux scénarios de
sensibilité, est versé dans `bench/results/cybercrime-cost-na-2026-11-22.json`.
Durée mesurée : **1,17 s** dans cet environnement (commande ci-dessus, sortie
JSON incluse), bien sous la limite de 60 s.

## Contrôles

```bash
RADAR_TEST_ADMIN_URL='postgres://radar:radar@localhost:5433/postgres' \
  apps/api/node_modules/.bin/tsx apps/api/test/run.ts test/cybercrime-cost.test.ts
```

**9 tests, 9 réussis**, un comportement par test : périmètre NA, fenêtre fermée,
rappel, correction du nombre d'incidents, filtre des montants attribués,
médiane robuste, bootstrap déterministe et encadrant, détection de dérive des
compteurs, cohérence des fichiers réels versionnés.

`apps/api/src/server.ts` n'est pas modifié (0 ligne de diff). Le code et
l'interface sont en anglais ; le présent rapport est en français.
OBJECTIF : atteint — 1 / 1 estimation annuelle du coût de la cybercriminalité en Nouvelle-Aquitaine publiée avec méthode et IC 95 % (3 495 110 € / an ; IC 95 % [2 459 805 € ; 7 024 134 €], bootstrap 2 000 réplications, graine 20261122 ; mesure rejouée le 22/11/2026 avec `apps/api/node_modules/.bin/tsx scripts/estimate-cybercrime-cost.mts` sans `--check` — compteurs live dérivés depuis la mesure —, estimation identique au JSON versionné ; aucun code ni test modifié).
