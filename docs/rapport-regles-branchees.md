# Rapport de vague — les règles de précision branchées dans le moteur

Vague « branchement » (docs/plans/wave-regles.md), 21 novembre 2026.
Suite de docs/rapport-precision.md (la campagne qui a posé les six règles).
État complet : `bench/state/wave-regles.json`. Mesure réexécutable :
`scripts/precision-branchement.mts` → `bench/results/precision-branchement.json`.

## La question et la réponse

**Que devient le rattachement en production quand les six règles de précision
sont actives (`PRECISION_RULES=on`) — et que coûte la précision gagnée ?**

| Mesure | off (livré) | on (règles actives) |
|---|---|---|
| Précision brute (frais proportionnel = estimateur de population) | **5,7 %** | **83,3 %** |
| Précision population stratifiée | 4,5 % (gelé) | **13,8 %** (frais) |
| **Couverture : part des rattachements du moteur qui survivent** | 100 % | **16,6 %** sur le frais (83/500, Wald ±3,3 pt à n=500) — **43,0 %** sur le gelé (215/500) |
| Part de la population dans des strates encore actives | 100 % | **29,1 %** (frais) / 29,2 % (gelé) — le « 29 % » de la vague précédente |
| Refus sur la file réelle du jour (220 faits à indice) | 16 rattachés | **0** (refus : 1-sigle 14, 2-homonyme 2) |
| Coût runtime des règles | — | +0,00 ms par indice (mesuré vague précédente) |

En clair : avec les règles actives, un rattachement que la machine **écrit**
a ~84 % de chances d'être la bonne organisation (contre ~5 % avant) — mais la
machine ne produit plus de rattachement que pour **une part bien plus petite**
des indices. Le prix exact dépend de l'estimateur, et les deux estimateurs ne
disent pas la même chose (voir « Le prix » ci-dessous). Les indices refusés
ne sont pas jetés : ils restent en file de revue, et chaque refus est écrit au
journal avec **la règle qui l'a posé**.

## Le prix, mesuré — deux estimateurs, publiés ensemble

La vague précédente publiait « le moteur ne rattache plus que 29 % de la
population ». La relecture de cette vague montre que ce nombre est un **borne
haute**, et la mesure branchée le précise :

- **Par unité d'attachement (l'estimateur brut du tirage proportionnel)** :
  83/500 = **16,6 %** des rattachements que le moteur produisait survivent aux
  règles. Sur les 1 992 unités rattachées de la population, cela estime
  ~330 unités encore produites.
