# Couverture par secteur — mesure du 2026-11-21

Script : `apps/api/node_modules/.bin/tsx scripts/couverture-secteurs.mts`.
Corpus : `bench/fixtures/corpus-reference-na.json` (fenêtre 2025-11-01 → 2026-10-31,
60 incidents). Organisations : 1 673 151 lignes de `org`,
1 678 185 alias actifs. Lecture seule. **Chaque nombre ci-dessous est calculé par le script** ; les règles de classement sont écrites dans le script et reprises en fin de document.

## Résultat

| Secteur | Faits | Vus | Bon secteur | Rappel juste | Intervalle 95 % | Org / dont avec alias | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| public | 4 | 3 | 0 | 0 % | 0 – 49 % | 3 384 / 3 384 | invisible |
| santé | 8 | 5 | 3 | 37.5 % | 14 – 69 % | 82 982 / 82 683 | partiel |
| industrie | 3 | 3 | 0 | 0 % | 0 – 56 % | 60 328 / 58 979 | invisible |
| commerce | 10 | 8 | 2 | 20 % | 6 – 51 % | 175 593 / 172 586 | partiel |
| enseignement | 4 | 4 | 2 | 50 % | 15 – 85 % | 44 258 / 42 429 | partiel |
| collectivités | 6 | 5 | 5 | 83.3 % | 44 – 97 % | 4 477 / 4 467 | bien vu |

« Bon secteur » compte les rattachements à une organisation du même secteur :
un incident vu mais rattaché à un autre secteur n'est pas une couverture.
L'intervalle est celui de Wilson (95 %) sur ce rappel juste ; sur moins de dix
faits il dit l'incertitude au lieu de la masquer.

Un « bon secteur » n'est pas une « bonne entité » : un magasin du même réseau
dans une autre ville compte ici comme juste ; le détail ci-dessous le montre.

La colonne « Org / dont avec alias » compte les lignes de `org` et celles qui
ont au moins un alias actif ; le nom de l'organisation étant lui-même un alias,
un écart y signale des lignes importées sans alias exploitable.

Le verdict est calculé : `invisible` si aucun fait n'est rattaché au bon
secteur, `bien vu` si au moins 60 % le sont sur trois faits ou plus,
`partiel` sinon, `non mesurable` si le corpus n'a aucun fait dans le secteur.

## Ce qui est bien vu

- **collectivités** — 5/6 au bon secteur (83.3 %), 4 477 organisation(s) au référentiel.

## Ce qui est partiel

- **santé** — 3/8 au bon secteur (37.5 %), 82 982 organisation(s) au référentiel.
- **commerce** — 2/10 au bon secteur (20 %), 175 593 organisation(s) au référentiel.
- **enseignement** — 2/4 au bon secteur (50 %), 44 258 organisation(s) au référentiel.

## Ce qui est invisible

- **public** — 0/4 au bon secteur (0 %), 3 384 organisation(s) au référentiel.
- **industrie** — 0/3 au bon secteur (0 %), 60 328 organisation(s) au référentiel.

## Ce qui est non mesurable

Aucun secteur dans ce cas.

## Pourquoi

### public — invisible

Sur 4 fait(s) dans la fenêtre, 3 a (ont) été rattaché(s) à une organisation et 0 au bon secteur (0 %). Refus motivés : aucun × 1. Secteurs des organisations trouvées : sante/sante × 1, autre/null × 2. Référentiel : 3 384 organisation(s), dont 3 384 avec au moins un alias.

Le corpus n'a pas de type `public` : les faits comptés ici viennent du type `autre` passé par le lexique (ministère, SDIS, office national, union nationale). Le référentiel n'a pas de `kind='public'` non plus : le proxy est `sector='administration'`, et les SDIS y sont rangés en `kind='sante'`. Un service public dont le texte ne porte pas de rôle explicite n'a donc ni case où être attendu, ni case où être trouvé.

### santé — partiel

Sur 8 fait(s) dans la fenêtre, 5 a (ont) été rattaché(s) à une organisation et 3 au bon secteur (37.5 %). Refus motivés : aucun × 2, ambigu × 1. Secteurs des organisations trouvées : sante/sante × 1, entreprise/sante-social × 1, sante/null × 1, collectivite/commune × 1, entreprise/null × 1. Référentiel : 82 982 organisation(s), dont 82 683 avec au moins un alias.

Le type `sante` existe des deux côtés (`entiteType='sante'`, `kind='sante'`). Le lexique y ajoute les entreprises dont le texte parle d'établissements de santé ou de patients : un éditeur de logiciel médical est un fait de santé, pas un fait de numérique. Ce sont justement ces cas qui n'ont pas de `kind='sante'` au référentiel.

### industrie — invisible

