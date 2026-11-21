# Rattachement : domaines racines et sigles au registre

Ce document décrit la chaîne de rattachement livrée pour les indices qui ne
sont pas des noms complets, et la mesure faite sur les indices réels de la file
de quarantaine. Il remplace les notes éparpillées dans les scripts de mesure :
une règle qui ne dit pas ce qu'elle refuse n'est pas auditable.

## Règles

### 1. Domaine racine

`match/domaine.ts` normalise les deux côtés de la comparaison :

- schéma, port, chemin, requête, identifiants `user:pass@`, point final, casse
  et `www.` sont retirés (`normalizeDomainValue`) ;
- tous les sous-domaines sont retirés par `domaineRacine`, qui conserve les
  suffixes publics composés (`com.br`, `com.ng`, `gob.pe`, …). Un suffixe nu
  (`com.br`) n'est jamais une racine : il ne rattache personne ;
- la racine est cherchée dans `org.domain`, `org.website` et les alias
  `org_alias.source='domain'`. Les trois sources portent la même clé.

La chaîne s'arrête au premier étage qui réussit :

| étage | critère | confiance |
|---|---|---|
| 1 | racine exacte | 0,95 (`via=domain`) |
| 2 | première étiquette distinctive (≥ 5 lettres) présente **une seule fois** dans un slug ou un nom | 0,75 |
| 3 | rien : l'indice reste en revue | 0 |

Un sous-domaine générique (`mail.`, `www.`, `api.`) ne fonde jamais un
rattachement vers son parent par lui-même ; c'est la racine calculée des deux
côtés qui le permet. Un TLD ne se compense pas (`.fr` ≠ `.com`).

### 2. Désambiguïsation

Quand plusieurs organisations portent la même clé, on ne tire pas au sort :

- le **domaine exact** porté par la source l'emporte sur sa racine, puis le
  département de la source (code INSEE ou libellé, `match/dept.ts`) ;
- l'intersection des deux critères est préférée à chacun d'eux ;
- un filtre sans résultat est ignoré ; plusieurs rescapés restent ambigus et
  le rattachement est refusé avec un motif (`raison`) écrit dans la trace.

Le domaine de la source est transmis au moteur par
`matchOrgInIndex` → `resoudreDomaine`. Le même départage vaut pour les sigles
(`desambiguiserSigles`) et pour la création d'organisation depuis un indice
(`from-hint.findExisting`), qui réutilise l'existante au lieu d'en créer une
doublon quand seul le préfixe du domaine diffère.

### 3. Sigles

`match/sigles.ts` charge l'index sigle → organisations (dénominations usuelles
SIRENE, sigles SIRENE, annuaire, usage). Deux garde-fous :

- une forme de sigle est refusée si elle ressemble à un mot courant (`ORANGE`) ;
- une confirmation n'est acceptée que si **toutes les sources actives** du
  registre sont d'accord. Limiter la recherche aux seules usuelles faisait
  « confirmer » `BMW` sur une seule organisation alors que cinq organisations
  portaient ce sigle au registre : c'était un faux positif. Le registre complet
  est donc consulté (`SQL_CANDIDATS_SIGLE`, toutes sources actives).

Un sigle partagé sans contexte discriminant reste ambigu. Le département de
l'organisation proposée par le moteur est un contexte **faible** : il peut
valider un faux positif. La mesure ci-dessous ne compte que les confirmations
fondées sur un contexte indépendant (domaine porté par l'indice) et garde les
confirmations par département proposé dans un compteur séparé.

## Cas d'erreur et états vides

- indice vide, `null`, domaine invalide ou suffixe public nu : aucun
  rattachement, motif explicite (`pas un domaine`, `organisation-vide`,
  `InvalidHintError` du côté création) ;
- index vide : `decideSigle` rend `inconnu`, `buildIndexSigles([])` rend une
  `Map` vide, `resoudreDomaine` rend `aucune` ;
- deux organisations incompatibles (domaine partagé, sigle partagé) : `ambigu`
  ou `aucune`, jamais un choix arbitraire ;
- département divergent dans une fiche de corpus : `faux-positif`, même si le
  nom ou le domaine concordent ;
- erreur de base : l'échec remonte, le cache d'index est invalidé pour ne pas
  garder un état partiel en mémoire.

## Mesure sur les indices réels

```bash
apps/api/node_modules/.bin/tsx scripts/mesure-rattachement-file.mts
# équivalent : pnpm mesure:rattachement
```

Lecture seule sur `radar:5433`, transaction `READ ONLY`, aucun domaine ni
organisation injecté. Le script charge les organisations porteuses d'un
domaine, celles dont le nom ou le slug porte une racine de la file, puis
l'index des sigles ; le moteur pur tranche sur ce sur-ensemble. Le résultat est
écrit dans `bench/results/rattachement-file.json` avec le hash de la file.

Relevé du 2026-11-21 (`sha256_file` dans le JSON). La colonne « historique »
reprend les mesures déjà versionnées, qui ne chargeaient que les organisations
porteuses d'un domaine et l'index des seules usuelles ; la colonne « livrée »
est la mesure complète ci-dessus :

| population | historique | livrée |
|---|---:|---:|
| indices pending avec indice | 200 | 200 |
| familles domaine / nom / sigle / vide | 163 / 37 / 0 / 0 | idem |
| domaines rattachés par domaine racine | 0 (index tronqué) | **2** |
| sigles confirmés sur contexte indépendant | 3 faux positifs (usuelles seules) | **0** (4 ambigus) |
| propositions de rattachement toutes familles | non mesuré | **3 / 200 (1,5 %)** |
| promotions automatiques (≥ 0,85) | 0 | 0 |

Les deux rattachements par domaine racine sont `owens-minor.com` → `OWENS`
(33) et `pizwich.com` → `PIZWICH` (16), à 0,75 : ils restent soumis à la revue
humaine, le seuil automatique étant 0,85. Le troisième est un nom
(`bastion.internal` → `LE BASTION`, 0,7). Sur la cohorte gelée des 220 indices
où 20 organisations ont été créées depuis un domaine, la mesure historique
(`bench/results/domaines-racine.json`) reste à 19 domaines rattachés sur 182.

Le plafond est une propriété du référentiel, pas du code : sur 1,67 M
organisations, 88 portent un domaine et 19 un alias de type domaine. Les 161
autres indices-domaines n'ont aucune organisation porteuse de leur racine ; un
meilleur score exigerait des données de domaine supplémentaires, pas une
règle plus permissive.
