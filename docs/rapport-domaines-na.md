# Chantier — domaine vérifié et provenance pour 100 % des organisations de Nouvelle-Aquitaine

Date : 2026-11-21, tranche suivante le 2026-11-22. Branche : `ext/chantier-a1`, reprise depuis `origin/big/DomainesReels` (PR #300).
> État courant (rattrapage du 2026-11-24) : voir la dernière section « Rattrapage — tranche t15 ». Les sections précédentes sont l'historique des tranches livrées.

## État réel observé

La PR #300 avait livré 942 organisations dotées d'un domaine vérifié avec preuve. Son objectif propre est atteint, mais il couvre 0,06 % du périmètre : l'objectif de 100 % du présent chantier ne l'est pas.

Mesure live sur la base `radar` (PostgreSQL, 127.0.0.1:5433), au 2026-11-21 :

| Indicateur | Valeur |
| --- | --- |
| Organisations | 1 673 221 |
| Sources | 376 |
| Événements | 27 882 |
| Organisations de Nouvelle-Aquitaine | 1 671 912 |

Les chiffres du brief (1 673 151 organisations, 312 sources, ~28 000 événements) sont ceux de l'instantané documenté ; l'écart vient d'écritures concurrentes d'autres branches sur la même base.

## Définition retenue pour « domaine vérifié avec provenance »

Une organisation entre dans le numérateur seulement si :

1. elle est en Nouvelle-Aquitaine (départements 16, 17, 18, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87) ;
2. `org.domain` contient une racine de domaine valide ;
3. `org_enrichissement` porte une ligne `champ = 'domaine'` dont la valeur est le même domaine, avec une source non vide et une confiance ≥ 0,8 ;
4. la preuve JSONB porte un statut HTTP 200 et l'URL finale qui redescend sur cette même racine.

Un domaine présent dans `org.domain` sans preuve HTTP n'est donc pas compté.

## Étapes implémentées, une mesure par comportement

1. `scripts/domain-coverage.mts` — métrique reproductible (normalisation, filtre NA, contrôle de provenance, agrégation). 5 tests.
2. `scripts/expand-domains.mts` — lecture d'un export public Wikidata P856 (SIREN, site, QID), appariement strict par SIREN, rejet des hôtes sans racine valide, vérification HTTP (200, même racine, page ≥ 150 caractères, hors parking, jeton distinctif du nom). 6 tests.
3. Écriture transactionnelle `org` + `org_enrichissement`, uniquement avec `--apply` ; aucune donnée d'événement, de victime ou de personne n'est lue ni écrite.
4. `bench/results/domains-from-wikidata.json` — détail des 338 domaines ajoutés avec QID, SIREN, domaine, confiance.
5. Tranche suivante — `scripts/expand-domains-racine.mts` : les candidats Wikidata P856 dont le SIREN n'apparie aucune organisation sont appariés par jeton rare de la racine de domaine, **confirmés par le libellé Wikidata contenu dans le nom de l'organisation**, puis soumis à la même preuve HTTP stricte. Sur 500 paires examinées : 144 confirmées par libellé, 97 vérifiées HTTP et écrites. Le libellé écarte les faux positifs observés sans garde-fou (Vesoul → Saint-Jean-de-Luz, Smictom d'Alsace → Périgord, Kessel GmbH → collège du 47). 6 tests. Détail : `bench/results/domains-from-root-match.json` (et le dry-run `...-dry.json`).

6. Tranche suivante — extension de la route racine à tout le réservoir exploitable : 1 032 paires examinées au lieu de 500, en excluant les QID déjà attribués par une route vérifiée (`excludeAttributedCandidates`) et en réutilisant, avec `--labels-from`, les libellés enregistrés par le dry-run quand l'API Wikidata répond 429 (limite de débit atteinte après la première passe). 115 nouveaux domaines vérifiés HTTP et tracés. 2 tests. Détail : `bench/results/domains-from-root-match-p2-dry.json` et `bench/results/domains-from-root-match-p2.json`.

7. Tranche suivante (t6) — nouvelle route grise géographique : requête SPARQL publique sur Wikidata (`P856`, `P131*` Nouvelle-Aquitaine Q18678082) ramenant 5 693 sites, dont 5 634 QID absents de l'export SIREN. `scripts/expand-domains-geo.mts` apparie le **libellé Wikidata entier** au nom de l'organisation (une seule correspondance acceptée), écarte les QID déjà examinés par les deux routes précédentes, puis exige la même preuve HTTP stricte. Sur 134 paires retenues : 83 domaines vérifiés et tracés `wikidata:P856:geographie:http200` (collèges, lycées, châteaux, clubs et administrations locales). 9 tests. Détail : `bench/results/domains-from-geo.json`, candidats mis en cache dans `bench/domain-candidates/wikidata-na-sites.tsv`.

8. Tranche suivante (t7) — nouvelle route grise du **siège social** : requête SPARQL publique Wikidata (`P856`, `P159/P131*` Nouvelle-Aquitaine Q18678082) ramenant 1 412 sites d'entités dont le siège est en région, distinctes de celles de la route géographique (t6). `scripts/expand-domains-hq.mts` écarte les 13 714 QID déjà examinés par les routes SIREN et géographiques, apparie le libellé Wikidata entier à une seule organisation, puis exige la même preuve HTTP stricte. Sur 62 paires retenues : 39 domaines vérifiés et tracés `wikidata:P856:siege:http200` (associations sportives, sociétés et chambres consulaires). 3 tests. Détail : `bench/results/domains-from-hq.json`, candidats mis en cache dans `bench/domain-candidates/wikidata-na-hq-sites.tsv`.

`apps/api/test/domain-coverage.test.ts`, `apps/api/test/expand-domains.test.ts`, `apps/api/test/expand-domains-racine.test.ts`, `apps/api/test/expand-domains-geo.test.ts` et `apps/api/test/expand-domains-hq.test.ts` : 31 tests réussis, un comportement par test. Typecheck `tsc --noEmit` des paquets : OK (`pnpm -r typecheck` refuse le `node_modules` symlinké du worktree). `apps/api/src/server.ts` : 0 ligne modifiée.

## Commande reproductible

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée après les cinq expansions (`pnpm domaines:etendre -- --limit=1000 --concurrency=48 --apply`, `pnpm domaines:etendre-racine -- --limit=500 --concurrency=32 --apply`, `pnpm domaines:etendre-racine -- --limit=2000 --concurrency=24 --labels-from=bench/results/domains-from-root-match-p2-dry.json --apply`, `pnpm domaines:etendre-geo -- --limit=400 --concurrency=32 --apply`, puis `pnpm domaines:etendre-siege -- --refresh --limit=2000 --concurrency=32 --apply`) :

```
organisations_total=1673220
organisations_nouvelle_aquitaine=1671911
organisations_avec_domaine=1619
organisations_avec_domaine_verifie_et_provenance=1604
couverture_pourcent=0.0959

La commande `pnpm domaines:mesurer` rejouée indépendamment après écriture redonne exactement ces chiffres.

## Résultat chiffré

**1 604 organisations sur 1 671 911 ont un domaine vérifié et sa provenance, soit 0,0959 % de la Nouvelle-Aquitaine. Objectif 100 % : NON ATTEINT.**

Progression due à ce chantier : 932 → 1 270 (`wikidata:P856:http200`, +338) → 1 367 (`wikidata:P856:racine:http200`, +97) → 1 482 (même route, ensemble du réservoir, +115) → 1 565 (`wikidata:P856:geographie:http200`, +83) → 1 604 (`wikidata:P856:siege:http200`, +39), soit **672 domaines supplémentaires** tous vérifiés HTTP et tracés. Il reste 1 670 307 organisations sans domaine vérifié (99,9041 % du périmètre).

## Limite structurelle — pourquoi 100 % n'est pas atteignable ici

- 1 594 010 organisations viennent de SIRENE (dont 429 025 fermées) et n'ont aucun site dans les jeux publics consultés ; l'API recherche-entreprises renvoie 0 champ site web sur 100 SIREN testés en #300.
- L'export Wikidata SIREN ne contient que 14 458 lignes exploitables : la route SIREN a accepté 338 domaines, la route racine confirmée par libellé 97 puis 115 de plus sur 1 032 paires examinées. Le réservoir de paires uniques de cette route est épuisé. La route géographique interroge 5 693 autres sites (5 634 QID hors export SIREN) mais le libellé complet ne nomme sans ambiguïté qu'une organisation dans 134 cas, dont 83 vérifiés HTTP. La route du siège social interroge 1 412 sites supplémentaires, dont 13 714 QID déjà examinés écartés ; 62 paires restantes, 39 vérifiées HTTP. Même en élargissant, le réservoir public restant ne peut couvrir 1,67 M d'organisations ; les appariements sans confirmation de libellé produisent des attributions fausses et ont été rejetés.
- Les autres corpus publics (articles, santé, communes, institutions) plafonnent à ~1 700 candidats au total et sont déjà exploités par #300 et #297.
- Attribuer un domaine deviné, loué ou acheté à une organisation sans preuve publique gonflerait le chiffre mais détruirait la garantie « vérifié avec provenance ». Aucun domaine n'a été fabriqué.

## Conformité

Nouvelle-Aquitaine uniquement ; sources publiques/grises uniquement (requêtes SPARQL Wikidata régionales, P856, libellés Wikidata, preuve HTTP) ; aucun service payant ; aucune donnée personnelle de victime ; code et interface en anglais ; rapport en français ; `server.ts` inchangé ; chaque commande exécutée en moins de 60 s (mesure 1,3 s, expansion du siège 21,1 s).
OBJECTIF : partiel — 1 604 / 1 671 911 organisations (0,0959 %), manque 1 670 307 organisations vérifiées (99,9041 %) pour atteindre 100 %

## Rattrapage — tranche t8 (2026-11-24)

Le travail des tranches t1 à t7 est conservé tel quel. La tranche t8 ajoute une **sixième route grise** : les sites Wikidata `P856` des entités de Nouvelle-Aquitaine déjà mis en cache par les routes géographique (t6) et du siège (t7), mais non retenus par l'appariement du libellé entier. `scripts/expand-domains-racine-regionale.mts` apparie le **jeton distinctif de la racine de domaine** (`ville-boulazac.fr` → `boulazac`) à un nom d'organisation, exige en plus que le libellé Wikidata entier nomme cette organisation, puis applique la même preuve HTTP stricte (statut 200, racine identique, jeton distinctif dans la page). La recherche des organisations passe par l'index trigramme de `name_norm`, par lots de 100 libellés, sur le pool d'ingestion afin de ne pas bloquer les routes API.

Sur 7 105 candidats (5 693 géographiques + 1 412 siège), 6 764 libellés uniques, 48 paires ont satisfait les deux critères d'appariement et 19 sites ont passé la preuve HTTP : 19 communes et établissements locaux supplémentaires écrits de façon transactionnelle avec la source `wikidata:P856:racine-regionale:http200`. Détail : `bench/results/domains-from-racine-regionale.json`. 3 tests comportement (un par comportement) dans `apps/api/test/expand-domains-racine-regionale.test.ts` ; typecheck `tsc --noEmit` de `apps/api` : OK ; `apps/api/src/server.ts` : 0 ligne modifiée.

Commande reproductible (identique à celle des tranches précédentes) :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Expansion de la tranche : `pnpm domaines:etendre-racine-regionale -- --limit=1500 --concurrency=24 --max-orgs=25 --apply` (68,9 s), puis mesure rejouée indépendamment :

```
organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=1668
organisations_avec_domaine_verifie_et_provenance=1623
couverture_pourcent=0.0971
```

Le dénominateur est passé de 1 671 911 à 1 671 941 par des écritures concurrentes d'autres branches sur la même base ; le numérateur passe de 1 604 à 1 623 (+19). La limite structurelle décrite plus haut demeure : l'API Recherche d'entreprises et les exports `unites-legales` de data.gouv.fr ne contiennent aucun champ site web ; Wikidata ne porte un `P856` que pour 14 487 des 464 200 entités avec SIREN (3,1 %). Aucun domaine n'a été deviné ni attribué sans preuve publique.

OBJECTIF : partiel — 1 623 / 1 671 941 organisations (0,0971 %), manque 1 670 318 organisations vérifiées (99,9029 %) pour atteindre 100 %

## Rattrapage — tranche t9 (2026-11-24)

Le travail des tranches t1 à t8 est conservé tel quel. La tranche t9 réutilise la plus grande réserve de sites déjà prouvés HTTP 200 de la base : `exposition_service` (11 145 services rattachés à 10 326 organisations, collectés sans service payant depuis OSM apparié par SIREN, les annuaires administration/éducation, DILA, RNA, FINESS et Wikidata). `scripts/expand-domains-exposition.mts` ne reprend qu'une URL par organisation et par racine de domaine, refuse les places de marché et les hôtes génériques, puis **revérifie chaque URL en direct** (statut 200, racine inchangée après redirection, page de plus de 150 caractères, jeton distinctif du nom de l'organisation). L'écriture est transactionnelle (`org.domain`, `org.website`, `org_enrichissement`) et tracée `exposition-service:http200` avec l'identifiant du service, le registre d'origine et la preuve HTTP. Aucune donnée de victime ni donnée personnelle n'est lue.

Trois passes à concurrence décroissante (128, 32, 16) ont été nécessaires : la première, trop agressive, n'a validé que 166 candidats sur 6 437 (délais réseau) ; les deux suivantes en ont validé 5 169 sur 6 271 puis 120 sur 1 102. Au total **5 455 sites acceptés, dont 5 442 nouveaux domaines comptés** (13 organisations portaient déjà une preuve incompatible). Détails : `bench/results/domains-from-exposition.json`, `...-p2.json`, `...-p3.json`. 4 tests comportement (un par comportement) dans `apps/api/test/expand-domains-exposition.test.ts` ; 38 tests domaines verts au total ; `tsc --noEmit` OK ; `apps/api/src/server.ts` : 0 ligne modifiée.

Mesure reproductible (identique à celle des tranches précédentes) :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée :

```
organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=7123
organisations_avec_domaine_verifie_et_provenance=7065
couverture_pourcent=0.4226
```

Preuve de la limite restante, reproductible sur la même base :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c \
  "SELECT count(*) FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']) AND (o.domain IS NULL OR btrim(o.domain)='') AND NOT EXISTS (SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')"
-- 1661633
```

Il reste donc 1 661 633 organisations de Nouvelle-Aquitaine sans domaine **et sans aucune URL HTTP 200** dans le corpus consolidé des sources publiques/gratuites ; l'API Recherche d'entreprises et les exports `unites-legales` n'ont pas de champ site web, et Wikidata ne porte un `P856` que pour 3,1 % des entités avec SIREN. Attribuer les domaines manquants exigerait de les inventer, ce qui détruirait la garantie « vérifié avec provenance ». Aucun domaine n'a été fabriqué ; aucune donnée personnelle, aucun service payant.

OBJECTIF : partiel — 7 065 / 1 671 941 organisations (0,4226 %), manque 1 664 876 organisations vérifiées (99,5774 %) pour atteindre 100 %

## Rattrapage — tranche t10 (2026-11-24)

Le travail des tranches t1 à t9 est conservé. Les trois premières passes de réemploi des URL d'exposition avaient laissé 982 organisations sans domaine : l'URL officielle prouvée HTTP 200 par le registre ne répondait pas dans les 5 s ou sans le préfixe `www`. `scripts/expand-domains-retry.mts` retente ces 982 URL avec un délai de 15 s et la variante `www` du même hôte, puis exige exactement la même preuve stricte (statut 200, racine inchangée après redirection, page de plus de 150 caractères, jeton distinctif du nom). La provenance est tracée `exposition-service:retry:http200` ; aucune URL n'est devinée et aucune écriture n'a lieu sans `--apply`.

Sur 982 candidats, **358 nouveaux domaines vérifiés et tracés** (FINESS, OSM/SIREN, DILA, RNA, annuaires éducation/administration, Wikidata), tous de racine unique. Détail : `bench/results/domains-from-exposition-retry.json`. 4 tests comportement (`apps/api/test/expand-domains-retry.test.ts`), 79 tests domaines verts, `tsc --noEmit` OK, `apps/api/src/server.ts` : 0 ligne modifiée. Le `package.json` hérité de `main` portait deux virgules manquantes qui bloquaient toute commande pnpm : elles sont corrigées ici pour rendre la mesure reproductible.

Commande reproductible (identique aux tranches précédentes) :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée :

```
organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=7481
organisations_avec_domaine_verifie_et_provenance=7423
couverture_pourcent=0.444
```

La limite structurelle demeure : la requête SQL de la tranche t9 redonne toujours 1 661 633 organisations de Nouvelle-Aquitaine sans domaine **et sans aucune URL HTTP 200** dans le corpus consolidé des sources publiques/gratuites. Attribuer les 1 664 518 organisations restantes exigerait d'inventer des sites, ce qui détruirait la garantie « vérifié avec provenance ». Aucun domaine n'a été fabriqué ; aucune donnée personnelle, aucun service payant.

OBJECTIF : partiel — 7 423 / 1 671 941 organisations (0,4440 %), manque 1 664 518 organisations vérifiées (99,5560 %) pour atteindre 100 %

## Rattrapage — tranche t11 (2026-11-24)

Le travail des tranches t1 à t10 est conservé : la branche de départ porte la mesure 7 423 / 1 671 941. La tranche t11 ouvre une **neuvième route grise** : les pages dédiées d'un domaine de groupe déjà attribué à une autre organisation. Un même domaine peut desservir plusieurs établissements, mais seulement si l'adresse de la page (sous-domaine ou chemin, hors `www` et hors mots génériques) nomme l'organisation **et** si la page passe la preuve stricte inchangée (HTTP 200, racine identique après redirection, contenu réel, jeton distinctif du nom, page finale dédiée). `scripts/expand-domains-shared.mts` ne reprend qu'une page par organisation, trace la provenance `exposition-service:page-dediee:http200` et n'écrit rien sans `--apply`.

Deux passes ont été nécessaires : la première porte le compteur de 7 423 à 8 284, la seconde de 8 284 à 8 309 (détail : `bench/results/domains-from-shared-pages.json`). Soit **886 domaines supplémentaires vérifiés et tracés**, tous issus d'URL déjà prouvées HTTP 200 par les registres publics/gratuits (FINESS, OSM/SIREN, DILA, RNA, annuaires administration/éducation, Wikidata). 5 tests comportement (`apps/api/test/expand-domains-shared.test.ts`), 47 tests domaines verts au total, typecheck `apps/api` OK, `apps/api/src/server.ts` : 0 ligne modifiée.

Commande reproductible (identique aux tranches précédentes) :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée après les deux passes :

```
organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=8367
organisations_avec_domaine_verifie_et_provenance=8309
couverture_pourcent=0.497
```

Preuve de la limite restante, reproductible sur la même base :

```sh
mcp__postgres_query --sql "SELECT count(*) AS sans_domaine_sans_preuve_http200 FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']) AND (o.domain IS NULL OR btrim(o.domain)='') AND NOT EXISTS (SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')"
-- 1661633
```

Il reste donc 1 661 633 organisations de Nouvelle-Aquitaine sans domaine **et sans aucune URL HTTP 200** dans le corpus consolidé des sources publiques/gratuites. Sur les 1 663 574 organisations encore sans domaine, 1 941 seulement disposent d'une URL prouvée mais échouent à la preuve stricte (page morte, contenu trop court ou absence de jeton distinctif). Le périmètre initial du rapport était 1 671 911 organisations ; le dénominateur mesuré est passé à 1 671 941 par des écritures concurrentes d'autres branches. Combler 1 663 632 organisations exigerait d'inventer des sites, ce qui détruirait la garantie « vérifié avec provenance ». Aucun domaine n'a été fabriqué ; aucune donnée personnelle, aucun service payant.

OBJECTIF : partiel — 8 309 / 1 671 941 organisations (0,4970 %), manque 1 663 632 organisations vérifiées (99,5030 %) pour atteindre 100 %

## Rattrapage — tranche t12 (2026-11-24)

Le travail des tranches t1 à t11 est conservé : la branche de départ porte la mesure 8 309 / 1 671 941. La tranche t12 ouvre une **dixième route grise** : le **libellé enregistrable lui-même** du site officiel (`aussac-vadalle.fr` → `aussac`, `vadalle`) peut nommer l'organisation. Les routes précédentes ne regardaient que le sous-domaine ou le chemin (`isDedicatedPageUrl`) et la route t9 écartait toute racine déjà attribuée à une autre organisation : une commune dont le site porte son nom était donc écartée au profit d'une association hébergée sur la même racine. `scripts/expand-domains-domain-label.mts` accepte ces pages à condition que l'URL **et l'URL finale** portent un jeton distinctif du nom (au moins 5 lettres, hors mots génériques), puis applique la preuve stricte inchangée (HTTP 200, racine inchangée après redirection, contenu réel, jeton distinctif dans la page). Une seule page par organisation ; une racine peut être partagée si chaque page nomme son organisation. Aucune écriture n'a lieu sans `--apply`.

Sur 819 candidats retenus, **470 domaines vérifiés et tracés** `exposition-service:domaine-nomme:http200` (communes, établissements et associations), tous issus d'URL déjà prouvées HTTP 200 par les registres publics/gratuits (OSM/SIREN, Wikidata, FINESS, DILA, RNA, annuaires administration/éducation). Détail : `bench/results/domains-from-domain-label.json`. 5 tests comportement (`apps/api/test/expand-domains-domain-label.test.ts`), 52 tests domaines verts au total, typecheck `apps/api` OK, `apps/api/src/server.ts` : 0 ligne modifiée.

Commande reproductible :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-domaine-nomme -- --limit=3000 --concurrency=32 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée (mesure rejouée indépendamment après écriture) :

```
selected=819 verified=470 applied=true
verified_domain_coverage=8309 -> 8779
coverage_percent=0.497 -> 0.5251

organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=8837
organisations_avec_domaine_verifie_et_provenance=8779
couverture_pourcent=0.5251
```

La requête SQL de la tranche t11 redonne toujours 1 661 633 organisations de Nouvelle-Aquitaine sans domaine **et sans aucune URL HTTP 200** dans le corpus consolidé des sources publiques/gratuites : la tranche t12 n'invente aucun site, elle corrige un appariement qui écartait à tort des sites déjà prouvés. Sur les 1 663 162 organisations encore sans domaine, moins de 1 500 disposent d'une URL prouvée mais échouent à la preuve stricte. Combler le reste exigerait d'attribuer des sites inexistants, ce qui détruirait la garantie « vérifié avec provenance ». Aucune donnée personnelle, aucun service payant.

OBJECTIF : partiel — 8 779 / 1 671 941 organisations (0,5251 %), manque 1 663 162 organisations vérifiées (99,4749 %) pour atteindre 100 %

## Rattrapage — tranche t13 (2026-11-24)

Le travail des tranches t1 à t12 est conservé : la branche de départ porte la mesure 8 779 / 1 671 941. La tranche t13 ouvre une **onzième route grise** : les variantes de protocole et de préfixe `www` d'une URL officielle déjà prouvée HTTP 200 par un registre public/gratuit. Les passes précédentes n'essayaient qu'une seule variante (`http` → `https` ou ajout de `www`) et manquaient les sites qui ne répondent qu'en `http`, ou seulement avec le préfixe `www` sur une URL `https`. `scripts/expand-domains-variantes.mts` ne garde que les URL dont le libellé enregistrable ou la page dédiée nomme l'organisation, essaie les quatre combinaisons du **même hôte officiel**, puis exige la preuve stricte inchangée (statut 200, racine identique après redirection, page de plus de 150 caractères, jeton distinctif du nom, URL finale nommante). Une seule organisation est proposée, même si deux formes d'URL qualifient ; rien n'est écrit sans `--apply`.

Sur 390 candidats retenus, **53 domaines vérifiés et tracés** `exposition-service:variante-hote:http200` (établissements d'éducation, communes, associations, cabinets et sites Wikidata), tous issus d'URL déjà prouvées par les registres publics/gratuits. Détail : `bench/results/domains-from-host-variants.json`. 5 tests comportement (un par comportement) dans `apps/api/test/expand-domains-variantes.test.ts` ; 57 tests domaines verts au total ; typecheck `tsc --noEmit` OK ; `apps/api/src/server.ts` : 0 ligne modifiée.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-variantes -- --limit=2000 --concurrency=24 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée (mesure rejouée indépendamment après écriture) :

```
selected=390 verified=53 applied=true
verified_domain_coverage=8779 -> 8832
coverage_percent=0.5251 -> 0.5282

organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=8890
organisations_avec_domaine_verifie_et_provenance=8832
couverture_pourcent=0.5282
```

La requête SQL de la tranche t11 redonne toujours 1 661 633 organisations de Nouvelle-Aquitaine sans domaine **et sans aucune URL HTTP 200** dans le corpus consolidé des sources publiques/gratuites : la tranche t13 ne fabrique aucun site, elle retente l'hôte officiel déjà prouvé par un registre. Sur les 1 663 109 organisations encore sans domaine vérifié, moins de 1 500 disposent d'une URL prouvée mais échouent à la preuve stricte. Combler le reste exigerait d'attribuer des sites inexistants, ce qui détruirait la garantie « vérifié avec provenance ». Aucune donnée personnelle, aucun service payant.

OBJECTIF : partiel — 8 832 / 1 671 941 organisations (0,5282 %), manque 1 663 109 organisations vérifiées (99,4718 %) pour atteindre 100 %

## Rattrapage — tranche t14 (2026-11-24)

Le travail des tranches t1 à t13 est conservé : la branche de départ porte la mesure 8 832 / 1 671 941. La tranche t14 répare sept preuves HTTP 200 déjà collectées mais incomplètes : le statut, le titre et le jeton distinctif étaient enregistrés, mais le champ `urlFinale` manquait, ce qui empêchait la mesure de les compter. Ces URL venaient de l'ancienne règle `nom:mairie-<slug>.fr` ; elles ne sont comptées qu'après une **nouvelle vérification en direct** de la page avec la preuve stricte inchangée (statut 200, racine inchangée après redirection, contenu réel, jeton du nom de la commune dans la page et l'URL finale). La provenance est tracée `domaine:reverification-http200`, avec l'URL revérifiée et la date. Aucun domaine n'est deviné ici, aucune donnée personnelle n'est lue ou écrite, aucun service payant n'est utilisé.

Une seule écriture est nécessaire : `scripts/expand-domains-preuve.mts`, 7 candidats retenus, **7 preuves réparées et comptées** (8 832 → 8 839). Détail : `bench/results/domains-from-preuve-reparee.json`. 4 tests comportement (un par comportement) dans `apps/api/test/expand-domains-preuve.test.ts` ; typecheck `tsc --noEmit` de `apps/api` : OK ; `apps/api/src/server.ts` : 0 ligne modifiée. Les autres réservoirs locaux ont été instruits et écartés : `bench/corpus/institutions-complet.jsonl` ne laisse que 8 organisations sans URL prouvée, les alias publics `org_alias` (enseignes, FINESS, éducation) ne nomment que 6 URL supplémentaires, et `bench/corpus/presse-communale.jsonl` recouvre les sites déjà réemployés.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar apps/api/node_modules/.bin/tsx scripts/expand-domains-preuve.mts --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée (mesure rejouée indépendamment après écriture) :

```
selected=7 verified=7 applied=true
verified_domain_coverage=8832 -> 8839
coverage_percent=0.5282 -> 0.5287

organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=8890
organisations_avec_domaine_verifie_et_provenance=8839
couverture_pourcent=0.5287
```

Décomposition reproductible de l'écart restant (1 663 102 organisations), sur la même base :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661633 | 1418 | 8890
```

Les deux premiers seaux totalisent 1 662 051 organisations : 1 661 633 n'ont **aucune URL HTTP 200** dans le corpus consolidé des registres publics/gratuits, et les 1 418 restantes ont une URL mais échouent à la preuve stricte après cinq passes de réemploi. Le troisième seau contient 8 890 organisations avec domaine dont 8 839 seulement portent une preuve comptable. Combler 1 663 102 organisations exigerait d'attribuer des sites inexistants ou de baisser le standard de preuve, ce qui détruirait la garantie « vérifié avec provenance ». La cible chiffrée de 100 % n'est donc pas livrable avec les sources autorisées ; elle est mesurée et documentée ici sans fabrication.

OBJECTIF : partiel — 8 839 / 1 671 941 organisations (0,5287 %), manque 1 663 102 organisations vérifiées (99,4713 %) pour atteindre 100 %

## Rattrapage — tranche t15 (2026-11-24)

Reprise depuis `origin/ext/rattrapage-rapport-domaines-na` (t14 : 8 839 / 1 671 941). La tranche t15 ouvre une onzième route grise : les pages dédiées d'un établissement hébergées sur le site d'un groupe (emeis.fr, retab.fr, colisee.fr, cmso.com, medilab-group.eu). Ces URL sont déjà prouvées HTTP 200 par FINESS ou OSM dans `exposition_service`, mais les passes précédentes écartaient leur racine comme place de marché. `scripts/expand-domains-groupe.mts` n'accepte une page que si son adresse porte un jeton distinctif du **nom de l'organisation** — la ville seule ne suffit pas —, si la racine reste la même après redirection et si la preuve stricte inchangée passe (statut 200, contenu réel, jeton du nom dans la page). Les places de marché (orpi.com, planity.com, intramuros.org) restent exclues. Écriture transactionnelle `org` + `org_enrichissement`, provenance `exposition-service:page-groupe:http200`, rien sans `--apply`.

Sur 97 candidats retenus, 97 pages vérifiées en direct et comptées : **97 domaines supplémentaires** (8 839 → 8 936). Détail : `bench/results/domains-from-group-pages.json`. 5 tests comportement, un par comportement, dans `apps/api/test/expand-domains-groupe.test.ts` (dont le rejet d'une page nommée par la seule ville) ; 107 tests domaines verts ; `tsc --noEmit` de `apps/api` : OK ; `apps/api/src/server.ts` : 0 ligne modifiée. `package.json` inchangé.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar apps/api/node_modules/.bin/tsx scripts/expand-domains-groupe.mts -- --limit=1000 --concurrency=24 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée après écriture, puis mesure rejouée indépendamment :

```
selected=97 verified=97 applied=true
verified_domain_coverage=8839 -> 8936
coverage_percent=0.5287 -> 0.5345

organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=8987
organisations_avec_domaine_verifie_et_provenance=8936
couverture_pourcent=0.5345
```

Décomposition reproductible de l'écart restant (1 663 005 organisations), sur la même base :

```sh
mcp__postgres_query --sql "SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661633 | 1321 | 8987
```

Les deux premiers seaux totalisent 1 662 954 organisations : 1 661 633 n'ont aucune URL HTTP 200 dans le corpus consolidé des registres publics/gratuits, et 1 321 ont une URL mais échouent à la preuve stricte après six passes de réemploi. Aucun réservoir caché n'existe dans la base : le recoupement de toutes les tables porteuses d'URL ne couvrait que 1 559 organisations sans domaine sur 1 663 051 avant cette tranche, et les 1 418 premières sont précisément celles de `exposition_service`. Les sources gratuites vérifiées ne changent pas cette limite : l'annuaire DILA (86 193 lignes, champ `coordonneesnum_url`) ne concerne que les établissements publics, le RNA national (121 686 lignes) ne publie un site web que pour 4 475 associations, FINESS et l'API Recherche d'entreprises n'ont aucun champ site web. Combler 1 663 005 organisations exigerait d'inventer des sites ou de baisser le standard de preuve ; aucun domaine n'a été fabriqué, aucune donnée personnelle ni service payant utilisé. La cible de 100 % reste donc non livrable avec les sources autorisées, et elle est mesurée ici sans fabrication.

OBJECTIF : partiel — 8 936 / 1 671 941 organisations (0,5345 %), manque 1 663 005 organisations vérifiées (99,4655 %) pour atteindre 100 %

## Rattrapage — tranche t16 (2026-11-24)

Le travail des tranches t1 à t15 est conservé : la branche de départ porte la mesure 8 936 / 1 671 941. La tranche t16 ouvre une **seizième route grise** : les pages dédiées déjà prouvées HTTP 200 par les registres publics qui sont hébergées sur une racine d'annuaire ou d'enseigne (Orpi, Planity, Intramuros, sites de groupes). Les routes t11/t15 écartaient ces racines par principe (`PLATFORM_ROOTS`) ou ne retenaient que cinq groupes. Ici la racine redevient éligible **uniquement si l'adresse porte un jeton distinctif du nom de l'organisation** (jeton d'au moins 5 lettres, hors jetons de ville et hors mots génériques), si la réponse reste sur la même racine et si la page contient elle aussi un jeton du nom — pas seulement de la ville. Les pages génériques d'annuaire et les pages nommées par la seule commune restent donc refusées ; la preuve stricte (statut 200, contenu réel, jeton distinctif, URL finale nommante) est inchangée. `scripts/expand-domains-annuaire.mts` n'écrit rien sans `--apply`.

Sur 246 pages dédiées retenues, **51 domaines vérifiés et tracés** `exposition-service:page-annuaire:http200` (agences Orpi, salons Planity, établissements de groupes), tous issus d'URL déjà prouvées par un registre public/gratuit (OSM/SIREN, FINESS, DILA, RNA, Wikidata, annuaires). Détail avec jeton et titre de chaque page : `bench/results/domains-from-annuaire.json`. 8 tests comportement (`apps/api/test/expand-domains-annuaire.test.ts`), `tsc --noEmit` OK, `apps/api/src/server.ts` : 0 ligne modifiée. Le manifeste `package.json` a été validé après l'ajout de la commande `domaines:etendre-annuaire`.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-annuaire -- --limit=500 --concurrency=32 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée, puis mesure rejouée indépendamment :

```
selected=246 verified=51 applied=true
verified_domain_coverage=8936 -> 8987
coverage_percent=0.5345 -> 0.5375

organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9038
organisations_avec_domaine_verifie_et_provenance=8987
couverture_pourcent=0.5375
```

Écart restant (1 662 954 organisations), décomposé par la même requête que la tranche t15 :

```
-- sans_domaine_sans_200 | sans_domaine_avec_200 | avec_domaine
-- 1661633 | 1270 | 9038
```

Sur les 9038 organisations avec domaine, 51 seulement échouent encore à la mesure (preuve incomplète ou racine de l'URL finale différente) ; 1 661 633 n'ont aucune URL HTTP 200 dans le corpus consolidé des sources publiques/gratuites, et 1 270 ont une URL mais ne passent pas la preuve stricte. Ces deux derniers seaux ne peuvent être comblés qu'en inventant des sites ou en abaissant le standard de preuve, ce qui est refusé. Aucune donnée personnelle, aucun service payant, Nouvelle-Aquitaine uniquement.

OBJECTIF : partiel — 8 987 / 1 671 941 organisations (0,5375 %), manque 1 662 954 organisations vérifiées (99,4625 %) pour atteindre 100 %

## Rattrapage — tranche t17 (2026-11-24)

Reprise depuis `origin/ext/rattrapage-rapport-domaines-na` (t16 : 8 987 / 1 671 941). Le travail des tranches t1 à t16 est conservé tel quel. La tranche t17 ajoute deux routes grises distinctes, sans toucher au standard de preuve HTTP (statut 200, racine stable après redirection, page réelle, identité publiée).

**t17a — réalignement sur l'hôte qui a répondu.** Cinq organisations portaient la racine d'un groupe (`aeroport.fr`) alors que la preuve HTTP 200 enregistrée pointait vers un sous-domaine nommé (`bordeaux.aeroport.fr`) : la mesure ne les comptait pas, l'hôte final n'étant pas la racine enregistrée. `scripts/expand-domains-sous-domaine.mts` ne reprend que ces preuves, exige que l'hôte final soit bien un sous-domaine de la racine mémorisée, **revérifie la page en direct** avec la preuve stricte inchangée, puis n'écrit que l'hôte exact ayant répondu (`org.domain`, `org_enrichissement.valeur` et `preuve`, source `domaine:sous-domaine-verifie:http200`). Les cinq pages ont répondu 200 et nommé l'organisation : **5 domaines supplémentaires comptés** (8 987 → 8 992). Détail : `bench/results/domains-from-sous-domaine.json`.

**t17b — ancrage par SIREN public.** Sur les 1 270 organisations sans domaine mais disposant d'une URL prouvée HTTP 200 par un registre public, 343 pages d'établissement sont hébergées sur une racine partagée dont l'adresse ne nomme pas l'organisation (agences Orpi, MMA, AXA, franchise, concessions). `scripts/expand-domains-siren.mts` accepte une page seulement si sa réponse publie le **SIREN de l'organisation** (identifiant légal public, aucune donnée personnelle), si elle ne répertorie pas plus de trois SIREN distincts (page annuaire rejetée), et si la preuve HTTP stricte passe en direct sur la même racine. Le SIREN est un ancrage plus fort qu'un jeton de ville : aucune preuve n'est affaiblie et aucune URL n'est devinée. Sur 343 candidats, **20 domaines vérifiés et tracés** `exposition-service:siren-page:http200` (8 992 → 9 012). Détail : `bench/results/domains-from-siren.json`.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:reparer-sous-domaine -- --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-siren -- --limit=500 --concurrency=16 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sorties observées, puis mesure rejouée indépendamment après écritures :

```
selected=5 verified=5 applied=true
verified_domain_coverage=8987 -> 8992
selected=343 verified=20 applied=true
verified_domain_coverage=8992 -> 9012

organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9058
organisations_avec_domaine_verifie_et_provenance=9012
couverture_pourcent=0.539
```

Dix tests comportement, un par comportement (`apps/api/test/expand-domains-sous-domaine.test.ts` : 4 tests ; `apps/api/test/expand-domains-siren.test.ts` : 6 tests, dont le rejet d'une page annuaire listant plusieurs SIREN). Suite domaines : 84 tests réussis ; typecheck `tsc --noEmit` de `apps/api` : OK ; `apps/api/src/server.ts` : 0 ligne modifiée ; `package.json` validé après ajout des deux commandes (`pnpm install --frozen-lockfile --offline`).

Décomposition reproductible de l'écart restant (1 662 929 organisations), sur la même base :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661633 | 1250 | 9058
```

Sur ces 9 058 organisations avec domaine, 46 échouent encore à la mesure : 14 preuves `lien-article` issues de mots génériques extraits d'articles (`CHROMIUM`, `DELL`, `SHELL`, ...), manifestement sans lien avec l'organisation locale, et 32 sans preuve comptable. Elles ne doivent pas être « réparées » : le faire reviendrait à fabriquer une attribution. Les autres réservoirs ont été instruits et écartés : les 5 preuves `url_testee` sans domaine sont les mêmes correspondances génériques d'articles, les 14 935 pages SIRENE de `org.parent_evidence` ne publient aucun site, et `org_history` ne recèle que des groupes déjà repris. Il reste donc 1 661 633 organisations sans aucune URL HTTP 200 dans le corpus consolidé des sources publiques/gratuites et 1 250 dont l'URL échoue à la preuve stricte après sept passes de réemploi : combler ce solde exigerait d'inventer des sites ou d'abaisser le standard de preuve, ce qui est refusé. Aucune donnée personnelle, aucun service payant, Nouvelle-Aquitaine uniquement.

OBJECTIF : partiel — 9 012 / 1 671 941 organisations (0,5390 %), manque 1 662 929 organisations vérifiées (99,4610 %) pour atteindre 100 %

## Rattrapage — tranche t18 (2026-11-24)

Reprise depuis `origin/ext/rattrapage-rapport-domaines-na` (t17 : 9 012 / 1 671 941), seule base autorisée : la PR #794 existe mais son objectif chiffré (100 %) n'était pas atteint. Le travail des tranches t1 à t17 est conservé tel quel. La tranche t18 ouvre deux routes grises sans baisser la preuve stricte, sans donnée personnelle et sans service payant.

**t18a — identifiant légal publié.** Sur 180 pages d'établissement déjà prouvées HTTP 200 par un registre public et hébergées sur une racine partagée, `scripts/expand-domains-identifiant.mts` n'accepte une page que si elle publie le **FINESS** (9 chiffres) ou le **SIRET** (14 chiffres) exact de l'organisation, avec au plus trois identifiants sur la page. Deux pages `retab.fr` publient le FINESS géographique attendu : 9 012 → 9 014. Détail : `bench/results/domains-from-identifiant.json`.

**t18b — catalogue officiel.** `scripts/expand-domains-catalogue.mts` reprend 1 295 entrées HTTP 200 du catalogue `source` et du corpus versionné `bench/corpus/sources-na-population.jsonl` : seules les entrées qui désignent explicitement une commune (« Mairie de X ») ou un établissement scolaire nommant exactement une organisation de Nouvelle-Aquitaine sont appariées (12 retenues). Chaque URL est revérifiée en direct (statut 200, racine inchangée, contenu réel, nom de la commune ou de l'établissement dans la page, racine non déjà attribuée) : 6 sites officiels supplémentaires, 9 014 → 9 020. Détail : `bench/results/domains-from-catalogue.json`.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-identifiant -- --limit=500 --concurrency=16 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-catalogue -- --limit=1000 --concurrency=16 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Mesure rejouée indépendamment après écriture :

```
organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9066
organisations_avec_domaine_verifie_et_provenance=9020
couverture_pourcent=0.5395
```

Décomposition reproductible de l'écart restant (1 662 921 organisations) :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661629 | 1246 | 9066
```

Il reste 1 661 629 organisations sans aucune URL HTTP 200 dans le corpus consolidé des sources publiques/gratuites, et 1 246 avec une URL mais qui échouent à la preuve stricte. Les 46 dernières preuves `lien-article` sont des correspondances génériques (`CHROMIUM`, `DELL`, `SHELL`, ...) sans lien avec l'organisation locale : les compter reviendrait à fabriquer une attribution. Combler 1 662 921 organisations exigerait d'inventer des sites ou d'abaisser le standard de preuve. Aucun domaine n'a été fabriqué ; Nouvelle-Aquitaine uniquement, aucune donnée personnelle, aucun service payant.

16 tests comportement (un par comportement) dans `apps/api/test/expand-domains-identifiant.test.ts` et `apps/api/test/expand-domains-catalogue.test.ts` ; 125 tests domaines verts au total ; typecheck `apps/api` OK ; `apps/api/src/server.ts` : 0 ligne modifiée. Manifeste `package.json` validé (`node -e JSON.parse` et `pnpm install --frozen-lockfile --offline`).

OBJECTIF : partiel — 9 020 / 1 671 941 organisations (0,5395 %), manque 1 662 921 organisations vérifiées (99,4605 %) pour atteindre 100 %

## Rattrapage — tranche t19 (2026-11-24)

Reprise depuis `origin/ext/rattrapage-rapport-domaines-na` (t18 : 9 020 / 1 671 941), seule base autorisée : la PR #797 existe mais son objectif chiffré (100 %) n'était pas atteint. Le travail des tranches t1 à t18 est conservé tel quel. La tranche t19 ouvre une **douzième route grise** : le nom de domaine est parfois déclaré directement dans l'enseigne ou le nom SIRENE public (`org_alias`, sources `sirene`, `sirene-nom`, `sirene-usuelle`, `sirene-enseigne`), alors même que la raison sociale ne contient pas de site. Ce réservoir n'avait pas été exploité : 1 040 organisations de Nouvelle-Aquitaine sans domaine portent un alias qui est lui-même un domaine, sur 984 racines distinctes, toutes sans preuve HTTP 200 dans `exposition_service`.

`scripts/expand-domains-alias-domaine.mts` extrait ces domaines, écarte les racines de plateforme, les libellés courts ou génériques, les racines déjà attribuées et les alias de personnes physiques (aucune donnée personnelle n'est écrite). Chaque domaine est ensuite **revérifié en direct** avec la preuve stricte inchangée : statut 200, racine identique après redirection, page réelle, puis identité publiée par la page elle-même — jeton distinctif du nom ou identifiant légal (SIREN/SIRET) de l'organisation. Sur 823 candidats retenus, **147 domaines vérifiés et tracés** `sirene:alias-domaine:http200` (9 020 → 9 167). Détail avec alias, racine et preuve : `bench/results/domains-from-alias-domaine.json`.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-alias-domaine -- --limit=1200 --concurrency=32 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée, puis mesure rejouée indépendamment après écriture :

```
selected=823 verified=147 applied=true
verified_domain_coverage=9020 -> 9167
coverage_percent=0.5395 -> 0.5483

organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9213
organisations_avec_domaine_verifie_et_provenance=9167
couverture_pourcent=0.5483
```

Décomposition reproductible de l'écart restant (1 662 774 organisations), sur la même base :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661482 | 1246 | 9213
```

Il reste 1 661 482 organisations sans aucune URL HTTP 200 dans le corpus consolidé des sources publiques/gratuites, et 1 246 avec une URL mais qui échouent à la preuve stricte après sept passes de réemploi. Les réservoirs sectoriels du corpus (`sources-*.jsonl`) ne portent que 27 organisations appariables ; les autres tables JSONB et les preuves SIRENE ont été instruites et sont soit déjà exploitées, soit stériles. Combler 1 662 774 organisations exigerait d'inventer des sites ou d'abaisser le standard de preuve. Aucun domaine n'a été fabriqué ; Nouvelle-Aquitaine uniquement, aucune donnée personnelle, aucun service payant.

9 tests comportement (un par comportement) dans `apps/api/test/expand-domains-alias-domaine.test.ts` ; 109 tests domaines verts au total ; typecheck `apps/api` OK ; `apps/api/src/server.ts` : 0 ligne modifiée. Manifeste `package.json` validé (`node -e JSON.parse`).

OBJECTIF : partiel — 9 167 / 1 671 941 organisations (0,5483 %), manque 1 662 774 organisations vérifiées (99,4517 %) pour atteindre 100 %

## Rattrapage — tranche t20 (2026-11-24)

Reprise depuis `origin/ext/rattrapage-rapport-domaines-na` (t19 : 9 167 / 1 671 941), seule base autorisée : la PR #797 existe mais son objectif chiffré (100 %) n'était pas atteint. Le travail des tranches t1 à t19 est conservé tel quel. La tranche t20 ajoute une **treizième route grise** : les mentions légales publiées par le site officiel déclaré dans un alias SIRENE public. Les passes t9 et t19 ne regardaient que la page d'accueil : quand celle-ci ne nomme pas l'organisation, le site peut publier son identité dans sa mention légale.

`scripts/expand-domains-mentions.mts` reprend les alias domaines des organisations de Nouvelle-Aquitaine sans domaine, écarte les personnes physiques (aucune donnée personnelle n'est écrite), exige que la page d'accueil **et** la mention légale répondent en HTTP 200 sur la même racine avec un contenu réel, puis accepte seulement deux formes d'identité publiée par le site lui-même : le SIREN ou le SIRET exact de l'organisation (au plus trois identifiants sur la page, afin d'écarter les annuaires), ou deux jetons distinctifs de son nom (hors ville). Les liens de mention légale sont pris sur la page d'accueil, avec repli sur les chemins conventionnels `/mentions-legales`, `/mentions` et `/legal`. Provenance tracée `sirene:alias-domaine:mentions-legales:http200` ; aucune écriture sans `--apply`, aucun site deviné, aucun service payant.

Sur 667 candidats retenus, **17 domaines vérifiés et tracés** (9 167 → 9 184). Détail avec l'alias, la racine, l'identifiant public et l'URL de mention légale : `bench/results/domains-from-mentions-legales.json`.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-mentions -- --limit=1200 --concurrency=24 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée (`selected=667 verified=17 applied=true`, `verified_domain_coverage=9167 -> 9184`), puis mesure rejouée indépendamment :

```
organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9230
organisations_avec_domaine_verifie_et_provenance=9184
couverture_pourcent=0.5493
```

Décomposition reproductible de l'écart restant (1 662 757 organisations), par la requête des tranches précédentes :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661465 | 1246 | 9230
```

Il reste 1 661 465 organisations sans aucune URL HTTP 200 dans le corpus consolidé des sources publiques/gratuites, et 1 246 avec une URL qui échoue encore à la preuve stricte. Les réservoirs JSONB et les corpus versionnés ont été recoupés : les sites avec SIREN de `bench/corpus/sante-enseignement.jsonl` et `institutions-complet.jsonl` ne laissent que deux racines libres, déjà mesurées sans preuve nouvelle. Combler 1 662 757 organisations exigerait d'inventer des sites ou d'abaisser le standard de preuve. Aucun domaine n'a été fabriqué ; Nouvelle-Aquitaine uniquement, aucune donnée personnelle, aucun service payant.

12 tests comportement (un par comportement) dans `apps/api/test/expand-domains-mentions.test.ts` ; 141 tests domaines verts au total ; typecheck `tsc --noEmit` de `apps/api` OK ; `apps/api/src/server.ts` : 0 ligne modifiée. Manifeste `package.json` validé (`node -e JSON.parse` et `pnpm install --frozen-lockfile --offline`).

OBJECTIF : partiel — 9 184 / 1 671 941 organisations (0,5493 %), manque 1 662 757 organisations vérifiées (99,4507 %) pour atteindre 100 %

## Rattrapage — tranche t21 (2026-11-24)

Reprise depuis `origin/ext/rattrapage-rapport-domaines-na` (t20 : 9 184 / 1 671 941), seule base autorisée : la PR #797 existe mais son objectif chiffré (100 %) n'était pas atteint. Le travail des tranches t1 à t20 est conservé tel quel. La tranche t21 ouvre une **quatorzième route grise** : les variantes de protocole et de préfixe `www` d'un domaine déclaré par un alias SIRENE public. Les passes t19 et t20 ne tentaient que `https://<domaine>/` et manquaient les sites qui ne répondent qu'en `http`, ou seulement avec le préfixe `www`.

`scripts/expand-domains-alias-variantes.mts` reprend les 657 racines d'alias encore sans domaine, essaie les quatre combinaisons du **même hôte officiel**, puis exige la preuve stricte inchangée (statut 200, racine identique après redirection, contenu réel, identité publiée par le site lui-même : jeton distinctif du nom ou identifiant légal). Sur 657 candidats, **8 domaines vérifiés et tracés** `sirene:alias-domaine:variante-hote:http200` (9 184 → 9 192) : cinq racines ne répondaient qu'en `http` et trois seulement en `https://www`. Détail avec la variante ayant répondu et les tentatives : `bench/results/domains-from-alias-variantes.json`.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-alias-variantes -- --limit=657 --concurrency=24 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée, puis mesure rejouée indépendamment après écriture :

```
selected=657 verified=8 applied=true
verified_domain_coverage=9184 -> 9192
coverage_percent=0.5493 -> 0.5498

organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9238
organisations_avec_domaine_verifie_et_provenance=9192
couverture_pourcent=0.5498
```

Décomposition reproductible de l'écart restant (1 662 749 organisations), par la requête des tranches précédentes :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661457 | 1246 | 9238
```

Il reste 1 661 457 organisations sans aucune URL HTTP 200 dans le corpus consolidé des sources publiques/gratuites, 1 246 avec une URL qui échoue encore à la preuve stricte, et 46 avec un domaine sans preuve comptable (correspondances génériques d'articles, non réparables sans fabrication). Une recherche complémentaire dans le catalogue des sources par nom d'organisation a été instruite puis abandonnée : la requête de recoupement n'a pas abouti en 300 s sur la base de production, aucun résultat n'a donc été écrit. Combler 1 662 749 organisations exigerait d'inventer des sites ou d'abaisser le standard de preuve. Nouvelle-Aquitaine uniquement, aucune donnée personnelle, aucun service payant.

5 tests comportement (un par comportement) dans `apps/api/test/expand-domains-alias-variantes.test.ts`, tous verts en exécution directe ; typecheck `tsc --noEmit` de `apps/api` OK ; `apps/api/src/server.ts` : 0 ligne modifiée. Manifeste `package.json` validé (`node -e JSON.parse` et `pnpm install --frozen-lockfile --offline`). La suite complète `tsx test/run.ts` n'a pas pu être rejouée ici : son lanceur exige un PostgreSQL de test sur `127.0.0.1:5432`, absent de cet environnement.

OBJECTIF : partiel — 9 192 / 1 671 941 organisations (0,5498 %), manque 1 662 749 organisations vérifiées (99,4502 %) pour atteindre 100 %

## Rattrapage — tranche t22 (2026-11-24)

Reprise depuis `origin/ext/rattrapage-rapport-domaines-na` (t21 : 9 192 / 1 671 941), seule base autorisée : la PR #797 existe mais son objectif chiffré (100 %) n'était pas atteint. Le travail des tranches t1 à t21 est conservé tel quel. La tranche t22 ouvre une **quinzième route grise** : les pages d'identité (`/contact`, `/a-propos`, `/qui-sommes-nous`, `/presentation`) publiées sur la racine d'un site déjà prouvé HTTP 200 par un registre public/gratuit. Les passes précédentes ne vérifiaient que la page d'accueil (t9, t10, t13) ou la mention légale des alias SIRENE (t20) : une organisation peut publier son nom sur une page secondaire sans le publier en accueil.

`scripts/expand-domains-pages-identite.mts` reprend les 591 racines d'URL officielles encore sans domaine, construit les chemins d'identité sur la **même racine** (jamais un hôte tiers), puis exige la preuve stricte inchangée (statut 200, racine identique après redirection, contenu réel, jeton distinctif du nom). La provenance est tracée `exposition-service:page-identite:http200` avec l'URL de registre, la page ayant répondu et le nombre de pages tentées. Sur 591 candidats, **44 domaines vérifiés et tracés** (9 192 → 9 236). Détail : `bench/results/domains-from-pages-identite.json`.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-pages-identite -- --limit=2000 --concurrency=32 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée (`selected=591 verified=44 applied=true`, `verified_domain_coverage=9192 -> 9236`), puis mesure rejouée indépendamment après écriture :

```
organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9282
organisations_avec_domaine_verifie_et_provenance=9236
couverture_pourcent=0.5524
```

Décomposition reproductible de l'écart restant (1 662 705 organisations), par la requête des tranches précédentes :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661457 | 1202 | 9282
```

Le bloc de 1 661 457 organisations sans aucune URL HTTP 200 dans le corpus consolidé des sources publiques/gratuites est **inchangé** : la tranche t22 n'invente aucun site, elle exploite uniquement des URL déjà prouvées par les registres. Il reste 1 202 organisations avec une URL qui échoue encore à la preuve stricte après quinze passes, et 46 avec un domaine non comptable. Combler 1 662 705 organisations exigerait d'attribuer des sites inexistants ou d'abaisser le standard de preuve. Nouvelle-Aquitaine uniquement, aucune donnée personnelle, aucun service payant.

4 tests comportement (un par comportement) dans `apps/api/test/expand-domains-pages-identite.test.ts`, tous verts en exécution directe ; typecheck `tsc --noEmit` de `apps/api` OK ; `apps/api/src/server.ts` : 0 ligne modifiée. Manifeste `package.json` validé (`node -e JSON.parse` et `pnpm install --frozen-lockfile --offline`). La suite complète `tsx test/run.ts` exige un PostgreSQL de test sur `127.0.0.1:5432`, absent de cet environnement.

OBJECTIF : partiel — 9 236 / 1 671 941 organisations (0,5524 %), manque 1 662 705 organisations vérifiées (99,4476 %) pour atteindre 100 %

## Rattrapage — tranche t23 (2026-11-24)

Reprise depuis `origin/ext/rattrapage-rapport-domaines-na` (t22 : 9 236 / 1 671 941), seule base autorisée : la PR #797 existe mais son objectif chiffré (100 %) n'est pas atteint. Le travail des tranches t1 à t22 est conservé tel quel. La tranche t23 ajoute deux routes grises sans toucher au standard de preuve (statut 200, racine stable après redirection, contenu réel, identité publiée par le site lui-même).

**t23a — identité légale sur les pages de registre.** `scripts/expand-domains-identite-legale.mts` reprend les 547 racines d'URL officielles encore sans domaine et essaie dix pages d'identité ou mentions légales non couvertes par la passe t22. Une page n'est acceptée que si elle publie le SIREN exact de l'organisation (au plus trois identifiants sur la page, pour écarter les annuaires) ou un jeton distinctif de son nom. Sur 547 candidats, **10 domaines vérifiés et tracés** `exposition-service:identite-legale:http200` (9 236 → 9 246). Détail : `bench/results/domains-from-identite-legale.json`.

**t23b — communiqués officiels versionnés.** `scripts/expand-domains-communiques.mts` lit les 16 communiqués first-party des corpus `bench/corpus/incidents-*.jsonl`. Une racine n'est retenue que si son libellé nomme l'organisation du communiqué, si une seule organisation de Nouvelle-Aquitaine sans domaine porte ce jeton, et si la racine passe la preuve stricte en direct. Sur 2 candidats appariés, **1 domaine vérifié et tracé** `corpus:communique-officiel:http200` (9 246 → 9 247). Détail : `bench/results/domains-from-communiques.json`.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-identite-legale -- --limit=2000 --concurrency=32 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-communiques -- --limit=200 --concurrency=16 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sorties observées : `selected=547 verified=10 applied=true` (`verified_domain_coverage=9236 -> 9246`), puis `selected=2 verified=1 applied=true` (`9246 -> 9247`). Mesure rejouée indépendamment après écritures :

```
organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9293
organisations_avec_domaine_verifie_et_provenance=9247
couverture_pourcent=0.5531
```

Décomposition reproductible de l'écart restant (1 662 694 organisations), par la requête des tranches précédentes :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661456 | 1192 | 9293
```

Le bloc de 1 661 456 organisations sans aucune URL HTTP 200 reste inchangé. Les autres réservoirs ont été recoupés et écartés : `org_enrichissement/domaine:lien-article` (4 racines divergentes sans `urlFinale`), `exposition_service/shodan-internetdb` (2 noms de ville sans statut HTTP), `org_history` (2 sites de groupe), `warc_proof` (33 URL d'articles), `fuite_reference` (179 faux positifs), `org_rec` (6 flux RSS) et `org.parent_evidence` (14 930 URL d'annuaire du parent) : **226 organisations** au total hors exposition_service HTTP 200, aucune ne portant la preuve stricte. Les compter exigerait d'inventer des sites ou d'abaisser le standard de preuve. Nouvelle-Aquitaine uniquement, aucune donnée personnelle, aucun service payant.

11 tests comportement, un par comportement (`apps/api/test/expand-domains-identite-legale.test.ts` : 6 tests ; `apps/api/test/expand-domains-communiques.test.ts` : 5 tests), tous verts en exécution directe ; typecheck `tsc --noEmit` de `apps/api` OK ; `apps/api/src/server.ts` : 0 ligne modifiée. Manifeste `package.json` validé (`node -e JSON.parse` et `pnpm install --frozen-lockfile --offline`).

OBJECTIF : partiel — 9 247 / 1 671 941 organisations (0,5531 %), manque 1 662 694 organisations vérifiées (99,4469 %) pour atteindre 100 %

## Rattrapage — tranche t24 (2026-11-24)

Reprise depuis `origin/ext/rattrapage-rapport-domaines-na` (t23 : 9 247 / 1 671 941), seule base autorisée : la PR #797 existe mais son objectif chiffré (100 %) n'est pas atteint. Le travail des tranches t1 à t23 est conservé tel quel. La tranche t24 ouvre une **dix-septième route grise** : les libellés des sites `P856` déjà mis en cache par les routes géographiques (t6) et du siège (t7) sont appariés aux **alias publics d'identité** (`referentiel-na`, FINESS, annuaire de l'éducation, annuaire des entreprises). Les routes précédentes appariaient le libellé entier ou le jeton de la racine : les communes dont le libellé ne nommait qu'une partie de l'alias (« Ville de X », « Mairie de X ») restaient sans domaine. Les QID déjà écrits par une route antérieure et les racines déjà attribuées sont exclus ; la preuve HTTP reste stricte et inchangée (statut 200, racine stable après redirection, contenu réel, jeton distinctif du libellé publié par la page). Aucune écriture sans `--apply`.

Sur 7 105 libellés Wikidata mis en cache et 22 308 alias publics, 436 candidats inédits ont été retenus, dont **52 sites vérifiés en direct** et tracés `wikidata:P856:alias-public:http200` (9 247 → 9 299). Détail (QID, libellé, alias, page) : `bench/results/domains-from-alias-wikidata.json`. Un résultat de dry-run n'est plus considéré comme une écriture : les QID qu'il contient restent réessayés, afin qu'une passe sans `--apply` ne consomme pas le réservoir.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-alias-wikidata -- --limit=2000 --concurrency=32 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée (`selected=436 verified=52 applied=true`, `verified_domain_coverage=9247 -> 9299`), puis mesure rejouée indépendamment après écriture :

```
organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9345
organisations_avec_domaine_verifie_et_provenance=9299
couverture_pourcent=0.5562
```

Décomposition reproductible de l'écart restant (1 662 642 organisations) :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661409 | 1187 | 9345
```

Le bloc de 1 661 409 organisations sans aucune URL HTTP 200 dans les sources publiques/gratuites est inchangé : la tranche t24 n'invente aucun site, elle ne fait que lever une ambiguïté de libellé sur des sites Wikidata déjà collectés et revérifiés en direct. Sur 9 345 organisations avec domaine, 46 échouent encore à la mesure (correspondances génériques d'articles, non réparables sans fabrication). Combler 1 662 642 organisations exigerait d'attribuer des sites inexistants ou d'abaisser le standard de preuve. Nouvelle-Aquitaine uniquement, aucune donnée personnelle lue ou écrite, aucun service payant.

8 tests comportement, un par comportement (`apps/api/test/expand-domains-alias-wikidata.test.ts`), tous verts en exécution directe ; typecheck `tsc --noEmit` de `apps/api` OK ; `apps/api/src/server.ts` : 0 ligne modifiée. Manifeste `package.json` validé (`node -e JSON.parse` et `pnpm install --frozen-lockfile --offline` après ajout de la commande).

OBJECTIF : partiel — 9 299 / 1 671 941 organisations (0,5562 %), manque 1 662 642 organisations vérifiées (99,4438 %) pour atteindre 100 %

## Rattrapage — tranche t25 (2026-11-24)

Reprise depuis `origin/ext/rattrapage-rapport-domaines-na` (t24 : 9 299 / 1 671 941), seule base autorisée : la PR #797 existe toujours mais son objectif chiffré (100 %) n'est pas atteint. Le travail des tranches t1 à t24 est conservé tel quel. La tranche t25 ajoute deux routes grises distinctes, sans toucher au standard de preuve (statut 200, racine stable après redirection, page réelle, identité publiée par le site lui-même).

**t25a — identité dans les métadonnées de la page.** Sur les 1 187 organisations de Nouvelle-Aquitaine qui disposent d'une URL déjà prouvée HTTP 200 par un registre public mais que la mesure ne comptait pas, 533 candidats passent le filtre de racine non attribuée. `scripts/expand-domains-identite-structuree.mts` lit uniquement les emplacements d'identité explicites (`title`, `og:site_name`, `name`/`legalName` JSON-LD), exige un jeton distinctif du nom **dans la racine du domaine** et dans l'identité publiée, puis revérifie la page en direct. Un seul site passe : la commune de Messanges (`messanges40.fr`, `exposition-service:identite-structuree:http200`). Détail : `bench/results/domains-from-identite-structuree.json`.

**t25b — corpus d'observations TLS/DMARC.** `bench/corpus/security-observations-na.jsonl` (163 lignes, domaines publics observés le 22 novembre par `collect-security-signals.mts`) n'avait jamais été lu par une route d'expansion. Après exclusion des sous-domaines et des racines déjà attribuées, 148 racines restent ; `scripts/expand-domains-securite.mts` n'accepte qu'un appariement sans ambiguïté entre un jeton distinctif de la racine et le nom d'une organisation sans domaine, puis applique la même preuve stricte en direct. Deux sites sont vérifiés : GYRAX (`gyrax.fr`) et MAGENDIE (`magendie.fr`), tracés `corpus:observations-securite:http200`. Détail : `bench/results/domains-from-securite.json`.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-identite-structuree -- --limit=2000 --concurrency=24 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-securite -- --limit=500 --concurrency=16 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sorties observées, puis mesure rejouée indépendamment après écritures :

```
selected=533 verified=1 applied=true
verified_domain_coverage=9299 -> 9300
observations=148 selected=2 verified=2 applied=true
verified_domain_coverage=9300 -> 9302

organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9348
organisations_avec_domaine_verifie_et_provenance=9302
couverture_pourcent=0.5564
```

Décomposition reproductible de l'écart restant (1 662 639 organisations), sur la même base :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661407 | 1186 | 9348
```

Un recoupement exhaustif des tables porteuses d'URL montre 15 974 organisations sans domaine avec une preuve URL ailleurs que dans `exposition_service` HTTP 200 : `parent_evidence` (14 930 URL d'annuaires du parent), `org_alias` (924), `event_archive` (58 avis de sécurité), `leak_claim` (51), `warc_proof` (33) et quelques tables résiduelles. Aucun de ces réservoirs ne contient le site officiel de l'organisation : les compter reviendrait à fabriquer une attribution ou à abaisser le standard de preuve. Il reste donc 1 661 407 organisations sans aucune URL HTTP 200 et 1 186 avec une URL qui échoue à la preuve stricte après dix-neuf passes. La cible de 100 % n'est pas livrable avec des sources publiques/gratuites et une preuve vérifiée ; elle reste mesurée ici sans fabrication. Nouvelle-Aquitaine uniquement, aucune donnée personnelle lue ou écrite, aucun service payant.

17 tests comportement, un par comportement (`apps/api/test/expand-domains-identite-structuree.test.ts` : 9 tests ; `apps/api/test/expand-domains-securite.test.ts` : 8 tests), tous verts en exécution directe ; typecheck `tsc --noEmit` de `apps/api` OK ; `apps/api/src/server.ts` : 0 ligne modifiée. Manifeste `package.json` validé (`node -e JSON.parse` et `pnpm install --frozen-lockfile --offline` après ajout des deux commandes).

OBJECTIF : partiel — 9 302 / 1 671 941 organisations (0,5564 %), manque 1 662 639 organisations vérifiées (99,4436 %) pour atteindre 100 %

## Rattrapage — tranche t26 (2026-11-24)

Reprise depuis `origin/ext/rattrapage-rapport-domaines-na` (t25 : 9 302 / 1 671 941), seule base autorisée : la PR #797 existe toujours mais son objectif chiffré (100 %) n'est pas atteint. Le travail des tranches t1 à t25 est conservé tel quel. La tranche t26 ouvre une **vingtième route grise** : les URL officielles des 167 corpus sectoriels versionnés `bench/corpus/sources-*.jsonl` (5 117 lignes, 5 102 entrées exploitables, 1 728 racines distinctes : agriculture, banque, bâtiment, collectivités, commerce, énergie, industrie, juridique, numérique, santé, transport...). La route du catalogue (t18b/t23) ne lisait que `sources-na-population.jsonl` (mairies et établissements scolaires) et n'appariait que des désignations explicites.

`scripts/expand-domains-corpus-sectoriel.mts` n'accepte une entrée que si son libellé, normalisé sans accents, nomme **exactement** une organisation sans domaine du même département, et une seule (les homonymes comme les quatre `AXA` de la 64 sont écartés). Les racines de plateformes tierces (`sites.google.com`, `index-education.net`, ...), les racines déjà attribuées et les redirections hors racine sont rejetées. La preuve stricte reste inchangée : HTTP 200 en direct, racine stable après redirection, page de plus de 150 caractères, hors parking, jeton distinctif du nom de l'organisation. Sur 33 candidats retenus, **30 sites ont été revérifiés en direct** et tracés `source:corpus-sectoriel:http200` (9 302 → 9 332). Détail complet (organisation, racine, page, corpus, libellé) : `bench/results/domains-from-corpus-sectoriel.json`.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-corpus-sectoriel -- --limit=200 --concurrency=16 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sorties observées (`selected=33 verified=30 applied=true`, `verified_domain_coverage=9302 -> 9332`), puis mesure rejouée indépendamment après écritures :

```
organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9378
organisations_avec_domaine_verifie_et_provenance=9332
couverture_pourcent=0.5582
```

Décomposition reproductible de l'écart restant (1 662 609 organisations), sur la même base :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661377 | 1186 | 9378
```

Sur les 9 378 organisations avec domaine, 46 échouent encore à la mesure (correspondances génériques d'articles, non réparables sans fabrication). Le bloc de 1 661 377 organisations sans aucune URL HTTP 200 est structurel : le recoupement des tables porteuses d'URL (t25, confirmé ici) ne trouve que 15 974 organisations sans domaine avec une URL ailleurs que dans `exposition_service` HTTP 200, toutes issues d'annuaires parents, d'alias d'identité ou d'articles, sans site officiel prouvé. Les 1 186 autres ont une URL qui échoue à la preuve stricte après vingt passes. Atteindre 1 671 941 exigerait d'attribuer plus de 1,66 million de sites inexistants ou d'abaisser le standard de preuve : la cible de 100 % n'est pas livrable avec des sources publiques/gratuites et une preuve vérifiée. Aucune donnée personnelle, aucun service payant, Nouvelle-Aquitaine uniquement.

12 tests comportement, un par comportement (`apps/api/test/expand-domains-corpus-sectoriel.test.ts`), tous verts en exécution directe ; typecheck `tsc --noEmit` de `apps/api` OK ; `apps/api/src/server.ts` : 0 ligne modifiée. Manifeste `package.json` validé après ajout de la commande (`node -e JSON.parse` et `pnpm install --frozen-lockfile --offline`).

OBJECTIF : partiel — 9 332 / 1 671 941 organisations (0,5582 %), manque 1 662 609 organisations vérifiées (99,4418 %) pour atteindre 100 %

## Rattrapage — tranche t27 (2026-11-24)

Reprise depuis `origin/ext/rattrapage-rapport-domaines-na` (t26 : 9 332 / 1 671 941), seule base autorisée : la PR #797 existe toujours mais son objectif chiffré (100 %) n'est pas atteint. Le travail des tranches t1 à t26 est conservé tel quel. La tranche t27 ouvre une vingt-et-unième route grise : les **annuaires officiels versionnés** (`institutions-complet.jsonl` de l'éducation, `sante-enseignement.jsonl`, `communes.jsonl`) publient le SIREN, le nom de l'établissement et l'URL de son site. Sur 1 741 entrées exploitables, **32 organisations de Nouvelle-Aquitaine sans domaine** portent exactement un de ces SIREN publics. `scripts/expand-domains-siren-officiel.mts` exige en outre la concordance du département, un mot distinctif du libellé officiel (pas un type d'établissement ni une ville), une racine tierce exclue et l'absence d'un chemin qui ne nomme pas l'établissement. Une racine déjà attribuée à une autre organisation est acceptée seulement ici parce que le SIREN officiel et la page dédiée identifient l'organisation visée ; une seule organisation par SIREN et par racine est retenue par passe.

La preuve stricte reste inchangée : HTTP 200 en direct, racine stable après redirection, page de plus de 150 caractères, hors parking, libellé officiel publié par la page. Sur 21 candidats retenus, **19 domaines ont été revérifiés en direct** et tracés `source:annuaire-officiel:siren:http200` (9 332 → 9 351). Détail (SIREN, organisation, racine, page) : `bench/results/domains-from-annuaire-officiel.json`. Le SIREN est un identifiant légal d'organisation, jamais une donnée personnelle ; aucune URL n'a été devinée.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-siren-officiel -- --limit=200 --concurrency=16 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sorties observées (`selected=21 verified=19 applied=true`, `verified_domain_coverage=9332 -> 9351`), puis mesure rejouée indépendamment après écriture :

```
organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9397
organisations_avec_domaine_verifie_et_provenance=9351
couverture_pourcent=0.5593
```

Décomposition reproductible de l'écart restant (1 662 590 organisations), sur la même base :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661373 | 1171 | 9397
```

Le recoupement des tables porteuses d'URL (t25, rejoué ici sur `source`, `source_verification`, `org_nis2_reference_siren`, `exposition_risque`, `dns_domaine`, `asset`, `org_alias`, `parent_evidence`, `event_archive`, `leak_claim`, `warc_proof`) ne révèle aucun autre réservoir rattachable : 1 661 373 organisations n'ont aucune URL HTTP 200 dans les sources publiques/gratuites et 1 171 ont une URL qui échoue à la preuve stricte après vingt-et-une passes. Les 46 organisations avec domaine non comptable sont des correspondances génériques d'articles, non réparables sans fabrication. Combler 1 662 590 organisations exigerait d'attribuer des sites inexistants ou d'abaisser le standard de preuve. Nouvelle-Aquitaine uniquement, aucune donnée personnelle, aucun service payant.

14 tests comportement, un par comportement (`apps/api/test/expand-domains-siren-officiel.test.ts`), tous verts en exécution directe ; typecheck `tsc --noEmit` de `apps/api` OK ; `apps/api/src/server.ts` : 0 ligne modifiée. Manifeste `package.json` validé après ajout de la commande (`node -e JSON.parse` et `pnpm install --frozen-lockfile --offline`).

OBJECTIF : partiel — 9 351 / 1 671 941 organisations (0,5593 %), manque 1 662 590 organisations vérifiées (99,4407 %) pour atteindre 100 %

## Rattrapage — tranche t28 (2026-11-24)

Reprise depuis `origin/ext/rattrapage-rapport-domaines-na` (t27 : 9 351 / 1 671 941), seule base autorisée : la PR #797 existe toujours mais son objectif chiffré (100 %) n'est pas atteint. Le travail des tranches t1 à t27 est conservé tel quel. La tranche t28 ouvre une vingt-deuxième route grise, inexploitée par les expansions précédentes : l'export versionné `bench/results/registry-id-sites-2026-11-22.tsv` (1 910 paires SIRET data.inclusion / FINESS OSM → site public). `scripts/expand-domains-registre.mts` n'accepte une paire que si l'identifiant légal public apparie exactement une organisation de Nouvelle-Aquitaine sans domaine, si un mot distinctif de sa raison sociale figure à la fois dans l'hôte et dans le titre de la page, et si sa racine n'est ni une place de marché ni un hébergeur. Les libellés ambigus (mot partagé par deux organisations retenues, variante `(4)` d'un groupe) sont écartés.

La preuve stricte reste inchangée : HTTP 200 en direct, racine stable après redirection, page de plus de 150 caractères, hors parking, identité publiée par le titre et le corps. Sur 74 candidats retenus, **11 domaines ont été revérifiés en direct** et tracés `source:registre-identifiant:http200` (9 351 → 9 362). Détail (identifiant, organisation, racine) : `bench/results/domains-from-registre.json`. Le SIRET et le FINESS sont des identifiants d'organisation, jamais des données personnelles ; aucune URL n'a été devinée.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-registre -- --limit=500 --concurrency=24 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sorties observées (`selected=74 verified=11 applied=true`, `verified_domain_coverage=9351 -> 9362`), puis mesure rejouée indépendamment après écriture :

```
organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9408
organisations_avec_domaine_verifie_et_provenance=9362
couverture_pourcent=0.5599
```

Décomposition reproductible de l'écart restant (1 662 579 organisations), sur la même base :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661362 | 1171 | 9408
```

Le recoupement des tables porteuses d'URL (t25/t27, rejoué en t28) ne révèle aucun autre réservoir rattachable : 1 661 362 organisations n'ont aucune URL HTTP 200 dans les sources publiques/gratuites et 1 171 ont une URL qui échoue à la preuve stricte après vingt-deux passes. Combler 1 662 579 organisations exigerait d'attribuer des sites inexistants ou d'abaisser le standard de preuve. Nouvelle-Aquitaine uniquement, aucune donnée personnelle, aucun service payant.

12 tests comportement, un par comportement (`apps/api/test/expand-domains-registre.test.ts`), tous verts en exécution directe ; typecheck `tsc --noEmit` de `apps/api` OK ; `apps/api/src/server.ts` : 0 ligne modifiée ; manifeste `package.json` validé après ajout de la commande (`node -e JSON.parse` et `pnpm install --frozen-lockfile --offline`).

OBJECTIF : partiel — 9 362 / 1 671 941 organisations (0,5599 %), manque 1 662 579 organisations vérifiées (99,4401 %) pour atteindre 100 %

## Rattrapage — tranche t29 (2026-11-24)

La PR #797 existait mais son objectif chiffré (100 %) n'était pas atteint : la tranche t29 poursuit depuis `origin/ext/rattrapage-rapport-domaines-na` (t28 : 9 362 / 1 671 941). Le travail des tranches précédentes est conservé tel quel.

Nouvelle route grise : les sites d'établissement indexés par **UAI** (identifiant public d'enseignement, propriété Wikidata P3202) dans l'export versionné `bench/results/wikidata-id-sites-2026-11-22.tsv`. `scripts/expand-domains-uai.mts` ne retient que les lignes `uai`, exige un `entity_code` strictement égal à l'UAI publiée, une organisation de Nouvelle-Aquitaine sans domaine, une racine non encore attribuée et l'exclusion des racines de plateforme (académies, Pronote, hébergeurs). La preuve HTTP reste stricte et revérifiée en direct (statut 200, racine stable après redirection, contenu réel, jeton distinctif du nom dans le corps et le titre de la page). Sur 11 249 lignes UAI exploitables, 102 organisations NA sans domaine portaient exactement l'UAI publiée, 44 racines restaient éligibles et **1 site a passé la preuve** : `lyceedesgraves.fr` (UAI `0332846P`, Lycée des Graves), tracé `wikidata:P3202:uai:http200`. Détail : `bench/results/domains-from-uai.json`. Une seconde passe, après exclusion des racines de plateforme, ne trouve plus aucun candidat vérifiable : ce réservoir est épuisé.

Commandes reproductibles :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:etendre-uai -- --limit=1000 --concurrency=16 --apply
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sortie observée, puis mesure rejouée indépendamment :

```
selected=32 verified=1 applied=true
verified_domain_coverage=9362 -> 9363
coverage_percent=0.5599 -> 0.56

organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9409
organisations_avec_domaine_verifie_et_provenance=9363
couverture_pourcent=0.56
```

Décomposition reproductible de l'écart restant (1 662 578 organisations), sur la même base :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661361 | 1171 | 9409
```

Il reste 1 661 361 organisations de Nouvelle-Aquitaine sans domaine **et sans aucune URL HTTP 200** dans le corpus consolidé des sources publiques/gratuites, et 1 171 avec une URL qui échoue à la preuve stricte. Les autres réservoirs SQL encore non exploités (événements, archives d'événements, réclamations de fuite, preuves WARC) ne concernent que 58, 51, 34 et 33 organisations et pointent vers des articles ou des places de marché, sans racine de site propre ; le corpus de recherche locale (85 lignes) ne s'apparie à aucune organisation sans domaine. Combler 1 662 578 organisations exigerait d'inventer des sites ou d'abaisser le standard de preuve. Nouvelle-Aquitaine uniquement, aucune donnée personnelle, aucun service payant.

13 tests comportement, un par comportement (`apps/api/test/expand-domains-uai.test.ts`), tous verts ; typecheck `tsc --noEmit` de `apps/api` OK ; `apps/api/src/server.ts` : 0 ligne modifiée ; manifeste `package.json` validé après ajout de la commande (`pnpm install --frozen-lockfile --offline`).

OBJECTIF : partiel — 9 363 / 1 671 941 organisations (0,5600 %), manque 1 662 578 organisations vérifiées (99,4400 %) pour atteindre 100 %


## Rattrapage — tranche t30 (2026-11-24) : mesure de non-atteignabilité

La PR #797 est toujours ouverte et son objectif chiffré (100 %) n'est pas atteint : la tranche t29 livrait 9 363 / 1 671 941. Reprise depuis `origin/ext/rattrapage-rapport-domaines-na`, seule base autorisée ; le travail des tranches t1 à t29 est conservé tel quel. Aucune nouvelle écriture n'a été faite en base : aucune route grise supplémentaire ne peut produire un domaine vérifié sans fabriquer une attribution.

Mesure rejouée sur la base courante, sans modification de code :

```sh
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

```
organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9409
organisations_avec_domaine_verifie_et_provenance=9363
couverture_pourcent=0.56
```

Nouvelle route instruite puis écartée : les 11 569 lignes `siret` de l'export Wikidata versionné `bench/results/wikidata-id-sites-2026-11-22.tsv`, appariées exactement au SIREN public d'une organisation de Nouvelle-Aquitaine sans domaine (46 organisations, 34 racines encore libres). La revérification stricte en direct (statut 200, racine stable, contenu réel, SIREN ou SIRET publié par la page) n'a retenu **aucun** site : 30 candidats examinés, 0 vérifié — réponses 403 anti-robot, échecs DNS, pages de parking (contenu sans titre ni identité) et redirections hors racine. Le croisement avec les 66 paires déjà rattachées à un service du même export (`services-wikidata-id-2026-11-22.json`) donne le même résultat : 4 candidats, 0 vérifié. Aucun de ces sites n'a été compté : la route est documentée comme épuisée, sans laisser de code mort.

Décomposition reproductible de l'écart restant (1 662 578 organisations) :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661361 | 1171 | 9409
```

Les 9 409 organisations avec domaine incluent 46 preuves non comptables : 14 correspondances génériques issues d'articles (`DELL`, `SHELL`, `AIRBUS`, ...) et des enregistrements incomplets ou fictifs (`injection-sc-*.example.invalid`). Les « réparer » reviendrait à fabriquer une attribution : elles restent hors numérateur. Les 1 661 361 organisations sans aucune URL HTTP 200 et les 1 171 dont l'URL échoue à la preuve stricte ne peuvent être couvertes qu'en inventant des sites ou en abaissant le standard de preuve. La cible de 100 % n'est donc pas livrable avec les sources publiques/gratuites autorisées ; aucune donnée personnelle, aucun service payant, `apps/api/src/server.ts` inchangé, aucun test ajouté puisqu'aucun comportement n'a changé.

OBJECTIF : partiel — 9 363 / 1 671 941 organisations (0,5600 %), manque 1 662 578 organisations vérifiées (99,4400 %) pour atteindre 100 %

## Rattrapage — tranche t31 (2026-11-24) : domaines municipaux du référentiel territorial

La PR #797 est toujours ouverte et son objectif chiffré (100 %) n'est pas atteint : la tranche t30 livrait 9 363 / 1 671 941. Reprise depuis `origin/ext/rattrapage-rapport-domaines-na`, seule base autorisée ; le travail des tranches t1 à t30 est conservé tel quel.

Nouvelle route grise : le référentiel territorial versionné `db/data/referentiel-na.json` (4 517 communes des 12 départements de Nouvelle-Aquitaine, avec SIREN, code postal et département). `scripts/expand-domains-communes-na.mts` ne retient qu'une organisation sans domaine dont le nom désigne explicitement la commune (« Commune de », « Mairie de », « Ville de »), dans le même département. Quatre motifs publics sont essayés en passes successives : `<commune>.fr`, `mairie-<commune>.fr`, `<commune>-mairie.fr`, `ville-<commune>.fr`. La preuve live reste stricte : HTTP 200 final sur la racine attendue, contenu réel, nom de la commune dans la page, vocabulaire municipal et ancre locale (code postal ou nom du département, sans code départemental contradictoire). Une racine déjà attribuée à une autre fiche n'est jamais réemployée ; une seule racine par commune, une seule écriture par organisation. Aucun site n'est deviné au sens « attribué sans preuve » : chaque domaine accepté a été revérifié en direct et porte code commune, URL source et URL finale dans sa provenance.

Commandes reproductibles (quatre passes, puis mesure indépendante) :

```sh
for motif in slug mairie slug-mairie ville; do
  DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar \
    pnpm domaines:etendre-communes-na -- --motif=$motif --limit=2000 --concurrency=32 --apply
done
DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm domaines:mesurer
```

Sorties observées (détail : `bench/results/domains-from-communes-na-{slug,mairie,slug-mairie,ville}.json`) :

```
selected=1747 verified=65 applied=true   # 9363 -> 9428 (racine <commune>.fr)
selected=1696 verified=7  applied=true   # 9428 -> 9435 (racine mairie-<commune>.fr)
selected=1698 verified=0  applied=true   # 9435 -> 9435 (racine <commune>-mairie.fr)
selected=1697 verified=0  applied=true   # 9435 -> 9435 (racine ville-<commune>.fr)

organisations_total=1673270
organisations_nouvelle_aquitaine=1671941
organisations_avec_domaine=9481
organisations_avec_domaine_verifie_et_provenance=9435
couverture_pourcent=0.5643
```

Soit **72 domaines supplémentaires vérifiés et tracés** (Cellefrouin, Lésignac-Durand, Londigny, Fontenille, Mesnac, Mouton, …), tous en Nouvelle-Aquitaine, sans donnée personnelle ni service payant.

Deux inventaires indépendants confirment l'absence de réservoir matériel restant :

- corpus locaux : aucun fichier versionné non consommé n'apparie un nom d'organisation et une URL de site sur plus de 50 lignes. Les seuls fichiers inexploités sont des catalogues de presse (`presse.jsonl`, `articles-presse-na.jsonl`) dont les racines (`actu.fr`, `sudouest.fr`, …) sont des titres de médias, pas les sites des organisations nommées dans les articles, et un extrait de 116 lignes déjà couvert par `institutions-complet.jsonl` ;
- base PostgreSQL : `fuite_reference.domain` ne concerne que 178 organisations par nom exact et porte des domaines de services de fuite (`*.com` internationaux), `quarantine_raw.source_url` 836 organisations mais uniquement des URL `github.com`/`raw.githubusercontent.com`, `org.parent_evidence` 14 930 organisations mais uniquement l'URL de l'API recherche-entreprises (sans champ site web), et `exposition_service` 1 169 organisations supplémentaires dont l'URL échouait déjà à la preuve stricte. Les autres tables (événements, archives, réclamations de fuite, preuves WARC, DNS) totalisent moins de 150 organisations chacune et pointent vers des articles ou des places de marché.

Décomposition reproductible de l'écart restant (1 662 506 organisations), sur la même base :

```sh
PGPASSWORD=radar psql -h 127.0.0.1 -p 5433 -U radar -d radar -c "
SELECT count(*) FILTER (WHERE coalesce(o.domain,'')='' AND NOT EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_sans_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')='' AND EXISTS (
         SELECT 1 FROM exposition_service e WHERE e.org_id=o.id AND e.evidence->>'status'='200')) AS sans_domaine_avec_200,
       count(*) FILTER (WHERE coalesce(o.domain,'')<>'') AS avec_domaine
FROM org o WHERE o.dept = ANY(ARRAY['16','17','18','19','23','24','33','40','47','64','79','86','87']);"
-- 1661304 | 1156 | 9481
```

Il reste donc 1 661 304 organisations de Nouvelle-Aquitaine sans domaine **et sans aucune URL HTTP 200** dans le corpus consolidé, et 1 156 dont l'URL échoue à la preuve stricte après trente et une passes. Les quatre motifs municipaux ajoutent 72 sites réels mais n'épuisent pas cet écart : les 1 661 304 organisations restantes n'ont ni site public identifiable ni ancre locale vérifiable. Les couvrir exigerait d'inventer des domaines ou d'abaisser le standard de preuve, ce qui détruirait la garantie « vérifié avec provenance ».

13 tests comportement, un par comportement (`apps/api/test/expand-domains-communes-na.test.ts`), tous verts ; typecheck `tsc --noEmit` de `apps/api` OK ; `apps/api/src/server.ts` : 0 ligne modifiée ; manifeste `package.json` validé (`JSON.parse` et `pnpm install --frozen-lockfile --offline`).

OBJECTIF : partiel — 9 435 / 1 671 941 organisations (0,5643 %), manque 1 662 506 organisations vérifiées (99,4357 %) pour atteindre 100 %

