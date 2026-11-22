# Incidents confirmés — tranche 3 du chantier c8

Mesure du **22 novembre 2026**, sur la branche `ext/chantier-c8`.

## Objectif et résultat

La tranche 1 a compté les 21 incidents « presse seule » (`rapporte`) du corpus
vérifié de Nouvelle-Aquitaine ; la tranche 2, les 6 revendications d'attaquant
non confirmées (`declare`). Cette tranche 3 mesure la classe restante : les
incidents dont la pièce publique citée établit une confirmation par la victime
ou par une autorité (`etabli`).

La cible est le nombre réel de lignes `etabli` du corpus de référence versionné
(`bench/fixtures/corpus-reference-na.json`, 60 incidents, 12 départements) :
**33**. Le détecteur les retrouve toutes, sans faux positif. Les trois classes
forment une partition du corpus : 33 + 21 + 6 = 60.

**Résultat mesuré : 33 / 33.**

OBJECTIF : atteint — 33 / 33

## État réel de départ

Les tranches 1 et 2 étaient livrées dans la PR #345 (21/21 et 6/6) ; aucune
tranche 3 n'existait dans l'historique de la branche ni dans une PR. Le corpus
versionné portait déjà les 33 lignes `etabli`, sans code pour les compter ni
route pour les publier.

## Définition opérationnelle

Un incident est retenu quand :

1. son étiquette de confiance dans le corpus vérifié est `etabli` — la
   confirmation est portée par la pièce citée, pas déduite du texte ni du nom
   d'un éditeur ;
2. son département appartient aux 12 départements de Nouvelle-Aquitaine ;
3. au moins une source publique est citée (éditeur principal ou source
   additionnelle) ;
4. son identifiant est unique dans le corpus (une ligne = un événement vérifié).

Les éditeurs gris publics restent des indices : leur présence n'établit ni la
confirmation, ni l'auteur, ni le volume de données. Un éditeur officiel est une
corroboration, pas une condition : la confirmation est celle du corpus vérifié.

La projection publique ne contient que l'identifiant, le département, la date,
le type et la catégorie d'éditeur : aucun nom de victime, aucun résumé libre,
aucune URL d'article.

## Commande reproductible

```sh
pnpm measure:confirmed-incidents --json=bench/results/confirmed-incidents-2026-11-22.json
```

Sans base, sans réseau, sans service payant. Sortie datée :
`bench/results/confirmed-incidents-2026-11-22.json`.

## Livré

- `apps/api/src/analyse/confirmed-incidents.ts` — détecteur pur et projection
  privée, réutilisant la classification d'éditeurs de la tranche 1.
- `apps/api/src/routes/confirmed-incidents.ts` — lecture publique du même chiffre.
- `scripts/measure-confirmed-incidents.mts` — mesure rejouable,
  `pnpm measure:confirmed-incidents`.
- Interface anglaise « Confirmed incidents » dans l'onglet Corpus, avec états
  de chargement et d'erreur.
- Un test par comportement : 8 tests API, 10 contrôles de rendu.
- `docs/incidents-confirmes.md` — ce rapport.

Le diff de `apps/api/src/server.ts` est **vide** (0 ligne) : la route passe par
le registre unique `routes/index.ts` et la matrice d'accès existante.

## Vérifications observées

- `pnpm measure:confirmed-incidents` → `confirmed incidents: 33 / 60`,
  7 avec source grise, 12 départements couverts.
- 8/8 tests API ciblés verts (`confirmed-incidents.test.ts`).
- 3/3 tests de couverture de sécurité verts (`securite-couverture.test.ts`) :
  route enregistrée et règle publique présente.
- 10/10 contrôles de rendu verts (`test:confirmed-incidents`).
- `tsc --noEmit` API et web : 0 erreur.
- `securite-rbac.test.ts` non rejoué : PostgreSQL n'écoute pas sur ce poste.

## Limites

- Le corpus est un échantillon vérifié de 60 incidents, pas un inventaire
  exhaustif de la région ; le chiffre mesure notre capacité à reconnaître des
  incidents déjà publiés et confirmés, pas l'exhaustivité terrain.
- `etabli` signifie « confirmé nominativement par la victime ou une autorité
  dans la pièce publique lue », pas « grave » ni « avéré au-delà de cette pièce ».
- Aucune détection temps réel n'est revendiquée : ce chantier fournit le registre
  et le compte, pas une alerte précoce.
- Aucune donnée personnelle de victime n'est exposée, côté API comme côté
  navigateur.
