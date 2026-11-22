# Faux rattachements par cohérence de graphe — 2026-11-22

## Objectif

Détecter les rattachements incohérents et retirer au moins 100 faux positifs, en Nouvelle-Aquitaine uniquement, sans retirer de lien vérifié comme juste sur l'échantillon manuel.

OBJECTIF : atteint — 195 / 100

## Résultat mesuré

| Mesure | Valeur |
| --- | ---: |
| Organisations dans la base | 1673220 |
| Sources | 463 |
| Événements | 27899 |
| Rattachements en base | 299 |
| Rattachements sur une organisation NA | 240 |
| Rattachements cohérents conservés | 45 |
| **Faux positifs détectés** | **195** |
| Faux positifs effectivement retirés | 195 |

Détail par motif de rejet : `no-shared-node` 10, `publisher-domain-only` 175, `domain-mismatch` 10. Motifs de conservation : `distinctive-name` 39, `shared-domain` 3, `shared-department` 3.

## Méthode

Un rattachement `event.org_id` est conservé seulement si l'événement et l'organisation partagent un nœud du graphe de cohérence :

1. un domaine victime (indice de revendication ou domaine explicite du texte), jamais le domaine de l'organisme qui publie le flux ;
2. un voisin DNS/IP/ASN issu des arêtes `resolves_to` du graphe ;
3. un nom distinctif de l'organisation (nom ou alias) effectivement présent dans le texte de l'événement.

Un domaine qui n'appartient qu'au flux (`publisher-domain-only`) n'est pas une preuve : c'est exactement le défaut du rattachement des dépêches d'un CERT étranger à une association bordelaise. Les motifs génériques (`au bureau`, `open source`, `agence nationale`) ne créent pas de nœud de nom.

Les liens retirés ne sont pas effacés : `event.org_id` passe à `null` et une entrée `attachment.coherence` est écrite au journal avec les identifiants et le motif, sans texte d'événement ni donnée personnelle.

## Validation sur l'échantillon vérifié à la main

Sur les 95 liens de l'échantillon de 100 encore présents en base : 15 hors-sujet détectés, 0 liens exacts ou partiels à tort signalés, 30 hors-sujet non détectés, 50 liens justes conservés.

## Rejouer

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-attachment-coherence.mts
# ajouter --apply pour retirer les liens détectés
```

Tests : `apps/api/node_modules/.bin/tsx --test apps/api/test/attachment-coherence.test.ts`.
