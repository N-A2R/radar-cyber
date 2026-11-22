# API v1 stable — version publiée et engagement de compatibilité

Mesure du 22 novembre 2026, sur la branche `ext/chantier-g1`.

## Prévol

Une PR existe sur le versionnement de l'API : **#294 « API publique documentée,
versionnée et à quotas »** (branche `big/ApiPublique`, mergée). Elle a livré
`/api/v1`, l'en-tête `X-API-Version`, la spec OpenAPI 3.1 et les clés à quota,
mais **aucun engagement de compatibilité** : aucun contrat figé, aucune
garantie de non-rupture, aucune politique de publication. Son objectif propre
était atteint ; l'objectif du présent chantier ne l'était pas. Ce travail
reprend donc cette base et ajoute la publication de v1 comme version stable.

## Objectif et résultat mesuré

Objectif : la version publiée avec son engagement de compatibilité.

**Chiffre obtenu : 54/54 opérations v1 figées et vérifiées, 0 rupture de
compatibilité.** La version publiée est **1.0.0**, état `stable`, empreinte de
contrat `b38488c0c88e44efa260fcbca899f8b1dac970b1cc4c36dc70a1f34139724298`.

Le chiffre porte sur l'état réel de départ : **1 673 151 organisations**,
**312 sources** et **26 719 événements** (plus 4 710 archivés, soit l'ordre de
grandeur des ~28 000 événements annoncés). Ces trois compteurs sont lus dans
`bench/results/couverture-mesuree.json`, produit par la commande reproductible
`pnpm mesure:couverture` ; la mesure du chantier les republie sans les recalculer
et sans toucher à la base.

## Commande reproductible

```bash
apps/api/node_modules/.bin/tsx scripts/mesure-api-v1.mts
# ou : pnpm mesure:api-v1
```

Sortie observée (2 s, hors réseau, sans base) :

```
stable: v1.0.0 — 54/54 opérations figées, 0 rupture(s), digest identique
```

Le résultat complet est écrit dans `bench/results/api-v1-stable.json` : version,
stabilité, compteurs de départ, contrat figé (54 opérations, 0 ajout, 0 rupture,
digest identique), publication (OpenAPI 3.1, 54 opérations documentées, 5 règles
de compatibilité, préfixes `/api/v1` et `/api`) et verdict `stable`.

Tests, un comportement par test :

```bash
apps/api/node_modules/.bin/tsx --test apps/api/test/api-v1-stability.test.ts
# 7 tests, 7 réussis
```

Ils couvrent : publication de la version stable, politique interdisant les
ruptures, couverture intégrale du contrat figé, détection d'une opération
retirée, détection d'une signature modifiée, ajout compatible exigeant une
nouvelle publication, et identité des deux préfixes `/api/v1` et `/api`.

## Ce qui est livré

- **Version publiée** : `API_VERSION = 1.0.0`, `X-API-Version: 1.0.0` et
  `X-API-Stability: stable` sur les deux préfixes ; `info.version`,
  `info.x-stability`, `info.x-compatibility` et `info.x-contract` dans la spec.
  La politique est aussi énoncée dans `info.description`, visible dans Swagger UI.
- **Engagement de compatibilité** (5 règles, publiées telles quelles dans la
  spec) : les opérations figées gardent leur chemin, méthode, identifiant, statut
  de succès, schéma de réponse, sécurité et paramètres pendant tout 1.x ; les
  ajouts restent en 1.x mais exigent une nouvelle publication du contrat ; le
  retrait d'une opération exige une version majeure ; les changements de
  signature sont signalés prudemment (mineur si additif, majeur sinon) ; le
  préfixe historique `/api` reste le miroir de `/api/v1` pendant tout 1.x.
- **Contrat figé vérifiable** : `apps/api/src/openapi/v1-contract.ts` contient
  les 54 signatures (SHA-256 tronqué) générées depuis le catalogue par
  `pnpm api:contract`. `checkCompatibility()` compare ce contrat au catalogue
  vivant et distingue retraits, changements, ajouts et divergence du digest.
- **Génération et mesure** : `scripts/generate-api-contract.mts` (republication)
  et `scripts/mesure-api-v1.mts` (preuve chiffrée), tous deux sans service payant.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : aucun élargissement du périmètre, les
  comptoirs de départ restent ceux du jeu NA mesuré.
- **Sources grises autorisées** : aucune règle de filtrage ni d'exclusion ajoutée.
- **Aucune donnée personnelle de victime** : le contrat ne publie aucun nouveau
  champ ; seules des signatures de schémas et des opérations agrégées sont
  ajoutées, aucune donnée d'événement ni de victime n'est lue ou exposée.
- **Aucun service payant** : mesure et tests entièrement locaux, hors réseau.
- **Code et interface en anglais** : nouveaux modules, messages et politique en
  anglais ; le rapport est en français, comme demandé.
- **Diff de `server.ts` ≤ 10 lignes** : **0 ligne modifiée**. La publication est
  faite dans `spec.ts` et `install.ts`, appelés aussi bien par `server.ts` que
  par `buildApp()`.
- **Aucune commande de plus de 60 s** : mesure ~2 s, tests ~1 s, typecheck ~7 s.
