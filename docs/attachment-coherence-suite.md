# Faux rattachements résiduels — passe 2 — 2026-11-22

## Objectif

Détecter au moins 10 faux rattachements résiduels en Nouvelle-Aquitaine après la première passe (195 liens retirés), sans signaler à tort un lien vérifié comme juste.

OBJECTIF : atteint — 17 / 10

## Résultat mesuré

| Mesure | Valeur |
| --- | ---: |
| Organisations dans la base | 1673220 |
| Sources | 543 |
| Événements | 26758 |
| Rattachements en base | 103 |
| Rattachements sur une organisation NA | 45 |
| Rattachements cohérents conservés | 28 |
| Faux positifs déjà au journal avant cette passe | 195 |
| **Faux positifs détectés** | **17** |
| Faux positifs effectivement retirés en passe 2 | 17 |

Détail par motif de rejet : `sector-only-name` 17. Motifs de conservation : `distinctive-name` 22, `shared-domain` 3, `shared-department` 3.

## Méthode

Un rattachement `event.org_id` est conservé seulement si l'événement et l'organisation partagent un nœud du graphe de cohérence :

1. un domaine victime (indice de revendication ou domaine explicite du texte), jamais le domaine de l'organisme qui publie le flux ;
2. un voisin DNS/IP/ASN issu des arêtes `resolves_to` du graphe ;
3. un nom distinctif de l'organisation (nom ou alias) effectivement présent dans le texte de l'événement.

La passe 2 ajoute un veto : un nom formé uniquement de mots de secteur (`DATA STORAGE`, `GREEN ENERGY`, `QUALITY CONTROL`) décrit une catégorie, pas une entité. Les descriptions de revendications parlent du secteur de la victime ; elles ne prouvent pas que l'organisation référencée est la victime. Un domaine victime partagé, un voisin réseau, un département explicite ou un alias distinctif gardent la priorité sur ce veto.

Un domaine qui n'appartient qu'au flux (`publisher-domain-only`) n'est pas une preuve : c'est exactement le défaut du rattachement des dépêches d'un CERT étranger à une association bordelaise. Les motifs génériques (`au bureau`, `open source`, `agence nationale`) ne créent pas de nœud de nom.

Les liens retirés ne sont pas effacés : `event.org_id` passe à `null` et une entrée `attachment.coherence` est écrite au journal avec les identifiants et le motif, sans texte d'événement ni donnée personnelle.

## Validation sur l'échantillon vérifié à la main

Sur les 80 liens de l'échantillon de 100 encore présents en base : 16 hors-sujet détectés, 0 liens exacts ou partiels à tort signalés, 14 hors-sujet non détectés, 50 liens justes conservés.

## Rejouer

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-attachment-coherence.mts
# ajouter --apply pour retirer les liens détectés
```

Tests : `apps/api/node_modules/.bin/tsx --test apps/api/test/attachment-coherence.test.ts`.