Sur 3 fait(s) dans la fenêtre, 3 a (ont) été rattaché(s) à une organisation et 0 au bon secteur (0 %). Secteurs des organisations trouvées : entreprise/null × 3. Référentiel : 60 328 organisation(s), dont 58 979 avec au moins un alias.

Le corpus n'a pas de type `industrie` : les faits viennent d'`entreprise` étiquetées par lexique (vignoble, logistique vitivinicole, ingénierie, atelier). Le moteur nomme les victimes, mais les lignes trouvées ne portent pas `secteur='industrie'` : secteur vide ou rangé dans une autre catégorie NAF (agriculture, transport, activités spécialisées). L'industrie est donc invisible **en tant que secteur**, pas en tant qu'organisation — la répartition `kind/secteur` mesurée ci-dessus dit lequel des deux cas s'applique.

### commerce — partiel

Sur 10 fait(s) dans la fenêtre, 8 a (ont) été rattaché(s) à une organisation et 2 au bon secteur (20 %). Refus motivés : aucun × 2. Secteurs des organisations trouvées : entreprise/null × 4, entreprise/restauration-hotellerie × 1, association/services-entreprises × 1, entreprise/commerce × 2. Référentiel : 175 593 organisation(s), dont 172 586 avec au moins un alias.

Le corpus n'a pas de type `commerce` : les faits viennent d'`entreprise` (enseignes de distribution). Le référentiel a des unités légales `sector='commerce'`, pas l'enseigne que le texte cite (« Intermarché de X » est une SARL locale derrière un réseau). Un alias mono-jeton, même présent, ne suffit pas au moteur pour trancher.

### enseignement — partiel

Sur 4 fait(s) dans la fenêtre, 4 a (ont) été rattaché(s) à une organisation et 2 au bon secteur (50 %). Secteurs des organisations trouvées : enseignement/null × 1, enseignement/enseignement × 1, entreprise/null × 2. Référentiel : 44 258 organisation(s), dont 42 429 avec au moins un alias.

Type et `kind` explicites des deux côtés. La limite vient des organismes parasites du monde scolaire : réseaux d'anciens, prestataires alumni, unions sportives. Le moteur les nomme, mais rattache alors une entreprise ou une association plutôt que l'établissement visé : le secteur est vu, l'entité ne l'est pas toujours.

### collectivités — bien vu

Sur 6 fait(s) dans la fenêtre, 5 a (ont) été rattaché(s) à une organisation et 5 au bon secteur (83.3 %). Refus motivés : aucun × 1. Secteurs des organisations trouvées : collectivite/commune × 5. Référentiel : 4 477 organisation(s), dont 4 467 avec au moins un alias.

Type `collectivite` au corpus et `kind='collectivite'` au référentiel (communes, EPCI, départements). Les alias de rôle (« mairie de », « ville de ») laissent le moteur trancher sur des noms de lieux qui, seuls, ne désignent personne : c'est le secteur où la taxonomie des deux sources coïncide le mieux.

## Détail des incidents retenus

