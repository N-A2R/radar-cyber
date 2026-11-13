# Mission — cadre de décision verrouillé

Décisions prises par le porteur du projet le 2026-11-12. **Elles priment sur
toute proposition antérieure** (y compris `docs/research/product-reuse.md` et
les arbitrages de `design-shortlist.md`).

## Les quatre réponses

| Question | Réponse | Conséquence directe |
| --- | --- | --- |
| Destination à 12 mois | **Mon poste de commandement** | Un seul utilisateur. Pas de multi-tenant, pas de portail, pas de comptes pour des tiers. Toute l'énergie va dans la détection, le rattachement et la couverture. |
| Mesure unique à faire exploser | **Couverture du territoire** | Deux axes : part des organisations réellement surveillées, et part des incidents publics NA effectivement vus. Le délai et la précision sont des contraintes, pas l'objectif. |
| Autonomie de la machine | **Agents autonomes sous garde-fous** | La machine chasse, enquête, enrichit, trie et escalade seule dans un cadre borné : provenance par affirmation, journal d'audit, budgets, réversibilité, évaluation avant activation. |
| Carburant | **Moyens institutionnels** | Hébergement, clés LLM, GPU possible, cadre officiel. Ouvre la couverture exhaustive, les modèles locaux et l'entraînement sur les décisions de l'analyste. |

## Deuxième salve de décisions (2026-11-12)

| Question | Réponse | Conséquence |
| --- | --- | --- |
| Périmètre du référentiel | **Exhaustif Nouvelle-Aquitaine** | Communes, EPCI, santé, scolaire, opérateurs, entreprises au-delà d'un seuil. Enrichissement par vagues de criticité, pas en un seul lot. |
| Vérité terrain | **Corpus rétrospectif 12 mois** | Reconstitution des incidents publics NA (presse régionale, CERT-FR, sites de fuite, CNIL, communiqués), agents proposeurs puis validation humaine. |
| Accès réseau | **Ouvert** (demandé) | **Non effectif à ce jour** : `recherche-entreprises.api.gouv.fr`, `sudouest.fr`, `cert.ssi.gouv.fr` restent injoignables depuis le sandbox. À fournir avant toute mesure réelle. |
| Frontière d'action des agents | **Passif + vérifications actives légères** | DNS, requête HTTP simple, en-têtes TLS sur les domaines du référentiel. Pas de scan de ports. Mandat à confirmer avant activation. |
| Sortie des données | **API pour le public, local pour le sensible** | Presse, avis CERT, données ouvertes → API. Dès qu'une organisation identifiée ou une fuite est en jeu → traitement local. Journal de ce qui sort. |
| Usage quotidien | **Le dashboard existant, alertes en direct** | On conserve carte + fil + inspecteur + rail. Aucun nouvel écran principal. Les alertes arrivent dans l'interface sans rechargement. |

### Ce que « alertes en direct » exige, vérifié dans le code

Deux chaînons manquent, et aucun n'est cosmétique :

1. **La détection n'est pas branchée sur la collecte.** `evaluateEvent` n'est
   appelé que depuis `quarantine/promote.ts`. Le planificateur ne lance jamais
   `evaluateAll`. Les événements issus du CERT-FR, de KEV, de NVD, des RSS
   génériques et d'Hermes ne produisent donc aucune alerte.
2. **Il n'existe pas de canal d'alertes en temps réel.** `routes/stream.ts`
   n'émet que `event: new` (des événements). Le front n'écoute que `new`, et
   `AlertsView` charge une seule fois au montage — sans rafraîchissement.
   Même une alerte créée aujourd'hui n'apparaît pas toute seule à l'écran.

Fermer ces deux chaînons **est** l'étage 0. C'est exactement ce que demande
l'usage quotidien retenu.

## Troisième salve de décisions (2026-11-12)

