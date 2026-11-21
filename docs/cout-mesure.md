# Coût de la mesure de couverture — 21 novembre 2026

Ce document donne le **coût réel**, mesuré sur cette machine, de la production
du chiffre de couverture de bout en bout : collecte du corpus, rattachement,
mesure. Aucun chiffre n'est estimé : tous proviennent des compteurs du processus
et de PostgreSQL pendant 15 rejeux consécutifs de la chaîne livrée.

## Périmètre

La chaîne est celle de [`docs/mesure-couverture.md`](mesure-couverture.md) :

1. **collecte** — lecture des 60 incidents de `bench/fixtures/corpus-reference-na.json`
   (SHA-256 `a6634b37f84e896f…`), construction des 60 événements normalisés et
   passage par la porte d'admission du contrat (`contract/admit.ts`) ;
2. **rattachement** — chargement de l'index (`getGazetteer`, `preparerGazetteer`),
   décision du moteur (`designateOrganization`) sur les 60 textes, puis sondage
   du référentiel pour motiver chaque non-rattaché ;
3. **mesure** — agrégation des motifs, requêtes de publication, classement de la
   qualité des rattachements, sortie console et JSON.

La collecte réseau des sources (296 flux) **n'est pas** dans ce périmètre : le
corpus est versionné et la mesure le rejoue, exactement comme le script livré.
L'import initial du référentiel n'est pas compté non plus ; il est préalable à
toute mesure.

## Machine et base

| | |
|---|---|
| Hôte | Linux 6.18.54-instabox, x86_64 |
| CPU | AMD EPYC, **4 vCPU** |
| Mémoire | 8 351 297 536 octets (7,8 GiB), pas de swap |
| Node / pnpm | v22.23.3 / 12.15.0 |
| PostgreSQL | 18.7 (Debian), `shared_buffers = 128 MB` |
| Base de mesure | `radar_cout_mesure_20261121`, 27 Mo |
| Contenu de la base | 4 462 organisations, 22 904 alias actifs, 311 sources, 500 revendications, 52 migrations |
| Résultat affiché | `Couverture : 6/42 (14,3 %)` — 42 incidents dans la fenêtre, 18 hors fenêtre |

La base a été créée et chargée uniquement avec le socle versionné, sans réseau :

```bash
psql -h localhost -p 5432 -U radar -d postgres -c 'CREATE DATABASE radar_cout_mesure_20261121'
DATABASE_URL='postgres://radar:radar@localhost:5432/radar_cout_mesure_20261121' \
  apps/api/node_modules/.bin/tsx scripts/bootstrap.mts --with-sample
```

Le chiffre de couverture dépend de l'état de la base : sur la base préparée du
15 novembre (4 480 organisations, 22 947 alias), le même script affichait
`28/42 (66,7 %)` ([`couverture-mesuree.md`](couverture-mesuree.md)). Le coût a
aussi été relevé sur cette base (voir « Contrôle » plus bas) ; les chiffres
principaux ci-dessous viennent de la base fraîchement reconstruite, donc
reproductible par les deux commandes ci-dessus.

## Instrument et protocole

`scripts/mesure-couverture.mts` accepte depuis cette mesure un drapeau `--cout`
qui n'active aucun instrument sur le chemin normal. Quand il est passé, le
script écrit une ligne JSON `COUT {…}` avec les millisecondes par phase, le CPU
consommé (`process.resourceUsage()`), la mémoire maximale et les défauts de
page. La chronométrie intègre les attentes PostgreSQL dans la phase qui les
provoque.

```bash
for i in $(seq 1 15); do
  DATABASE_URL='postgres://radar:radar@localhost:5432/radar_cout_mesure_20261121' \
    apps/api/node_modules/.bin/tsx scripts/mesure-couverture.mts \
      --cout --json=/tmp/couv.json | grep '^COUT '
done
```

Le temps « complet » est pris dans un processus Python autour de cette commande
(`time.perf_counter()`), et le CPU extérieur avec `getrusage(RUSAGE_CHILDREN)`:
il inclut le démarrage de `tsx` et la compilation TypeScript, absents du
`wallMs` interne. Les compteurs PostgreSQL sont lus avant et après chaque
rejeu dans `pg_stat_database` de cette base. Les 15 rejeux ont tous terminé en
code 0 et affiché le même taux.

## Résultats — 15 rejeux, base chaude

Médianes, avec le minimum et le maximum observés entre parenthèses.

