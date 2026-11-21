# Historique des mesures de couverture

Chaque ligne ci-dessous est une mesure de couverture **effectivement produite**,
pas une estimation : fenêtre `2025-11-01 → 2026-10-31`, corpus versionné dans
`bench/fixtures/corpus-reference-na.json`, moteur rejoué pour de vrai par
`scripts/mesure-couverture.mts`. La table est **antichronologique** : la mesure
la plus récente est en tête et chaque nouvelle mesure s'ajoute **juste sous
l'en-tête**. Aucune ligne n'est réécrite — un re-jeu ou une correction donne une
ligne supplémentaire datée du re-jeu.

C'est ce journal qui permet de dire si le chiffre progresse ou régresse, et de
ne pas confondre un progrès du moteur avec un changement de corpus ou de base.

## Mesures

| Date | Corpus (sha256/16) | Chiffre | Écart | Moteur | Auteur | Preuve |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-21 | `a6634b37f84e896f` | **31/42 (73,8 %)** · 28/42 défendables | +7,1 pt | production `designateOrganization` · 1 244 048 orgs | j0ltdevv | † `55405d0` · `bench/results/couverture-2026-11-21.json` |
| 2026-11-21 | `a6634b37f84e896f` | **28/42 (66,7 %)** · 26/42 défendables | 0 pt | production `designateOrganization` · 4 480 orgs | j0ltdevv | `627ba35` · `docs/couverture-mesuree.md` |
| 2026-11-15 | `a6634b37f84e896f` | **28/42 (66,7 %)** · 26/42 défendables | −7,1 pt | `gazetteer@4` (confiance par source d'alias) · 1 244 048 orgs | j0ltdevv | `088a5fb` · `bench/results/couverture-2026-11-15-gazetteer4.json` |
| 2026-11-15 | `a6634b37f84e896f` | **31/42 (73,8 %)** · 28/42 défendables | +16,7 pt | `gazetteer@3` + vague 2 (alias de nom) · 1 244 048 orgs | j0ltdevv | `4afb5e3` · `bench/results/couverture-2026-11-15-post-vague2.json` |
| 2026-11-15 | `a6634b37f84e896f` | **24/42 (57,1 %)** | −7,2 pt | production, vague 1 (stock SIRENE national) · 700 320 orgs | j0ltdevv | `93b11af` · `bench/results/couverture-2026-11-15-post-vague1.json` |
| 2026-11-15 | `21c5667a67e6e0ea` | **27/42 (64,3 %)** | 0 pt | production · 41 801 orgs | j0ltdevv | `ff2a1d2` · `bench/results/couverture-2026-11-15.json` |
| 2026-11-14 | `21c5667a67e6e0ea` | **27/42 (64,3 %)** | +28,6 pt | production + référentiel SIRENE hors numérique · 41 801 orgs | j0ltdevv | `2c658cd` · `bench/results/couverture-2026-11-14.json` |
| 2026-11-14 | `21c5667a67e6e0ea` | **15/42 (35,7 %)** | — corpus changé | production · 34 352 orgs | j0ltdevv | `726010d` · `bench/results/couverture-2026-11-14.json` |
| 2026-11-13 | `a9393ae13ad988cf` | **12/18 (66,7 %)** | +5,6 pt | production · référentiel collectivités complété | j0ltdevv | † `0790163` (message de commit) |
| 2026-11-13 | `dae521c38edb41e6` | **11/18 (61,1 %)** | +22,2 pt | production · cinq entités ajoutées au référentiel | j0ltdevv | ‡ `724299f` (message de commit) |
| 2026-11-13 | `dae521c38edb41e6` | **7/18 (38,9 %)** | — corpus changé | production `designateOrganization` · 34 330 orgs | j0ltdevv | `6994148` · `docs/mesure-couverture.md` |
| 2026-11-13 | `d76fa29da4e06910` | **5/15 (33,3 %)** | — première mesure | `resoudre` (gazetteer brut) · 34 330 orgs | j0ltdevv | `0110079` · `bench/results/couverture-2026-11-13.json` |

† Mesures publiées dans des commits présents dans l'historique du dépôt
(`git log --all`) mais **hors de l'ascendance de ce worktree**. Elles sont
conservées ici pour que l'historique des mesures produites soit complet ; leur
preuve se lit avec `git show <commit>:<fichier>` (le JSON du 21/11 n'est pas
présent dans l'arbre de ce worktree).

‡ Le commit `724299f` annonce 11/18 et son document contemporain décrit un
corpus de 23 incidents (18 dans la fenêtre) ; son arbre porte toutefois une
version antérieure du corpus (20 incidents, `d76fa29da4e06910…`), issue d'une
divergence de branche. L'empreinte consignée est celle de la version à 23
incidents utilisée par la mesure, introduite par `6994148`.

## Lire le tableau

- **Corpus** : 16 premiers caractères du SHA-256 des octets du fichier de
  corpus. Deux mesures avec le même hash portent sur exactement les mêmes
  incidents ; un hash différent signifie que le dénominateur peut avoir changé
  (15 → 18 → 42), même à nombre d'incidents égal.
- **Chiffre** : incidents « vus » / incidents dans la fenêtre, suivi du taux
  arrondi au dixième de point. La mention « défendables » est le sous-comptage
  du script qui exclut les rattachements hors sujet ; les deux chiffres sont
  publiés côte à côte, jamais l'un à la place de l'autre.
- **Écart** : variation en points de la mesure immédiatement antérieure. Il est
  remplacé par « — corpus changé » quand le dénominateur n'est pas le même :
  33,3 % sur 15 incidents et 38,9 % sur 18 incidents ne se comparent pas.
- **Moteur** : moteur de rattachement et état du référentiel au moment du
  re-jeu. Le passage de `resoudre` à `designateOrganization`, puis de
  `gazetteer@3` à `gazetteer@4`, est une cause de variation distincte du corpus.
- **Preuve** : commit et fichier où le chiffre est publié, pour rejouer la
  mesure plutôt que la croire.

Versions du corpus rencontrées :

| Hash (16) | Corpus |
| --- | --- |
| `d76fa29da4e06910` | 20 incidents — première version (13/11) |
| `dae521c38edb41e6` | 23 incidents (13/11) |
| `a9393ae13ad988cf` | 23 incidents, entité FNC corrigée (13/11) |
| `21c5667a67e6e0ea` | 60 incidents (14/11) |
| `a6634b37f84e896f` | 60 incidents, métadonnées enrichies (15/11 → 21/11) |

## Ajouter une mesure

1. Rejouer la mesure et publier sa sortie :

   ```bash
   DATABASE_URL=… apps/api/node_modules/.bin/tsx scripts/mesure-couverture.mts \
     --json=bench/results/couverture-AAAA-MM-JJ.json
   ```

2. Calculer l'empreinte du corpus utilisé (ou de la version historique) :

   ```bash
   sha256sum bench/fixtures/corpus-reference-na.json | cut -c1-16
   git show <commit>:bench/fixtures/corpus-reference-na.json | sha256sum | cut -c1-16
   ```

3. Insérer **une nouvelle première ligne** dans le tableau, avec la date du
   re-jeu, le hash, le chiffre `vus/total (taux %)`, l'écart, le moteur et
   l'état du référentiel, l'auteur du commit et la preuve (commit + fichier).
4. Ne jamais corriger une ligne existante : si le chiffre est faux, ajouter une
   ligne datée qui le remplace avec la raison. La régression est une
   information, pas une erreur à effacer.

Références : `docs/mesure-couverture.md` (méthode), `docs/couverture-mesuree.md`
(dernière mesure détaillée), `docs/programme.md` (trajectoire du taux).
