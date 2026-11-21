# Benches de validation — comment les rejouer

Trois benches, trois questions produit. Aucun n'a besoin de PostgreSQL ni de
l'API : ils tournent hors ligne, sur des jeux versionnés dans ce dossier.

## Prérequis

```bash
npx --yes pnpm@12.15.0 install                 # deps du monorepo
python3 -m venv /tmp/radar-bench-venv
/tmp/radar-bench-venv/bin/pip install rapidfuzz trafilatura newspaper4k nltk pandas pyarrow
```

`newspaper4k` et `trafilatura` tirent tous deux `lxml[html-clean]`. Sur certaines
versions de pip, les installer dans la même commande déclenche
`AssertionError: Candidate is not for this requirement lxml[html-clean,html-clean]` :
installer `trafilatura` d'abord, `newspaper4k` ensuite (ou mettre pip à jour).

## Corpus externes (non versionnés)

Deux benches régénèrent un jeu **à partir de sources externes** : le référentiel
NA (`bench/referentiel/build_na.py`) et l'échantillon de revendications
(`bench/quarantine/build_fixture.py`). Leurs **résultats sont versionnés**
(`db/data/referentiel-na.json`, `bench/fixtures/claims-sample.json`) : un
déploiement neuf n'a besoin ni de Python ni du réseau.

Pour les régénérer, placez les sources hors du dépôt et pointez dessus :

```bash
export RADAR_BENCH_DATA=../radar-bench-data   # défaut : à côté du dépôt
python3 bench/referentiel/build_na.py --fetch
python3 bench/quarantine/build_fixture.py
```

`--data-dir` et `--posts` permettent de passer un autre emplacement au cas par
cas. Le corpus ransomwatch complet fait 2,3 Mo ; on n'en versionne que 500
revendications.

## Aperçu web derrière un tunnel

Vite écoute sur `0.0.0.0` et n'autorise que `localhost` par défaut. Derrière un
tunnel ou un reverse proxy, déclarez l'hôte attendu :

```bash
RADAR_ALLOWED_HOSTS=".exemple.app,localhost" pnpm -F @radar/web dev
RADAR_API_ORIGIN=http://localhost:8080       # cible du proxy /api (défaut)
```

## A — rattachement texte → organisation

Question : le matcher déterministe actuel est-il meilleur qu'un rapprochement
flou, et que gagne-t-on à les combiner ?

```bash
apps/api/node_modules/.bin/tsx bench/orgs/run-core.mts   > bench/results/A1-radar-core.json
apps/api/node_modules/.bin/tsx bench/orgs/run-hybrid.mts > bench/results/A1-radar-hybrid.json
/tmp/radar-bench-venv/bin/python bench/orgs/baselines.py
/tmp/radar-bench-venv/bin/python bench/orgs/score.py --md docs/research/bench-a-orgs.md
```

`run-hybrid.mts` mesure **le code livré** (`core.ts` + `fuzzy.ts`), pas une
approximation : c'est la ligne `radar-hybrid` du tableau.

- `gold-attach.json` — 40 organisations, 75 cas annotés à la main, 8 catégories
  de modes d'échec. **Ce n'est pas un échantillon aléatoire du flux réel.**
- `run-core.mts` — le cœur `apps/api/src/match/core.ts`, sans base.
- `baselines.py` — sous-chaîne naïve, RapidFuzz (fenêtre et sac de jetons),
  hybride cœur-puis-filet-flou.
- `score.py` — précision / rappel / F1, faux positifs hors-sujet distingués des
  rattachements à la mauvaise organisation, détail par catégorie.

### A.2 Déduplication d'organisations

Question : pour repérer qu'une organisation est présente deux fois dans le
référentiel, un modèle probabiliste apporte-t-il quelque chose ?

```bash
apps/api/node_modules/.bin/tsx bench/orgs/derive-aliases.mts > bench/results/A2-aliases.json
/tmp/radar-bench-venv/bin/pip install splink duckdb pandas pyarrow
/tmp/radar-bench-venv/bin/python bench/orgs/dedupe.py --md docs/research/bench-a2-dedupe.md
```

