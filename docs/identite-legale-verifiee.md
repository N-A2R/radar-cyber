# Identité légale vérifiée des organisations citées

## Règle

Le nom d'une organisation citée par un événement n'est publié que si son SIREN
a été confronté à la **source officielle nationale** : l'API « recherche
d'entreprises » mise à disposition par la DINUM à partir des données SIRENE de
l'INSEE (`https://recherche-entreprises.api.gouv.fr/`). C'est une source
nationale, présentée comme telle : aucune fiche n'est présentée comme une
collecte locale, aucune clé d'API n'est requise, aucune donnée n'est mise en
cache dans le dépôt.

## Schéma (migration 215)

- `org.siren_verifie_le` : horodatage de la confrontation avec la source.
- `org.siren_nom_officiel` : raison sociale exacte renvoyée par la source.
- Contrainte `org_siren_verifie_format_check` : un horodatage sans SIREN à neuf
  chiffres est impossible.
- `identite_legale_decrochage` : trace (`event_id`, `motif`, `decroche_le`) de
  chaque événement dont l'attribution à une organisation a été retirée.

## Décision

`apps/api/src/siren/verification.ts` est pur : il ne devine jamais.

1. Un nom de domaine n'est pas une personne morale : aucun SIREN ne lui est
   attribué.
2. Un SIREN déjà présent est confirmé uniquement par sa propre fiche officielle.
3. En l'absence de SIREN, la recherche par nom (avec le département quand il est
   connu) n'accepte qu'une raison sociale normalisée identique. Les noms
   commerciaux entre parenthèses et l'ordre « nom / prénom » sont ignorés par
   la normalisation ; les mots de liaison ne distinguent pas deux fiches.
4. Trois alias explicites et documentés couvrent les cas où la dénomination
   courante n'est pas la raison sociale (Grand Poitiers, conseil départemental
   de Lot-et-Garonne, SPSTI16). La fiche officielle doit confirmer la raison
   sociale attendue avant toute écriture.
5. Deux candidats encore possibles = abstention : aucun gagnant n'est choisi au
   hasard.
6. Quand la fiche officielle désigne une personne physique sans lien avec le
   libellé publié, l'événement est détaché : aucun nom personnel n'est copié.

## Opération

```sh
# Rapport seul (aucune écriture)
DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/certifier-siren-cites.mts \
  --json=/tmp/siren-cites-rapport.json

# Certification : horodatage, correction, puis retrait des attributions non vérifiables
DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/certifier-siren-cites.mts \
  --appliquer --echantillon=100 --json=bench/results/siren-cites.json

# Contrôle seul des 100 SIREN tirés au hasard dans le référentiel
DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/certifier-siren-cites.mts \
  --controle-seul --echantillon=100 --json=bench/results/siren-echantillon.json
```

L'API est appelée séquentiellement avec une pause et des reprises sur 429/5xx :
le service est public et gratuit, mais il est limité en débit.

## Contrôle

```sql
SELECT count(*) FROM org o
 WHERE o.id IN (SELECT org_id FROM event)
   AND (o.siren IS NULL OR o.siren_verifie_le IS NULL OR length(o.siren) <> 9);
-- 0 attendu
```

Le second contrôle prélève 100 SIREN au hasard dans `org` et compare le nom de
l'organisation à la raison sociale renvoyée par l'API officielle, avec la même
normalisation que le pipeline. Résultats dans `bench/results/siren-cites.json`
et `bench/results/siren-echantillon.json`.

## Résultat mesuré (2026-11-23)

- 80 organisations citées ; 53 SIREN vérifiés auprès de l'API officielle,
  27 attributions retirées (19 noms de domaine, 8 libellés sans fiche officielle
  correspondante), soit 40 événements détachés et tracés.
- Critère SQL exécuté tel quel : `count(*) = 0`.
- Les 53 organisations certifiées portent toutes le nom officiel enregistré
  (53/53 conformes).
- Tirage de 100 SIREN dans l'ensemble du référentiel : 94 réponses conformes,
  6 libellés historiques `sirene`/`sirene-ferme` sont des noms commerciaux
  (`CAFE DU COMMERCE`, `ANTIQUE DESIGN DECORATION`...) qui ne sont pas la
  raison sociale de la fiche INSEE. Leur correction de fond supposerait
  d'interroger les 1,67 M fiches une par une ; elle n'est pas effectuée ici.

