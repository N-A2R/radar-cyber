# Signaux précoces — mesure avant/après par piste

Mesure 2026-11-21 sur les 100 incidents du benchmark (`docs/benchmark.md`). Un signal n'est retenu que s'il porte un incident du corpus, une date valide et une URL de sa piste : un article de presse reste la référence « avant », jamais un signal nouveau. Gain = `max(0, date radar − date du signal)` ; délai après = `min(radar, signal) − première date de presse`, sur les 77 incidents datés.

| Piste | Couverts | Jours gagnés (total) | Médiane sur couverts | Délai médian après |
| --- | ---: | ---: | ---: | ---: |
| CT (crt.sh) | 0/100 | 0 | — | 8 520 h |
| Revendication (ransomware.live, Socradar) | 3/100 | 1 496 | 411 j | 8 160 h |
| Fuites (FrenchBreaches, HIBP) | 2/100 | 217 | 108,5 j | 8 520 h |
| DNS (changements) | 0/100 | 0 | — | 8 520 h |
| Toutes pistes | 5/100 | 1 713 | 272 j | 8 160 h |

Avant : délai médian 8 520 h, 77 incidents datés. Après : 8 160 h, 77 incidents datés.

**Piste qui apporte le plus de jours gagnés : Revendication (ransomware.live, Socradar)** — 1 496 j cumulés sur 3 incidents, 411 j médians, jusqu'à 813 j (Cité internationale de la bande dessinée et de l'image (Angoulême)). Les fuites ajoutent 217 j sur 2 incidents. CT et DNS : 0 j, aucune observation rattachée aux 100 incidents.

**Médiane globale : 8 520 h → 8 160 h, soit 15 jours gagnés.** Ce gain vient de la revendication. 3 des 77 incidents datés portent un signal ; les 74 autres gardent leur délai d'origine. Le gain reste concentré sur 5 incidents sur 100 (jusqu'à 813 j).

Limites : dates de revendication et de fuite relevées rétrospectivement le 21 novembre 2026 ; elles prouvent qu'un signal public existait, pas qu'un collecteur l'a vu ce jour-là. Aucune donnée volée n'est collectée. Disponibilités vérifiées : `bench/results/disponibilite-signaux.json` ; rejouer avec `apps/api/node_modules/.bin/tsx scripts/rapport-signaux-precoces.mts --verifier`.
