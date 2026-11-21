# Établissements SIRET — établissements rattachés aux sièges

> Mesure du 21 novembre 2026, branche `ext/chantier-a8`. Rapport en français,
> code et réponse API en anglais.

## Résultat

**14 956 établissements SIRET sont rattachés à un siège actif de Nouvelle-Aquitaine**,
répartis sur **8 824 sièges**.

| Compteur | Valeur |
|---|---:|
| Établissements SIRET de Nouvelle-Aquitaine | 50 571 |
| **Établissements rattachés à un siège actif** | **14 956** |
| Sièges concernés | 8 824 |
| Établissements sans siège actif correspondant | 35 615 |
| dont établissements dont le siège est fermé (`sirene-ferme`) | 37 |
| dont établissements sans siège dans le référentiel | 35 578 |

Preuve machine : `bench/results/etablissements-siret-2026-11-21.json`.

## État de départ

Le point de départ annoncé est vérifié dans
`bench/results/agents-cpu-fausses-alertes-2026-11-21-rejeu.json` :
**1 673 151 organisations**, **312 sources**, **26 719 événements** au
21 novembre 2026. Au moment de la mesure, la base locale de développement
portait **1 673 221 organisations**, **376 sources** et **27 882 événements**
(ajouts intervenus entre-temps dans d'autres worktrees) ; ces trois compteurs
sont imprimés par la commande de mesure pour que le chiffre publié soit toujours
accompagné de l'état réel de la base mesurée.

## Méthode

Un SIRET comporte 14 chiffres : les 9 premiers sont le SIREN de l'unité légale.
Le référentiel contient les sièges actifs (`entity_source = 'sirene'`, `siren`
renseigné) et les établissements secondaires (`entity_source = 'sirene-site'`,
SIRET dans `entity_code`, `siren` vide). Le rattachement remplit
`parent_org_id` sur l'établissement quand le préfixe SIREN du SIRET correspond
exactement à un siège **actif** du même référentiel. Aucune correspondance par
nom, adresse ou commune n'est tentée.

Règles appliquées, toutes vérifiées par un test dédié :

- Nouvelle-Aquitaine uniquement : 16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87 ;
- un siège fermé (`sirene-ferme`) n'est jamais utilisé comme parent d'un
  établissement actif (37 cas écartés) ;
- un code SIRET mal formé ou un établissement hors région n'est jamais rattaché ;
- le rattachement est idempotent : un second passage crée 0 lien ;
- aucun événement, aucune source ni aucune donnée personnelle de victime n'est
  lu : la jointure reste dans la table `org` ;
- aucune donnée n'est inventée, aucun service payant n'est appelé.

## Commandes reproductibles

```bash
export DATABASE_URL=postgres://radar:radar@localhost:5433/radar
apps/api/node_modules/.bin/tsx scripts/attacher-etablissements-siret.mts
apps/api/node_modules/.bin/tsx scripts/mesure-etablissements-siret.mts \
  --json=bench/results/etablissements-siret-2026-11-21.json
```

Le second passage du script de rattachement affiche `linksCreated: 0`. Le
compteur public `GET /api/siret/establishments/count` expose le même nombre
sous la clé anglaise `attachedEstablishments`. La route est enregistrée dans
le registre commun et couverte par `POLITIQUE_ACCES` ; `server.ts` n'a pas été
modifié (0 ligne de diff).

## Vérifications

- `apps/api/test/siret-establishments.test.ts` : 3 tests, un par comportement
  (rattachement actif et idempotence, exclusions, route de comptage) — 3/3 verts ;
- `apps/api/test/securite-couverture.test.ts` : 3/3 verts (la nouvelle route a
  bien une règle d'accès et aucune règle orpheline) ;
- `tsc --noEmit` dans `apps/api` : aucune erreur ;
- rattachement exercé sur la base locale réelle : 14 956 liens créés, puis
  mesure relue depuis la base : 14 956 établissements rattachés.

## Limites

Le chiffre mesure un rattachement par identifiant officiel, pas une vérité
d'activité : un établissement dont le siège a disparu du référentiel reste
non rattaché (35 578 cas), et il ne faut pas en déduire qu'il est fermé. Les
sièges fermés sont exclus volontairement ; un usage historique pourrait les
réintégrer, ce qui donnerait 14 993 liens, mais ce ne serait pas un état actif.
