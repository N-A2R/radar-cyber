# Cartographie NIS2 — pourquoi une entité est essentielle ou importante

La migration `db/migrate-217-org-nis2.sql` crée la table `org_nis2` : une ligne
par organisation du référentiel dont le `kind` est `operateur_critique` ou
`ess`. Chaque ligne porte `categorie` (`essentielle` ou `importante`), `motif`
(explication lisible), `siren`, `classes_le` et `preuve` (calcul structuré).
La vue `org_nis2_lecture` expose ces champs avec le nom et le `kind` de
l'organisation.

## Règle de classement

Fondement : directive (UE) 2022/2555 (NIS2), article 3 et annexes I et II.
La transposition nationale reste à confirmer par l'autorité compétente ; aucune
source nationale n'est présentée comme une collecte locale.

1. `kind = 'operateur_critique'` → **essentielle** (annexe I).
2. Nom normalisé correspondant à une administration publique (conseil
   départemental, département, SDIS, préfecture, ARS) → **essentielle**
   (annexe I, administration publique).
3. `effectif_min >= 250`, ou NAF dans les divisions critiques (énergie, eau,
   transport, numérique, finance, administration, santé) → **essentielle**.
4. Sinon (enseignement/recherche ou autre secteur couvert de taille PME) →
   **importante** (annexe II).

## Preuve

`preuve` contient `regle`, `entrees` (kind, famille, nom normalisé, NAF,
secteur, effectif, SIREN brut), `source_droit`, `siren_source`, `nom_officiel`,
`siren_etabli` et `calcule_le`. Le `motif` reprend la règle, les entrées et la
source du SIREN en langage lisible.

Le SIREN est pris, dans l'ordre, dans `org.siren`, dans l'identifiant officiel
SIRENE de `org.entity_code`, dans les neuf premiers chiffres d'un SIRET
`entity_code` de source `sirene-site`, dans la table de correspondances
`org_nis2_reference_siren` (SIREN vérifiés auprès de l'API Recherche
d'entreprises, base SIRENE INSEE, source nationale nommée comme telle), puis
dans l'organisation mère. À défaut, la valeur sentinelle `000000000` est
employée avec `siren_etabli = false` : elle n'est jamais présentée comme un
identifiant officiel.

Un trigger `nis2_org_classement` recalcule la ligne à chaque insertion ou
changement pertinent de l'organisation ; le retrait du statut assujetti supprime
la ligne. Le backfill de la migration couvre les organisations préexistantes.

## Vérification

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/verifie-nis2-classement.mts
```

Sortie observée le 2026-11-23 sur la base de développement :

```text
resultat_1=0
resultat_2=0
classes=27
siren_etabli=27
verdict=ok
```

Le test `apps/api/test/org-nis2.test.ts` exécute les deux requêtes du juge sur
une base de test neuve et vérifie chaque règle de classement avec ses propres
organisations synthétiques.
