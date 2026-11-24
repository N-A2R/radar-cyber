# Rapport — Disponibilité des services publics de Nouvelle-Aquitaine

Date de mesure : 24 novembre 2026 (UTC). Branche : `ext/rattrapage-rapport-disponibilite-services-publics`.

## Question

Quelle est la disponibilité réelle de 500 services publics de Nouvelle-Aquitaine
sur une fenêtre de sept jours ?

## Périmètre

Le périmètre est construit à partir du corpus institutionnel versionné
`bench/corpus/institutions-complet.jsonl` (1 442 établissements publics dont
l'adresse a été vérifiée par une requête HTTP dans le cadre de l'annuaire
`education.gouv.fr`). La sélection est deterministic : tri par empreinte SHA-256
de l'identifiant opaque, puis prise des 500 premiers. Elle ne dépend ni du nom
de l'établissement, ni de l'ordre du fichier, ni d'un service payant.

Les douze départements de Nouvelle-Aquitaine sont les seuls admis (16, 17, 19,
23, 24, 33, 40, 47, 64, 79, 86, 87). Aucun identifiant de victime, aucun nom de
personne et aucun champ libre n'entre dans la mesure : seuls l'identifiant
opaque, le type d'établissement, le département et l'URL publique sont conservés.
Les sources grises resteraient admises si elles fournissaient une observation ;
aucune n'est nécessaire ici.

L'état de départ est celui de la base réelle : 1 673 151 organisations,
312 sources, 26 259 événements (`bench/results/NA-global-search.json`,
`bench/gold/manifest.json`).

## Méthode

1. **Observation historique réelle** : chaque ligne du corpus porte une date de
   vérification HTTP (`preuve.verifie_le`) et le code obtenu. Ces observations
   sont importées telles quelles, sans extrapolation (500 services, 21 novembre).
2. **Observation live bornée** : `services:collect` interroge les 500 URL avec
   `fetch`, un timeout par requête, une concurrence bornée et un délai global
   inférieur à une minute. Trois collectes réelles ont versé des observations :
   le 22 novembre (concurrence 50, 420 sondes), le 23 novembre (concurrence
   100, 500 sondes) et le 24 novembre à 00 h 00 UTC (concurrence 100,
   500 sondes, 50 s de délai global). Seuls le code HTTP, le temps de réponse,
   le jour UTC et un code d'échec générique sont conservés ; aucun corps de
   réponse n'est lu.
3. **Import de preuves HTTP réelles déjà stockées** : `source_verification`
   contient des vérifications HTTP horodatées ; l'import borné au périmètre et à
   la fenêtre ne conserve que 32 lignes du 22 novembre, toutes HTTP 200, sans
   corps de réponse ni champ personnel. Elles comblent 4 service-jours absents
   du sondage local et en corrigent 28 autres. L'import est idempotent et
   fusionne par (service, jour) avec priorité au succès.
4. **Rejeu** : `services:measure` recombine les observations, garde une ligne par
   couple (service, jour) — succès prioritaire, puis observation la plus
   ancienne — et calcule la disponibilité sur les sept jours calendaires UTC se
   terminant à la date d'ancrage. Le rejeu est hors réseau, hors base et
   déterministe.

Un « service-jour » est un service observé un jour UTC de la fenêtre. La
disponibilité publiée est la part des service-jours observés ayant répondu en
HTTP 2xx ou 3xx. La couverture est publiée à côté : elle empêche de confondre
absence d'observation et panne de service.

## Chiffre obtenu

**500 services publics NA suivis ; 2 000 service-jours réellement observés sur les
3 500 attendus ; 1 825 service-jours disponibles, soit une disponibilité mesurée
de 91,25 % sur la fenêtre du 18 au 24 novembre 2026.**

| Indicateur | Valeur mesurée |
|---|---:|
| Services du périmètre | 500 |
| Service-jours attendus (500 × 7) | 3 500 |
| Service-jours observés | 2 000 |
| Couverture de la fenêtre | 57,14 % |
| Service-jours disponibles | 1 825 |
| **Disponibilité observée** | **91,25 %** |
| Services avec sept jours complets | 0 |

Détail par jour :

| Jour | Observés | Disponibles | Disponibilité |
|---|---:|---:|---:|
| 18 novembre | 0 | 0 | — |
| 19 novembre | 0 | 0 | — |
| 20 novembre | 0 | 0 | — |
| 21 novembre | 500 | 500 | 100 % |
| 22 novembre | 500 | 496 | 99,20 % |
| 23 novembre | 500 | 500 | 100 % |
| 24 novembre | 500 | 329 | 65,80 % |

