# Surveillance BGP — détection de détournement de préfixe en Nouvelle-Aquitaine

Mesure du 22 novembre 2026, branche `ext/chantier-p3`.

## Objectif et résultat

L'objectif était de détecter un détournement de préfixe touchant un opérateur de
Nouvelle-Aquitaine, avec une validation sur données historiques.

**Chiffre retenu : 1 détournement détecté sur 1 injecté, 0 faux positif sur
346 annonces historiques réelles** (précision 1,0000 ; rappel 1,0000). L'alerte
produite porte sur le préfixe `185.218.32.0/23`, annoncé par un AS non autorisé
alors que le préfixe parent `185.218.32.0/22` appartient à REZOCEAN SAS
(AS198551), opérateur télécom de Nouvelle-Aquitaine.

## État réel de départ

La base de travail réelle (`localhost:5433/radar`, lecture seule) portait, au
moment de la mesure, **1 673 151 organisations, 312 sources et 26 259
événements**. Ce sont les valeurs relevées, pas celles recopiées de l'énoncé :

```sql
SELECT (SELECT count(*) FROM org) AS orgs,
       (SELECT count(*) FROM source) AS sources,
       (SELECT count(*) FROM event) AS events;
```

Le détecteur lui-même ne lit ni la base, ni l'horloge, ni le réseau : il ne
consomme que le jeu versionné décrit ci-dessous. La base n'est consultée qu'avec
`--with-db`, dans une transaction `READ ONLY`, pour publier l'état de départ.

## Opérateurs retenus

Deux opérateurs réels de Nouvelle-Aquitaine, identifiés par des sources
publiques gratuites et sans donnée personnelle :

| Opérateur | ASN | Preuve publique |
| --- | --- | --- |
| REZOCEAN SAS (Société Atlantique de Téléphonie et Communication) | 198551 | `PeeringDB net 198551`, `RIPEstat as-overview` (titulaire `REZOCEAN-AS`) |
| Région Nouvelle-Aquitaine | 208458 | `PeeringDB net 208458`, `RIPEstat as-overview` (titulaire `NOUVELLE-AQUITAINE`) |

Les préfixes surveillés sont ceux effectivement annoncés par ces AS dans
`RIPEstat announced-prefixes` (21 préfixes IPv4 observés dans la fenêtre, 23 et
3 préfixes déclarés respectivement). Aucun opérateur hors région n'entre dans le
périmètre : le détecteur filtre sur `region === "NA"`.

## Jeu historique et provenance

`bench/fixtures/bgp-na-historical.json` (69 704 octets, SHA-256
`1d1830d08efcfbae8aebdbeaad840836f54bce40c1a88f940fef18bb0c8f6335`) contient :

- **346 annonces BGP réelles** observées le 21 novembre 2026 de 10:00 à 11:00
  UTC, obtenues par `RIPEstat /data/bgp-updates/data.json` sur les préfixes des
  deux opérateurs. Toutes ont pour origine l'AS attendu ; elles servent de
  référence négative (zéro faux positif attendu).
- **1 événement de rejeu** (`source: documented-replay`) : une annonce plus
  spécifique `185.218.32.0/23` par `AS64496`. Il reproduit le motif documenté du
  détournement du 27 juin 2024 (route `/32` de `1.1.1.1` annoncée par
  `AS267613`, Eletronet) transplanté sur le préfixe de l'opérateur NA.

Ce dernier point est une limite à énoncer clairement : l'incident injecté est un
**rejeu de motif documenté**, pas un incident historiquement observé chez
REZOCEAN. La mesure prouve que le détecteur aurait détecté ce motif sur des
annonces historiques réelles ; elle ne prétend pas qu'un tel détournement a eu
lieu chez cet opérateur. Les annonces de fond, elles, sont bien des données
historiques observées.

Sources utilisées : RIPEstat (API de données de RIPE NCC) et PeeringDB, toutes
deux publiques et gratuites ; aucune source payante, aucune donnée personnelle de
victime. Les sources grises autorisées par le chantier n'étaient pas nécessaires.

## Commande reproductible

