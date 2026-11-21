# Sources productives par famille

Mesure exécutée le 2026-11-21 sur la base live, en lecture seule, avec
`apps/api/node_modules/.bin/tsx scripts/sources-productives.mts` (sortie `--json`
disponible pour rejouer le tableau).

| Famille | Sources déclarées | Sources productives | Taux de sources rouges | Délai moyen de production |
| --- | ---: | ---: | ---: | ---: |
| presse | 63 | 32 | 58,7 % | 17,2 h |
| radio | 3 | 0 | 100,0 % | — |
| CERT | 16 | 12 | 37,5 % | 11,9 h |
| ransomware | 100 | 11 | 90,0 % | 8,6 h |
| CT log | 1 | 0 | 100,0 % | — |

## Définition des mesures

- **Source productive** : au moins un événement rattaché, toutes dates
  confondues — la définition du README, pas celle de « source active » (qui
  exige un fait sur 7 jours).
- **Source rouge** : aucun événement, ou dernier fait antérieur à 7 jours.
  Même règle que `/health/detail`, `/health/causes` et
  `scripts/qualite-donnees.mts`. Le taux est calculé sur toutes les sources
  déclarées, y compris désactivées : c'est volontaire, mais cela gonfle
  artificiellement le rouge des familles dont une grande partie du catalogue
  est à l'arrêt (cas du ransomware, voir ci-dessous).
- **Délai moyen de production** : moyenne, par source productive disposant d'au
  moins un `collector_run`, entre son premier run et son premier événement
  collecté. Les écarts négatifs (horodatages importés antérieurs au premier run
  enregistré) sont ramenés à zéro. Le tiret signifie « non mesurable » : aucune
  source de la famille n'a produit.

## Familles : règles de rattachement

Le champ `source.family` ne contient ni `radio` ni `CT log` : ces deux groupes
sont déduits des métadonnées, par ordre de priorité dans le SQL du script.

| Famille | Règle |
| --- | --- |
| CT log | identifiant `ctlog`, nom contenant « certificate transparency » ou URL `crt.sh` |
| radio | licence « radio publique » ou nom commençant par ICI / France Bleu |
| CERT | `source.family` dans `cert`, `cert_fr` |
| ransomware | `source.family = ransomware` |
| presse | `source.family` dans `presse`, `presse_cyber`, licence `presse`, ou identifiant préfixé `presse-`, `gn-`, `eco-` |

La règle radio est évaluée avant la règle presse : les flux `presse-ici-*`
sont donc comptés comme radio, pas comme presse. Les 129 autres sources
(cti hors presse/radio/CT log, vuln, leaks, reputation, paste, phishing,
warninglist) ne font pas partie des cinq familles demandées.

## Familles à abandonner

**À abandonner : radio et CT log.**

- **radio** — 3 sources déclarées, 0 productive, 100 % rouge. Les deux flux ICI
  encore actifs (`presse-ici-creuse`, `presse-ici-limousin-infos`) ont été
  collectés avec succès le 21/11/2026 et n'ont produit aucun événement ; France
  Bleu est déjà désactivée depuis la migration 033 (redirection vers ICI sans
  items RSS). Le coût de collecte est réel, le rendement nul.
- **CT log** — 1 source déclarée, 0 productive, 100 % rouge. `ctlog` a un
  `last_ok_at` au 21/11/2026 et 5 runs enregistrés, mais aucun événement : le
  collecteur tourne sans alimenter le radar. Ce flux sert à la découverte
  d'actifs (`docs/detection.md`) ; l'abandon porte sur sa comptabilisation
  comme source productrice d'événements, pas sur son rôle d'outil de
  découverte, à vérifier avant arrêt complet.

**À conserver, avec correction de périmètre :**

- **CERT** (12 productives sur 16, 37,5 % rouge) et **presse** (32 sur 63,
  58,7 % rouge) produisent régulièrement : leur délai moyen (11,9 h et 17,2 h)
  est un délai de mise en route, pas un délai de détection.
- **ransomware** : le 90 % rouge est trompeur. Sur 100 sources déclarées, 88
  sont désactivées et n'entrent dans le rouge que parce qu'elles n'ont plus de
  fait récent ; parmi les 12 sources actives, 11 sont productives et 2 seulement
  sont rouges. Il faut purger les 88 sources inactives du catalogue, pas
  abandonner la famille.

Règle de décision appliquée : famille à abandonner si elle a **zéro source
productive** et **100 % de sources rouges**, avec des collectes réellement
exécutées. Le délai moyen ne peut pas départager ces familles puisqu'il est
non mesurable quand rien n'est produit.
