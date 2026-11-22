# Quotas par clé — limiteur de débit mesuré

Mesure du 22 novembre 2026, sur la branche `ext/chantier-g6`.

## Prévol

Recherche effectuée avec `gh pr list --state all --search '<mots-clés>'` et
`git log --oneline --all | grep -i '<mots-clés>'` sur « quota », « rate limit »,
« clé » et « API publique ». Aucune PR ne porte sur le chantier « Quotas par
clé » ni ne mesure le limiteur de débit par clé.

Les PR voisines ne livrent pas cet objectif :

- **#294** « API publique documentée, versionnée et à quotas » (mergée)
  implémente le quota atomique en SQL, mais ne l'expose pas au client et ne
  fournit aucune mesure de débit ;
- **#390** « API v1 stable : 54/54 opérations… » (branche `ext/chantier-g1`)
  mesure la stabilité du contrat, pas les quotas ;
- **#42** « sessions hashées, rate-limit login… » (mergée) limite les
  écritures par utilisateur/IP, pas les clés d'API.

L'objectif du présent chantier n'était donc pas atteint : le quota existait,
mais son application n'était ni observable ni mesurée. Ce travail ajoute
l'observation standard et la preuve chiffrée.

## Objectif et résultat mesuré

Objectif : **le rate limiting mesuré** sur des clés d'API distinctes.

**Chiffre obtenu : 800 requêtes injectées en concurrence — 400 acceptées,
400 refusées, 0 dépassement de quota sur 10 clés** (quota 40 requêtes par
fenêtre de 60 s, 80 requêtes par clé). Débit observé : **1 370 req/s** sur
584 ms, avec **800/800 réponses** portant des en-têtes de quota conformes.

Le chiffre porte sur l'état réel de départ : **1 673 151 organisations**,
**312 sources** et **26 719 événements** (27 899 en incluant les événements
archivés, soit l'ordre de grandeur des ~28 000 annoncés). Ces compteurs sont
lus dans `bench/results/auto-repair-na.json` et
`bench/results/couverture-mesuree.json` ; la mesure ne modifie aucune base de
production.

## Commande reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:quotas-cles
# enforced: 800 requests — 400 accepted / 400 rejected — 1370 req/s
# — 0 overflow(s) across 10 keys (quota 40/60s, 800 headers verified)
```

Le port 5433 est celui de l'environnement de mesure ; la commande fonctionne
avec n'importe quel `DATABASE_URL` PostgreSQL local. Elle crée une base
jetable via `apps/api/test/helpers/testdb.ts`, injecte 10 clés de test dans
cette base, traverse la vraie route Fastify (`GET /api/v1/health`), le vrai
résolveur de clé et la mise à jour SQL atomique, puis détruit la base. Aucun
réseau, aucune donnée de production, aucun service payant. Durée observée :
environ 2 s.

Le résultat complet est écrit dans `bench/results/quotas-cles-mesures.json`
(compteurs de départ, méthode, 800 requêtes, 400/400, 0 dépassement, 800
en-têtes vérifiés, débit et verdict `enforced`).

Tests, un comportement par test :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx test/run.ts test/api-key-quota.test.ts
# 6 tests, 6 réussis
```

Ils couvrent : en-têtes sur une requête acceptée, 429 avec en-têtes et
`Retry-After`, clé à quota zéro, isolation entre deux clés, 20 requêtes
simultanées sans dépassement du quota, et réouverture de la fenêtre après
60 s. La suite existante `api-publique.test.ts` reste verte (7/7) et le
typecheck API passe.

## Ce qui est livré

- **En-têtes standard** sur toute réponse authentifiée par clé :
  `RateLimit-Limit`, `RateLimit-Remaining` et `RateLimit-Reset` (secondes
  restantes, RFC 9333), plus `Retry-After` sur les 429. Une clé à quota zéro
  publie `Limit: 0`, `Remaining: 0` et un délai de réessai.
- **Détails d'erreur enrichis** : `API_KEY_QUOTA_EXCEEDED` contient désormais
  `quota`, `used`, `limit`, `remaining`, `resetAt` et `retryAfter`, sans
  changer le code d'erreur ni le statut.
- **Modification isolée** : toute la logique est dans `api-key.ts` et
  `openapi/install.ts`, déjà appelés par `server.ts` comme par `buildApp()`.
- **Preuve reproductible** : `scripts/mesure-quotas-cles.mts` et le script
  `pnpm mesure:quotas-cles`, plus un test par comportement.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : aucun périmètre ni filtre modifié ; la
  mesure n'interroge que `/api/v1/health`, qui compte les sources.
- **Sources grises autorisées** : aucune règle d'admission ni d'exclusion
  touchée.
- **Aucune donnée personnelle de victime** : les clés, les utilisateurs et les
  requêtes de mesure existent uniquement dans une base jetable ; aucun
  événement ni victime n'est lu ou exposé.
- **Aucun service payant** : PostgreSQL local, Fastify en injection, zéro
  appel réseau.
- **Code et interface en anglais** : modules, messages, en-têtes, tests et
  sortie de mesure en anglais ; le présent rapport est en français.
- **Diff de `server.ts` ≤ 10 lignes** : **0 ligne modifiée**.
- **Aucune commande de plus de 60 s** : mesure ~2 s, tests ~4 s, typecheck
  ~8 s.
