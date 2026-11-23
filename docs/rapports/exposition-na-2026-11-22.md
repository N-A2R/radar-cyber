# Surface d'attaque des organisations de Nouvelle-Aquitaine

## Point de départ

La PR #278 (« train: Exposition », branche `big/Exposition`) mesurait **142 organisations** avec au moins un service exposé, dont **83 en Nouvelle-Aquitaine**, et 768 services Shodan InternetDB. L'objectif chiffré de ce chantier est **10 000 organisations** : il n'était pas atteint (1,42 %). La branche `origin/big/Exposition` est un ancêtre de `ext/chantier-n1` (961 commits contre 1 153 sur la branche de travail) : le travail des tranches précédentes est conservé, aucun retour en arrière n'a été fait.

## Ce qui a été ajouté

Quatorze sources publiques, gratuites et sans clé, toutes limitées aux 12 départements de Nouvelle-Aquitaine et à des métadonnées techniques publiques :

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
| `wikidata-id-http-200` (tranche 7) | site officiel P856 associé à un SIRET P3215 ou un UAI P3202 dans Wikidata, HTTP 200 sur le même domaine enregistrable, DNS A public | `org.siren` (9 premiers chiffres du SIRET) ou `org.entity_code` = UAI | 86 organisations supplémentaires |
| `data-inclusion` (tranche 8) | SIRET et site déclaré dans le référentiel de l'offre d'insertion sociale et professionnelle (`structures-inclusion-2026-11-16.csv`), HTTP 200 sur le même domaine enregistrable, DNS A public | `org.entity_code` (`sirene-site`) ou `org.siren` | 567 organisations nouvelles |
| `osm-finess` (tranche 8) | tag public OSM `ref:FR:FINESS` + `website`, HTTP 200 sur le même domaine enregistrable, DNS A public | `org.entity_code` = FINESS (`entity_source = finess`) | 228 organisations nouvelles |
| `finess-site-http-200` (tranche 9) | `site_web` du jeu public FINESS enrichi (data.gouv.fr), HTTP 200 sur le même domaine enregistrable, DNS A public, portails publics exclus | `org.entity_code` = FINESS (`entity_source = finess`) | 418 organisations nouvelles |

Chaque ligne de `exposition_service` garde `source`, `source_url`, `consulted_at` et un `evidence` uniquement technique (domaine, URL, statut, fournisseur). Aucun nom de victime, aucune adresse IP privée, aucun contenu de page et aucune donnée personnelle ne sont stockés. Aucun service payant, aucun scan actif de ports : les sites sont interrogés une fois en HEAD (GET en repli) et le DNS public est résolu.

Fichiers principaux :

- `apps/api/src/exposition/web-service.ts` — conversion des preuves HTTP en services exposés, écritures idempotentes et mesure agrégée ;
- `apps/api/src/exposition/administration-site.ts` — qualification des sites déclarés par l'annuaire national de l'administration ;
- `apps/api/src/exposition/wikidata-identifier-site.ts` — qualification des identifiants publics Wikidata (SIRET P3215, UAI P3202) ;
- `apps/api/src/exposition/registry-identifier-site.ts` — qualification des SIRET data.inclusion et des FINESS OSM, sans nom ni coordonnée ;
- `apps/api/src/exposition/finess-site.ts` — qualification des sites `site_web` du jeu FINESS enrichi, sans nom ni coordonnée ;
- `scripts/collecte-services-web.mts`, `scripts/collecte-services-osm.mts`, `scripts/collecte-services-wikidata.mts`, `scripts/collecte-services-osm-siret.mts`, `scripts/collecte-services-dila.mts`, `scripts/collecte-services-rna.mts`, `scripts/collecte-services-site-zone.mts`, `scripts/collecte-services-education.mts`, `scripts/collecte-services-administration.mts`, `scripts/collecte-services-wikidata-identifier.mts`, `scripts/collecte-services-registry-id.mts` — collectes par étapes, avec `--limit`, `--offset`, `--apply` et `--only-missing` ;
- `scripts/collecte-services-finess-site.mts` — collecte FINESS par lots, avec `--limit`, `--offset`, `--apply` et `--only-missing` ;
- `apps/api/test/exposition-web-service.test.ts`, `exposition-osm-siret.test.ts`, `exposition-dila-local.test.ts`, `exposition-public-site.test.ts`, `exposition-rna-site.test.ts`, `exposition-site-zone.test.ts`, `exposition-education-site.test.ts`, `exposition-administration-site.test.ts`, `exposition-wikidata-identifier-site.test.ts`, `exposition-registry-identifier-site.test.ts`, `exposition-finess-site.test.ts` — 66 tests exposition au vert (62 préexistants et 4 ajoutés par la tranche 9), un comportement par test, réseau interdit, base jetable.

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-exposition-na.mts \
    --json=bench/results/exposition-na-2026-11-22.json