| Incident | Entité | Secteur attendu | Résultat | Organisation trouvée |
|---|---|---|---|---|
| na-2026-001 | Ymed (éditeur de la plateforme Sooncare) | santé | pas rattaché (ambigu) | — |
| na-2026-002 | Mairie de Marennes-Hiers-Brouage | collectivités | vu / bon secteur | Commune de Marennes-Hiers-Brouage |
| na-2026-003 | Ville de Tarnos | collectivités | vu / bon secteur | Commune de Tarnos |
| na-2026-004 | Mairie d'Espelette | collectivités | vu / bon secteur | Commune de Espelette |
| na-2026-005 | EHPAD Résidence du Parc de Champdeniers | santé | vu / bon secteur | EHPAD RESIDENCE DU PARC |
| na-2026-006 | Ville de Gradignan — police municipale | collectivités | vu / bon secteur | Commune de Gradignan |
| na-2026-009 | Bordeaux Sciences Agro | enseignement | vu / bon secteur | École nationale supérieure des sciences… |
| na-2026-010 | Vignobles Toutigeac | industrie | vu / hors secteur | EARL Vignobles Toutigeac |
| na-2026-011 | SICSOE (Solution Vin Logistique) | industrie | vu / hors secteur | SICSOE |
| na-2026-012 | Intermarché d'Altillac | commerce | pas rattaché (aucun) | — |
| na-2026-013 | Magasins de grande distribution touchés en Béarn et… | commerce | vu / hors secteur | Carrefour |
| na-2026-021 | SDIS des Landes | public | vu / sante | SDIS LANDES |
| na-2026-022 | Institut Bergonié | santé | vu / bon secteur | INSTITUT BERGONIE |
| na-2026-023 | ERNAT (Études Réalisations Négoce Assistance Techni… | industrie | vu / hors secteur | Études Réalisations Négoce Assistance T… |
| na-2026-024 | Rectorat de l'académie de Poitiers | enseignement | vu / bon secteur | Rectorat de l'académie de Poitiers |
| na-2026-025 | UPPA Alumni — réseau des anciens de l'Université de… | enseignement | vu / hors secteur | AlumnForce |
| na-2026-026 | Réseau Alumni de l'Université de Bordeaux | enseignement | vu / hors secteur | AlumnForce |
| na-2026-027 | UNSS (Union nationale du sport scolaire) — exfiltra… | public | vu / hors secteur | Union nationale du sport scolaire |
| na-2026-028 | Ville de La Rochelle — fuite via le prestataire Syn… | collectivités | vu / bon secteur | Commune de La Rochelle |
| na-2026-029 | Bordeaux Métropole — portail de la taxe de séjour | collectivités | pas rattaché (aucun) | — |
| na-2026-030 | Ministère de l'Intérieur — intrusion initiale depui… | public | pas rattaché (aucun) | — |
| na-2026-032 | Intermarché de Gradignan, Parempuyre, Macau et La T… | commerce | vu / hors secteur | LA TESTE DE BUCH |
| na-2026-033 | Supermarchés des Deux-Sèvres (Hyper U Parthenay, In… | commerce | vu / hors secteur | Système U |
| na-2026-034 | Cinq Intermarché de Dordogne (Hautefort, Tocane-Sai… | commerce | vu / hors secteur | OFFICE DE TOURISME DU PAYS BEAUMONTOIS |
| na-2026-035 | E.Leclerc de Surgères | commerce | vu / bon secteur | E. LECLERC (ANGOULEME) |
| na-2026-036 | Magasins de la Vienne (Intermarché Chauvigny et Gen… | commerce | vu / hors secteur | Système U |
| na-2026-037 | Super U de Morcenx-la-Nouvelle et Carrefour Express… | commerce | vu / bon secteur | CC DISTRIBUTION |
| na-2026-038 | Intermarché et Carrefour Market de Marmande | commerce | vu / hors secteur | Carrefour |
| na-2026-039 | Cerballiance — réseau de laboratoires de biologie m… | santé | pas rattaché (aucun) | — |
| na-2026-040 | Cegedim Santé — logiciel MonLogicielMedical (MLM) | santé | pas rattaché (aucun) | — |
| na-2026-041 | Polyclinique Bordeaux Nord Aquitaine | santé | vu / bon secteur | Polyclinique Bordeaux Nord Aquitaine |
| na-2026-042 | Ville de Limoges — centre de vaccination municipal … | santé | vu / collectivites | Commune de Limoges |
| na-2026-043 | Weda — logiciel médical (cabinets touchés jusqu'en … | santé | vu / hors secteur | Weda |
| na-2026-046 | Office français de la biodiversité — fichier des pe… | public | vu / hors secteur | Office français de la biodiversité |
| na-2026-060 | Cdiscount — extraction frauduleuse de données clien… | commerce | pas rattaché (aucun) | — |

Corpus : 60 incidents · hors fenêtre 18 ·
dans la fenêtre 42 · non classés 7 ·
classés 35 · refusés par la porte d'admission 0.
Les « non classés » ne sont pas comptés comme des échecs : le corpus dit
`entreprise` ou `autre` sans qu'aucun lexique ne permette de les ranger dans
les six secteurs demandés.

## Méthode et limites

- **Corpus** : type `entiteType` quand il porte directement collectivité, santé ou
  enseignement ; lexiques explicites sur le nom et le résumé pour répartir
  `entreprise` (commerce, industrie, santé) et `autre` (public). Le reste est
  publié comme non classé, jamais deviné.
- **Référentiel** : `kind='collectivite'|'sante'|'enseignement'` ; `sector='administration'`
  pour public, `sante-social` pour santé, `industrie` / `agroalimentaire` pour industrie,
  `commerce` pour commerce. L'absence de `kind='public'` est un fait mesuré,
  pas un oubli de la mesure.
- **Moteur** : même porte d'admission que l'ingestion (`contract/admit.ts`) et
  même fonction de désignation que la production (`designateUneOrganisation`,
  `match/gazetteer.ts`), appliquée à « entité + résumé ». Le gazetteer est
  construit en mémoire depuis `org_alias` (la colonne matérialisée
  `nom_normalise` n'existe pas sur toutes les bases).
- **Limite** : la mesure évalue la capacité à reconnaître un incident publié,
  pas le délai de collecte ni les incidents jamais rendus publics. Sur moins de
  trois faits, le verdict est indicatif : c'est l'intervalle qui fait foi.
