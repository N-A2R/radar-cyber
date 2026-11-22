# Surface d'attaque des organisations de Nouvelle-Aquitaine

## Point de départ

La PR #278 (« train: Exposition », branche `big/Exposition`) mesurait **142 organisations** avec au moins un service exposé, dont **83 en Nouvelle-Aquitaine**, et 768 services Shodan InternetDB. L'objectif chiffré de ce chantier est **10 000 organisations** : il n'était pas atteint (1,42 %). La branche `origin/big/Exposition` est un ancêtre de `ext/chantier-n1` (961 commits contre 1 148 sur la branche de travail) : le travail des tranches précédentes est conservé, aucun retour en arrière n'a été fait.

## Ce qui a été ajouté

Six sources publiques, gratuites et sans clé, toutes limitées aux 12 départements de Nouvelle-Aquitaine et à des métadonnées techniques publiques :

| Source | Preuve exigée | Organisation rattachée par | Organisations ajoutées |
| `shodan-internetdb` (existant) | ports + CPE InternetDB | `org_id` existant | 83 (déjà présentes) |
| `http-200` | réponse HTTP 200 déjà enregistrée dans `org_enrichissement`, domaine final identique | `org_id` de la preuve | 1 256 |
| `osm-http-200` | tag `website` OSM (ohsome), réponse HTTP 200, résolution DNS A publique | `ref:FR:SIREN` / `ref:FR:SIRET` → `org.siren` | 2 707 |
| `wikidata-http-200` | site officiel P856 + code INSEE P374 (Wikidata), réponse HTTP 200, résolution DNS A | `org.entity_code` = code INSEE | 850 |
| `osm-siret-http-200` | tags `ref:FR:SIREN`/`ref:FR:SIRET` + `website`/`contact:website` (ohsome), réponse HTTP 200, résolution DNS A publique | `org.siren` | 1 677 services, 1 503 organisations nouvelles |
| `dila-http-200` | site déclaré dans la base locale DILA de Service-public.fr, réponse HTTP 200, résolution DNS A | `siret` → `org.siren` | 1 045 services, 1 045 organisations nouvelles |

Chaque ligne de `exposition_service` garde `source`, `source_url`, `consulted_at` et un `evidence` uniquement technique (domaine, URL, statut, fournisseur). Aucun nom de victime, aucune adresse IP privée, aucun contenu de page et aucune donnée personnelle ne sont stockés. Aucun service payant, aucun scan actif de ports : les sites sont interrogés une fois en HEAD (GET en repli) et le DNS public est résolu.

Fichiers principaux :

- `apps/api/src/exposition/web-service.ts` — conversion des preuves HTTP en services exposés, écritures idempotentes et mesure agrégée ;
- `scripts/collecte-services-web.mts`, `scripts/collecte-services-osm.mts`, `scripts/collecte-services-wikidata.mts`, `scripts/collecte-services-osm-siret.mts`, `scripts/collecte-services-dila.mts` — collectes par étapes, avec `--limit`, `--offset`, `--apply` et `--only-missing` ;
- `scripts/measure-exposition-na.mts` — mesure reproductible, sans écriture ;
- `apps/api/test/exposition-web-service.test.ts`, `exposition-osm-siret.test.ts`, `exposition-dila-local.test.ts` — 19 tests, un comportement par test, réseau interdit, base jetable.

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-exposition-na.mts \
    --json=bench/results/exposition-na-2026-11-22.json
```

Résultat observé le 2026-11-22 (UTC) :

```
NA exposed services: 7280 organisations / 1671906 in scope, 8168 services
(by source: {"http-200":1256,"osm-http-200":2941,"dila-http-200":1045,"shodan-internetdb":399,"wikidata-http-200":850,"osm-siret-http-200":1677})
```

Le chiffre retenu est le nombre d'organisations distinctes avec au moins un service exposé et un département de Nouvelle-Aquitaine : **7 280**. Les rapports détaillés sont versionnés dans `bench/results/exposition-na-2026-11-22.json`, `services-web-2026-11-22.json`, `services-osm-2026-11-22.json`, `services-wikidata-2026-11-22.json`, `services-osm-siret-2026-11-22.json` et `services-dila-2026-11-22.json`.

## Contraintes vérifiées

- `apps/api/src/server.ts` : **0 ligne de diff** ; aucun nouveau serveur n'est nécessaire pour la mesure.
- Code et messages d'outils en anglais ; le présent rapport est en français.
- Nouvelle-Aquitaine uniquement : filtre sur `org.dept` (codes 16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87).
- Aucune commande de collecte ou de mesure n'excède 55 s dans ce worktree ; les collectes sont découpées en lots de 300 entrées. Le téléchargement unique de l'archive DILA (366 Mo) n'est pas une collecte de services.
- Sources grises autorisées et utilisées (OSM, Wikidata, annuaire DILA de Service-public.fr) ; aucune source payante, aucune donnée personnelle de victime. Seuls le SIRET, le code postal et le site déclaré sont lus dans l'archive DILA ; aucun nom de dirigeant, courriel ou téléphone n'est copié.

## Tranche suivante et limite restante

La tranche précédente publiait 4 732 organisations. Celle-ci ajoute **2 548 organisations mesurées** : 1 503 par élargissement de la requête OpenStreetMap aux objets identifiés par SIRET et au tag `contact:website`, puis 1 045 par l'annuaire public DILA. Leur site est vérifié une fois en HEAD (GET en repli), doit répondre 200 sur son propre domaine et résoudre vers une IPv4 publique. Les organisations déjà mesurées sont exclues avant vérification (`--only-missing`) pour que chaque lot apporte une organisation supplémentaire.

Il reste **2 720 organisations** pour atteindre 10 000. Les sources gratuites sans clé jointes au référentiel sont maintenant épuisées pour ce périmètre : les autres pistes (RNA, FINESS, API Recherche d'entreprises, WHOIS, certificats) ne fournissent pas de site web rattachable, et les atteindre demanderait un scan actif, un service payant ou un rattachement par similarité de nom non prouvé, tous exclus par les contraintes.

OBJECTIF : partiel — 7280 / 10000, manque 2720 organisations avec service exposé mesurable et rattachable