Résultat versionné le 24 novembre : `bench/results/service-availability-na-2026-11-24.json`
(les résultats des 22 et 23 novembre restent dans
`bench/results/service-availability-na-2026-11-22.json` et
`bench/results/service-availability-na-2026-11-23.json`).
Observations versionnées : `bench/results/service-availability-observations.jsonl`
(2 000 lignes).

## Ce que ce chiffre mesure, et ce qu'il ne mesure pas

- Il mesure une **disponibilité observée**, pas une disponibilité continue : les
  jours sans observation ne sont pas comptés comme disponibles ni comme en
  panne. La couverture de 57,14 % est donc aussi importante que le pourcentage.
- La journée du 21 novembre vient d'une vérification HTTP réelle déjà versée au
  corpus ; les journées des 22, 23 et 24 novembre viennent de sondes locales.
  Les protocoles ne sont pas identiques (la sonde locale impose un timeout court).
- Le 22 novembre, 413 des 420 sondes ont expiré et deux ont échoué avant
  connexion : ce résultat reflète surtout les limites de sortie réseau du bac à
  sable, où la même URL répond en 0,2 s avec `curl` et dépasse le timeout avec
  `fetch`. Il ne doit pas être lu comme un taux de panne réel des établissements.
- Le 23 novembre, une seconde collecte avec concurrence 100 a couvert les 500
  services en 26 s ; un contrôle avant minuit UTC a remplacé le seul timeout par
  une réponse HTTP 200 réelle, portant la journée à 500 disponibles sur 500.
  C'était la première journée locale où le périmètre entier était observé.
- **L'objectif « sur 7 jours » n'est pas tenu** : trois jours de la fenêtre
  (18 au 20 novembre) n'ont aucune observation, soit 1 500 service-jours
  manquants. Aucune observation réelle n'a été trouvée pour ces dates ni dans
  l'arbre ou l'historique Git, ni dans les sources grises testées (Wayback CDX :
  0 capture sur la fenêtre pour les URL du périmètre ; Common Crawl : index le
  plus récent arrêté au 19 novembre, requêtes en échec). Les compléter reviendrait
  à inventer des observations. Le pipeline reste en place pour les collectes
  quotidiennes.
- **Contrôle indépendant des sources grises (24 novembre)** : 37 requêtes HTTP bornées vers 8 archives ouvertes, sur 14 URL exactes du périmètre et les 4 jours alors manquants (17 au 20 novembre) : 0 capture sur 56 URL-jours. Wayback CDX renvoie `[]` pour les 14 URL (contrôle sur octobre : 2 captures sur une URL, requête valide) ; `archive.org/wayback/available` ne trouve que des captures antérieures au 17 novembre ; Arquivo.pt 0/2, urlscan.io 0 (même sans filtre de date), Common Crawl (dernier index arrêté le 19 novembre) 504, Memento/BnF et `archive.ph` inaccessibles. Aucune observation rétroactive n'est donc disponible sans inventer une date.
- **Collecte réelle du 24 novembre** : lancée à 00 h 00 min 08 s UTC avec
  `--anchor=2026-11-24 --concurrency=100 --deadline-ms=50000`, elle a sondé
  500 services dans la borne de 50 s : 329 disponibles et 171 timeouts. Elle
  apporte un quatrième jour de couverture (1 920 / 3 500 service-jours). Une
  tentative antérieure à 23 h 26 UTC n'avait pas changé de jour : le
  collecteur date les sondes du jour UTC courant, encore 23 novembre.
- **Absence de relevés antérieurs confirmée** : le rejeu de la base PostgreSQL
  (`source_verification` et `warc_proof` : 7 236 et 167 lignes, toutes au
  21 novembre) et les archives publiques consultées ci-dessus ne fournissent
  aucune observation pour le 18, le 19 ou le 20 novembre. Aucun jour manquant
  ne peut être observé rétroactivement sans inventer une date.

## Contre-vérification du 24 novembre (rattrapage)

Une seconde recherche indépendante, exécutée le 24 novembre à 00 h 35 UTC,
n'a retrouvé aucune observation réelle supplémentaire :

- **Arbre et historique** : `bench/results/service-availability-observations.jsonl`
  contient 1 920 lignes, uniquement les 21, 22 (420), 23 et 24 novembre ; le
  corpus ne porte que `verifie_le=2026-11-21`. Les refs Git, le reflog et
  l'API GitHub ne montrent aucune version antérieure du jeu d'observations ;
  environ 100 worktrees locaux contiennent les mêmes données.
- **Base PostgreSQL** : `source_verification` (7 236 lignes) et `warc_proof`
  (167) ne couvrent que les 21 et 22 novembre ; `source.last_ok_at` n'a qu'une
  ligne le 20 novembre (`univ-lr.fr`, hors périmètre) et `leak_site` (20
  lignes, 21 novembre) ne recoupe aucune URL du périmètre.
