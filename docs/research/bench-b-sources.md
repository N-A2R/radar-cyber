# Bench B — extraction d'articles (HTML → texte)

Corpus : **181 pages HTML réelles annotées**, `scrapinghub/article-extraction-benchmark` (MIT), corpus neutre indépendant des deux extracteurs. Métrique : celle du corpus (`evaluate.py`, F1 sur shingles de tokens, ± écart-type par bootstrap 1000 tirages).

| Extracteur | Version | F1 | Précision | Rappel | Page entière exacte |
| --- | --- | --- | --- | --- | --- |
| `trafilatura` | 2.3.1 | **0.964** ± 0.007 | 0.958 ± 0.008 | 0.971 ± 0.008 | 0.337 |
| `newspaper4k` | 0.9.6.1 | **0.925** ± 0.011 | 0.962 ± 0.008 | 0.890 ± 0.018 | 0.287 |

« Page entière exacte » = part des pages dont le texte extrait est exactement celui de l'annotation (métrique `accuracy` du corpus).

## Coût d'exécution et pages vides

| Extracteur | Version | Pages vides | Erreurs | Total | ms/page |
| --- | --- | --- | --- | --- | --- |
| `trafilatura` | 2.3.1 | 0/181 | 0 | 4.53 s | **25.0** |
| `newspaper4k` | 0.9.6.1 | 9/181 | 0 | 229.39 s | **1267.3** |

Sortie brute du script du corpus :

```
version      F1             precision      recall         accuracy     
newspaper4k          0.9.6.1      0.925 ± 0.011  0.962 ± 0.008  0.890 ± 0.018  0.287 ± 0.034
trafilatura          2.3.1        0.964 ± 0.007  0.958 ± 0.008  0.971 ± 0.008  0.337 ± 0.035
```
