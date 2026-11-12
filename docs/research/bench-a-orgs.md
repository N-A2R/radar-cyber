# Bench A — rattachement texte → organisation

Jeu : **75 cas annotés à la main**, **40 organisations** du référentiel Nouvelle-Aquitaine reconstitué. Ce n'est pas un échantillon aléatoire du flux réel : les cas couvrent volontairement les modes d'échec connus.

## Résultats

| Moteur | Précision | Rappel | F1 | Bons | FP hors-sujet | FP mauvaise org | Abstentions | ms/cas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `radar-core` | **0.941** | 0.906 | 0.923 | 48 | 3 | 0 | 5 | 0.0767 |
| `radar-hybrid` | **0.946** | 1.000 | 0.973 | 53 | 3 | 0 | 0 | 0.6069 |
| `hybrid-core-then-fuzzy` | **0.930** | 1.000 | 0.964 | 53 | 4 | 0 | 0 | 0.2482 |
| `rapidfuzz-window-95` | **0.845** | 0.924 | 0.883 | 49 | 9 | 0 | 4 | 0.9481 |
| `rapidfuzz-window-85` | **0.836** | 0.962 | 0.895 | 51 | 10 | 0 | 2 | 1.1287 |
| `rapidfuzz-window-90` | **0.836** | 0.962 | 0.895 | 51 | 10 | 0 | 2 | 1.098 |
| `substring` | **0.833** | 0.943 | 0.885 | 50 | 10 | 0 | 3 | 0.0343 |
| `rapidfuzz-tokenset-90` | **0.818** | 0.849 | 0.833 | 45 | 10 | 0 | 8 | 0.1605 |

## Par catégorie (ok / cas)

| Catégorie | `radar-core` | `radar-hybrid` | `hybrid-core-then-fuzzy` | `rapidfuzz-window-95` | `rapidfuzz-window-85` | `rapidfuzz-window-90` | `substring` | `rapidfuzz-tokenset-90` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| alias | 21/21 | 21/21 | 21/21 | 20/21 | 20/21 | 20/21 | 21/21 | 20/21 |
| ambiguity | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| exact | 25/25 | 25/25 | 25/25 | 24/25 | 24/25 | 24/25 | 25/25 | 23/25 |
| homonym | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 |
| none | 7/7 | 7/7 | 7/7 | 7/7 | 7/7 | 7/7 | 7/7 | 6/7 |
| short-no-context | 6/7 | 6/7 | 5/7 | 1/7 | 0/7 | 0/7 | 0/7 | 1/7 |
| substring-trap | 3/3 | 3/3 | 3/3 | 2/3 | 2/3 | 2/3 | 2/3 | 2/3 |
| typo | 2/7 | 7/7 | 7/7 | 5/7 | 7/7 | 7/7 | 4/7 | 2/7 |