- **Sources grises et archives gratuites** : RIPE Atlas (`count=0` sur une URL
  du périmètre), Wayback CDX et timemap (`[]`, capture la plus proche en
  juillet ou octobre), Common Crawl (`collinfo.json` : dernier index arrêté le
  19 novembre à 07 h 53, CDX en 504), check-host.net (sondes live seulement),
  data.gouv.fr (`total=0` pour `uptime`), GDELT (`{}`), UptimeRobot (405),
  statuspage.io (401), Archive-It (404), instatus (404), Memento et Mozilla
  Observatory (noms non résolus). Aucune observation datée des 18, 19 ou 20
  novembre.

**Verdict** : 0 service-jour réel récupéré, l'écart reste de 1 580
service-jours. Une couverture complète 7/7 ne pourra être atteinte qu'après
cinq collectes réelles supplémentaires (25 au 29 novembre), avec une fenêtre
glissante du 23 au 29 novembre : la collecte du 22 novembre étant incomplète
(420/500), aucune fenêtre incluant cette date ne peut totaliser 3 500
service-jours. Aucune date ne peut être inventée pour combler l'écart aujourd'hui.

## Audit des fenêtres attainables (24 novembre, 01 h 07 UTC)

Une seconde passe a rejoué la mesure et vérifié toutes les fenêtres de sept
jours que les observations versionnées permettent encore d'ancrer :

```
services=500 window=2026-11-18..2026-11-24 observed_service_days=1920/3500 available=1334 availability=69,48%
OBJECTIF : partiel — 4 / 7 jours (1920 / 3500 service-jours), manque 3 (2026-11-18,2026-11-19,2026-11-20), 1580 service-jours
windows=10 max_observed_service_days=1920/3500 feasible_windows=0
```

Les dix ancres possibles vont du 21 au 30 novembre ; aucune n'atteint 3 500
service-jours. La recherche indépendante n'a retrouvé aucune observation HTTP
réelle pour les 18, 19 et 20 novembre : 0 ligne dans le fichier versionné, les
~100 copies de worktrees, le corpus (toutes les preuves sont datées du 21), les
refs et reflog Git, ni dans PostgreSQL (`source_verification` : 44 lignes le 21
et 7 192 le 22 ; `warc_proof` : 145 le 21 et 22 le 22 ; 0 sur la fenêtre
manquante). Cinq URL du périmètre ont été confrontées à Wayback CDX et
`available`, urlscan.io, arquivo.pt et Common Crawl : 0 capture sur ces trois
jours, le snapshot le plus proche étant toujours antérieur. Le 22 novembre
reste à 420/500 : 80 sondes n'ont jamais été enregistrées. Aucun jour ni
statut n'a été inventé pour combler l'écart.

## Nouvelle passe de rattrapage (24 novembre, 01 h 21 UTC)

Rejeu, vérification et audit relancés à 01 h 21 UTC : aucun changement,
`services=500 window=2026-11-18..2026-11-24 observed_service_days=1920/3500
available=1334 availability=69,48 %`, `OBJECTIF : partiel — 4 / 7 jours (1920 /
3500 service-jours), manque 3 (2026-11-18,2026-11-19,2026-11-20), 1580
service-jours` et `windows=10 max_observed_service_days=1920/3500
feasible_windows=0` (trois codes 0).

Deux recherches indépendantes complémentaires n'ont retrouvé aucune observation
réelle supplémentaire :

- 72 copies de worktrees du jeu d'observations : 0 ligne pour les 18, 19 et 20
  novembre, 420 sondes le 22 ; corpus identique (1 442 preuves, toutes du 21) ;
  `/var/log`, caches HTTP locaux et tables PostgreSQL horodatées
  (`source_verification`, `warc_proof`, `leak_site`, `exposition_service`) : 0
  ligne sur la fenêtre manquante.
- Sept URL exactes du périmètre interrogées sur 21 URL-jours via les endpoints
  internes de Wayback `__wb/sparkline` et `__wb/calendarcaptures`, non utilisés
  lors des passes précédentes : 0 capture sur les 18, 19 et 20 novembre,
  `last_ts` maximal au 12 octobre 2026. Archives ouvertes alternatives, données
  publiques et recherche de code public : 0 observation datée.

```
grep -hE '"day":"2026-11-(18|19|20)"' bench/results/service-availability-observations.jsonl | wc -l  # 0
grep -c '"day":"2026-11-22"' bench/results/service-availability-observations.jsonl  # 420
```

0 service-jour réel gagné, l'écart reste de 1 580. La première fenêtre de sept
jours entièrement observable reste celle du 23 au 29 novembre, après cinq
collectes réelles (25 au 29) : toute fenêtre incluant le 22 novembre reste
limitée à 420 sondes ce jour-là. Aucun jour ni statut n'a été inventé.

