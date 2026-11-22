# Revendications non confirmées — tranche 2 du chantier c8

Mesure du **22 novembre 2026**, sur la branche `ext/chantier-c8`.

## Objectif et résultat

La tranche 1 a compté les 21 incidents « presse seule » (`rapporte`) du corpus
vérifié de Nouvelle-Aquitaine, en excluant explicitement les revendications
d'attaquant (`declare`). Cette tranche 2 mesure la classe complémentaire : les
incidents de Nouvelle-Aquitaine dont la seule affirmation d'attaque vient d'un
tiers, sans confirmation de la victime ni d'une autorité dans la pièce citée.

La cible est le nombre réel de lignes `declare` du corpus de référence
versionné (`bench/fixtures/corpus-reference-na.json`, 60 incidents, 12
départements) : **6**. Le détecteur les retrouve toutes, sans faux positif.

**Résultat mesuré : 6 / 6.**

OBJECTIF : atteint — 6 / 6

## État réel de départ

Aucun compteur courant n'est affirmé : la base live n'était pas joignable et
la mesure ne dépend ni d'elle, ni du réseau, ni d'un service payant. La source
est l'instantané vérifié et cité du corpus, seul archivé dans le dépôt.

## Définition opérationnelle

Une revendication non confirmée est une ligne du corpus qui réunit trois
conditions :

1. `confiance === "declare"` : l'attaque est affirmée par un tiers, la victime
   ou une autorité ne l'a pas confirmée dans la source lue ;
2. `departement` appartient aux douze départements de Nouvelle-Aquitaine ;
3. au moins un éditeur est cité comme indice, et aucun n'est officiel.

Les éditeurs gris publics (FrenchBreaches, ZATAZ, Clubic, TNTIC,
Cyberattaque.org) sont acceptés comme **indice de revendication**, jamais comme
confirmation. Une source officielle disqualifie la ligne. Les identifiants
dupliqués sont fusionnés : un fait vérifié compte une fois.

Répartition mesurée : 4 revendications avec source grise, 2 rapportées par la
presse, départements 33 (3), 47 (1), 64 (2) ; types : ransomware (5), ddos (1).

## Commande reproductible

```bash
pnpm measure:unconfirmed-claims --json=bench/results/unconfirmed-claims-2026-11-22.json
```

Sortie observée : `unconfirmed claims: 6 / 60`. Le résultat daté est versionné
dans `bench/results/unconfirmed-claims-2026-11-22.json`.

## Livré

- `apps/api/src/analyse/unconfirmed-claims.ts` — détecteur pur et projection
  privée, réutilisant la classification d'éditeurs de la tranche 1.
- `apps/api/src/routes/unconfirmed-claims.ts` — lecture publique du même chiffre.
- `scripts/measure-unconfirmed-claims.mts` — mesure rejouable, sans base ni réseau.
- Interface anglaise « Unconfirmed claims » dans l'onglet Corpus, avec états
  de chargement et d'erreur.
- Un test par comportement : 8 tests API, 10 contrôles de rendu.
- `docs/revendications-non-confirmees.md` — ce rapport.

La projection ne contient que l'identifiant, le département, la date, le type
et la catégorie d'éditeur : aucun nom de victime, aucun résumé libre, aucune
URL d'article. Le diff de `apps/api/src/server.ts` est **vide** (0 ligne) : la
route passe par le registre unique et la matrice d'accès existante.

## Vérifications observées

- `pnpm measure:unconfirmed-claims` → `unconfirmed claims: 6 / 60`, 4 avec
  source grise.
- 8/8 tests API ciblés verts (`unconfirmed-claims.test.ts`).
- 3/3 tests de couverture de sécurité verts (`securite-couverture.test.ts`) :
  route enregistrée et règle publique présente.
- 10/10 contrôles de rendu verts (`test:unconfirmed-claims`).
- `tsc --noEmit` API et web : 0 erreur.
- `securite-rbac.test.ts` non rejoué : PostgreSQL n'écoute pas sur ce poste.

## Limites

- Le corpus est un échantillon vérifié de 60 incidents, pas un inventaire
  exhaustif de la région ; le chiffre mesure notre capacité à reconnaître des
  revendications déjà publiées, pas l'exhaustivité des attaquants.
- `declare` ne signifie pas « faux » : la revendication peut être vraie, mais
  elle n'est pas confirmée nominativement dans la pièce publique lue.
- Les sources grises restent des indices publics : leur présence n'établit ni
  l'auteur, ni le volume de données, ni l'exfiltration.
- Aucune détection temps réel n'est revendiquée : ce chantier fournit le
  registre et le compte, pas une alerte précoce.
