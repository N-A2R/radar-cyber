# OpenAPI avec exemples — documentation exécutable

Mesure du 22 novembre 2026, sur la branche `ext/chantier-g7`.

## Prévol

Aucune PR n'existe pour ce sujet : la recherche `gh pr list --state all --search 'openapi'`
ne renvoie que **#294** « API publique documentée, versionnée et à quotas »
(merge, spec OpenAPI et Swagger UI sans exemples rejouables) et **#390**
« API v1 stable : 54/54 opérations sous engagement de compatibilité »
(autre objectif, branche `ext/chantier-g1`). Aucune branche ni PR
`ext/chantier-g7` n'était ouverte. Le travail part donc de `origin/main`,
sans reprendre ces deux livraisons.

## Objectif et résultat mesuré

Objectif : **la documentation exécutable**. Un exemple est compté comme
exécutable quand quatre conditions sont réunies : il est publié dans la spec
OpenAPI (paramètres, corps, réponse), sa requête passe les schémas Zod des
routes, sa requête vise une route réellement enregistrée, et sa réponse est
rejouée par Fastify puis comparée à l'exemple publié et au schéma de réponse.

**Chiffre obtenu : 54/54 opérations ont un exemple exécutable rejoué avec
succès, 0 exemple invalide.**

L'état réel de départ est celui documenté dans `docs/couverture-mesuree.md` :
**1 673 151 organisations**, **312 sources**, **26 719 événements** et
**4 710 événements archivés** (soit l'ordre de grandeur des ~28 000
événements annoncés), en Nouvelle-Aquitaine. Ces compteurs sont lus dans le
document de référence et republiés tels quels dans la mesure ; ils alimentent
les exemples `Health`, `Stats` et `Coverage`. Aucune donnée personnelle de
victime n'entre dans les exemples : organisations et domaines sont synthétiques.

## Commande reproductible

```bash
pnpm mesure:openapi-exemples
# ou : apps/api/node_modules/.bin/tsx scripts/mesure-openapi-exemples.mts
```

Sortie observée (1,6 s, hors réseau, sans base) :

```
executable: 54/54 examples replayed, 0 invalid (312 sources, 1,673,151 organisations, 26,719 events)
```

Le résultat complet est écrit dans `bench/results/openapi-exemples.json` :
54 opérations, 54 opérations documentées, 54 exemples exécutables, 54 rejoués,
54 réussis, 0 échec, verdict `executable`, et l'état de départ avec sa
provenance.

## Tests, un comportement par test

```bash
apps/api/node_modules/.bin/tsx --test apps/api/test/openapi-exemples.test.ts
# 9 tests, 9 réussis
```

Ils couvrent : publication d'un exemple de requête et de réponse pour chaque
opération, validation des requêtes par les schémas de route, validation des
réponses par le schéma déclaré, identité entre réponse rejouée et réponse
documentée, existence de la route dans l'application, usage de l'état réel
documenté, absence de donnée personnelle de victime, présence des exemples sur
`/api/openapi.json` et `/api/v1/openapi.json`, et rejet d'un exemple falsifié.

Le contrôle de typage de l'API est vert :
`apps/api/node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit`.

## Ce qui est livré

- `apps/api/src/openapi/examples.ts` : exemples générés depuis les mêmes
  schémas Zod que les routes, avec des valeurs curatées ancrées dans l'état
  réel et uniquement des organisations synthétiques.
- `apps/api/src/openapi/spec.ts` : exemples de paramètres, de corps et de
  réponses dans la spec 3.1, plus une extension `x-request-example` donnant
  la requête prête à rejouer.
- `apps/api/src/openapi/replay.ts` : rejeu HTTP local des 54 exemples et
  contrôle de leur publication et de leur conformité.
- `scripts/mesure-openapi-exemples.mts` et la commande
  `pnpm mesure:openapi-exemples`.
- `apps/api/test/openapi-exemples.test.ts` et le présent rapport.

Une seule opération, `POST /sources/:id/collecte`, n'est enregistrée que dans
`server.ts` et non dans le banc d'essai `buildApp()` ; la mesure la reconnaît
comme route de production et ne modifie pas `server.ts`.

## Contraintes

`server.ts` est inchangé (**0 ligne de diff**). Périmètre Nouvelle-Aquitaine
inchangé, sources grises autorisées, aucune donnée personnelle de victime,
aucun service payant, code et sortie CLI en anglais, rapport en français,
toutes les commandes de mesure et de test sous les 60 secondes.
