# Chantier — sites techniques et revendications (Nouvelle-Aquitaine)

## Objectif et résultat mesuré

Deux compteurs sont publiés, calculés sur la base de travail réelle et reproductibles :

| Compteur | Avant | Après |
| --- | ---: | ---: |
| Sources techniques intégrées (CVE, PoC, NVD, Exploit-DB, GitHub) | 0 | **20** |
| Revendications rattachées à une organisation de Nouvelle-Aquitaine | 67 | **74** |

Répartition des 20 sources : `cve=4`, `poc=3`, `nvd=5`, `exploit_db=4`, `github=4`.
Les 74 revendications couvrent 71 organisations distinctes ; 7 proviennent du corpus ajouté par cette tranche, les 67 autres étaient déjà rattachées.

Commande de mesure et résultat brut :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-technical-coverage.mts \
  --json=bench/results/technical-coverage-2026-11-21.json
```

Sortie observée :

```
Technical sources integrated: 20 (cve=4, poc=3, nvd=5, exploit_db=4, github=4); claims attached to an NA organization: 74 (organizations=71, from corpus=7) -> bench/results/technical-coverage-2026-11-21.json
```

Une passe ultérieure a rencontré un 502 transitoire sur Exploit-DB, absorbé par le mécanisme de relance ; l'artefact final `bench/results/technical-sites-integration-2026-11-21.json` indique 20/20 sources vérifiées, dont la preuve est conservée en base (`via: database`). Les 7 revendications ont été inscrites dès la première passe (0 rejet, 0 doublon).

Le JSON publié (`bench/results/technical-coverage-2026-11-21.json`) contient les compteurs, les identifiants de sources et le SQL exécuté. Aucun nom de victime, aucune adresse e-mail et aucun contenu de fuite n'y figurent.

## Méthode

1. **Catalogue technique** — `bench/corpus/technical-sites-na.jsonl` : 20 points d'accès publics, chacun avec un type (`cve`, `poc`, `nvd`, `exploit_db`, `github`), un département de Nouvelle-Aquitaine et une ancre locale explicite (Bordeaux, Limoges, Poitiers, Pau, La Rochelle, Creuse, CHU de Bordeaux, université de Poitiers, UPPA).
2. **Validation stricte** — `apps/api/src/technical/catalog.ts` : schémas Zod stricts. Une ligne avec un département hors NA, une URL non HTTPS ou un champ de niveau victime (`victim`, `email`, `phone`, …) est refusée avant toute écriture.
3. **Intégration** — `scripts/integrate-technical-sites.mts` sonde chaque URL (GET borné à 7 s, lecture du statut seul, trois essais sur erreur transitoire 429/502/503/504), n'enregistre que les réponses 2xx/3xx dans `source` avec `region='nouvelle-aquitaine'`, `family='vuln'` et la preuve de vérification dans `parser` (`kind`, `naAnchor`, `httpStatus`, `verifiedAt`). L'insertion est idempotente ; les sources déjà vérifiées conservent leur preuve en base au lieu d'être resondées.
4. **Revendications** — `bench/corpus/na-org-claims.jsonl` : 7 revendications publiques déjà documentées dans `bench/corpus/ransomware-na.jsonl`, réduites au nom de l'organisation, au groupe, à la date et à l'URL de preuve. Chaque ligne est attachée seulement si le référentiel confirme **le même nom d'organisation et le même département NA** (`matchesNaOrganization`). Les trois revendications sans organisation correspondante (CCI Béarn et Soule, UPPA, ville de Fumel) n'ont pas été rattachées : un rattachement par proximité de nom serait une supposition.
5. **Surface API** — `GET /api/technical/coverage` renvoie les compteurs agrégés en anglais ; la route est enregistrée dans `routes/index.ts` et autorisée en lecture publique dans `security/rbac.ts`. `apps/api/src/server.ts` n'a pas été modifié (**diff de 0 ligne** par rapport à la base de la branche, limite : 10).


## Vérifications

- `DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx apps/api/test/run.ts apps/api/test/technical-coverage.test.ts apps/api/test/contrat-routes.test.ts apps/api/test/securite-rbac.test.ts apps/api/test/securite-couverture.test.ts` : **44 tests réussis, 0 échec** — refus d'un département hors NA et d'un champ personnel, contrôle d'attachement exact, mesure sur base isolée, contrat et couverture des règles d'accès de la route réellement enregistrée.
- `apps/api/node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json` : réussi.
- `DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/integrate-technical-sites.mts --json=bench/results/technical-sites-integration-2026-11-21.json` relancé : 20/20 sources vérifiées, **0 revendication inscrite, 7 déjà présentes, 0 rejet** — intégration idempotente.
- Chaque commande est restée sous une minute ; la mesure ne fait aucun appel réseau.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : les 12 départements (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87) sont la seule liste acceptée, aussi bien pour les sources que pour les organisations.
- **Sources grises autorisées** : plaques de revendication et agrégateurs publics sont conservés comme preuves, sans contenu de fuite.
- **Aucune donnée personnelle** : schémas stricts, noms d'organisations seulement, pas de corps de revendication, pas d'e-mail, pas de téléphone, pas de donnée de victime.
- **Aucun service payant** : uniquement des points d'accès publics (CVE.org, NVD, Exploit-DB, GitHub, pages d'actualité et agrégateurs ouverts).
- **Code et interface en anglais**, rapport en français.
- **Diff de `server.ts`** : 0 ligne.

## Prévolution et limites

- PR #320 (`ext/chantier-b3`) livrait un crawler de sitemaps : 42 sources `sitemap:`, 46 flux découverts. PR #212 (`big/CorpusTechnique`) et la réparation #8efd44f livraient un catalogue de 53 sources techniques documentées. Aucune PR ne publie les deux compteurs ci-dessus avec une mesure reproductible sur la base courante : cette tranche les complète sans repartir de `origin/main`.
- Les requêtes NVD et GitHub sont des **requêtes de veille ciblées sur une ancre NA** : un HTTP 200 prouve que le point de veille est opérationnel, pas qu'une vulnérabilité affecte l'organisation citée. Les résultats peuvent être vides et doivent être relus avant publication d'un incident.
- Une revendication reste une affirmation de tiers, pas un incident confirmé. Le rattachement repose sur une correspondance exacte de nom et de département dans le référentiel ; il n'est pas une preuve de compromission.
