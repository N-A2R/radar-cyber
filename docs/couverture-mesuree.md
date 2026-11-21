# Couverture mesurée — corpus consolidé de 50 incidents

**Réponse mesurée le 21 novembre 2026** sur `bench/couverture/incidents.jsonl`
(50 incidents, publications du `2024-04-19` au `2026-10-14`) : le radar a vu
**0 incident sur 50 (0 %)**. Aucun événement de `event` ou `event_archive` ne
correspond à l'une de ces URL, à leur titre ou à leur organisation à la date de
publication : les 50 incidents portent le motif `pas_collecte`. Aucun délai
médian fait → collecte n'est calculable sur ce corpus.

**Ce chiffre est publiable** au sens de `docs/seuils-couverture.md` : les quatre
garde-fous passent. `GET /api/couverture` renvoie `publiable: true`,
`mention: null`, `raison: null`, avec le verdict détaillé sous `publication`.
La publication est désormais autorisée par les seuils ; elle ne rend pas le
chiffre meilleur — 0 % reste le résultat observé, avec ses preuves.

| Garde-fou | Mesure observée | Seuil | Résultat |
| --- | --- | --- | --- |
| Corpus | 50 incidents dans la fenêtre | ≥ 30 | passe |
| Référentiel | 4 secteurs attendus sur 4 présents | ≥ 3 sur 4 (75 %) | passe |
| Sources | 17 éditeurs distincts, part max 30 % (Sud Ouest, 15/50) | ≥ 5 éditeurs, part max ≤ 50 % | passe |
| Fenêtre | 909 jours du 2024-04-19 au 2026-10-14 | ≥ 90 jours | passe |

- Corpus : `bench/couverture/incidents.jsonl`, 50 lignes dedupliquées par `id`,
  séquence stable (aucun doublon).
- Empreinte SHA-256 du corpus consolidé :
  `fee9681c3869baffa645ac20b1679edb82c45597433185923734c4cdf0397c26`. Elle est
  identique dans `bench/couverture/HASH` et dans le rapport publié.
- État de la base au calcul : 312 sources, 26 719 événements, 4 710 événements
  archivés, 1 673 151 organisations ; 7 781 exécutions de collecte du
  2026-11-13 au 2026-11-21. Empreinte des lignes lues :
  `80de9f90ae633b31c35d5598cafad74302207a6f14d65676b5a1e49198a53282`.
- Décomposition : 50 `pas_collecte`, 0 `vu`, 0 `pas_rattache`, 0
  `pas_juge_cyber`, 0 `indetermine`. Les 12 départements et les 6 types sont
  tous à 0/50 ; le détail ligne par ligne, avec les trois requêtes SQL et leurs
  paramètres, est dans `bench/results/couverture-mesuree.json`.

La route `GET /api/couverture` sert exactement ce rapport, avec `publiable`,
`mention`, `raison` et le verdict détaillé sous `publication` en tête de
réponse. Le test `apps/api/test/couverture-api.test.ts` rejoue le script sur la
base et échoue si le chiffre servi diverge, même d'un incident.

## Ce que `pas_collecte` veut dire, et ce que ça ne veut pas dire

Un incident est « vu » lorsqu'un événement correspondant porte un `org_id`
non nul. Ici aucune correspondance n'est trouvée, et le média déclaré n'a aucun
événement ni exécution de collecteur le jour de la publication : le radar n'a
pas eu l'occasion de voir ces articles. C'est un état de la base de travail au
21 novembre 2026, pas une propriété des articles : une collecte rétrospective
ou une source déclarée plus tard changerait la mesure. Le corpus est rejoué
contre la base, il n'est pas ingéré.

## Mesure complémentaire — corpus de référence de 60 incidents

Le corpus de référence `bench/fixtures/corpus-reference-na.json` (60 incidents,
dont 42 publiés dans la fenêtre glissante `2025-11-01 → 2026-10-31`) fait
l'objet d'une autre mesure, publiée dans `bench/results/couverture-2026-11-21.json`
et décrite dans `docs/mesure-couverture.md`. Elle teste la porte d'admission et
le gazetteer sur un jeu plus large : le radar aurait vu **31 incidents sur 42
(73,8 %)**, dont **28 défendables (66,7 %)** — 23 rattachements exacts, 5
partiels, 3 hors sujet. Les 11 non vus se répartissent en 6 organisations
absentes du référentiel et 5 présentes mais non reconnues par le moteur ; 0
refus à l'admission. Ce chiffre diagnostique le rattachement, il n'est **pas**
celui servi par `GET /api/couverture`, qui porte sur les 50 incidents du corpus
consolidé.

Le délai médian entre la date du fait et sa première publication y est de
**2 jours** (41 incidents datés sur 42 ; maximum 1 834 jours). C'est une borne
basse : le radar ne peut pas voir avant la publication. Ce n'est **pas** sa
latence de collecte, qui se mesure sur le flux réel (1,9 jour médian sur 933
faits, bulletins CVE exclus — `docs/mesure-couverture.md`) : le corpus est
rejoué contre le moteur, il n'est pas ingéré, donc aucun délai réel par incident
n'est mesurable ici.

Cette mesure complémentaire est mauvaise mois par mois : **décembre 2025 (1/4,
25 %)** et **mars 2026 (1/3, 33,3 %)** sont très sous la cible de 60 %, et le
délai médian de publication passe de **25 jours en février 2026** à **1 jour en
octobre**. La moyenne annuelle cache ces trous ; ils sont publiés ci-dessous.

### Mois par mois (corpus de référence)