| Phase | Médiane | Min – max | Part du temps interne |
|---|---:|---:|---:|
| Collecte (60 incidents, porte d'admission) | **6,5 ms** | 5,9 – 15,8 ms | 2,9 % |
| Rattachement | **215,1 ms** | 180,0 – 483,3 ms | 95,3 % |
| ├─ index gazetteer (22 904 alias) | 196,4 ms | 166,5 – 445,6 ms | 87,0 % |
| ├─ moteur (60 textes) | 3,4 ms | 3,1 – 8,4 ms | 1,5 % |
| └─ sondes au référentiel (36 absents) | 12,6 ms | 10,3 – 31,9 ms | 5,6 % |
| Mesure (agrégation, publication, sortie) | **4,0 ms** | 3,5 – 11,7 ms | 1,8 % |
| **Total dans `main()`** | **225,8 ms** | 190,4 – 521,5 ms | 100 % |
| **Temps mur complet, compilation incluse** | **433,2 ms** | 373,3 – 939,0 ms | — |

Les médianes des sous-phases sont prises séparément : elles ne s'additionnent
pas exactement à la médiane de leur somme.

Le temps mur complet est bimodal : les cinq premiers rejeux après la création
de la base vont de 614 à 939 ms (médiane 697 ms), les dix suivants de 373 à
445 ms (médiane 415 ms). Le tableau retient la médiane des 15, sans écarter les
rejeux lents. Le même écart se voit dans `main()` : 363 ms sur les cinq
premiers, 213 ms sur les dix suivants. C'est un relevé, pas une correction
statistique.

### Ressources

| Ressource | Valeur mesurée |
|---|---|
| CPU dans `main()` | **312,7 ms** (276,1 – 347,7 ms) par rejeu |
| CPU du processus complet, compilation `tsx` incluse | **601,6 ms** (575,5 – 608,0 ms), 5 rejeux chronométrés |
| Mémoire maximale du processus (`maxRSS`) | **124,4 MiB** (122,0 – 129,1 MiB) |
| Défauts de page mineurs / majeurs | **15 082 / 0** par rejeu |
| Lecture/écriture système du processus (`resourceUsage`) | **0 / 0 octet** |
| Buffers PostgreSQL touchés / lus sur disque | **3 152 / 0** par rejeu |
| Tuples PostgreSQL retournés / extraits | **37 364 / 1 063** par rejeu |
| Transactions PostgreSQL validées | **45** par rejeu |

Sur un rejeu témoin, `pg_stat_io` (`client backend`, relation normale) a relevé
3 163 accès au cache et 3 lectures, soit 24 576 octets lus — cohérent avec une
base entièrement en mémoire (`shared_buffers = 128 MB` pour 27 Mo de données).
La CPU cumulée dépasse le temps mur : le processus utilise plusieurs threads,
les deux compteurs ne mesurent donc pas la même chose.

## Lecture

Le coût est **presque entièrement fixe** : 196 ms sur 226 ms servent à charger
et préparer l'index du gazetteer. Le moteur lui-même coûte 3,4 ms pour 60
incidents, et la mesure agrégée 4,0 ms. Dérivé des médianes, un incident
supplémentaire après chargement de l'index coûte environ 0,4 ms
(`(3,4 + 12,6) / 42`), tandis que le démarrage de la mesure coûte ~207 ms
même sur un corpus vide. Optimiser la boucle de rattachement ne changerait donc
presque rien au temps total : le levier est le chargement de l'index.

Avec la compilation `tsx`, l'utilisateur attend environ 0,4 s (régime établi)
pour obtenir le chiffre. Sans changement de base, 15 rejeux consécutifs donnent
le même taux : le coût de reproductibilité est celui d'une seule mesure.

## Contrôle sur la base préparée du 15 novembre

Sur la base `couv_repro_verify` (4 480 organisations, 22 947 alias, 28/42),
7 rejeux du même instrument ont donné : temps mur complet médian 745 ms
(499 – 1 001 ms), `main()` 399 ms, index 355 ms, moteur 7,1 ms, sondes 17 ms,
mesure 5,7 ms, `maxRSS` 126 MiB, 2 932 buffers touchés et 0 lu sur disque pour
la majorité des rejeux. Le taux diffère, la répartition du coût reste la même.
Cette base a été recyclée par l'environnement après la mesure ; la base
`radar_cout_mesure_20261121` est celle qui sert de référence ici.

## Limites

- Le délai de veille (1,9 jour, [`mesure-couverture.md`](mesure-couverture.md)
  § « Le délai ») n'est pas inclus : il se mesure sur le flux ingéré, pas sur
  le rejeu du corpus.
- Le chargement du référentiel (`bootstrap.mts --with-sample`, ~5 s mesurés) est
  une étape de préparation, pas du coût par mesure.
- Les temps dépendent de la charge de la machine partagée ; c'est pour cela que
  les fourchettes sont publiées à côté des médianes.