`gold-dedupe.json` : 60 enregistrements, 27 organisations réelles, 45 paires de
doublons. Splink 5 a une API différente de la v4 documentée en ligne :
`DuckDBAPI().register(df, table_name=...)` puis `Linker(frame, settings)` — il
n'y a plus de paramètre `db_api`.

### A.3 Audit du catalogue de sources

```bash
python3 bench/sources/audit-catalog.py --md docs/research/sources-audit.md \
  --json bench/results/sources-audit.json
```

Sans réseau ni base : familles hors contrat, doublons d'URL, écart entre le
catalogue versionné et les chiffres du README.

## B — extraction d'articles

Question : quel extracteur retenir pour les pages de presse sans flux RSS ?

```bash
# corpus externe, MIT, 181 pages réelles annotées
curl -sL -o /tmp/aeb.tar.gz \
  https://codeload.github.com/scrapinghub/article-extraction-benchmark/tar.gz/refs/heads/master
mkdir -p /tmp/aeb && tar xzf /tmp/aeb.tar.gz -C /tmp/aeb

/tmp/radar-bench-venv/bin/python bench/sources/extract.py \
  --corpus /tmp/aeb/article-extraction-benchmark-master --out bench/results
/tmp/radar-bench-venv/bin/python bench/sources/score.py \
  --corpus /tmp/aeb/article-extraction-benchmark-master --results bench/results \
  --md docs/research/bench-b-sources.md
```

Le corpus n'est **pas** versionné ici (83 Mo décompressés) : il se télécharge.
La métrique est celle du corpus (`evaluate.py`, F1 sur shingles de tokens,
intervalles par bootstrap), réutilisée telle quelle plutôt que réécrite.
`--limit 40` pour un passage rapide.

## C — prototype UX

Pas de bench chiffré : un prototype à regarder, plus des contrôles de rendu.

```bash
npx --yes pnpm@12.15.0 -F @radar/web run test:render   # 18 contrôles, sans navigateur
VITE_DATA_MODE=mock npx --yes pnpm@12.15.0 -F @radar/web run dev
```

`test/render.tsx` fait un rendu statique React des nouveaux composants :
cela exécute réellement TanStack Table v9 (tri, pagination, facettes) et les
états vide / chargement / erreur, ce que le typecheck ne vérifie pas.

## A.4 — Référentiel NA × moteur de rattachement

Balaye **les 4 293 communes** du référentiel versionné, avec quatre formulations
réalistes (« la mairie de X… », « la ville de X… »). Compare le rattachement
obtenu à la commune attendue, et compte séparément l'abstention et l'erreur.

```bash
apps/api/node_modules/.bin/tsx bench/referentiel/probe-match.mts --json bench/results/NA-match.json
```

Résultat : **93,9 % de rattachements corrects, 0 erreur, 260 abstentions** (les
111 noms communaux homonymes), index de 22 088 clés construit en 91 ms, décision
p95 0,065 ms. Interprétation et limites : `docs/research/referentiel-na.md`.

**Régénérer le jeu** (quand le découpage administratif change) :

```bash
python3 bench/referentiel/build_na.py --fetch     # npm + GitHub, stdlib seule
apps/api/node_modules/.bin/tsx scripts/load-referentiel-na.mts --plan-only
```

## B.2 — Annuaire à l'échelle

Compare l'ancien `GET /orgs` (toute la table) au nouveau chemin paginé, facetté
et classé, sur le référentiel réel puis sur un palier synthétique inséré et
**supprimé** aussitôt. Ne pas lancer sur une base de production.

```bash
DATABASE_URL=... apps/api/node_modules/.bin/tsx bench/directory/probe.mts \
  --scale 100000 --json bench/results/NA-directory.json
```