```bash
apps/api/node_modules/.bin/tsx scripts/measure-bgp-hijack.mts --with-db
# ou, depuis la racine : pnpm measure:bgp-hijack
```

Sortie observée :

```text
dataset: Historical BGP announcements for Nouvelle-Aquitaine network operators
source: RIPE NCC RIPEstat data API (free, public) : bgp-updates, announced-prefixes, as-overview
window: 2026-11-21T10:00:00Z → 2026-11-21T11:00:00Z
operator: REZOCEAN SAS (AS198551, NA)
operator: Region Nouvelle-Aquitaine (AS208458, NA)
real_announcements: 346
injected_hijacks: 1
hijacks_detected: 1
false_positives: 0
precision: 1.0000
recall: 1.0000
personal_data_findings: 0
alert: more-specific 185.218.32.0/23 origin=AS64496 expected=AS198551 operator="REZOCEAN SAS" at 2026-11-21T10:30:00Z
baseline_orgs: 1673151
baseline_sources: 312
baseline_events: 26259
```

La commande termine avec un code non nul si le nombre détecté diffère du nombre
injecté, si un faux positif apparaît ou si une donnée personnelle est trouvée
dans une alerte. Durée mesurée : environ 1 s, bien sous la limite de 60 s.

## Comportements testés

`apps/api/test/bgp-hijack.test.ts` — 12 tests, un par comportement, tous verts :
analyse IPv4/IPv6 et invalidité CIDR, appartenance d'un préfixe (même famille),
annonce légitime silencieuse, changement d'origine, préfixe plus spécifique,
préfixe plus spécifique légitime, hors périmètre NA, retrait ignoré,
déduplication, liste d'origines autorisées, rejeu historique, absence de donnée
personnelle. Validation :

```bash
cd apps/api && node_modules/.bin/tsx test/run.ts test/bgp-hijack.test.ts
# # tests 12 / # pass 12 / # fail 0
```

Le typage est vérifié avec
`apps/api/node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json` (exit 0).

## Contraintes

- **Nouvelle-Aquitaine uniquement** : filtre `region === "NA"` dans le détecteur
  et opérateurs tous NA ; un test vérifie qu'un opérateur hors région est ignoré.
- **Sources grises autorisées** : non utilisées ; uniquement RIPEstat et
  PeeringDB, publics et gratuits.
- **Aucune donnée personnelle de victime** : le détecteur ne produit que des
  identifiants d'opérateur, des préfixes, des AS, des horodatages et des identifiants
  de collecteur. Un garde-fou (`personalDataFindings`) et un test dédié vérifient
  l'absence d'e-mail, de téléphone ou de libellé personnel ; mesure : 0.
- **Aucun service payant** : aucune clé, aucun abonnement, aucun appel facturé.
- **Code et interface en anglais** : module, tests, script de mesure et sortie
  console sont en anglais ; le présent rapport est en français.
- **`server.ts` inchangé** : 0 ligne de diff (aucune route ajoutée), la limite
  autorisée étant 10 lignes.
- **Aucune commande de plus de 60 s** : la plus longue mesure observationnelle
  a duré 53 s (balayage d'ASRIPEstat) ; toutes les commandes livrées avec ce
  changement sont sous 3 s.

## Limites

La fenêtre RIPEstat conservée ne couvre qu'environ deux semaines : le jeu ne
prouve pas une capacité de détection sur plusieurs années. Le rejeu injecté
valide un motif d'attaque, pas un incident réel survenu chez l'opérateur NA. Le
détecteur ne compare pas les chemins AS complets ni les ROV/RPKI ; il se limite
aux changements d'origine et aux préfixes plus spécifiques, ce qui est suffisant
pour l'objectif mesuré.

OBJECTIF : atteint — 1 / 1 détournement détecté sur injecté, 0 faux positif sur 346 annonces historiques réelles (mesure du 22/11/2026 : `apps/api/node_modules/.bin/tsx scripts/measure-bgp-hijack.mts --with-db` → `hijacks_detected: 1`, `false_positives: 0`, `real_announcements: 346`, code 0).
