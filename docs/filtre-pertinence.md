# Filtre de pertinence — audit mesuré (10/11/2026)

Mesuré par `scripts/audit-filter.mts` (lecture seule, prédicats importés) sur les 72 sources `narrative` + `relevance='context'` et 3 sources à indicateurs.

## Règles réelles
1. `isRelevant` ne s'applique qu'aux sources `relevance != 'strict'` (72 des 213 sources `narrative`) ; les 141 `strict` passent outre, sans test.
2. Il teste dans l'ordre les 29 `CYBER_KEYWORDS` (francophones, sauf `ransomware`/`phishing`/`zero-day`/`DDoS`/`APT`/`CVE-`) sur titre+résumé+URL+sourceUrl, puis le nom d'org normalisé (≥4 car.) ou son domaine/asset sur titre+résumé seulement. Présence = vrai, aucun score.
3. « Bruit » ≠ « hors périmètre » : bruit = `filterIndicators` (dénylist MISP des valeurs courantes) + `isActionableIndicator` (ni org, ni sous-domaine, ni /24 d'asset, ni CVE connue) sur les indicateurs ; hors périmètre éditorial = `isRelevant`, qui jette du cyber non rattaché.
4. Aucune fenêtre d'âge dans `generic.ts`. `last_items` = lignes insérées (`xmax = 0`) : 0 = « rien de neuf », pas « tout filtré ». `items_new` d'une source à indicateurs compte aussi les `ON CONFLICT DO UPDATE` et surestime le neuf.

## Répartition — 2 682 items lus
| motif | items | part |
|---|---|---|
| pertinence (`isRelevant` = false) | 2 135 | 79,6 % |
| doublon_db (clé déjà en base) | 113 | 4,2 % |
| sans titre (jeté silencieusement) | 25 | 0,9 % |
| format non reconnu | 12 | 0,4 % |
| source vide / 304 | 1 | 0,0 % |
| **retenus (nouveaux)** | **409** | 15,2 % |

Sur les 2 135 rejets : 930 (44 %) viennent de 39 flux 100 % cyber (actu-*, cert-*, osint-*, bsi, telegram) où le filtre se trompe, 733 (34 %) de la presse régionale généraliste où le rejet est voulu. Côté indicateurs : 503 712 sur 503 712 rejetés en `hors_perimetre` (aucun ne touche nos actifs), 3 467 doublons, 7 retenus — conforme.

## Recommandation chiffrée
Étendre `CYBER_KEYWORDS` au lexique anglais (`vulnerability`, `exploit`, `malware`, `breach`, `attack`, `threat actor`, `patch`, `zero-day`) : **+317 items (+14,8 %)**, dont 343/350 sans lien avec nos 529 orgs — du contexte cyber, pas du ciblage ; faux positifs circonscrits aux articles hors-sujet d'un média cyber. Les deux pistes demandées sont marginales : CVE à EPSS>0,10 = +13 (0,6 %), département de la région cité = +33 (1,5 %). Levier gratuit et plus large : basculer les 39 flux cyber-natifs en `relevance='strict'` rendrait ~930 items, au prix de la garantie anti-bruit sur ces seuls flux.

## État courant (21/11/2026)

Le diagnostic ci-dessus porte sur l'ancienne porte. Depuis, `collectors/filter.ts`
porte un moteur unique, `evaluatePertinence`, qui remplace l'ancienne présence
binaire par un score entier 0–10 ; `isRelevant` n'en est plus qu'un adaptateur
pour les scripts d'audit. Le lexique intègre désormais l'anglais (`breach`,
`vulnerability`, `malware`, `exploit`, `threat actor`…), ce qui répond à la
recommandation chiffrée plus haut. Les signaux EPSS et département montent le
score au lieu de contourner la porte ; une organisation citée ajoute 3 points.

Configuration, sans dépendance : `RADAR_CYBER_KEYWORDS` (termes supplémentaires),
`RADAR_CYBER_EXCLUSIONS` (phrases qui annulent un score faible) et
`RADAR_CYBER_MIN_SCORE` (seuil 1–10, défaut 2). La langue reste filtrée par
`RADAR_LANGUAGES` et stockée dans `event.langue` (migration 047) ; le score et
la règle d'admission sont stockés dans `event.pertinence_score` et
`event.pertinence_rule` (migration 050).

Mesures reproductibles :
- `test/language.test.ts` : détection fr/en **30/30 (100 %)** ;
- `test/pertinence.test.ts` : verdict sur 30 textes **30/30 (100 %)** ;
- `pnpm mesure:pertinence` sur le corpus gelé de 100 items réels étiquetés :
  faux positifs **0/30 (0,0 %)**, précision 69/69 (100 %), rappel 69/70
  (98,6 %). Avec l'ancienne règle « présence d'un mot = pertinence » (seuil 1),
  le taux de faux positifs serait **16/30 (53,3 %)** : le seuil et la pondération
  font le résultat, pas le seul lexique.

L'unique manque du corpus est un titre avec « attaquée numériquement » et
« piratée » (formes conjuguées non couvertes) : il reste mesuré et publié,
pas masqué.