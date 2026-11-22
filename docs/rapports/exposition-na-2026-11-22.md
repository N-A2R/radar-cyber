# Surface d'attaque des organisations de Nouvelle-Aquitaine

## Point de départ

La PR #278 (« train: Exposition », branche `big/Exposition`) mesurait **142 organisations** avec au moins un service exposé, dont **83 en Nouvelle-Aquitaine**, et 768 services Shodan InternetDB. L'objectif chiffré de ce chantier est **10 000 organisations** : il n'était pas atteint (1,42 %). La branche `origin/big/Exposition` est un ancêtre de `ext/chantier-n1` (961 commits contre 1 153 sur la branche de travail) : le travail des tranches précédentes est conservé, aucun retour en arrière n'a été fait.

## Ce qui a été ajouté

Dix sources publiques, gratuites et sans clé, toutes limitées aux 12 départements de Nouvelle-Aquitaine et à des métadonnées techniques publiques :

| Source | Preuve exigée | Organisation rattachée par | Organisations ajoutées |
| `shodan-internetdb` (existant) | ports + CPE InternetDB | `org_id` existant | 83 (déjà présentes) |
| `http-200` | réponse HTTP 200 déjà enregistrée dans `org_enrichissement`, domaine final identique | `org_id` de la preuve | 1 256 |
| `osm-http-200` | tag `website` OSM (ohsome), réponse HTTP 200, résolution DNS A publique | `ref:FR:SIREN` / `ref:FR:SIRET` → `org.siren` | 2 707 |
| `wikidata-http-200` | site officiel P856 + code INSEE P374 (Wikidata), réponse HTTP 200, résolution DNS A | `org.entity_code` = code INSEE | 850 |
| `osm-siret-http-200` | tags `ref:FR:SIREN`/`ref:FR:SIRET` + `website`/`contact:website` (ohsome), réponse HTTP 200, résolution DNS A publique | `org.siren` | 1 677 services, 1 503 organisations nouvelles |
| `dila-http-200` | site déclaré dans la base locale DILA de Service-public.fr, réponse HTTP 200, résolution DNS A | `siret` → `org.siren` | 1 045 services, 1 045 organisations nouvelles |
| `rna-http-200` (tranche 3) | `siret` + `siteweb` du répertoire national des associations (Waldec 2026-10-01), réponse HTTP 200, DNS A public | `siret` → `org.siren` | 522 organisations nouvelles |
| `site-zone-http-200` (tranche 4) | site déclaré puis HTTP 200 sur l'hôte final du même domaine enregistrable, DNS A public | `org.website`, preuves `org_enrichissement`, SIREN Wikidata → `org.siren` | 381 organisations nouvelles |
| `education-http-200` (tranche 5) | site déclaré dans l'annuaire public des établissements de l'Éducation nationale, HTTP 200 sur le même domaine, DNS A public | `UAI` (`Identifiant_de_l_etablissement`) → `org.entity_code` (`entity_source = annuaire-education`) | 733 organisations nouvelles |
| `administration-http-200` (tranche 6) | SIREN ou code INSEE + site déclaré dans l'annuaire national de l'administration (API Service-public.fr), HTTP 200 sur le même domaine enregistrable, DNS A public | `org.siren` ou `org.entity_code` (INSEE) | 40 organisations nouvelles |

Chaque ligne de `exposition_service` garde `source`, `source_url`, `consulted_at` et un `evidence` uniquement technique (domaine, URL, statut, fournisseur). Aucun nom de victime, aucune adresse IP privée, aucun contenu de page et aucune donnée personnelle ne sont stockés. Aucun service payant, aucun scan actif de ports : les sites sont interrogés une fois en HEAD (GET en repli) et le DNS public est résolu.

Fichiers principaux :

- `apps/api/src/exposition/web-service.ts` — conversion des preuves HTTP en services exposés, écritures idempotentes et mesure agrégée ;
- `apps/api/src/exposition/administration-site.ts` — qualification des sites déclarés par l'annuaire national de l'administration ;
- `scripts/collecte-services-web.mts`, `scripts/collecte-services-osm.mts`, `scripts/collecte-services-wikidata.mts`, `scripts/collecte-services-osm-siret.mts`, `scripts/collecte-services-dila.mts`, `scripts/collecte-services-rna.mts`, `scripts/collecte-services-site-zone.mts`, `scripts/collecte-services-education.mts`, `scripts/collecte-services-administration.mts` — collectes par étapes, avec `--limit`, `--offset`, `--apply` et `--only-missing` ;
- `apps/api/test/exposition-web-service.test.ts`, `exposition-osm-siret.test.ts`, `exposition-dila-local.test.ts`, `exposition-public-site.test.ts`, `exposition-rna-site.test.ts`, `exposition-site-zone.test.ts`, `exposition-education-site.test.ts`, `exposition-administration-site.test.ts` — 36 tests au vert (31 préexistants et 5 ajoutés par la tranche 6), un comportement par test, réseau interdit, base jetable.

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-exposition-na.mts \
    --json=bench/results/exposition-na-2026-11-22.json