- **Par strates encore actives (l'estimateur stratifié, ce que le 29 % mesurait)** :
  580/1 992 unités = **29,1 %** vivent dans des strates qui produisent encore
  des rattachements. Une strate à moitié survivante y compte pour entière —
  d'où la surestimation.

La vraie couverture est donc entre **16,6 % et 29,1 %** selon ce qu'on mesure :
la survie des attachements individuels (16,6 %) ou la part de la population
que le moteur continue de couvrir en partie (29,1 %). Les deux chiffres
décrivent des choses différentes et n'ont pas à être arbitré : ils sont
publiés ensemble, ici et dans `bench/results/precision-branchement.json`.

## Ce que chaque règle refuse (fonction de production, `ecarteeParRegles`)

| Règle | Gelé (n=500) | Verdicts refusés | Frais (n=500) | Verdicts refusés |
|---|---|---|---|---|
| 1-sigle (jeton unique, 0,7) | 140 | 128 hs, 12 indéc | 353 | 282 hs, 70 indéc, **1 partielle** (fujitsu.com) |
| 2-homonyme (indice non couvert par le nom, 0,75) | 93 | 92 hs, **1 partielle** (Atos) | 45 | 44 hs, **1 partielle** (Atos) |
| 3-masquage (indice masqué) | 25 | 24 hs, 1 indéc | 12 | 11 hs, 1 indéc |
| 4-commentaire (marqueur de fuite hors domaine) | 24 | 24 hs | 6 | 6 hs |
| 6-ville (chemin ville+nom, 0,6) | 3 | 3 hs | 1 | 1 hs |
| 5-TLD | — | sans prédicat propre, couvert par 1-sigle | — | idem |

Totaux : **285/500 écartées sur le gelé** (271 hors_sujet, 13 indécidables,
1 partielle), **417/500 sur le frais** (344 hs, 71 indéc, 2 partielles) —
identiques aux mesures de la vague précision (`precision-generalisation.json`),
recoupées ici avec la fonction appelée par le moteur. **0 exacte cassée** ; les
2 partielles perdues sur le frais sont le prix assumé et documenté de la vague
précédente.

## Le flux réel d'aujourd'hui

La file `quarantine_raw` pending à indice compte **220 faits** (16 901 claims
au total, le reste est promu, relu ou sans indice) :

- 204 faits ne produisent aucun rattachement (sans rapport avec les règles) ;
- 16 produisent un rattachement off → **0 avec les règles on** : 14 refus
  1-sigle, 2 refus 2-homonyme (« Marseille Provence » → « SCI PROVENCE »,
  « INTERSPORT France » → « FRANCE 2R ») ;
- **aucun des 16 n'atteignait le seuil de promotion automatique (0,85)** :
  sur la file du jour, les règles ne retirent rien à l'observatoire — elles
  retirent de la file de revue 16 propositions fausses.

Sur le corpus, en revanche, les règles refusent aussi des rattachements de la
strate haute (0,9) : les indices masqués qui étaient **auto-promus** (24
hors_sujet + 1 indécidable sur le gelé). Le branchement arrête donc des
écritures automatiques réelles, pas seulement des propositions.

## Ce que ça implique pour la revue humaine

1. **La charge ne baisse pas, elle se déplace.** Les indices refusés restent
   en file (`status='pending'`) ; ce qui disparaît, ce sont les fausses
   propositions de rattachement. L'analyste vérifie moins de rattachements
   faux et rattache à la main plus d'indices sans proposition — c'est la
   contrepartie directe de la précision 83 %.
2. **Chaque refus est lisible.** La promotion automatique écrit un fait
   `match.refuse` au journal (payload : règle, indice, org proposée, via,
   confiance, drapeau), dédoublonné par (sujet, règle) car la file est
   rescanée à chaque passage. La voie manuelle journalise dans la même
   transaction que la promotion.
3. **La promotion manuelle d'un analyste n'est jamais bloquée.** Si
   l'analyste promeut un indice que les règles refusent, l'événement entre
   dans l'observatoire **non rattaché**, avec le refus au journal et
   `refuseParRegle` dans la réponse de l'API : la machine ne pose pas un
   rattachement non fondé, l'humain garde la décision.
4. **La voie de sortie reste celle documentée par la vague précision** :
   enrichissement du référentiel (domaines renseignés pour 69 organisations
   sur 1,24 M) et revue des indécidables (27 % des propositions). Sans
   enrichissement, les 16,6-29 % de couverture ne remontent pas.
5. **Mise en production.** Le drapeau `PRECISION_RULES` est absent du
   `.env` livré (défaut `off`) : tant que l'exploitation ne le pose pas à
   `on`, le binaire branché se comporte exactement comme le binaire d'avant.
   Recommandation : poser `PRECISION_RULES=on` dans l'environnement de l'API ;
   le premier passage de promotion constatera les refus au journal. Le
   retour arrière est immédiat (défaut sans la variable).

## Relecture : les écarts trouvés dans la campagne précédente

Consignés tels quels, sans lissage ; aucun verdict du corpus gelé ni des
tirages n'a été modifié :

1. **Source citée fausse pour les bons chiffres.** docs/rapport-precision.md
   et docs/plans/wave-regles.md attribuent « 83,3 % brut · 13,8 % population »
   à `precision-regle12-s2.json` — ce fichier porte les règles 1+2 sur le
   gelé (66,4 % brut / 19,1 % population, 243 conservées). Les chiffres
   83,3 % / 13,8 % viennent du jeu complet sur le frais :
   `precision-regles-frais500.json` + `precision-generalisation.json`.
2. **`rattachementsEncoreProduits: 0.291` n'est pas une survie par unité.**
   Le champ (precision-generalisation.json) est le poids des strates encore
   actives (poidsActif de l'estimateur stratifié) : une strate à moitié
   survivante y compte entière. La survie par unité sur le même tirage est
   83/500 = 16,6 %. Le « 29 % des indices rattachés » publié était la borne
   haute ; voir « Le prix ».
3. **Le 5,7 % brut (frais) ne vit pas dans `precision-baseline.json`** (qui
   porte le 4,5 % stratifié et le brut gelé 21,8 %) mais dans
   `precision-generalisation.json`. Tableau du plan corrigé ici, pas dans le
   plan (document daté).

## Ce que la vague ne prétend pas

- **La file de revue n'est pas filtrée.** Les règles portent sur ce que la
  machine **écrit** (promoteMatches, promoteOneTx). L'écran de revue calcule
  et montre toujours toutes les propositions du moteur ; y filtrer l'affichage
  est une autre vague.
- **La précision 83,3 % porte sur ce qui est encore produit** — 16,6 % des
  attachements du moteur (frais). Elle ne dit rien des indices écartés,
  qui retournent en revue humaine.
- **La mesure « flux réel » porte sur la file du jour** (220 faits), pas sur
  les 15 918 indices de la population : l'estimateur de population reste
  celui du frais 500, la file du jour ne fait que montrer le comportement
  branché sur des données vivantes.
- **Les indécidables restent hors du dénominateur** : les règles ne les
  tranchent pas, c'est la voie de revue et d'enrichissement (déjà documenté).

## Rejouer

```bash
# mesure complète (gelé + frais + file du jour, les deux régimes dans le même binaire)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  tsx scripts/precision-branchement.mts

# jeu d'or avec parité moteur (50 pièges, fonction de production exigée)
tsx scripts/precision-gold.mts --verifier

# garde-fous moteurs (les deux régimes verrouillés sur la promotion)
cd apps/api && RADAR_TEST_ADMIN_URL='postgres://radar:radar@localhost:5433/postgres' \
  node_modules/.bin/tsx test/run.ts

# basculer le régime en production
PRECISION_RULES=on   # (environnement de l'API ; défaut : off)
```
