# Incidents non revendiqués — détectés par la presse seule

Mesure du **22 novembre 2026**, sur la branche `ext/chantier-c8`.

## Objectif et résultat

**Objectif : 21 incidents détectés par la presse seule** dans le corpus de
référence vérifié de Nouvelle-Aquitaine (`bench/fixtures/corpus-reference-na.json`,
60 incidents). La cible est le nombre d'incidents étiquetés `rapporte` par la
méthode du corpus : « presse seule », sans confirmation par la victime ni par
une autorité, et sans revendication retenue comme établissement du fait
(`declare` est exclu).

**Résultat mesuré : 21 / 21.** La mesure est reproductible, sans base, sans
réseau et sans service payant (voir la commande ci-dessous).

OBJECTIF : atteint — 21 / 21

## État réel de départ

L'instantané versionné (`bench/results/couverture-mesuree.json`, `dateCalcul`
2026-11-21) porte **1 673 151 organisations, 312 sources et 26 719 événements**
(plus 4 710 archivés) : ce sont les ordres de grandeur de la consigne. La base
live n'était pas joignable à la livraison (`ECONNREFUSED` sur 127.0.0.1:5432) ;
aucun compteur courant n'est donc affirmé ici. Une lecture psql antérieure
notait 1 673 220 / 469 / 27 899, mais elle n'a pas pu être rejouée et n'est pas
prise comme preuve.

Le chiffre livré ne dépend pas de ces compteurs : les incidents vérifiés sont
versionnés dans le dépôt, et la table `event` ne contient aucun d'entre eux
(cf. `docs/comparaison-presse.md`).

## Définition opérationnelle

Un incident entre dans le compte si, et seulement si :

1. son étiquette de confiance est `rapporte` (presse seule) — `etabli`
   (victime/autorité) et `declare` (revendication non confirmée) sont exclus ;
2. son département est l'un des douze de Nouvelle-Aquitaine
   (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87) ;
3. au moins une preuve est publiée par un média ou un éditeur gris public
   (ZATAZ, Clubic, Cyberattaque.org, FrenchBreaches, TNTIC…), et aucune source
   officielle n'est mêlée à la preuve retenue ;
4. l'identifiant d'incident est unique : deux articles du même fait ne comptent
   pas deux fois.

Les sources grises sont autorisées comme **indice de détection**, jamais comme
confirmation : trois incidents du compte en portent une. Aucun nom de victime,
aucun résumé libre et aucune URL d'article ne sortent du détecteur, de l'API ou
de l'interface — seulement l'identifiant, le département, la date, le type et la
catégorie de l'éditeur.

## Commande reproductible

```bash
pnpm measure:press-only
# press-only incidents: 21 / 60
# with grey source: 3
# departments: 16=2, 17=2, 19=2, 23=1, 24=1, 33=5, 40=4, 47=1, 64=1, 79=1, 86=1
```

Avec sortie datée dans `bench/results/press-only-2026-11-22.json` :
`pnpm measure:press-only --json=bench/results/press-only-2026-11-22.json`.

La même règle est servie par `GET /api/press-only/incidents` et affichée dans
l'onglet Corpus, panneau « Press-only incidents ».

## Livré

- `apps/api/src/analyse/press-only.ts` — détecteur pur et projection privée.
- `apps/api/src/routes/press-only.ts` — lecture publique du même chiffre.
- `scripts/measure-press-only.mts` — mesure rejouable, `pnpm measure:press-only`.
- Interface anglaise dans l'onglet Corpus : compte, définition, liste par
  identifiant, états de chargement et d'erreur.
- `docs/incidents-presse-seule.md` — ce rapport.

Le diff de `apps/api/src/server.ts` est **vide** (0 ligne) : la route passe par
le registre unique `routes/index.ts` et la matrice d'accès existante.

## Vérifications observées

Commandes rejouées le 22 novembre 2026, chacune sous 60 s :

- `pnpm measure:press-only` → `press-only incidents: 21 / 60`, sortie datée dans
  `bench/results/press-only-2026-11-22.json`.
- 8 tests API ciblés (`apps/api/test/press-only.test.ts`) : 8/8 verts, dont le
  compte réel 21/60, l'exclusion des départements hors NA, l'exclusion
  `etabli`/`declare`, l'acceptation des sources grises, le rejet d'une source
  officielle, la déduplication, la projection sans donnée personnelle et la
  route HTTP.
- 9 contrôles de rendu (`apps/web/test/press-only-verif.tsx`) : 9/9 verts, y
  compris l'absence de nom de victime dans le DOM.
- `tsc --noEmit` API et web : 0 erreur.
- `securite-couverture.test.ts` : 3/3 verts — la route est enregistrée et
  couverte par une règle publique de la matrice d'accès.
- `securite-rbac.test.ts` non rejoué : PostgreSQL n'écoute pas sur ce poste
  (`ECONNREFUSED`). Le test ciblé de la route avec Fastify est vert, et le
  contrat de couverture des routes l'est aussi.

## Limites

- Le corpus est un échantillon vérifié de 60 incidents, pas un inventaire
  exhaustif des incidents réels de Nouvelle-Aquitaine. Le chiffre mesure notre
  capacité à reconnaître des incidents déjà publiés, pas l'exhaustivité terrain.
- `rapporte` ne signifie pas « non avéré » : cela signifie « non confirmé
  nominativement par la victime ou une autorité dans la page lue ». Quatre des
  21 incidents sont hors de la fenêtre produit `2025-11-01 → 2026-10-31` ;
  dans cette fenêtre seule, le compte serait 17. Ils sont conservés ici
  parce que la consigne porte sur la Nouvelle-Aquitaine, pas sur la fenêtre.
- Aucune détection temps réel n'est revendiquée : la collecte automatique a
  commencé en novembre 2026 et les incidents mesurés sont antérieurs. Ce
  chantier fournit le registre et le compte, pas une alerte précoce.
- Les éditeurs gris restent des indices publics : leur présence n'établit ni
  l'auteur, ni le volume de données, ni l'exfiltration.
