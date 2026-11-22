# Surface d'attaque des organisations de Nouvelle-Aquitaine

## Point de départ

La PR #278 (« train: Exposition », branche `big/Exposition`) mesurait **142 organisations** avec au moins un service exposé, dont **83 en Nouvelle-Aquitaine**, et 768 services Shodan InternetDB. L'objectif chiffré de ce chantier est **10 000 organisations** : il n'était pas atteint (1,42 %). La branche `origin/big/Exposition` est un ancêtre de `ext/chantier-n1` (961 commits contre 1 148 sur la branche de travail) : le travail des tranches précédentes est conservé, aucun retour en arrière n'a été fait.

## Ce qui a été ajouté

Quatre sources publiques, gratuites et sans clé, toutes limitées aux 12 départements de Nouvelle-Aquitaine et à des métadonnées techniques publiques :

| Source | Preuve exigée | Organisation rattachée par | Organisations ajoutées |
| `shodan-internetdb` (existant) | ports + CPE InternetDB | `org_id` existant | 83 (déjà présentes) |
| `http-200` | réponse HTTP 200 déjà enregistrée dans `org_enrichissement`, domaine final identique | `org_id` de la preuve | 1 256 |
| `osm-http-200` | tag `website` OSM (ohsome), réponse HTTP 200, résolution DNS A publique | `ref:FR:SIREN` / `ref:FR:SIRET` → `org.siren` | 2 707 |
| `wikidata-http-200` | site officiel P856 + code INSEE P374 (Wikidata), réponse HTTP 200, résolution DNS A | `org.entity_code` = code INSEE | 850 |

Chaque ligne de `exposition_service` garde `source`, `source_url`, `consulted_at` et un `evidence` uniquement technique (domaine, URL, statut, fournisseur). Aucun nom de victime, aucune adresse IP privée, aucun contenu de page et aucune donnée personnelle ne sont stockés. Aucun service payant, aucun scan actif de ports : les sites sont interrogés une fois en HEAD (GET en repli) et le DNS public est résolu.

Fichiers principaux :

- `apps/api/src/exposition/web-service.ts` — conversion des preuves HTTP en services exposés, écritures idempotentes et mesure agrégée ;
- `scripts/collecte-services-web.mts`, `scripts/collecte-services-osm.mts`, `scripts/collecte-services-wikidata.mts` — collectes par étapes, avec `--limit`, `--offset`, `--apply` ;
- `scripts/measure-exposition-na.mts` — mesure reproductible, sans écriture ;
- `apps/api/test/exposition-web-service.test.ts` — 9 tests, un comportement par test, réseau interdit, base jetable.

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-exposition-na.mts \
    --json=bench/results/exposition-na-2026-11-22.json
```

Résultat observé le 2026-11-22 (UTC) :

```
NA exposed services: 4732 organisations / 1671906 in scope, 5446 services
(by source: {"http-200":1256,"osm-http-200":2941,"shodan-internetdb":399,"wikidata-http-200":850})
```

Le chiffre retenu est le nombre d'organisations distinctes avec au moins un service exposé et un département de Nouvelle-Aquitaine : **4 732**. Les rapports détaillés sont versionnés dans `bench/results/exposition-na-2026-11-22.json`, `services-web-2026-11-22.json`, `services-osm-2026-11-22.json` et `services-wikidata-2026-11-22.json`.

## Contraintes vérifiées

- `apps/api/src/server.ts` : **0 ligne de diff** ; aucun nouveau serveur n'est nécessaire pour la mesure.
- Code et messages d'outils en anglais ; le présent rapport est en français.
- Nouvelle-Aquitaine uniquement : filtre sur `org.dept` (codes 16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87).
- Aucune commande de collecte ou de mesure n'excède 55 s dans ce worktree ; les collectes sont découpées en lots de 400 entrées.
- Sources grises autorisées et utilisées (OSM, Wikidata) ; aucune source payante, aucune donnée personnelle de victime.

## Limite atteinte

Le passage de 142 à 4 732 organisations est une multiplication par 33 du périmètre mesuré. Les 5 268 organisations restantes n'ont pas de domaine public vérifiable rattachable au référentiel : les atteindre demanderait soit un scan actif, soit un service payant, soit un rattachement par similarité de nom non prouvé. Ces trois options ont été écartées par les contraintes du chantier ; le chiffre publié est donc volontairement inférieur à la cible.

OBJECTIF : partiel — 4732 / 10000, manque 5268 organisations avec service exposé mesurable et rattachable
