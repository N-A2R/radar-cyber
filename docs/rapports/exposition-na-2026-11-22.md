# Surface d'attaque des organisations de Nouvelle-Aquitaine

## Point de départ

La PR #278 (« train: Exposition », branche `big/Exposition`) mesurait **142 organisations** avec au moins un service exposé, dont **83 en Nouvelle-Aquitaine**, et 768 services Shodan InternetDB. L'objectif chiffré de ce chantier est **10 000 organisations** : il n'était pas atteint (1,42 %). La branche `origin/big/Exposition` est un ancêtre de `ext/chantier-n1` (961 commits contre 1 148 sur la branche de travail) : le travail des tranches précédentes est conservé, aucun retour en arrière n'a été fait.

## Ce qui a été ajouté

Sept sources publiques, gratuites et sans clé, toutes limitées aux 12 départements de Nouvelle-Aquitaine et à des métadonnées techniques publiques :

| Source | Preuve exigée | Organisation rattachée par | Organisations ajoutées |
| `shodan-internetdb` (existant) | ports + CPE InternetDB | `org_id` existant | 83 (déjà présentes) |
| `http-200` | réponse HTTP 200 déjà enregistrée dans `org_enrichissement`, domaine final identique | `org_id` de la preuve | 1 256 |
| `osm-http-200` | tag `website` OSM (ohsome), réponse HTTP 200, résolution DNS A publique | `ref:FR:SIREN` / `ref:FR:SIRET` → `org.siren` | 2 707 |
| `wikidata-http-200` | site officiel P856 + code INSEE P374 (Wikidata), réponse HTTP 200, résolution DNS A | `org.entity_code` = code INSEE | 850 |
| `osm-siret-http-200` | tags `ref:FR:SIREN`/`ref:FR:SIRET` + `website`/`contact:website` (ohsome), réponse HTTP 200, résolution DNS A publique | `org.siren` | 1 677 services, 1 503 organisations nouvelles |
| `dila-http-200` | site déclaré dans la base locale DILA de Service-public.fr, réponse HTTP 200, résolution DNS A | `siret` → `org.siren` | 1 045 services, 1 045 organisations nouvelles |
| `rna-http-200` (tranche 3) | `siret` + `siteweb` du répertoire national des associations (Waldec 2026-10-01), réponse HTTP 200, DNS A public | `siret` → `org.siren` | 522 organisations nouvelles |

Chaque ligne de `exposition_service` garde `source`, `source_url`, `consulted_at` et un `evidence` uniquement technique (domaine, URL, statut, fournisseur). Aucun nom de victime, aucune adresse IP privée, aucun contenu de page et aucune donnée personnelle ne sont stockés. Aucun service payant, aucun scan actif de ports : les sites sont interrogés une fois en HEAD (GET en repli) et le DNS public est résolu.

Fichiers principaux :

- `apps/api/src/exposition/web-service.ts` — conversion des preuves HTTP en services exposés, écritures idempotentes et mesure agrégée ;
- `scripts/collecte-services-web.mts`, `scripts/collecte-services-osm.mts`, `scripts/collecte-services-wikidata.mts`, `scripts/collecte-services-osm-siret.mts`, `scripts/collecte-services-dila.mts`, `scripts/collecte-services-rna.mts` — collectes par étapes, avec `--limit`, `--offset`, `--apply` et `--only-missing` ;
- `scripts/measure-exposition-na.mts` — mesure reproductible, sans écriture ;
- `apps/api/test/exposition-web-service.test.ts`, `exposition-osm-siret.test.ts`, `exposition-dila-local.test.ts`, `exposition-public-site.test.ts`, `exposition-rna-site.test.ts` — 27 tests, un comportement par test, réseau interdit, base jetable.

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-exposition-na.mts \
    --json=bench/results/exposition-na-2026-11-22.json
```

Résultat observé le 2026-11-22 (UTC) :

```
NA exposed services: 7676 organisations / 1671907 in scope, 8443 services
(by source: {"http-200":1256,"osm-http-200":2694,"rna-http-200":522,"dila-http-200":1045,"shodan-internetdb":399,"wikidata-http-200":850,"osm-siret-http-200":1677})
```

Le chiffre retenu est le nombre d'organisations distinctes avec au moins un service exposé et un département de Nouvelle-Aquitaine : **7 676** sur la base reconstruite décrite ci-dessous. Les rapports détaillés sont versionnés dans `bench/results/exposition-na-2026-11-22.json`, `services-web-2026-11-22.json`, `services-osm-2026-11-22.json`, `services-wikidata-2026-11-22.json`, `services-osm-siret-2026-11-22.json`, `services-dila-2026-11-22.json` et `services-rna-2026-11-22.json`.

## Contraintes vérifiées

- `apps/api/src/server.ts` : **0 ligne de diff** ; aucun nouveau serveur n'est nécessaire pour la mesure.
- Code et messages d'outils en anglais ; le présent rapport est en français.
- Nouvelle-Aquitaine uniquement : filtre sur `org.dept` (codes 16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87).
- Aucune commande de collecte ou de mesure n'excède 55 s dans ce worktree ; les collectes sont découpées en lots de 300 entrées. Le téléchargement unique de l'archive DILA (366 Mo) n'est pas une collecte de services.
- Sources grises autorisées et utilisées (OSM, Wikidata, annuaire DILA de Service-public.fr, répertoire RNA du ministère de l'Intérieur) ; aucune source payante, aucune donnée personnelle de victime. Dans l'archive RNA, seuls `siret`, `adrs_codepostal` et `siteweb` sont lus : aucun nom d'association, de dirigeant, courriel ou téléphone n'est copié.

## Tranche 3 — répertoire RNA

La tranche précédente publiait 7 280 organisations. Pendant cette tranche, le PostgreSQL de développement partagé a été réinitialisé par un autre chantier. La base a été reconstruite en lecture seule à partir des rapports versionnés : la mesure reconstruite avant ajout est **7 154 organisations / 7 921 services**, soit 126 organisations de moins que le chiffre publié (le rattachement initial de certains services Shodan/OSM n'était pas versionné). Aucune écriture n'a été faite dans la base de l'autre chantier.

La nouvelle source est le fichier public Waldec du répertoire national des associations (`rna_waldec_20261001.zip`, 12 fichiers départementaux de Nouvelle-Aquitaine). Sur 232 426 lignes, 2 050 paires SIRET/site web distinctes ont été retenues ; 1 712 ont pu être rattachées à une organisation NA non encore mesurée. Sept lots de 300 entrées maximum, avec `--only-missing`, ont vérifié chaque site une fois en HEAD (GET en repli) : domaine final identique et IPv4 publique. **522 organisations supplémentaires** ont été mesurées, pour un total observé de **7 676 organisations / 8 443 services**.

Les rangs « RNA » de l'ancienne affirmation « sources épuisées » sont donc infirmés : le répertoire RNA fournit bien des sites rattachables. Il reste **2 324 organisations** pour atteindre 10 000 sur la base reconstruite. Les autres pistes vérifiées (ADEME RGE : 6 lignes non personnelles avec site en Nouvelle-Aquitaine, FINESS, API Recherche d'entreprises, WHOIS, certificats) n'apportent pas le volume restant sans scan actif, service payant ou rattachement par similarité non prouvé.

OBJECTIF : partiel — 7676 / 10000, manque 2324 organisations avec service exposé mesurable et rattachable