| Question | Réponse | Conséquence |
| --- | --- | --- |
| Volume d'alertes absorbable | **Tout le flux, hiérarchisé** | Le fil garde tout ; la hiérarchie visuelle (sévérité, couleur, son sur le grave) fait le tri. Pas de seuil qui masque. |
| Ce qui mérite de sonner | **Incident sur une org du référentiel** | Les alertes proprement dites se limitent aux incidents rattachés. Vulnérabilités, signaux faibles et avis CERT restent dans le fil, sans sonner. |
| Stock existant | **On retraite tout** | Les 16 235 faits de quarantaine et 3 456 événements repassent par le nouveau pipeline. Rejeu silencieux d'abord, pour ne pas déclencher une avalanche d'alertes. |
| Mandat pour vérifications actives | **Oui, en place** | L'agent actif léger (DNS, HTTP, TLS) peut être câblé et activé. |
| Langues | **Multilingue, y compris forums** | Détection et traduction automatiques ; anglais et russe en plus du français. Coût et bruit à surveiller. |
| Accès réseau | **Impossible — environnement Arena** | Contrainte définitive, pas un retard. Voir ci-dessous. |

## Contrainte réseau : définitive, et contournement partiel

Le sandbox n'a accès qu'à `github.com`, `api.github.com`, `codeload.github.com`,
`registry.npmjs.org`, `pypi.org`. Impossible de sonder nos sources, de joindre
`recherche-entreprises.api.gouv.fr` ou data.gouv.fr. **Ce n'est pas négociable.**

Mais GitHub héberge des miroirs exploitables. Deux vérifiés et téléchargés :

1. **`joshhighet/ransomwatch` — `posts.json`** (Unlicense, 2,3 Mo) :
   **16 072 revendications** de sites de fuite, avec groupe et date de découverte.
   Période couverte : **2020-01-12 → 2025-06-16**. C'est une amorce réelle de
   corpus témoin. **Limite : l'archive s'arrête en juin 2025**, donc la fenêtre
   « 12 mois » serait juin 2024 → juin 2025, pas les douze derniers mois.
2. **`kraloveckey/threat-intelligence-feeds` — le CSV** (MIT, 52 ko) :
   **425 lignes, dont 317 passent le filtre de `db/import-feeds.ts`**. C'est
   exactement le fichier que ce script attendait dans `/tmp`. L'essentiel des
   449 sources manquantes au dépôt est donc **reconstructible sans réseau**.

Conséquence de méthode : tout ce qui est code, schéma, pipeline, agents et
évaluation sur jeux locaux se fait ici. Tout ce qui exige une mesure sur le
monde réel (rendement des sources, API entreprises, jeux officiels FINESS/UAI/
SIRENE) doit soit passer par un miroir GitHub, soit par un export fourni, soit
être exécuté par le porteur du projet dans son environnement.

## Quatrième salve et coup d'envoi (2026-11-12)

