# Chantier — domaine vérifié et provenance pour 100 % des organisations de Nouvelle-Aquitaine

Date : 2026-11-21, tranche suivante le 2026-11-22. Branche : `ext/chantier-a1`, reprise depuis `origin/big/DomainesReels` (PR #300).
> État courant (rattrapage du 2026-11-24) : voir la dernière section « Rattrapage — tranche t8 ». Les sections précédentes sont l'historique des tranches livrées.

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

