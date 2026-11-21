# Précision des rattachements existants — échantillon de 100

Mesure du 2026-11-21 sur la base live `postgres://radar:radar@localhost:5432/radar`.
Question : sur les rattachements **déjà posés** (`event.org_id`), combien sont justes ?

## Résultat

| Mesure | Valeur |
|---|---:|
| Rattachements existants dans la base | 115 |
| Échantillon vérifié à la main | 100 (graine 20261121) |
| **Justes** (exactes + partielles) | **52 / 100 (52.0 %)** |
| Précision au protocole de la vague (partielle = ½) | **52.0 %** |
| Exactes / partielles / hors_sujet / indécidables | 51 / 1 / 47 / 1 |
| Dont organisations synthétiques créées depuis la revendication | 27 |
| Justes sur des organisations indépendantes | 25 / 100 |

Dénominateur de la précision : exactes + partielles + hors_sujet ; les indécidables en sortent et sont comptés à part.

## Protocole

- Population : tous les événements de event portant un org_id non nul (115 liens).
- Tirage : tirage aléatoire sans remplacement (mulberry32, graine consignée), tri par id pour l'affichage.
- Chaque verdict a été posé à la main sur au moins deux sources recoupées :
  - événement (titre, résumé, evidence, source_url);
  - table source (flux d'origine);
  - journal (alias, motif, moteur ayant posé le lien);
  - table org (nom, domaine, SIREN, commune);
  - registre public recherche-entreprises.api.gouv.fr;
  - site cité par l'événement (domaine du titre ou de la description, article relié) et site de l'organisation;
- exacte = l'org désignée est celle que le texte vise ; partielle = bonne enseigne/groupe, mauvaise entité ; hors_sujet = aucune relation réelle ; indecidable = les sources ne tranchent pas. Précision = (exacte + partielle/2) / (exacte + partielle + hors_sujet), indécidables hors dénominateur.
- Le script ne compare aucun nom par programme : un verdict sans preuve collectée est refusé.

## Répartition par flux

| Flux | Échantillon | Justes |
|---|---:|---:|
| ransomlook | 60 | 40 (66.7 %) |
| leak | 16 | 10 (62.5 %) |
| gn-17 | 3 | 1 (33.3 %) |
| presse-france3-na | 3 | 1 (33.3 %) |
| cert_fr | 2 | 0 (0.0 %) |
| cat-circl-news | 2 | 0 (0.0 %) |
| cat-ncsc-nl-advisories | 2 | 0 (0.0 %) |
| cert-fr-alerte | 2 | 0 (0.0 %) |
| presse-sudouest-pyrenees | 2 | 0 (0.0 %) |
| presse-sudouest | 2 | 0 (0.0 %) |
| cat-cert-at-blog | 1 | 0 (0.0 %) |
| eco-dordogne-libre | 1 | 0 (0.0 %) |
| gn-79 | 1 | 0 (0.0 %) |
| gn-fuite-metropoles | 1 | 0 (0.0 %) |
| cat-cert-at-warnings | 1 | 0 (0.0 %) |
| presse-sudouest-charente | 1 | 0 (0.0 %) |

## Les 10 erreurs les plus instructives

| # | Événement | Lien posé | Verdict | Ce que montre le recoupement |
|---|---|---|---|---|
| 82931 | iledefrance-nature.fr — revendiqué par lockbit3 | NATURE ET PROGRES ILE DE FRANCE | hors_sujet | Le titre cite iledefrance-nature.fr, mais le site affiche « Île-de-France Nature » (agence régionale) ; l'org NATURE ET PROGRES ILE DE FRANCE porte ce domaine erroné du référentiel : mauvais titulaire du domaine. |
| 848 | Angel One - 6,765,054 breached accounts | lyon.co.uk | hors_sujet | L'article HIBP parle d'Angel One, courtier indien ; l'org lyon.co.uk est un hint de quarantaine et son site affiche « Lyon Equipment », sans rapport. Le hint a été réutilisé d'une autre revendication. |
| 51151 | Multiples vulnérabilités dans F5 NGINX (18 novembre 2026) | OPEN SOURCE | hors_sujet | L'avis CERT-FR porte sur F5 NGINX ; l'org OPEN SOURCE (BORDEAUX, registre) est une société locale. Le journal ne montre aucun motif : le mot « open source » du titre a servi de clé. |
| 3690 | BAE Exchange — revendiqué par the gentlemen | PORT LOUIS | hors_sujet | Le descriptif situe BAE Exchange à Port Louis (Maurice) et le site baexchange.mu confirme ; l'org PORT LOUIS est une société de LACANAU (registre, SIREN 999033715) : homonyme toponymique. |
| 112417 | Charente et Charente-Maritime : le cognac renouvelle ses instances sous un ciel toujours l | ETS VIVIER LEGRAND | hors_sujet | L'article vise le BNIC (Bureau national interprofessionnel du cognac) ; le journal montre l'alias « au bureau » et un arbitrage par département qui mène à ETS VIVIER LEGRAND (ANGOULEME, registre) : expression grammaticale, pas enseigne. |
| 24227 | Cyberattaque dans des supermarchés : qu’est-ce que Shahid Kaveh, l’armée de l’ombre iranie | MAISON HEBRARD | hors_sujet | Le texte vise Shahid Kaveh et les supermarchés ; le journal révèle l'alias « a l origine », simple expression, et l'org MAISON HEBRARD (HAUX, registre) est sans rapport. |
| 118380 | Polynésie française : à bord d’un Falcon 50 de la Marine nationale pour surveiller la plus | A BORD .. | hors_sujet | L'article décrit un vol à bord d'un Falcon 50 en Polynésie ; l'org « A BORD .. » (ANDILLY, registre 395382617) est une entreprise dont le nom reprend l'expression « à bord » du titre. |
| 128330 | COP31 en Turquie : les négociations sur le climat s’enlisent, sans compromis en vue | EN VUE | hors_sujet | L'article traite de la COP31 en Turquie ; le journal montre l'alias « en vue », expression de la dernière phrase, et l'org EN VUE (CREON, registre 389013160) est un studio photo sans lien. |
| 3729 | National Investments Company — revendiqué par the gentlemen | FAHAD ABDUL | hors_sujet | La victime est National Investments Company (ninv.com) ; l'org FAHAD ABDUL correspond à un nom de personne lu dans le descriptif (registre : ABDUL FAHAD, NIORT), pas à l'entité visée. |
| 128977 | Incidents de sécurité dans les pare-feux SonicWall (05 août 2025) | PARTIE SON | hors_sujet | L'avis CERT-FR porte sur SonicWall et une « partie » du communiqué ; l'org PARTIE SON (SAINTE-EULALIE, registre 789574399) est une société locale issue du fragment « partie son ». |

## Limites

- 27 des 51 exactes pointent vers une organisation synthétique créée depuis le hint de la propre revendication (`entity_source = hint:quarantine`) : le libellé est exact, mais la vérification est tautologique. Sans elles : 25 justes sur 100.
- 1 seul cas indécidable est écarté du dénominateur ; en le comptant comme échec, la précision serait de 51.5 %.
- La population ne compte que 115 liens ; 15 n'ont pas été tirés, et la base continue d'évoluer : ce chiffre est un instantané du 2026-11-21.
- La mesure porte sur les liens présents dans `event.org_id`, pas sur les rattachements proposés par le moteur aux indices de quarantaine (campagne distincte, voir docs/mesure-precision.md).

## Rejouer

```bash
apps/api/node_modules/.bin/tsx scripts/precision-rattachement.mts --web
apps/api/node_modules/.bin/tsx scripts/precision-rattachement.mts --dossier --de=1 --a=20
apps/api/node_modules/.bin/tsx scripts/precision-rattachement.mts
```

Tirage, preuves et verdicts : `bench/precision/rattachements-echantillon.json` ; verdicts manuels : `bench/precision/rattachements-verdicts.json`.