| Question | Réponse | Conséquence |
| --- | --- | --- |
| Export de la base réelle | **Oui, à déposer** | Tables `org`, `org_alias`, `event`, `quarantine_raw`, `source` attendues. Rien reçu à ce stade : les mesures sur l'instance réelle restent en attente. |
| Premier chantier | **Étage 0** | Détection branchée + alertes en direct. **Livré**, voir ci-dessous. |
| Calcul lourd | **CPU et modèles légers d'abord** | RapidFuzz, règles, petits modèles. Les agents LLM attendent que l'infra du porteur soit branchée. |
| Fenêtre du corpus | **Socle historique + enrichissement continu** | `ransomwatch` (16 072 revendications, jusqu'à juin 2025) comme socle, enrichi par ce que le pipeline découvre. |

## Étage 0 — livré le 2026-11-12

**Ce qui a changé.**

- `apps/api/src/detect/incremental.ts` : détection par lots bornés, un curseur
  par nature, insertions idempotentes, plus un rattrapage des **rattachements
  tardifs** (un événement collecté sans organisation puis rattaché ensuite
  finit par produire son alerte). Aucune migration : l'état vit en mémoire et
  se reconstitue au démarrage.
- `apps/api/src/server.ts` : tâche « détection » au démarrage puis à chaque
  tick de collecte, sous la garde de ré-entrance existante.
- `apps/api/src/notify/alert-feed.ts` + `routes/stream.ts` : canal
  `event: alert` sur le flux SSE, avec son propre curseur (`sinceAlertId`) et
  la même règle de confidentialité que les événements (TLP:RED jamais poussé).
- `apps/web` : bandeau `LiveAlerts` sous le rail, badge d'alertes non vues sur
  l'onglet Alertes, rechargement automatique de la vue, son optionnel **coupé
  par défaut** et réservé aux sévérités 4-5. **Le dashboard existant n'a pas
  changé de nature** : carte, fil, inspecteur, rail.
- `scripts/replay-detection.mts` : rejeu du stock, **silencieux par défaut**
  (diffusion reportée d'un an via `next_attempt_at`, réversible par
  `--release`), dry-run sans `--apply`, idempotent et reprenable.

**Vérifications.** 4 tests dédiés (`test/pipeline-etage0.test.ts`) : événement
collecté → alerte sans quarantaine ; rejeu sans doublon ; rattachement tardif →
alerte ; canal temps réel, TLP:RED exclu. Suite API **104/104**. Typechecks API
et web, 18 contrôles de rendu : tous verts.

**Bug trouvé en testant.** `event.id` est un `bigint` : le driver le rend en
chaîne, pas en nombre. Le code de détection normalise désormais explicitement.

**Reste à faire sur l'étage 0.** Le rejeu du stock n'a pas été lancé sur une
instance réelle (base vide ici) ; il attend l'export. Et le canal SSE n'est
vérifié que par la sélection d'alertes, pas par une connexion de bout en bout.

## Cinquième point : ce qui est faisable SANS l'export (vérifié le 2026-11-12)

Le blocage « pas d'export, pas de réseau » est **partiellement levé** par npm,
qui est autorisé. Trois sources vérifiées et téléchargées :

| Source | Licence | Contenu vérifié |
| --- | --- | --- |
| `@etalab/decoupage-administratif@6.0.0` (npm, publié 2026-03-09) | MIT | **4 594 communes NA** (4 293 avec SIREN), **156 EPCI NA** (129 CC, 24 CA, 2 CU, 1 métropole), 12 départements, 1 région. Codes postaux, population, appartenance commune→EPCI via `membres`. Soit **4 763 entités territoriales réelles**. |
| `codes-postaux@4.1.2` (npm) | MIT | 35 684 entrées compactes ; **4 304 des 4 517 communes NA** jointives par `codeCommune`. Recoupement postal indépendant. |
| `gregoiredavid/france-geojson` — `departements/{dep}/communes-*.geojson` | **Licence Ouverte** (confirmée dans le README : Admin Express ; le champ `license` de GitHub est null, ce n'est pas une absence de licence) | ~0,6 Mo par département, **~7 Mo pour les 12 départements NA** → centroïdes calculables, donc **géocodage des 4 594 communes sans API**. |

**Conséquence : le référentiel territorial NA n'attend plus l'export.** Il est
constructible ici, avec identifiants officiels, alias, hiérarchie et coordonnées.
Ce qui reste dépendant de l'export ou d'un jeu officiel : les entreprises
(SIRENE), la santé (FINESS), le scolaire (UAI).

**Corpus témoin, taille réelle mesurée** : sur `ransomwatch`, la fenêtre
juin 2024 → juin 2025 contient **4 474 revendications**, **68 groupes**,
**4 451 titres distincts** (top : ransomhub 878, play 405, lynx 244, cactus 194).
Les titres sont des noms de victimes ou des domaines, **sans pays** : le filtre
NA exige le référentiel ci-dessus. Sans vérité terrain fournie, on peut mesurer
la **précision** des candidats retenus (revue manuelle), **pas le rappel**.

**Autres manques confirmés dans le code, tous réparables sans export** :
`routes/search.ts` = 3 `ILIKE` + `LIMIT 20`, sans classement ni alias ;
**aucune UI de quarantaine** (la route API existe, l'écran n'existe pas) ;
**aucune virtualisation** de l'annuaire et **aucun état d'URL** (pas de lien
profond partageable).

## Sixième point : ordre de bataille arrêté (2026-11-12)

| Question | Réponse |
| --- | --- |
| Ordre des chantiers | **1 → 2 → 3, socle 4 en parallèle** : référentiel, puis annuaire/recherche à l'échelle, puis file de revue ; reproductibilité en fond. |
| Jeu de données NA | **Versionné dans le dépôt** (`db/data/referentiel-na.json`, 1,1 Mo). Un déploiement neuf n'exige ni npm ni réseau. |

### Chantier 1 — référentiel territorial : LIVRÉ

**4 462 organisations** (4 293 communes avec SIREN, 156 EPCI, 12 départements,
1 région), **toutes géocodées**, **22 904 alias**, 224 communes déléguées
rattachées en alias. Chargement mesuré **3,6 s**, rejeu **0 création / 0 alias**.

Banc à l'échelle réelle : **93,9 % de rattachements corrects, 0 erreur**,
260 abstentions sur les 111 noms homonymes, index construit en 91 ms, décision
p95 **0,065 ms**. Détails, pièges de données et limites :
**`docs/research/referentiel-na.md`**.

Reste ouvert sur ce chantier : entreprises (SIRENE), santé (FINESS), scolaire
(UAI) — l'exhaustivité demandée n'est pas atteinte, seulement l'étage territorial.

**Vérifications** : 14 tests sans base + 4 tests en base, suite API **122/122**,
typecheck API 0 erreur.

### Chantier 2 — annuaire et recherche à l'échelle : LIVRÉ

`GET /api/directory` : pagination, facettes et classement côté serveur,
recherche par alias et tolérante à une faute de frappe. Côté interface :
virtualisation au-delà de 100 lignes, et **liens profonds partageables**
(`#/directory?q=…&dept=33&org=412`), l'application n'ayant aucun état d'URL.

Mesuré : à **104 462 organisations**, l'ancien chemin envoyait **22,4 Mo** en
568 ms ; le nouveau envoie **12 Ko** en 55 ms. Charge utile divisée par
**1 870**. Détails et limites : **`docs/research/referentiel-na.md`** pour le
référentiel, **`docs/research/annuaire-echelle.md`** pour l'annuaire.

**Vérifications** : 9 tests de classement sans base, 8 tests en base, suite API
**139/139**, 32 contrôles de rendu web, typechecks et build à zéro erreur.

**Reste ouvert** : la carte charge encore `/orgs` en entier ; il lui faudra une
route bornée par emprise. La tolérance aux fautes s'arrête à une lettre.

## Ce que ça exclut

- Portail public, diffusion à des abonnés externes, comptes multi-utilisateurs :
  hors sujet. La phase 4 « exposition publique » reste abandonnée.
- Sécurité/auth/déploiement comme chantiers propres : écartés par consigne,
  sauf ce qui est indispensable à la traçabilité des agents.
- Réécriture du socle : Fastify + React/Vite + PostgreSQL + MapLibre restent.
  Le code est petit (9 300 lignes API, 5 350 web) ; le coût est dans les
  décisions de périmètre et le travail sur les données.

## Tension à assumer

« Poste de commandement » + « moyens institutionnels » ne veut pas dire petit.
Cela veut dire : **une machine d'échelle régionale au service d'une seule
personne**. Pas de SaaS, pas de compromis d'ergonomie pour des utilisateurs
hypothétiques — une interface dense, opinionnée, clavier d'abord.

## Étoile du nord, formulation opérationnelle

> Sur un corpus témoin d'incidents publics de Nouvelle-Aquitaine reconstitué
> sur 12 mois : quelle part aurions-nous vue, et à quel moment ?

Tant que ce corpus n'existe pas, la couverture n'est pas mesurable et
l'acquisition de sources reste une intuition. **Le construire est le premier
chantier de mesure du projet.**

## Trajectoire par étages

| Étage | Objet | Critère de passage |
| --- | --- | --- |
| 0 | Mise à feu : pipeline unique, détection branchée sur toute la collecte, contrat appliqué, instance reproductible | Un avis CERT-FR concernant une org du référentiel produit une alerte sans intervention |
| 1 | Le référentiel devient une cible : périmètre arbitré, enrichissement, géocodage, surface d'attaque connue | Chaque entité du périmètre a identifiant officiel, domaine, commune, coordonnées, criticité |
| 2 | Couverture mesurée : corpus témoin + rendement par source, acquisition pilotée par le rappel incrémental | La part d'incidents du corpus vus est un chiffre affiché, pas une opinion |
| 3 | Agents en production bornée : revue, enrichissement, acquisition, enquête | Chaque agent est évalué sur le corpus avant activation, et journalisé |
| 4 | Anticipation : typosquat, certificats, exposition, credentials | On voit un risque avant l'incident, pas seulement après |

## État des lieux mesuré qui justifie la trajectoire

- Détection appelée depuis un seul chemin (`quarantine/promote.ts`) ; le
  planificateur ne lance jamais `evaluateAll`. Le reste de la collecte traverse
  sans être évalué.
- `EventSchema` n'est jamais appelé : le contrat partagé est décoratif.
- 594 sources déclarées, **160 productives** ; 145 seulement sont versionnées.
- 10 261 organisations, **113** avec un événement, **444** géocodées,
  **12** événements avec coordonnées : la carte est vide.
- 16 235 lignes en quarantaine pour 3 456 événements publiés.

Détails et benches : `docs/research/validation-abc.md`, `bench/README.md`.


---

# Chantier 3 — file de revue de la quarantaine : LIVRÉ

**Demande** : « go » au bilan du chantier 2. **Ordre arbitré respecté** : 1 → 2 → 3.

## Livré et vérifié

| Élément | État |
| --- | --- |
| Préfiltre de candidats (scoring inchangé) | **×239** sur 500 indices réels, 6 tests dont différentiel non vide |
| Triage explicable (score, seau, suggestion, trace) | 13 tests, calibré sur le corpus réel |
| File + décisions journalisées (promote/reject/review/undo) | 7 tests en base |
| Routes `GET /quarantine/queue`, `POST /quarantine/review` | vérifiées en HTTP avec jeton : 401 sans, 400 sans motif |
| Écran « Revue » au clavier | 18 contrôles clavier purs + **26 interactions jsdom** |
| Jeu versionné 500 revendications réelles | `bench/fixtures/claims-sample.json`, Unlicense |
| Suite API | **165/165** · rendu web **59** · `tsc` 0 · build web OK |

Le dashboard est inchangé : carte, fil, inspecteur, rail, alertes en direct.
« Revue » est une entrée du rail, pas un nouvel écran principal.

## Le résultat qui compte n'est pas une performance

**Aucun « chaud » sur 500 revendications réelles.** Meilleur score 43, sur des
entreprises françaises (`adveo.com`, `lumioplan.com`, `demos.fr`) toutes marquées
`referentialGap` : **le référentiel NA de 4 462 organisations ne couvre pas les
entreprises visées.** Communes, EPCI, départements et région ne suffisent pas à
faire une veille économique régionale.

La file est désormais l'outil qui remonte ces trous en tête, avec le motif. Elle
ne les bouche pas : **le périmètre entreprises reste la question ouverte du
chantier 1**, et l'export de la base réelle (10 261 organisations) reste attendu
pour y répondre sur les vraies données.

## Deux corrections imposées par les données

1. **Fraîcheur = arrivée en file, pas date de publication.** En pénalisant l'âge
   publié, les 500 faits historiques tombaient tous à « froid » (score 2) et la
   file ne triait plus rien.
2. **Un indice français sans correspondance est un trou du référentiel (+25), pas
   du bruit.** L'écran le dit : « envisagez d'ajouter l'entité plutôt que de
   rejeter ».

## Limites dites

Heuristique lisible, pas un modèle appris : **aucun taux de faux positifs mesuré**,
faute de corpus annoté (chantier 5). Corpus historique 2024–2025 : il exercise la
file, il ne prouve pas la couverture actuelle. Journal de revue dans `extracted`
(pas de migration, contrainte tenue) : suffisant pour une personne, pas une piste
d'audit indexée. L'ajout d'une organisation depuis un `referentialGap` reste
manuel.

Détails : `docs/research/file-de-revue.md`, `bench/results/NA-review.json`.

## Chantier 4 livré — socle reproductible + contrat appliqué (2026-11-12)

Choisi par l'utilisateur parmi quatre options, avec arbitrage explicite :
**élargir** le contrat plutôt que fondre les familles hors contrat.

**Socle.** `pnpm db:up` puis `pnpm setup` remontent tout, hors réseau :
**8/8 étapes en 4,3 s** depuis une base vide (23 migrations, 265 sources,
7 règles, 4 462 orgs / 22 904 alias, 500 revendications, compte admin).
Rejeu idempotent (`+0` source). `pnpm setup:check` diagnostique sans écrire.
Procédure : [docs/socle.md](../socle.md).

Trois pannes révélées par le simple fait de rejouer l'installation :
`db/dev-pg.ts` ne démarrait pas (top-level await compilé en CJS, renommé `.mts`,
fichier référencé nulle part) ; `migrate.mts` / `create-admin.mts` /
`quarantine-review.mts` ne résolvaient pas `pg` depuis la racine (pnpm cloisonne) ;
et l'amorçage des migrations marquait **17 migrations appliquées sans les jouer**
sur une base neuve, puis échouait sur `org_alias`. Ce dernier bug était invisible
des tests et de la CI, qui appliquent le SQL via un autre chemin. Corrigé par un
amorçage conditionnel et une transaction par migration. Un job CI `socle` qui
rejoue l'installation depuis le vide, deux fois, est prêt et simulé en local dans
`scripts/ci/ci.proposed.yml` — **non appliqué** : le jeton de la session n'a pas
la permission GitHub `workflows` (voir `scripts/ci/README.md`).

**Contrat.** `EventSchema` est appelé aux **cinq** chemins d'écriture, via
`apps/api/src/contract/admit.ts` : réparations tracées (13 codes) d'un côté,
rejets motivés (7 motifs) de l'autre, compteurs rendus dans les logs et dans la
réponse `/ingest`. `FAMILIES` passe de 10 à **13** (`leaks`, `paste`,
`presse_cyber`) ; `db/migrate-025-family-contract.sql` aligne le CHECK SQL.
Détail : [docs/contrat.md](../contrat.md).

**Bug trouvé en écrivant le premier test de `/ingest`** (la route n'en avait
aucun) : le `source_id` par défaut était `hermes`, absent du catalogue, donc tout
bot poussant sans `source_id` prenait un 500 sur la clé étrangère. Défaut aligné
sur `hermes_radar_cyber`, et provenance inconnue devenue un refus lisible.

**Vérifications.** `pnpm verify` entièrement vert : contrat hors base **21/21**,
API **196/196** (165 avant ce chantier, +31), rendu **59**, jsdom **26/26**,
typechecks API et web **0**, build web OK, healthcheck OK. Chaîne réelle
contrôlée : `/ingest` sur lot mixte → 2 admis / 1 rejet motivé / 3 réparations
tracées ; front 200, annuaire NA et file de revue alimentés.

## Reste à faire

**5** corpus témoin + mesure de couverture · **6** agents CPU.
Options écartées à ce tour : **B** carte vivante hors ligne (géocodage par
centroïdes versionnés — 4 557 entités déjà géolocalisées dans le jeu NA),
**C** corpus témoin, **D** référentiel entreprises (**bloqué**, attend l'export :
`recherche-entreprises.api.gouv.fr` injoignable, aucun jeu SIRENE utilisable).
Export de la base réelle toujours en attente.

**Contournement du réseau filtré : collecte déléguée.** Puisque le sandbox ne
joint ni les API gouv ni la presse, la collecte peut être confiée à un assistant
externe qui, lui, a internet. Le prompt est prêt :
[**`prompt-collecte-externe.md`**](prompt-collecte-externe.md) — quatre blocs
(corpus témoin 12 mois, entreprises SIRENE, santé FINESS / enseignement UAI,
sonde des 265 sources), schémas JSON imposés, provenance et licence exigées,
livraison sur une branche dédiée.

Ce qui revient est vérifié par `scripts/validate-external-data.mts` (Node seul,
sans dépendance) : clés de Luhn des SIREN, codes INSEE confrontés aux 4 517 du
jeu versionné, dates ISO, URL, doublons, et citation obligatoire pour tout
incident du corpus. Les exemples du prompt passent le validateur ; un jeu
volontairement fautif est bien rejeté.

## Audit de la collecte externe — PR #3 (2026-11-12)

Branche `data/collecte-externe`, 6 fichiers, **30 152 enregistrements**. Données
récupérées et vérifiées localement, pas seulement sur la foi du compte rendu.

**Authenticité établie.** FINESS : 10 008 identifiants uniques au format INSEE,
libellés administratifs tronqués authentiques, adresses au format HAR,
répartition calée sur la population (Gironde 2 173 / Creuse 264). Éducation :
6 528 UAI avec lettre de contrôle, 4 707 écoles. Entreprises : 13 332 SIREN dont
la clé de Luhn est valide, **tous géolocalisés**, 12/12 départements, tous actifs,
noms commerciaux réels entre parenthèses. Sonde : 264 sources, titres réels en
allemand/croate/suédois, et l'attaque des supermarchés apparaît à la fois au
corpus et dans les flux CERT-AT/CERT-HR sondés — cohérence croisée qu'une
fabrication ne produit pas.

**Ce qui reste à reprendre :**

| Point | État |
| --- | --- |
| Coordonnées santé + enseignement | **0/16 536** — champ `position` de la source non repris |
| `perimetre` sur les 20 incidents | **0/20** — incidents nationaux encore géolocalisés en NA |
| Bloc 2, volet « ≥50 salariés, tous secteurs » | **absent** : 0 agroalimentaire, 0 industrie, 0 construction, 0 commerce |
| Bloc 2, secteurs critiques | restreints à ≥50 alors que le prompt demandait toutes tailles |

Seules **345** entreprises livrées ont un effectif ≥50, dont 297 hors numérique.
Le numérique représente 13 035 des 13 332 lignes. Pour une région dont
l'agroalimentaire, l'aéronautique et le bâtiment sont des employeurs majeurs, le
référentiel entreprises reste troué — et une couverture mesurée contre ce
référentiel serait flatteuse à tort.

**Piège de mesure à retenir.** Le collecteur a annoncé « 0 erreur, 0
avertissement » en exécutant une version périmée du validateur. La version à jour
rend **6 avertissements** (5 incidents hors fenêtre, 20 périmètres non marqués).
Toujours revérifier avec le validateur du dépôt avant de croire un feu vert.

**Récupérable côté chargement, sans recollecte** : les noms commerciaux sont
présents mais enfouis dans `nom` entre parenthèses (`ALLIANCE ATLANTIQUE (H.M.
VOYAGES, AUTOCARS BERTRAND, …)`) et `nomsAlternatifs` est vide partout. Les
extraire en alias au chargement — c'est exactement ce qui sert au rapprochement.

## Chargement du référentiel étendu (2026-11-12)

Le référentiel ne décrit plus seulement le maillage administratif : il contient
les organisations que la région compte réellement, donc celles qu'un incident
peut frapper.

| Jeu | Volume | Identifiant |
| --- | --- | --- |
| référentiel territorial | 4 462 | code INSEE / SIREN d'EPCI |
| santé (FINESS) | 10 008 | 9 chiffres |
| enseignement (UAI) | 6 528 | 7 caractères |
| entreprises (SIREN) | 13 332 | 9 chiffres, clé Luhn validée |
| **total** | **34 330** | |

`pnpm migrate` (migration 026) puis
`tsx scripts/load-organisations-na.mts --apply` : 34 330 organisations,
52 473 alias. Rejouable, 15 s.

**Coordonnées : trou comblé sans recollecte.** Les 16 536 établissements livrés
avec `lat`/`lon` à `null` portent tous un code commune INSEE géolocalisé dans
`referentiel-na.json` : le centroïde communal est posé et `geo_source` vaut
`centroide-commune`, ce qui interdit de confondre la précision d'un centroïde
avec celle d'une adresse. Résultat : **34 330 / 34 330 géolocalisées**, carte
alimentée.

**Alias : 4 267 noms écartés du moteur.** 710 écoles s'appellent « Ecole
primaire » et 21 pharmacies « Pharmacie du Centre ». Les verser au matcher, qui
rend `null` dès que deux organisations revendiquent le même nom, l'aurait
paralysé. Seuls les noms distinctifs deviennent des alias ; le nom complet reste
dans `org.name`, donc rien n'est perdu — on refuse seulement d'armer le moteur
avec du vocabulaire commun. Les enseignes entre parenthèses des entreprises
(« AGUR », « PEAKSYS ») sont extraites : 2 042 alias récupérés.

**Le vrai goulot n'est pas le référentiel, c'est le matcher d'ingestion.**
Mesuré sur les 15 incidents du corpus dans la fenêtre :

| Étage | Rattachement |
| --- | --- |
| `matchOrgForText` (ingestion) avec 4 462 orgs | 5/15 |
| `matchOrgForText` (ingestion) avec 34 330 orgs | **1/15** |
| `matchOrgDetailed` (alias) avec 34 330 orgs | 12/15, mais **4 faux** |

Le matcher d'ingestion compare des jetons du `name` de **toutes** les
organisations et exige **un seul candidat** dans la table entière : mécanique de
tablette de 800 lignes, elle s'effondre à 34 330. Il ignore `org_alias` — les
52 473 alias n'y servent à rien. Le moteur d'alias, lui, trouve plus mais se
trompe : « Vignobles Toutigeac » → Gironde, « Ymed » → « S-SERVICES », et
« Bordeaux » désigne tour à tour une commune, une école et une entreprise. Seuls
les 3 cas « Ville de Tarnos / Mairie d'Esplanade / Mairie de Marennes » sont
justes (3/15 de précision).

**Conséquence produit** : charger le référentiel n'améliore la couverture que
si l'ingestion bascule sur l'index d'alias *et* si les alias orphelins
mono-jeton sont écartés. C'est le chantier suivant, et il est mesurable.