```

Résultat observé le 2026-11-22 (UTC) :

```
NA exposed services: 8954 organisations / 1671906 in scope, 9844 services
(by source: {"http-200":1256,"osm-http-200":2941,"rna-http-200":522,"dila-http-200":1045,"shodan-internetdb":399,"wikidata-http-200":850,"education-http-200":733,"osm-siret-http-200":1677,"site-zone-http-200":381,"administration-http-200":40})
```

Le chiffre retenu est le nombre d'organisations distinctes avec au moins un service exposé et un département de Nouvelle-Aquitaine : **8 954** sur la base live décrite ci-dessous. Les rapports détaillés sont versionnés dans `bench/results/exposition-na-2026-11-22.json`, `services-web-2026-11-22.json`, `services-osm-2026-11-22.json`, `services-wikidata-2026-11-22.json`, `services-osm-siret-2026-11-22.json`, `services-dila-2026-11-22.json`, `services-rna-2026-11-22.json`, `site-zone-lot-{1,2,3}-2026-11-22.json`, `services-education-lot-{1,2,3,4,5}-2026-11-22.json`, `services-administration-2026-11-22.json` et `wikidata-siren-sites-2026-11-22.tsv`.

## Contraintes vérifiées

- `apps/api/src/server.ts` : **0 ligne de diff ajoutée par cette tranche** (le diff préexistant de la branche contre `main` est de 22 lignes, hérité d'autres chantiers et non modifié ici) ; aucun nouveau serveur n'est nécessaire pour la mesure.
- Code et messages d'outils en anglais ; le présent rapport est en français.
- Nouvelle-Aquitaine uniquement : filtre sur `org.dept` (codes 16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87).
- Aucune commande de collecte ou de mesure n'excède 55 s dans ce worktree ; les collectes sont découpées en lots de 300 entrées maximum (16 s mesurés pour le premier lot de la tranche 5, 15 s pour la collecte de la tranche 6). Le téléchargement unique de l'archive DILA (366 Mo) n'est pas une collecte de services.
- Sources grises autorisées et utilisées (OSM, Wikidata, annuaire DILA de Service-public.fr, annuaire national de l'administration de Service-public.fr, répertoire RNA du ministère de l'Intérieur, annuaire public des établissements de l'Éducation nationale, déclarations de sites déjà rattachées aux organisations) ; aucune source payante, aucune donnée personnelle de victime. Dans l'archive RNA, seuls `siret`, `adrs_codepostal` et `siteweb` sont lus : aucun nom d'association, de dirigeant, courriel ou téléphone n'est copié. Dans l'annuaire de l'Éducation nationale, seuls l'UAI, le SIRET, le département et le site déclaré sont lus : aucun nom d'établissement, courriel, téléphone ni adresse n'est copié. Dans l'API de l'annuaire de l'administration, seuls `siren`, `code_insee_commune` et `site_internet` sont demandés : aucun nom de service, courriel, téléphone ni adresse n'est copié. Le fichier Wikidata versionné ne contient que des SIREN et des URLs publics.

## Tranche 3 — répertoire RNA

La tranche précédente publiait 7 280 organisations. Pendant cette tranche, le PostgreSQL de développement partagé a été réinitialisé par un autre chantier. La base a été reconstruite en lecture seule à partir des rapports versionnés : la mesure reconstruite avant ajout est **7 154 organisations / 7 921 services**, soit 126 organisations de moins que le chiffre publié (le rattachement initial de certains services Shodan/OSM n'était pas versionné). Aucune écriture n'a été faite dans la base de l'autre chantier.

La nouvelle source est le fichier public Waldec du répertoire national des associations (`rna_waldec_20261001.zip`, 12 fichiers départementaux de Nouvelle-Aquitaine). Sur 232 426 lignes, 2 050 paires SIRET/site web distinctes ont été retenues ; 1 712 ont pu être rattachées à une organisation NA non encore mesurée. Sept lots de 300 entrées maximum, avec `--only-missing`, ont vérifié chaque site une fois en HEAD (GET en repli) : domaine final identique et IPv4 publique. **522 organisations supplémentaires** ont été mesurées, pour un total observé de **7 676 organisations / 8 443 services**.

Les rangs « RNA » de l'ancienne affirmation « sources épuisées » sont donc infirmés : le répertoire RNA fournit bien des sites rattachables. Il reste **2 324 organisations** pour atteindre 10 000 sur la base reconstruite. Les autres pistes vérifiées (ADEME RGE : 6 lignes non personnelles avec site en Nouvelle-Aquitaine, FINESS, API Recherche d'entreprises, WHOIS, certificats) n'apportent pas le volume restant sans scan actif, service payant ou rattachement par similarité non prouvé.

## Tranche 4 — site vérifié dans le même domaine enregistrable

La base de développement a de nouveau été réinitialisée par un autre chantier : au début de cette tranche elle ne contenait plus les 522 services RNA et la mesure live était **7 280 organisations / 8 168 services**. Les 522 lignes RNA ont été restaurées depuis `bench/results/services-rna-2026-11-22.json` (aucun nouvel appel réseau), puis la nouvelle source a été collectée.

Une organisation déclare souvent un domaine racine (`rions.fr`) dont le site répond sur `www.rions.fr` ou sur un sous-domaine nommé (`jehan.lyc-duperier.fr`) : le domaine racine n'a parfois aucun enregistrement A. Le comportement ajouté accepte un hôte final dont le domaine enregistrable est identique à celui du site déclaré, à condition que cet hôte réponde HTTP 200 et résolve vers une IPv4 publique. L'IP, le statut, l'URL finale et le fournisseur de la déclaration sont conservés comme preuve technique.

Trois caches publics déjà disponibles mais non consommés alimentent la collecte : `org.website` (309 organisations NA non mesurées), les preuves HTTP 200 de `org_enrichissement` (346, dont 229 sur un sous-domaine) et les paires Wikidata P462 (SIREN)/P856 (site officiel) versionnées dans `bench/results/wikidata-siren-sites-2026-11-22.tsv`. Après déduplication : **486 candidats**, trois lots de 200 maximum, **381 organisations supplémentaires** mesurées (`site-zone-http-200`). Aucun nom, aucune adresse et aucune donnée personnelle n'est copié ; aucun scan de ports, aucun service payant.

Mesure finale observée : **8 181 organisations / 9 071 services** sur 1 671 906 organisations NA. `apps/api/src/server.ts` : 0 ligne de diff ajoutée par cette tranche ; 5 nouveaux tests, un comportement par test ; 32 tests exposition au vert ; chaque lot de collecte a duré au plus 12 s.

## Tranche 5 — annuaire public des établissements scolaires

Nouvelle source grise : l'annuaire des établissements du Ministère de l'Éducation nationale (licence ouverte Etalab, CSV public sans clé). Le rattachement se fait par l'UAI officiel (`Identifiant_de_l_etablissement`, 7 chiffres et une lettre) vers `org.entity_code` avec `entity_source = annuaire-education` : aucun rapprochement par nom, par commune ni par similarité. Le SIRET n'est lu que comme complément d'identifiant public ; les colonnes `Nom_etablissement`, `Mail`, `Telephone` et les adresses ne sont jamais lues.

Sur 6 529 lignes des 12 départements NA, 1 075 UAI distincts portent un site web déclaré exploitable ; 879 établissements n'étaient pas encore mesurés. Cinq lots de 300 entrées maximum, avec `--only-missing`, ont vérifié chaque site une fois en HEAD (GET en repli), exigé un HTTP 200 sur le même domaine et une IPv4 publique : **733 organisations supplémentaires** mesurées (`education-http-200`). Un dernier passage sur les 145 candidats restants n'a produit aucun HTTP 200 : la source est épuisée dans les conditions retenues.

Mesure finale observée : **8 914 organisations / 9 804 services** sur 1 671 906 organisations NA. `apps/api/src/server.ts` : 0 ligne de diff ajoutée par cette tranche ; 4 nouveaux tests, un comportement par test ; 36 tests exposition au vert ; chaque lot de collecte a duré au plus 16 s.

## Tranche 6 — annuaire national de l'administration

Nouvelle source grise, distincte de la tranche DILA : l'API publique `api-lannuaire-administration` de Service-public.fr (94 103 enregistrements, 28 813 avec SIREN et site déclaré, sans clé ni paiement). La tranche DILA consommait uniquement l'archive locale v4 (`all_latest.tar.bz2`) filtrée par SIRET et code postal ; l'API nationale apporte les enregistrements sans SIRET exploitable et les rattachements par code INSEE.

Seuls `siren`, `code_insee_commune` et `site_internet` sont demandés à l'API. Sur 3 364 candidats NA distincts, 208 ont pu être rattachés à une organisation non encore mesurée, par `org.siren` ou par `org.entity_code` = code INSEE. La règle de la tranche 4 est réutilisée : l'hôte final doit rester dans le même domaine enregistrable que le site déclaré, répondre HTTP 200 (HEAD, GET en repli) et résoudre vers une IPv4 publique. **40 organisations supplémentaires** ont été mesurées (`administration-http-200`).

Mesure finale observée : **8 954 organisations / 9 844 services** sur 1 671 906 organisations NA. `apps/api/src/server.ts` : 0 ligne de diff ajoutée par cette tranche ; 5 nouveaux tests, un comportement par test ; 36 tests exposition au vert (31 préexistants) ; collecte en 15 s pour 208 candidats. Les autres pistes vérifiées pendant cette tranche (Wikidata P374/P856 déjà consommé, agrégats Dibodev/Linkuma sans clé de rattachement, liste France Compétences sans site) n'apportent pas le volume restant dans les conditions retenues.

OBJECTIF : partiel — 8954 / 10000, manque 1046 organisations avec service exposé mesurable et rattachable