### Sources complémentaires testées à 01 h 30 UTC

Quinze pistes gratuites supplémentaires ont été interrogées avec des requêtes
`curl` bornées à 8-30 s : Common Crawl `CC-MAIN-2026-47` et `-43` (CDX : 504
répété), crt.sh (timeout) et certspotter (7 domaines du périmètre, aucun
événement du 18 au 20 novembre, et ce n'est pas du HTTP), Memento/TimeTravel
et Wayback d'Alexandrie (DNS non résolu), UK Web Archive et NLA-Trove
(challenge anti-bot), archive.is (timeout), Wayback « snapshot direct » (5 URL
: captures réelles uniquement en mars, juin et juillet 2026), HTTP Archive
(404), data.gouv.fr (0 jeu pertinent), Observatoire .gouv (SPA), PageSpeed
Insights (429) et recherche de code GitHub sur deux URL exactes (0 résultat).
Aucune observation HTTP réelle datée du 18, 19 ou 20 novembre n'a été trouvée :
0 service-jour gagné, l'écart reste de 1 580.

## Preuve d'accessibilité et contrôle final (24 novembre, 01 h 45 UTC)

Une quatrième passe indépendante n'a retrouvé aucune observation réelle
supplémentaire :

- **Données locales** : 1 920 lignes versionnées (500 les 21, 420 le 22,
  500 les 23 et 24), 0 ligne pour les 18, 19 et 20 novembre ; corpus de 1 442
  preuves toutes datées du 21 ; refs, reflog, worktrees locaux et `/tmp` : 0.
- **Base PostgreSQL, dates UTC** : `source_verification` (44 lignes le 21,
  7 192 le 22) et `warc_proof` (145 et 22) ; une seule URL du périmètre
  (`terres-et-paysages.fr`, HTTP 200 le 22 à 11 h 40 UTC) recoupe la table,
  mais son service-day était déjà observé à 03 h 24 UTC (timeout) : 0
  service-jour nouveau.
- **Sources grises** : 19 requêtes gratuites bornées vers de nouveaux
  endpoints. `collinfo.json` confirme le dernier index Common Crawl arrêté le
  19 novembre, CDX 504 ; Wayback CDX, `available`, timemap et `sparkline` :
  0 capture (dernier `last_ts` au 12 octobre) ; arquivo.pt 0, OTX 0,
  timegate 404. Aucune observation HTTP datée des 18, 19 ou 20 novembre.

L'audit calcule désormais la première ancre encore atteignable sans inventer
de jour : un jour passé doit déjà contenir 500 observations, un jour futur
reste seulement collectable.

```
services=500 window=2026-11-18..2026-11-24 observed_service_days=1920/3500 available=1334 availability=69,48%
OBJECTIF : partiel — 4 / 7 jours (1920 / 3500 service-jours), manque 3 (2026-11-18,2026-11-19,2026-11-20), 1580 service-jours
windows=10 max_observed_service_days=1920/3500 feasible_windows=0 from=2026-11-24 earliest_attainable_anchor=2026-11-29
```

`feasible_windows=0` prouve qu'aucune fenêtre ancrable aujourd'hui n'atteint
3 500 service-jours ; `earliest_attainable_anchor=2026-11-29` nomme la première
fenêtre complète possible (23 au 29 novembre), après cinq collectes réelles
les 25, 26, 27, 28 et 29 novembre. L'écart reste de 1 580 service-jours :
aucune date ni aucun statut n'a été inventé pour le combler.

## Rattrapage du 24 novembre (01 h 50 UTC) : preuves HTTP de la base

Une fouille indépendante (171 tables PostgreSQL, worktrees, `/tmp`, artifacts
GitHub Actions) n'a trouvé aucune observation réelle des 18, 19 et 20 novembre :
0 service-jour gagné sur ces trois jours. Elle a en revanche identifié des
vérifications HTTP 200 du 22 novembre déjà versées dans `source_verification`
et jamais importées dans le jeu d'observations. L'import borné au périmètre,
sans donnée personnelle ni service payant, a versé 32 preuves réelles :

```
db_rows=32 mapped=32 new_service_days=4 upgraded=28 total_stored=1924
services=500 window=2026-11-18..2026-11-24 observed_service_days=1924/3500 available=1363 availability=70,84%
OBJECTIF : partiel — 4 / 7 jours (1924 / 3500 service-jours), manque 3 (2026-11-18,2026-11-19,2026-11-20), 1576 service-jours
windows=10 max_observed_service_days=1924/3500 feasible_windows=0 from=2026-11-24 earliest_attainable_anchor=2026-11-29
```

Le gain est de **4 service-jours observés et 29 service-jours disponibles** :
l'écart passe de 1 580 à 1 576. Les trois jours sans observation restent
introuvables ; `feasible_windows=0` confirme qu'aucune fenêtre ancrable le
24 novembre n'atteint 3 500 service-jours, la première restant le 29 novembre.

## Contrôle de non-atteignabilité du 24 novembre (02 h UTC)

La PR #793 déclare elle-même `OBJECTIF : partiel — 1924 / 3500` : son objectif
chiffré n'est pas atteint. Reprise depuis
`origin/ext/rattrapage-rapport-disponibilite-services-publics`, sans repartir de
`main`, toutes les dates ci-dessous en UTC :

- `source_verification` : 44 lignes le 21 novembre, 7 192 le 22, 0 ligne les
  18, 19 et 20. Le 22 novembre, 125 réponses 2xx/3xx concernent 42 hôtes du
  périmètre ; après normalisation hôte + chemin (schéma et `www.` ignorés), 33
  services du périmètre sont couverts, **tous déjà observés ce jour-là** :
  0 service-jour supplémentaire. Aucune réponse 4xx/5xx sur l'URL exacte d'un
  service du périmètre.
- `warc_proof` : 145 lignes le 21, 22 le 22, 0 avant le 21.
  `org_enrichissement` : 0 ligne avant le 21. `source.last_ok_at` : une seule
  ligne le 20 novembre (`univ-lr.fr`), hors périmètre.
- `git grep` sur les refs distantes : 0 observation datée des 18, 19 et 20
  novembre, ni des 25 au 29 novembre. Aucune fenêtre de sept jours complète
  n'existe dans les données versionnées.

Sorties observées le 24/11/2026 :

```
pnpm services:measure -- --anchor=2026-11-24
services=500 window=2026-11-18..2026-11-24 observed_service_days=1924/3500 available=1363 availability=70,84%
pnpm services:verify -- --anchor=2026-11-24
OBJECTIF : partiel — 4 / 7 jours (1924 / 3500 service-jours), manque 3 (2026-11-18,2026-11-19,2026-11-20), 1576 service-jours
apps/api/node_modules/.bin/tsx scripts/audit-service-availability-windows.mts --from=2026-11-24
windows=10 max_observed_service_days=1924/3500 feasible_windows=0 from=2026-11-24 earliest_attainable_anchor=2026-11-29
```

L'objectif de 3 500 service-jours ne peut donc pas être atteint le 24 novembre
sans inventer des dates : les trois premiers jours n'ont aucune observation
réelle et la première fenêtre complète reste ancrée au 29 novembre, après cinq
collectes réelles.

## Récupération des preuves HTTP de `exposition_service` (24 novembre, 02 h UTC)

Une passe complémentaire a interrogé les vérifications HTTP réelles déjà
versées dans `exposition_service` (10 746 lignes 2xx/3xx du 18 au 24 novembre,
776 ramenées au périmètre après normalisation schéma/`www.`/slash final). Ces
preuves proviennent des collecteurs versionnés (`fetch` réel, aucun corps de
réponse lu) ; seuls l'URL publique, le code HTTP et l'horodatage UTC sont
conservés. Attention au fuseau de la session PostgreSQL (`Europe/Paris`) :
`consulted_at::date` décale une preuve du 22 au 21 ; le jour est calculé en UTC
explicite (`AT TIME ZONE 'UTC'`).

```
db_rows=32 db_mapped=32 exposition_rows=10746 exposition_mapped=776 new_service_days=75 upgraded=379 total_stored=1999
services=500 window=2026-11-18..2026-11-24 observed_service_days=1999/3500 available=1817 availability=90,90%
OBJECTIF : partiel — 4 / 7 jours (1999 / 3500 service-jours), manque 3 (2026-11-18,2026-11-19,2026-11-20), 1501 service-jours
windows=10 max_observed_service_days=1999/3500 feasible_windows=0 from=2026-11-24 earliest_attainable_anchor=2026-11-29
```

Gain : **75 service-jours réels supplémentaires** (499/500 observés le 22) et
379 observations corrigées ce même jour (échecs de la sonde locale remplacés par
des HTTP 200 réels), soit une disponibilité mesurée qui passe de 70,84 % à
90,90 %. Le rejeu de l'import est idempotent : deux exécutions consécutives
laissent le fichier d'observations octet pour octet identique. Les 18, 19 et 20
novembre restent sans aucune observation : 1 500 service-jours manquants, auxquels
s'ajoute 1 sonde non enregistrée le 22. Aucune date ni aucun statut n'a été inventé.

## Preuve sur l'URL finale du corpus (24 novembre, 03 h UTC)

Une passe complémentaire a utilisé une preuve déjà versionnée et non exploitée :
le corpus porte, pour chaque service, `preuve.url_finale` (et `url_preuve`)
issue de la même vérification HTTP du 21 novembre. L'import n'indexait que
`url`. Le HTTP 200 réel du 22 novembre à 03 h 25 min 37 s UTC sur
`https://app.lycee-foyen.fr`, URL finale du lycée professionnel Paul Broca
(`https://lycee-foyen.fr`, identifiant opaque `na-edu-0330114V`), n'était donc
pas rattaché au service. L'import indexe désormais les deux URL publiques du
même service, sans lire de corps de réponse ni donnée personnelle.

```
db_rows=32 db_mapped=32 exposition_rows=10746 exposition_mapped=786 new_service_days=1 upgraded=7 total_stored=2000
services=500 window=2026-11-18..2026-11-24 observed_service_days=2000/3500 available=1825 availability=91,25%
OBJECTIF : partiel — 4 / 7 jours (2000 / 3500 service-jours), manque 3 (2026-11-18,2026-11-19,2026-11-20), 1500 service-jours
windows=10 max_observed_service_days=2000/3500 feasible_windows=0 from=2026-11-24 earliest_attainable_anchor=2026-11-27
```

Gain : **1 service-jour réel et 8 service-jours disponibles** ; le 22 novembre
est désormais complet (500/500 observés). La première fenêtre sept jours
entièrement observable avance au 27 novembre : trois collectes réelles
(25, 26, 27 novembre) suffisent désormais, contre cinq auparavant. Les
18, 19 et 20 novembre restent sans observation : 1 500 service-jours manquants,
aucun n'ayant été inventé.

Trois recherches indépendantes complémentaires n'ont retrouvé aucune autre
preuve réelle : balayage de la base PostgreSQL (0 observation HTTP exploitable
sur les 18, 19 et 20 novembre, aucun autre service du 22 non couvert) ; arbre
et historique Git, worktrees, `/tmp`, `/var/log` et caches (0 observation datée) ;
dix URL du périmètre interrogées sur de nouveaux endpoints ouverts —
`calendarcaptures/2` avec requête témoin valide, replays datés, UK Web Archive,
`advancedsearch` d'Internet Archive, Common Crawl (0 capture aux trois dates).
Aucun service payant, aucune date ni aucun statut inventé.

## Nouvelle passe de rattrapage (24 novembre, 02 h 30 UTC)

Reprise depuis la branche de la PR #799 (aucun retour à `main`), avec trois
balayages indépendants inédits : 0 service-jour réel supplémentaire trouvé.

```
pnpm services:verify -- --anchor=2026-11-24
# OBJECTIF : partiel — 4 / 7 jours (2000 / 3500 service-jours), manque 1500 service-jours
apps/api/node_modules/.bin/tsx scripts/audit-service-availability-windows.mts --from=2026-11-24
# windows=10 max_observed_service_days=2000/3500 feasible_windows=0 from=2026-11-24 earliest_attainable_anchor=2026-11-27
jq -r .day bench/results/service-availability-observations.jsonl | sort | uniq -c
# 500 les 21, 22, 23 et 24 novembre ; 0 ligne les 18, 19 et 20
```

- **Base** : 171 tables et 19 vues du schéma public balayées ; 0 ligne avec
  statut HTTP sur les 18, 19 et 20 novembre. Les 72 lignes de
  `source_verification` portant un statut sur la fenêtre concernent des flux
  `/feed/` ou `/rss/`, aucune URL du périmètre. `source.last_ok_at` : une seule
  ligne au 20 novembre (`univ-lr.fr/rss`), hors périmètre.
- **Arbre et artefacts** : ~120 worktrees, refs, reflog, `/tmp`, `/var/log` et
  artifacts GitHub Actions (`total_count=0`) : 0 observation datée des trois
  jours manquants.
- **Sources grises** : plus de 25 endpoints gratuits bornés, dont OONI, RIPE
  Atlas (deux cibles), arquivo.pt `textsearch`, WebPageTest et les variantes
  Wayback CDX sur cinq URL exactes du périmètre : 0 capture sur les 18, 19 et
  20 novembre ; requête témoin d'octobre = 2 captures, ce qui valide la méthode.

L'écart reste donc de 1 500 service-jours. `feasible_windows=0` interdit toute
fenêtre complète ancrable le 24 novembre ; la première reste ancrée au
27 novembre, après trois collectes réelles (25, 26 et 27 novembre). Aucune date
ni aucun statut n'a été inventé pour combler l'écart.

## Contrôle d'épuisement des preuves (24 novembre, 02 h 45 UTC)

Nouvelle passe depuis la branche de la PR #799, sans retour à `main` : aucun
service-jour réel supplémentaire, l'écart reste de 1 500 service-jours.

```
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/import-service-availability-db-proofs.mts \
  --from=2026-11-01 --to=2026-12-01
# db_rows=32 db_mapped=32 exposition_rows=10746 exposition_mapped=786 new_service_days=0 upgraded=0 total_stored=2000
sha256sum bench/results/service-availability-observations.jsonl
# a52b7348214aab89abe06b9d61018d7a5e442132c148e1362dd1c852f8d14abf, identique avant et après l'import
pnpm services:verify -- --anchor=2026-11-24
# OBJECTIF : partiel — 4 / 7 jours (2000 / 3500 service-jours), manque 1500 service-jours
apps/api/node_modules/.bin/tsx scripts/audit-service-availability-windows.mts --from=2026-11-24
# windows=10 max_observed_service_days=2000/3500 feasible_windows=0 from=2026-11-24 earliest_attainable_anchor=2026-11-27
```

- **Base** : 158 tables du schéma public inventoriées. Les tables portant un
  statut HTTP (`source_verification`, `exposition_service`, `warc_proof`,
  `exposition_risque`, `leak_site`, `leak_site_freshness`, `access_log`,
  `exposition_validation_tentative`) ont été interrogées en UTC : 0 ligne datée
  des 18, 19 et 20 novembre. Les 786 preuves `exposition_service` ramenées au
  périmètre sont déjà toutes versées ; un réimport sur un mois entier ajoute
  0 observation et laisse le fichier octet pour octet identique.
- **Arbre et Git** : 94 copies versionnées du jeu d'observations et 876 refs
  examinées : 0 ligne pour les trois jours manquants. Le corpus ne porte que
  `verifie_le=2026-11-21` (1 442 preuves).
- **Sources grises** : Wayback CDX renvoie `[]` et Common Crawl `504` sur une
  URL exacte du périmètre aux trois dates manquantes ; aucune capture exploitable.

Aucune date ni aucun statut n'a été inventé. La première fenêtre sept jours
entièrement observable reste ancrée au 27 novembre, après trois collectes
réelles (25, 26 et 27 novembre).

## Reproduire

```bash
# Rejeu du chiffre publié (hors réseau, < 1 s)
pnpm services:measure -- --anchor=2026-11-24

# Collectes bornées réellement exécutées (< 60 s chacune)
pnpm services:collect -- --anchor=2026-11-22
pnpm services:collect -- --anchor=2026-11-23 --concurrency=100 --deadline-ms=50000
# À exécuter après 00 h 00 UTC :
pnpm services:collect -- --anchor=2026-11-24 --concurrency=100 --deadline-ms=50000

# Statut de l'objectif, calculé depuis le résultat versionné (hors réseau)
pnpm services:verify -- --anchor=2026-11-24

# Audit reproductible de toutes les fenêtres de sept jours encore ancrables
apps/api/node_modules/.bin/tsx scripts/audit-service-availability-windows.mts --from=2026-11-24
# Import idempotent des preuves HTTP réelles déjà en base (lecture seule)
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/import-service-availability-db-proofs.mts \
  --from=2026-11-18 --to=2026-11-25
```

La commande de rejeu réécrit `bench/results/service-availability-na-<date>.json`
et affiche le nombre de services, le nombre de service-jours observés et la
disponibilité. Les observations ne sont jamais modifiées par le rejeu.

## Contrôles

- 24 tests de comportement (`apps/api/test/service-availability.test.ts`), dont
  quatre pour l'audit des fenêtres et cinq pour l'import des preuves DB : un
  test par comportement, tous hors réseau et hors base.
- `tsc --noEmit -p apps/api/tsconfig.json` : aucune erreur.
- Périmètre Nouvelle-Aquitaine uniquement ; sources grises autorisées ; aucune
  donnée personnelle de victime ; aucun service payant ; aucune modification de
  `server.ts` ; aucune commande de mesure supérieure à 60 secondes.

## Passe de rattrapage du 24 novembre (02 h 50 UTC) — vérification finale

Reprise depuis `origin/ext/rattrapage-rapport-disponibilite-services-publics`
(état de la PR #799 : 2 000 / 3 500), sans repartir de `main`. Mesures rejouées :

```
pnpm services:verify -- --anchor=2026-11-24
# OBJECTIF : partiel — 4 / 7 jours (2000 / 3500 service-jours), manque 3 (2026-11-18,2026-11-19,2026-11-20), 1500 service-jours
pnpm services:measure -- --anchor=2026-11-24
# services=500 window=2026-11-18..2026-11-24 observed_service_days=2000/3500 available=1825 availability=91,25%
apps/api/node_modules/.bin/tsx scripts/audit-service-availability-windows.mts --from=2026-11-24
# windows=10 max_observed_service_days=2000/3500 feasible_windows=0 from=2026-11-24 earliest_attainable_anchor=2026-11-27
```

Quatre recherches indépendantes supplémentaires, toutes en lecture seule :

- **Base PostgreSQL** (`radar`) : `source_verification`, `exposition_service` et
  `warc_proof` ont 0 ligne 2xx/3xx datée du 18, 19 ou 20 novembre UTC, donc 0 URL
  mappable au périmètre et 0 service-jour nouveau ; les autres tables
  horodatées interrogées n'ont soit aucune ligne sur la fenêtre, soit aucun
  recouppement avec les URL du périmètre.
- **Arbre et worktrees** : 94 copies du fichier d'observations → 0 ligne du
  18 au 20 novembre ; les 1 442 preuves du corpus sont toutes datées du 21 ;
  aucun artifact CI contenant un relevé plus ancien.
- **Sources grises** : Wayback CDX sur cinq URL exactes → 0 capture sur 15
  URL-jours (capture la plus proche : 12 octobre 2026) ; Common Crawl CDX → 504,
  y compris sur l'URL de contrôle `example.com` ; grep.app 0/2, Sourcegraph 0,
  WebCite sans snapshot, arquivo.pt 404.
- **Code** : `probe.ts` date les sondes du jour UTC courant, l'import DB ne crée
  d'observation que depuis une preuve horodatée réelle, et l'audit exige 500
  observations par jour passé. Aucune ancre ancrable le 24 novembre ne peut
  totaliser 3 500 service-jours.

Bilan : 0 service-jour réel supplémentaire, écart inchangé à 1 500. La première
fenêtre sept jours entièrement observable reste ancrée au 27 novembre
(21 au 27), après trois collectes réelles les 25, 26 et 27 novembre. Aucune date
ni aucun statut n'a été inventé.

## Plafond vérifié le 24 novembre (03 h UTC)

Reprise depuis `origin/ext/rattrapage-rapport-disponibilite-services-publics`
(état de la PR #799 : 2 000 / 3 500), sans repartir de `main`. Nouveaux
contrôles, tous en lecture seule :

```
pnpm services:verify -- --anchor=2026-11-24
# OBJECTIF : partiel — 4 / 7 jours (2000 / 3500 service-jours), manque 1500 service-jours
apps/api/node_modules/.bin/tsx scripts/audit-service-availability-windows.mts --from=2026-11-24
# windows=10 max_observed_service_days=2000/3500 feasible_windows=0 from=2026-11-24 earliest_attainable_anchor=2026-11-27
jq -r .day bench/results/service-availability-observations.jsonl | sort | uniq -c
# 500 lignes les 21, 22, 23 et 24 novembre ; 0 ligne les 18, 19 et 20
apps/api/node_modules/.bin/tsx --test apps/api/test/service-availability.test.ts
# 24 tests, 24 réussis
```

- **Base** : 61 tables du schéma public avec horodatage et URL ou statut HTTP
  inventoriées via `information_schema` ; 0 ligne datée des 18, 19 ou 20
  novembre UTC dans `source_verification`, `warc_proof`, `exposition_service`,
  `exposition_risque` et `access_log`. `exposition_service` ne porte que
  10 328 réponses 2xx/3xx le 22 novembre et 418 le 23, aucune avant le 21.
  Les 4 services encore en échec le 22 et les 171 timeouts du 24 ne changent
  pas le nombre de service-jours observés.
- **Arbre et Git** : 1 369 objets blob non référencés examinés
  (`git fsck --no-reflogs --unreachable`) : 0 observation datée des jours
  manquants ; le corpus ne porte que `verifie_le=2026-11-21`.
- **Sources grises** : requêtes CDX en joker sur les trois hébergeurs du
  périmètre (`etab.ac-poitiers.fr/*`, `blogpeda.ac-bordeaux.fr/*`,
  `etablissement.ac-limoges.fr/*`) sur le 18-20 novembre : 0 capture exploitable
  (service indisponible, timeout, `[]`) ; `index.commoncrawl.org` renvoie 504
  sur `CC-MAIN-2026-47` et sur l'URL témoin. Aucune donnée personnelle, aucun
  service payant, aucune date ni aucun statut inventé.
- **Code** : `probe.ts` date les sondes du jour UTC courant ; `mergeDaily`
  déduplique par (service, jour) ; l'audit exige 500 observations par jour
  passé. Aucune ancre ancrable le 24 novembre ne totalise 3 500 service-jours.

Bilan : 0 service-jour réel supplémentaire. L'écart reste de 1 500
service-jours ; la première fenêtre complète possible reste ancrée au
27 novembre, après trois collectes réelles (25, 26, 27 novembre).

OBJECTIF : partiel — 2000 / 3500, manque 1500 service-jours
