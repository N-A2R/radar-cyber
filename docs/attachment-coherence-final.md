# Faux rattachements résiduels — passe 3 — 2026-11-22

## Objectif

Détecter au moins 5 faux rattachements résiduels en Nouvelle-Aquitaine après les deux premières passes (212 liens retirés), sans signaler à tort un lien vérifié comme juste.

OBJECTIF : atteint — 8 / 5

CHANTIER TERMINÉ — objectif du chantier (≥ 100 faux rattachements retirés) atteint et dépassé : 220 retraits journalisés, 0 lien vérifié juste signalé à tort.

## Résultat mesuré

| Mesure | Valeur |
| --- | ---: |
| Organisations dans la base | 1673221 |
| Sources | 563 |
| Événements | 26758 |
| Rattachements en base | 86 |
| Rattachements sur une organisation NA | 28 |
| Rattachements cohérents conservés | 20 |
| Faux positifs déjà au journal avant cette passe | 212 |
| **Faux positifs détectés** | **8** |
| Faux positifs effectivement retirés en passe 3 | 8 |

Détail par motif de rejet : `body-only-name` 8. Motifs de conservation : `distinctive-name` 14, `shared-domain` 3, `shared-department` 3.

## Méthode

Un rattachement `event.org_id` est conservé seulement si l'événement et l'organisation partagent un nœud du graphe de cohérence :

1. un domaine victime (indice de revendication ou domaine explicite du texte), jamais le domaine de l'organisme qui publie le flux ;
2. un voisin DNS/IP/ASN issu des arêtes `resolves_to` du graphe ;
3. un nom distinctif de l'organisation (nom ou alias) effectivement présent dans le texte de l'événement.

La passe 3 retire la valeur de nœud d'identité à un nom qui n'apparaît que dans le corps de l'article : un mot de secteur ou de lieu mentionné incidemment dans la description ne prouve pas que l'organisation référencée est la victime. Un nom présent dans le titre, un domaine victime partagé, un voisin réseau ou un département explicite gardent la priorité.

Un domaine qui n'appartient qu'au flux (`publisher-domain-only`) n'est pas une preuve : c'est exactement le défaut du rattachement des dépêches d'un CERT étranger à une association bordelaise. Les motifs génériques (`au bureau`, `open source`, `agence nationale`) ne créent pas de nœud de nom.

Les liens retirés ne sont pas effacés : `event.org_id` passe à `null` et une entrée `attachment.coherence` est écrite au journal avec les identifiants et le motif, sans texte d'événement ni donnée personnelle.

## Validation sur l'échantillon vérifié à la main

Sur les 64 liens de l'échantillon de 100 encore présents en base : 6 hors-sujet détectés, 0 liens exacts ou partiels à tort signalés, 8 hors-sujet non détectés, 50 liens justes conservés.

## Rejouer

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-attachment-coherence.mts
# ajouter --apply pour retirer les liens détectés
```

Tests : `apps/api/node_modules/.bin/tsx --test apps/api/test/attachment-coherence.test.ts`.