| Mois de publication | Publiés | Vus | Couverture | Délai médian fait → publication | Délai max |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2025-11 | 2 | 2 | 100 % | 17 j | 31 j |
| 2025-12 | 4 | 1 | 25 % | 2 j | 1 834 j |
| 2026-01 | 1 | 1 | 100 % | 2 j | 2 j |
| 2026-02 | 3 | 2 | 66,7 % | 25 j | 122 j |
| 2026-03 | 3 | 1 | 33,3 % | 13 j | 107 j |
| 2026-04 | 6 | 4 | 66,7 % | 3 j | 4 j |
| 2026-05 | 1 | 1 | 100 % | 3 j | 3 j |
| 2026-06 | 1 | 1 | 100 % | 4 j | 4 j |
| 2026-07 | 3 | 3 | 100 % | 0 j | 2 j |
| 2026-08 | 5 | 5 | 100 % | 2 j | 30 j |
| 2026-09 | 4 | 3 | 75 % | 5 j | 7 j |
| 2026-10 | 9 | 7 | 77,8 % | 1 j | 2 j |
| **Total** | **42** | **31** | **73,8 %** | **2 j** | **1 834 j** |

Le délai maximum de décembre 2025 est un incident de 2021 relaté en 2026 :
ce n'est pas une latence, c'est l'âge du fait. La médiane l'absorbe ; la
moyenne aurait été faussée. Un incident n'a pas de `dateIncident` et est exclu
du délai, pas du dénominateur de couverture.

### Graphique ASCII — délai médian par mois

```
Délai médian fait → publication (1 # = 1 jour) :
  2025-11 |#################                   |    17 j  (2/2 vus, n=2)
  2025-12 |##                                  |     2 j  (1/4 vus, n=4)
  2026-01 |##                                  |     2 j  (1/1 vus, n=1)
  2026-02 |#########################           |    25 j  (2/3 vus, n=3)
  2026-03 |#############                       |    13 j  (1/3 vus, n=3)
  2026-04 |###                                 |     3 j  (4/6 vus, n=6)
  2026-05 |###                                 |     3 j  (1/1 vus, n=1)
  2026-06 |####                                |     4 j  (1/1 vus, n=1)
  2026-07 |                                    |     0 j  (3/3 vus, n=3)
  2026-08 |##                                  |     2 j  (5/5 vus, n=5)
  2026-09 |#####                               |     5 j  (3/4 vus, n=3)
  2026-10 |#                                   |     1 j  (7/9 vus, n=9)
```

Les mois sans publication resteraient des barres vides, pas des lignes omises.
Ici les douze mois ont au moins un incident.

### Ce que les trois « vus » non défendables disent

| Incident | Organisation trouvée |
| --- | --- |
| Magasins de grande distribution touchés en Béarn et Soule | carrefour city |
| Réseau Alumni de l'Université de Bordeaux | alumnforce |
| FFRandonnée — fichier adhérents | federation francaise de la randonnee pedestre |

Le dernier cas est probablement une erreur du *classificateur de qualité* : le
sigle `FFRandonnée` développe correctement le nom trouvé. Le publier quand même
vaut mieux que d'arrondir le taux à la hausse : la mesure doit exposer ses
doutes, pas les absorber.

## Méthode et reproductibilité

- La mesure publiée consolide `bench/couverture/*.jsonl`, déduplique par `id`,
  trie par `id` et resérialise les lignes avant de calculer l'empreinte : ni
  l'ordre des fichiers ni l'ordre des lignes ne changent le hash. Elle rejoue
  chaque incident avec les trois requêtes SQL conservées dans le rapport. Les
  quatre seuils sont évalués avant le taux, par
  `apps/api/src/analyse/seuils-couverture.ts` ; aucun refus n'est masqué.
- Le script est déterministe : ni date murale, ni réseau, ni ordre aléatoire.
  La date de calcul vient de la dernière collecte en base. `--check` compare le
  rapport publié à un rejeu, `--stdout` ne écrit aucun fichier.
- La procédure complète, hors réseau et en une commande, est
  `docs/reproduction-couverture.md` : `bash scripts/reproduire.sh`.
- La fenêtre de la mesure complémentaire est calculée : 12 mois calendaires
  clos, du premier jour du mois douze mois avant au dernier jour du mois
  précédant la mesure. Le mois en cours est exclu pour ne pas faire baisser le
  taux pour des raisons de calendrier. `--fin=YYYY-MM-DD` fige le dernier mois
  inclus pour un rejeu.
- Chaque incident du corpus de référence passe par la porte d'admission du
  contrat (`contract/admit.ts`) puis par le moteur de rattachement réel
  (`match/gazetteer.ts`) — aucune simulation de détection.
- Base utilisée pour la mesure complémentaire : 1 244 048 organisations, issue
  de la restauration de l'image PostgreSQL locale du 20 novembre 2026, avec les
  migrations du dépôt appliquées. Le corpus et le script sont versionnés ;
  l'image de base ne l'est pas, ce qui limite la reproductibilité du taux brut.
- Limite du corpus consolidé : il s'arrête aux publications d'octobre 2026. La
  fenêtre glisse, le corpus non : une mesure faite plus tard devra ajouter les
  incidents des nouveaux mois avant d'afficher un taux.

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-couverture-systeme.mts
apps/api/node_modules/.bin/tsx scripts/mesure-couverture-systeme.mts --check
apps/api/node_modules/.bin/tsx scripts/mesure-couverture.mts --fin=2026-10-31   # corpus de référence
```
