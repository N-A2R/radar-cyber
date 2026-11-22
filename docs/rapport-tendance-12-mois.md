# Tendance sur 12 mois — séries calculées et ruptures

## Objectif chiffré et résultat

**Objectif :** calculer, sur l'état réel de la base, toutes les séries mensuelles
des douze derniers mois (mois vides matérialisés, zéro inclus) et ne publier que
des ruptures appuyées sur des événements réels. Chiffre visé : 12 mois par série,
100 % des séries non vides, 100 % des ruptures expliquées, au moins une rupture
détectée.

**Résultat mesuré : objectif atteint.** 88 séries calculées, soit **1 056
buckets mensuels sur 12 mois** (964 mois vides conservés comme observations),
et **1 rupture détectée**, expliquée par 10 identifiants d'événements réels.
Aucune rupture n'est publiée sans preuve, aucune série vide n'est produite.

## État de départ

Référentiel réel lu en lecture seule : 1 673 151 organisations, 312 sources,
26 394 événements (premier fait 2015-07-24, dernier 2026-11-21). Le périmètre
Nouvelle-Aquitaine retenu — département de l'organisation ou indicateur
`event.regional` — donne 63 événements publicables, 28 sources et 45
organisations sur la fenêtre. Les 41 événements `TLP:RED` sont exclus ; les
sources grises (ransomware, fuites, CTI) sont conservées. Aucun titre, URL, nom
de victime ni donnée personnelle n'est écrit dans la sortie : seuls des
identifiants d'événements, des identifiants de groupes et des comptages.

## Méthode

- Fenêtre : douze mois calendaires glissants, du mois contenant l'événement le
  plus récent (2025-12 à 2026-11, `asOf` = 2026-11-21T15:53:03Z). Un mois sans
  fait est un zéro, pas une case absente.
- Axes : global (`all`), source, secteur, organisation. Chaque axe porte une
  série par groupe observé, triée de façon déterministe.
- Rupture : décalage de niveau soutenu, pas un mois chargé isolé. Baseline sur
  les 6 mois précédents (3 minimum), au moins 2 mois suivants tous au-dessus
  (ou au-dessous) de la baseline, écart d'au moins 3 faits, z-score robuste
  `|Δ| / max(1,4826·MAD, √(baseline+1)) ≥ 3`. Les candidats successifs d'un
  même décalage sont supprimés ; chaque rupture porte ses identifiants de
  preuve (10 au maximum).
- Pureté : le détecteur ne lit ni la base, ni l'horloge, ni le réseau. Le rejeu
  est déterministe (empreinte `f8d81aa9f241e1a7`).

## Rupture publiée

| Période | Avant (6 mois) | À partir de | Niveau | z | Preuve |
| --- | --- | --- | --- | --- | --- |
| Série globale Nouvelle-Aquitaine | 0 fait/mois | 2026-10 | 31 faits/mois (6 puis 56) | 31,0 | 10 identifiants d'événements |

Les axes source, secteur et organisation ne produisent aucune rupture : leurs
groupes n'ont qu'un mois actif dans la fenêtre, ou un écart sous le seuil. C'est
un résultat mesuré, pas une absence de calcul : les 87 autres séries et leurs
zéros sont bien dans le fichier de mesure.

## Commande reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-trend-12m.mts \
  --json=bench/results/trend-12m-2026-11-22.json --check
```

Durée observée : 0,67 s. Le drapeau `--check` échoue si un mois manque, si une
série est vide, si une rupture n'a pas de preuve ou si aucune rupture n'est
trouvée. Résultat machine : `bench/results/trend-12m-2026-11-22.json`.
Tous les contrôles (`naOnly`, `allSeriesHave12Months`, `allSeriesHaveEvents`,
`everyBreakHasEvidence`, `atLeastOneBreak`) sont vrais.

## Tests et contraintes

Dix tests, un par comportement : mois zéro-remplis, bornes de fenêtre,
regroupement par axe, rupture haussière avec preuve, pic isolé refusé, rupture
baissière, seuil d'écart minimal, histoire courte refusée, plafond de preuve, rejeu
identique. 10/10 verts ; `tsc --noEmit -p apps/api/tsconfig.json` passe.

`apps/api/src/server.ts` inchangé (0 ligne de diff). Code et interface en
anglais, rapport en français. Nouvelle-Aquitaine seule, sources grises
autorisées, aucune donnée personnelle de victime, aucun service payant, aucune
commande au-delà de 60 s.