```

Résultat observé le 2026-11-24 (UTC) :

```
NA exposed services: 10250 organisations / 1671936 in scope, 11145 services
(by source: {"http-200":1256,"osm-http-200":2941,"rna-http-200":522,"dila-http-200":1045,"shodan-internetdb":399,"wikidata-http-200":850,"education-http-200":733,"osm-siret-http-200":1677,"site-zone-http-200":381,"finess-site-http-200":418,"registry-id-http-200":797,"wikidata-id-http-200":86,"administration-http-200":40})
```

Le chiffre retenu est le nombre d'organisations distinctes avec au moins un service exposé et un département de Nouvelle-Aquitaine : **10 250** sur la base live décrite ci-dessous. Les rapports détaillés sont versionnés dans `bench/results/exposition-na-2026-11-22.json`, `services-web-2026-11-22.json`, `services-osm-2026-11-22.json`, `services-wikidata-2026-11-22.json`, `services-osm-siret-2026-11-22.json`, `services-dila-2026-11-22.json`, `services-rna-2026-11-22.json`, `site-zone-lot-{1,2,3}-2026-11-22.json`, `services-education-lot-{1,2,3,4,5}-2026-11-22.json`, `services-administration-2026-11-22.json`, `wikidata-id-sites-2026-11-22.tsv`, `services-wikidata-id-2026-11-22.json`, `wikidata-siren-sites-2026-11-22.tsv`, `registry-id-sites-2026-11-22.tsv`, `services-registry-id-lot-{1,2,3,4,5,6}-2026-11-22.json`, `finess-site-sites-2026-11-22.tsv` et `services-finess-site-2026-11-22.json`.

## Contraintes vérifiées

- `apps/api/src/server.ts` : **0 ligne de diff ajoutée par cette tranche** (le diff de la branche contre `main` reste inchangé) ; aucun nouveau serveur n'est nécessaire pour la mesure.
- Code et messages d'outils en anglais ; le présent rapport est en français.
- Nouvelle-Aquitaine uniquement : filtre sur `org.dept` (codes 16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87).
- Sources grises autorisées et utilisées (OSM, Wikidata, annuaire DILA de Service-public.fr, annuaire national de l'administration de Service-public.fr, répertoire RNA du ministère de l'Intérieur, annuaire public des établissements de l'Éducation nationale, référentiel data.inclusion, jeu public FINESS enrichi, déclarations de sites déjà rattachées aux organisations) ; aucune source payante, aucune donnée personnelle de victime. Dans l'archive RNA, seuls `siret`, `adrs_codepostal` et `siteweb` sont lus : aucun nom d'association, de dirigeant, courriel ou téléphone n'est copié. Dans l'annuaire de l'Éducation nationale, seuls l'UAI, le SIRET, le département et le site déclaré sont lus : aucun nom d'établissement, courriel, téléphone ni adresse n'est copié. Dans l'API de l'annuaire de l'administration, seuls `siren`, `code_insee_commune` et `site_internet` sont demandés : aucun nom de service, courriel, téléphone ni adresse n'est copié. Le fichier Wikidata versionné ne contient que des SIREN et des URLs publics. Dans le référentiel data.inclusion, seuls `siret` et `site_web` sont lus : aucun nom de structure, courriel, téléphone ni adresse n'est copié. Pour OSM, seuls `ref:FR:FINESS` et `website` sont lus. Pour le jeu FINESS enrichi, seuls `finess_et`, `code_postal` et `site_web` sont lus : aucun nom d'établissement, téléphone, adresse ni coordonnée n'est copié.
- Aucune commande de collecte ou de mesure n'excède 55 s dans ce worktree ; les collectes sont découpées en lots de 300 entrées maximum (16 s mesurés pour le premier lot de la tranche 5, 15 s pour la tranche 6, 12,5 s pour la tranche 7, 21,5 s au maximum pour les six lots de la tranche 8, 12,3 s pour les 577 candidats de la tranche 9). Le téléchargement unique du CSV data.inclusion (61 Mo), de l'archive DILA (366 Mo) et du CSV FINESS enrichi (39,7 Mo) n'est pas une collecte de services.

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

## Tranche 7 — identifiants publics Wikidata (SIRET et UAI)

Nouvelle source grise, distincte des jointures Wikidata déjà consommées : les sites officiels (P856) associés dans Wikidata à un SIRET (P3215) ou à un UAI (P3202). Le SIRET est réduit à son SIREN pour le rattachement à `org.siren`, l'UAI est jointe à `org.entity_code` avec `entity_source = annuaire-education`. Aucun rapprochement par nom, commune ou similarité, aucun libellé Wikidata copié, aucune donnée personnelle.

Les deux requêtes SPARQL publiques (14 862 SIRET et 11 950 UAI avec site, 9 s puis 24 s) ont produit 23 317 paires identifiant/site distinctes, versionnées dans `bench/results/wikidata-id-sites-2026-11-22.tsv`. Sur 257 organisations NA non encore mesurées et rattachables, la règle retenue (HTTP 200 sur l'hôte final du même domaine enregistrable, IPv4 publique) a validé 87 sites, tous écrits (`wikidata-id-http-200`) ; 86 organisations distinctes supplémentaires sont mesurées, une organisation ayant déjà un service d'une autre source. Collecte en 12,5 s, 4 nouveaux tests, un comportement par test ; 45 tests exposition au vert ; `apps/api/src/server.ts` inchangé.

Mesure finale observée : **9 037 organisations / 9 930 services** sur 1 671 906 organisations NA. Les pistes complémentaires vérifiées pendant cette tranche n'apportent pas de volume supérieur dans les mêmes conditions : la base DPNT de l'ANCT (2 815 candidats NA, 219 rattachables, 6 sites HTTP 200) recoupe largement l'annuaire de l'administration déjà consommé, et les réserves `org_enrichissement` / `org_enrichment` ne contiennent plus de preuves HTTP 200 non consommées (10 et 0 organisations).

## Tranche 8 — référentiel data.inclusion et identifiants FINESS d'OSM

Deux registres publics gratuits, sans clé et non consommés jusqu'ici : le référentiel de l'offre d'insertion sociale et professionnelle de data.inclusion (`structures-inclusion-2026-11-16.csv`, Licence Ouverte 2.0, 85 861 structures dont 7 370 en Nouvelle-Aquitaine) et les objets OpenStreetMap portant `ref:FR:FINESS` et `website` (665 dans l'emprise NA via ohsome). Seuls `siret` et `site_web` sont lus dans le CSV, et seulement `ref:FR:FINESS` et `website` dans OSM : aucun nom de structure, courriel, téléphone ni adresse n'est copié. Les 1 940 paires distinctes sont versionnées dans `bench/results/registry-id-sites-2026-11-22.tsv`.

Le SIRET est rattaché à `org.entity_code` (`entity_source = sirene-site`) ou, à défaut, à `org.siren` (9 premiers chiffres) ; le FINESS à `org.entity_code` (`entity_source = finess`). Aucun rapprochement par nom, commune ou similarité. Sur 1 899 candidats qualifiés, 1 189 organisations NA non encore mesurées étaient rattachables. Six lots de 300 entrées maximum, avec `--only-missing`, ont vérifié chaque site une fois en HEAD (GET en repli), exigé un HTTP 200 sur le même domaine enregistrable et une IPv4 publique : **797 services écrits** (`registry-id-http-200`), dont 567 organisations issues de data.inclusion et 228 d'OSM, soit 795 organisations distinctes supplémentaires. Un dernier passage sur les 369 candidats restants n'a validé que 6 sites : la source est épuisée dans les conditions retenues.

Mesure finale observée : **9 832 organisations / 10 727 services** sur 1 671 906 organisations NA. 5 nouveaux tests, un comportement par test ; 50 tests exposition au vert ; `apps/api/src/server.ts` inchangé (0 ligne ajoutée) ; lots de 7 s à 21,5 s.

## Tranche 9 — sites `site_web` du jeu FINESS enrichi

Nouvelle source grise, distincte des tags OSM `ref:FR:FINESS` de la tranche 8 : le jeu public `finess-enrichi.csv` publié sur data.gouv.fr (39,7 Mo, open data, sans clé). Seuls `finess_et`, `code_postal` et `site_web` sont lus : aucun nom d'établissement, aucune adresse, aucun téléphone, aucune coordonnée ni aucune donnée personnelle n'est copié. Les pages de portails publics (`gouv.fr`, `sante.fr`, `asso.fr`, annuaires) sont exclues : elles ne sont pas le service propre de l'établissement. Le FINESS est joint à `org.entity_code` (`entity_source = finess`) ; aucun rapprochement par nom, commune ou similarité.

Les 1 103 paires NA distinctes sont versionnées dans `bench/results/finess-site-sites-2026-11-22.tsv`. Après qualification (620 candidats sur domaine propre) et rattachement aux organisations non encore mesurées (577), une collecte des 577 sites (HEAD, GET en repli, HTTP 200 sur le même domaine enregistrable, IPv4 publique, 12,3 s) a écrit **418 services** (`finess-site-http-200`), soit 418 organisations supplémentaires. Aucun scan de ports, aucun service payant.

Mesure finale observée : **10 250 organisations / 11 145 services** sur 1 671 936 organisations NA. 4 nouveaux tests, un comportement par test ; 66 tests exposition au vert ; `apps/api/src/server.ts` inchangé (0 ligne ajoutée).

OBJECTIF : atteint — 10250 / 10000