Résultat : à 104 462 organisations, **22,4 Mo → 12 Ko** par affichage, première
page à 55 ms (p95 64 ms) contre 568 ms pour l'ancien chemin. Détails :
`docs/research/annuaire-echelle.md`.

### B.3 File de revue de la quarantaine

```bash
python3 bench/quarantine/build_fixture.py          # jeu versionné, 500 revendications
DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/load-claims-sample.mts
DATABASE_URL=... apps/api/node_modules/.bin/tsx bench/quarantine/probe.mts \
  --scale 5000 --json bench/results/NA-review.json
```

Deux mesures. **Le préfiltre de candidats** face au balayage complet du moteur de
rattachement : sur 4 462 organisations et 500 indices réels, **1 795,6 ms → 7,5 ms
(×239)**, 8,6 organisations examinées en moyenne, rattachements identiques.
**L'ouverture de la file** : p50 **252 ms** sur le jeu réel, **296 ms** avec 5 000
faits synthétiques ajoutés — le coût suit la fenêtre (2 000), pas le stock. Les
faits synthétiques sont insérés puis supprimés.

Résultat à lire en face : aucun « chaud », meilleur score 43, tous les faits de
tête marqués `referentialGap`. Le tri fonctionne ; c'est le **périmètre du
référentiel** qui ne couvre pas ces entreprises. Détails :
`docs/research/file-de-revue.md`.

## D — Extension du corpus santé/enseignement

Les 457 premières lignes de `bench/corpus/sante-enseignement.jsonl` sont
conservées telles quelles. Les lignes `na-sante-*` viennent des fiches publiques
de l'annuaire Santé.fr ; chaque URL est chargée et n'est retenue que si la page
répond 200 et mentionne au moins deux jetons du nom.

```bash
apps/api/node_modules/.bin/tsx scripts/corpus-sante-extension.mts
apps/api/node_modules/.bin/tsx scripts/corpus-sante-extension.mts \
  --departements=Gironde,Charente --appliquer

# Rejeu indépendant du validateur commun sur un échantillon de 50 lignes
mkdir -p /tmp/sante-sample
python3 - <<'PY'
import json
lignes = [l for l in open('bench/corpus/sante-enseignement.jsonl')
          if '"source":"sante.fr fiche établissement"' in l]
open('/tmp/sante-sample/additions.jsonl', 'w').write(''.join(lignes[::8][:50]))
PY
apps/api/node_modules/.bin/tsx scripts/valider-corpus.mts \
  --dir=/tmp/sante-sample --json=bench/results/validation-sante-extension-echantillon.json \
  --lecteur=off --concurrence=10
```

Sans `--appliquer`, rien n'est écrit. Le rapport cumulé est
`bench/results/extension-sante-enseignement.json`.

## Ce que ces benches ne mesurent pas

- **Le rendement bout-en-bout des sources** (`fetched → parsed → admitted →
  matched → useful`) : le réseau du sandbox n'autorise que GitHub, npm et PyPI.
  Impossible d'y joindre nos 594 sources, ni `recherche-entreprises.api.gouv.fr`.
  Le bench B mesure l'étage HTML → texte sur un corpus externe, pas notre chaîne.
- **Splink à l'échelle réelle** : mesuré sur 60 lignes, où il reste
  sous-entraîné — ses propres avertissements le disent. Le vrai référentiel
  compte 10 261 organisations ; ce bench ne permet pas de conclure sur Splink
  en production.
- **La disponibilité des sources** : l'audit du catalogue est statique. Il dit
  ce qui est mal déclaré, pas ce qui répond.
- **Le rappel en conditions réelles** : le jeu A est construit pour couvrir des
  modes d'échec, pas pour estimer un taux sur le flux production.

## Résultats

Les chiffres vivent dans `bench/results/*.json` (bruts) et sont rendus lisibles
dans `docs/research/bench-a-orgs.md`, `docs/research/bench-a2-dedupe.md`,
`docs/research/bench-b-sources.md` et `docs/research/sources-audit.md`.
Les décisions et leurs limites : `docs/research/validation-abc.md`.
