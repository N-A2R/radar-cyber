# Bench A2 — déduplication d'organisations

Jeu : **60 enregistrements** pour **27 organisations réelles**, soit **45 paires de doublons** attendues. Annotation manuelle ; pièges inclus (CHU vs université d'une même ville, mairie vs métropole, cliniques homonymes dans deux départements).

Métrique par **paire** : une fusion à tort (deux organisations réelles réunies) est un faux positif, un doublon manqué est un faux négatif.

| Approche | Précision | Rappel | F1 | Fusions à tort | Doublons manqués | ms |
| --- | --- | --- | --- | --- | --- | --- |
| `institutional-synonyms` | **1.000** | 0.711 | 0.831 | 0 | 13 | 9.9 |
| `rapidfuzz-85` | **0.909** | 0.444 | 0.597 | 2 | 25 | 23.9 |
| `rapidfuzz-90` | **1.000** | 0.422 | 0.594 | 0 | 26 | 9.2 |
| `rapidfuzz-95` | **1.000** | 0.422 | 0.594 | 0 | 26 | 9.6 |
| `normalised-key` | **0.950** | 0.422 | 0.585 | 1 | 26 | 13.5 |
| `rapidfuzz-90-any-city` | **0.950** | 0.422 | 0.585 | 1 | 26 | 15.2 |
| `derived-alias-overlap` | **1.000** | 0.356 | 0.525 | 0 | 29 | 6.4 |
| `splink-0.5` | **0.296** | 0.178 | 0.222 | 19 | 37 | 1575.5 |
| `splink-0.8` | **0.000** | 0.000 | 0.000 | 0 | 45 | 1194.9 |
| `splink-0.95` | **0.000** | 0.000 | 0.000 | 0 | 45 | 1137.6 |

Splink tourne avec un prior fixé à 0.025 (le prior réel du jeu est 0.0254) : sur 60 lignes, l'estimation automatique par règle déterministe dégénère à 1.0 et le modèle plante. C'est une limite du jeu, pas de Splink.

Détail des erreurs : `bench/results/A2-scores.json`.
