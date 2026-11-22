# Rapport — Index `.onion` à jour

## Chiffre mesuré

**49 sites `.onion` vivants et productifs.**

La mesure est reproductible avec une seule commande, hors réseau :

```bash
pnpm onion:index
```

Sortie observée :

```
onion index: 49 live and productive sites (77 sources, 70 sites; 61 live, 49 productive; evidence bench/results/tor-stability-after.json at 2026-11-21T20:29:36.381Z)
```

La commande écrit `bench/results/onion-index.json`. Deux exécutions consécutives
donnent la même empreinte `sha256 62aca7831dd9fe068fd40939ab343423d516716371d24594aaa8f12b03e51497`.

## État réel de départ

Le chantier part de l'état Versionné, sans jeu de démonstration :

- **1 673 151 organisations** (`bench/results/couverture-mesuree.json`, clé `base.organisations`) ;
- **312 sources**, 7 695 exécutions et **26 688 événements** (`bench/results/motifs-absence.md`, soit l'ordre de grandeur des « ~28 000 événements » de la consigne) ;
- **77 sources `.onion`** dans les trois catalogues `db/sources-onion*.sql`, dont 7 paires partagent la même adresse : **70 sites distincts** une fois dédupliqués par hôte.

## Méthode, en quatre étapes testées

1. **Catalogue** — `parseOnionCatalog()` lit les tuples `(id, name, family, url, …)` des trois fichiers SQL. `onionHost()` normalise l'hôte (minuscules, point final retiré, chemin ignoré) et refuse toute URL qui n'est pas `.onion`. Test : analyse d'un catalogue fictif, puis des 77 entrées réelles dont six URL comportent un chemin après `.onion`.
2. **Fraîcheur** — `pickLatestProbe()` choisit la plus récente mesure Tor Versionnée dans `bench/results`. La retenue est `bench/results/tor-stability-after.json` (2026-11-21T20:29:36.381Z) : 77 sources, un fetch réel chacune via `fetchResilient`, `maxAttempts=1`, délai 45 s, SOCKS5 local. Test : la mesure « after » bat la mesure « before », et l'absence de mesure est une erreur explicite.
3. **Classification** — un site est **vivant** si au moins une de ses sources a répondu HTTP 200 via Tor, **productif** si au moins une a livré un item extractible (`detectItems()`). Les deux conditions sont requises pour le chiffre publié. Test : quatre sources fictives, deux adresses en doublon, un site 200 sans item et un site 503 avec items — le décompte attendu est 1 site « vivant et productif ».
4. **Publication** — `buildOnionIndex()` ne laisse sortir que six champs par site (`host`, `sourceIds`, `live`, `productive`, `items`, `httpStatus`). Test : le chiffre réel (77 sources, 70 sites, 49 retenus) et l'absence de tout champ de revendication ou de donnée personnelle dans l'artefact.

L'API expose le même objet, recalculé depuis les mêmes preuves, sur
`GET /api/onion-index` (lecture publique, clés en anglais). Test dédié : statut 200,
périmètre `nouvelle-aquitaine`, chiffre 49. Le registre d'accès déclare cette
lecture comme publique ; six tests dédiés couvrent ce périmètre.

## Décomposition du chiffre

| Catégorie | Sites |
|---|---:|
| Sources `.onion` du catalogue | 77 |
| Sites `.onion` distincts | 70 |
| Vivants (HTTP 200) | 61 |
| Productifs (≥ 1 item) | 49 |
| **Vivants et productifs** | **49** |
| Vivants mais sans item extractible | 12 |
| Ni vivants ni productifs | 9 |

Les 12 sites vivants mais improductifs sont des pages HTTP 200 sans item
extractible (coquilles JavaScript, pages de challenge, contenus non structurés) :
un site qui répond n'est pas pour autant une source utile. Les deux sources
classées `blocked` par le sondage mais avec des items (`onion:ccw:insomnia` :
45 items, `onion:ccw:krybit` : 50 items) comptent comme productives : le critère
est l'item réellement extrait, pas l'étiquette de cause du sondage.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : l'index porte le périmètre `nouvelle-aquitaine` et ne recense que les sources alimentant l'observatoire régional ; aucune organisation hors périmètre n'est ajoutée.
- **Sources grises autorisées** : ce sont des miroirs publics de revendication, déjà présents dans le catalogue versionné ; aucun accès à un contenu privé, aucune négociation, aucun dump.
- **Aucune donnée personnelle de victime** : ni nom, ni email, ni titre de revendication, ni extrait de page ne figurent dans l'index ; seules des métadonnées de source sont publiées. Le sondage lui-même reste dans `bench/results` tel qu'il existe, sans recopie dans le nouvel artefact.
- **Aucun service payant** : lecture de fichiers versionnés, aucune clé d'API, aucun appel réseau.
- **Code et interface en anglais** : identifiants, commentaires, JSON et message de la commande sont en anglais ; le présent rapport est en français.
- **`server.ts` inchangé** : la route est enregistrée dans le registre unique `routes/index.ts` ; le diff de `apps/api/src/server.ts` est de **0 ligne**.
- **Aucune commande de plus de 60 s** : mesure 0,2 s (`pnpm run onion:index`), six tests 0,7 s (`tsx --test test/onion-index.test.ts`), typecheck API 6,3 s.

## Limites assumées

L'index rejoue la dernière mesure Tor versionnée, il ne relance pas de probe :
un changement d'état de site nécessite une nouvelle mesure `tor-stability-*.json`,
que la commande reprend alors automatiquement comme preuve la plus récente. Aucun
chiffre n'est extrapolé au-delà des 77 sources réellement mesurées.
