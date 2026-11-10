# Enrichissement NLP & pertinence — recherche outillée (vérifié le 2026-11-10)

Contexte : porte de pertinence actuelle = `includes()` sur 29 mots-clés (`apps/api/src/collectors/relevance.ts`). Défaillances connues : (1) « l'hôpital de Bayonne visé par une attaque » passe au travers (aucun mot-clé, si l'org n'est pas dans l'index orgs) ; (2) dépêches AFP reprises par N médias comptées N fois. Ce document évalue les outils de correction, chiffre leur coût, et propose un plan de migration en 3 étapes.

Méthode : métadonnées GitHub lues via `gh api` le 2026-11-10 (étoiles, dernier push, licence). Tailles de modèles = tailles réelles des wheels PyPI sur les releases `explosion/spacy-models`. APIs publiques testées par `curl` le jour même. Tor hors service sur la box → aucune URL .onion vérifiable.

---

## 1. Extraction d'entités (NER français)

| Outil | URL vérifiée | Licence | Étoiles | Dernier push | Modèle FR | Taille modèle | Verdict |
|---|---|---|---|---|---|---|---|
| spaCy | https://github.com/explosion/spaCy (200) | MIT | 34 039 | 2026-10-27 | `fr_core_news_lg` 3.8.0 (release vérifiée) | **572 Mo** (wheel mesuré) | **RÉUTILISER** |
| spaCy TRF | https://github.com/explosion/spaCy (même dépôt) | MIT | — | — | `fr_dep_news_trf` 3.8.0 (release vérifiée) | **398 Mo** wheel (mais ~800 Mo RAM avec transformers + torch) | ADAPTER (qualité NER +3-5 pts F1 sur presse FR, coût RAM/CPU ×5) |
| stanza | https://github.com/stanfordnlp/stanza (200) | Apache-2.0 (fichier LICENSE lu) | 7 911 | 2026-11-10 (actif) | `fr` (modèle téléchargeable, pack « French ») | ~500 Mo [ESTIMATION] | ADAPTER — très bon en FR mais pipeline lourd (tokenisation → NER → parse), redondant avec spaCy ; à garder en plan B |
| camembert | https://github.com/huggingface/transformers (200) | Apache-2.0 | 168 725 | 2026-11-10 | checkpoints `camembert-base`/`camembert-*` sur HF Hub (non vérifiés aujourd'hui → NON VÉRIFIÉ) | ~440 Mo base | ÉVITER seul — c'est un checkpoint encoder, pas un pipeline NER ; il faudrait spaCy + une couche custom. spaCy TRF (Camembert-based) le couvre déjà |
| flair | https://github.com/flairNLP/flair (200) | MIT (fichier LICENSE lu) | 14 398 | 2026-10-19 (actif) | `fr-ner-wikiner` etc. | ~1-2 Go avec torch [ESTIMATION] | ÉVITER — torch en dépendance dure (~2 Go RAM), NER FR correct mais pas meilleur que spaCy TRF pour 2× le coût |
| rapidfuzz | https://github.com/rapidfuzz/rapidfuzz (200) | MIT | 4 199 | 2026-11-09 (actif) | n/a (fuzzy matching, pas NER) | ~5 Mo pip | **RÉUTILISER** — pour matcher « CHU de Bayonne » ↔ « centre hospitalier de la Côte Basque » ; C++/SIMD, coût négligeable |
| duckduckgo | n/a | — | — | — | — | — | Hors sujet (moteur de recherche), retiré de la liste |

Précision attendue en FR sur presse cyber (orgs, lieux, personnes) : spaCy `fr_core_news_lg` ≈ 80-84 F1 NER [ESTIMATION issue des benchmarks spaCy] ; `fr_dep_news_trf` ≈ 85-88 F1 [ESTIMATION]. Pour notre cas (reconnaître des noms d'organisations dans une dépêche), le gain attendu vient surtout du gazetier + fuzzy (rapidfuzz), pas du NER brut.

## 2. Déduplication

| Outil | URL vérifiée | Licence | Étoiles | Dernier push | Verdict |
|---|---|---|---|---|---|
| datasketch | https://github.com/ekzhu/datasketch (200) | MIT | 2 980 | 2026-10-26 (actif) | **RÉUTILISER** — MinHash+LSH, l'outil de référence ; résout exactement « même dépêche AFP reprise par 2 médias » |
| simhash | https://github.com/yanyiwu/simhash (200) | licence non détectée par l'API GitHub (dépôt C++, usage : lib) ; alternatives MIT : `1e0ng/simhash` (MIT, 1 039★, dernier push 2022-03) | 1 170 | 2026-07-20 | ADAPTER — simhash convient aux quasi-dupliques de gros textes ; pour des dépêches courtes, MinHash (datasketch) est plus simple. Le dépôt yanyiwu est C++/PHP, intégration coûteuse |
| textdistance | https://github.com/life4/textdistance (200) | MIT | 3 546 | 2025-04-18 | ADAPTER — bon pour post-vérification (Jaccard/Levenshtein sur paires candidates), pas pour du scale (O(n²) si brut) |
| deduplicate-text-datasets (Google) | https://github.com/google-research/deduplicate-text-datasets (200) | Apache-2.0 | 1 274 | 2024-07-30 | ÉVITER — conçu pour des corpus de milliards de tokens (CCNet), sur-ingénierie pour ~8 700 événements ; dernier commit 2024 |

Verdict dédup : **datasketch seul**. À 5,6 M indicateurs / 8 749 événements, MinHash LSH sur titres+summary (256 permutations, seuil Jaccard 0,7) tourne en quelques secondes en batch et en ms par item en streaming. RAM ≈ 100-300 Mo [ESTIMATION].

## 3. Lecture de pages (extraction de contenu)

| Outil | URL vérifiée | Licence | Étoiles | Dernier push | Verdict |
|---|---|---|---|---|---|
| trafilatura | https://github.com/adbar/trafilatura (200) | Apache-2.0 | 7 116 | 2026-11-10 (très actif) | **RÉUTILISER** — meilleur F1 extraction d'articles FR/EN des benchmarks (Trafilatura vs Readability/Justext, paper Barba 2021) ; pure Python, ~50 ms/page [ESTIMATION] |
| readability | https://github.com/mozilla/readability (200) | Apache-2.0 | 11 535 | 2026-08-04 | ADAPTER — c'est du **JS**, donc compatible nativement avec notre stack Node ; précision inférieure à trafilatura sur FR (~10 pts [ESTIMATION]) mais zéro service Python |
| newspaper3k | https://github.com/codelucas/newspaper (200) | MIT | 15 183 | 2026-10-26 | ÉVITER — fork non maintenu du projet d'origine (article-extraction-command/newspaper), bugs connus non corrigés, moins bon que trafilatura |
| scrapling | https://github.com/D4Vinci/Scrapling (200) | BSD-3-Clause | 100 793 | 2026-11-09 (actif) | ÉVITER pour ce besoin — orienté scraping résistant (stealth, adaptive fetching), surdimensionné pour extraire le texte d'un article ; déjà monté en MCP pour d'autres usages |

## 4. Alternatives sans Python (stack Node/TS)

| Outil | URL vérifiée | Licence | Étoiles | Dernier push | Précision FR attendue | Effort | Verdict |
|---|---|---|---|---|---|---|---|
| duckdb + extensions | https://github.com/duckdb/duckdb (200) | MIT | 42 954 | 2026-11-10 | n/a (SQL, pas NLP) — utile pour le fuzzy `jaro_winkler_similarity` intégré et les agrégations de dédup | S (1 j) | **RÉUTILISER** comme backoffice analytique/dédup SQL, pas comme NER |
| sqlite-vec | https://github.com/asg017/sqlite-vec (200) | Apache-2.0 | 8 252 | 2026-05-18 | embeddings FR via modèle externe requis (non fourni) | M (3-5 j : pipeline d'embeddings + stockage) | ADAPTER — pertinent seulement si on ajoute de la recherche sémantique ; pas un correctif de la porte de pertinence |
| fast-fuzzy | npm `fast-fuzzy` (dépôt lovasoa/fast-fuzzy → 404, package vérifiable via `npm view` — NON VÉRIFIÉ aujourd'hui) ; alternative vérifiée : fuzzysort https://github.com/farzher/fuzzysort (MIT, 4 350★) | MIT | — | — | bonne sur les noms propres (Levenshtein/Damerau), nulle sur la sémantique | S | RÉUTILISER (fuzzysort ou fast-fuzzy) pour le matching d'orgs côté Node |
| wink-nlp | https://github.com/winkjs/wink-nlp (200) — **existe toujours, actif** | MIT | 1 391 | 2026-05-27 | FR : tokenisation OK, NER **limité** (pas de modèle FR complet ; support langues via `wink-eng-lite-*` essentiellement EN) | M | ÉVITER pour le NER FR ; ADAPTER pour tokenisation/normalisation FR si besoin léger |
| natural | https://github.com/NaturalNode/natural (200) | MIT | 10 882 | 2026-10-26 | FR : stemmer Porter/Snowball FR présent, NER absent | S | ÉVITER comme NER ; ADAPTER si besoin de stemming FR cheap |
| compromise | https://github.com/spencermountain/compromise (200) | MIT | 12 169 | 2026-11-09 (actif) | **EN seulement** — le support FR n'existe pas en core | — | ÉVITER — langue non supportée |

## 5. Coût réel et forme d'intégration (outils retenus)

| Outil | RAM résidente | CPU par item | Taille installée | Forme d'intégration recommandée |
|---|---|---|---|---|
| spaCy `fr_core_news_lg` | 700-900 Mo [ESTIMATION] | 30-80 ms/dépêche (NER+POS, CPU) [ESTIMATION] | 572 Mo (wheel mesuré) | **Service Python séparé** (FastAPI/uvicorn, 1 worker, endpoint POST /ner) — le collecteur Node envoie titre+summary, reçoit `[{text,label}]` ; alternative CLI batch nightly pour le backfill |
| spaCy `fr_dep_news_trf` | 2-3 Go (torch inclus) [ESTIMATION] | 200-600 ms/dépêche CPU [ESTIMATION] | 398 Mo wheel + torch ~2 Go | Idem mais GPU ou batch nightly uniquement |
| rapidfuzz | <50 Mo | <1 ms/paire | ~5 Mo | Dans le service Python du NER (gazetier fuzzy des 392 orgs) |
| datasketch | 100-300 Mo [ESTIMATION] | ~1-5 ms/item (MinHash 256 perm) [ESTIMATION] | ~2 Mo | Bibliothèque dans le service Python ; ou dédup SQL DuckDB côté Node |
| trafilatura | <100 Mo | 30-100 ms/page [ESTIMATION] | ~15 Mo | Même service Python (endpoint /extract) ou CLI batch |
| duckdb | 200-500 Mo selon données | n/a | ~40 Mo (npm/CLI) | Intégré au process Node (binding natif) |
| fuzzysort / fast-fuzzy | <10 Mo | µs/requête | <1 Mo | Directement dans `relevance.ts` |

Conclusion d'architecture : **un seul service Python sidecar** (« enrich » : NER spaCy lg + rapidfuzz + trafilatura + datasketch), FastAPI, conteneur ~1,5 Go RAM. Le reste (fuzzy orgs, géocodage, dédup SQL) reste en Node.

## 6. Plan de migration de la pertinence en 3 étapes

Fichier cible : `apps/api/src/collectors/relevance.ts` (29 mots-clés, `isRelevant()` retourne `{relevant, reason: keyword|org|none, match}`).

### Étape S — 0,5-1 j, Node seul, zéro dépendance
1. **Gazetier d'organisations élargi dans `loadRelevanceOrgIndex`** : injecter les alias/sigles des 392 orgs (CHU de Bayonne, Hôpital de X, préfecture de Y…). Le bug « hôpital de Bayonne » vient de l'absence de l'org dans l'index, pas du manque de mots-clés.
2. **Normalisation** : appliquer `stripAccents` (existant) au texte avant `includes()` pour capter « cyberattAQUE », variantes d'apostrophes/traits d'union (« cyber attaque », « rançongiciel »/« rançongiciels » via stem minimal : couper le « s » final).
3. **Seuil** : passer de « 1 mot-clé = pertinent » à un score (1 pt mot-clé cyber fort / 0,5 pt mot faible, ≥1 pt requis) pour réduire les faux positifs « faille » (mot du langage courant).
- Impact attendu : taux de rejet à tort ↓ (est. -30 % des faux négatifs orgs) [ESTIMATION] ; faux positifs « faille » ↓ ~50 % [ESTIMATION]. Casse : rien (signature `isRelevant` inchangée).
- Fichiers touchés : `relevance.ts` uniquement + fixture de tests.

### Étape M — 2-3 j, Node + sidecar Python
4. **Sidecar Python « enrich »** (spaCy `fr_core_news_lg` + rapidfuzz) exposant POST /ner.
5. Dans `isRelevant()` : si `reason === "none"`, appeler le sidecar ; si un `ORG`/`LOC` détecté matche (rapidfuzz ≥ 90) une org de l'index → `relevant: true, reason: "ner-org"`. Appel asynchrone avec timeout 500 ms et cache LRU (les dépêches AFP dupliquées partagent le même hash → cache hit).
6. **Dédup** : datasketch MinHash (256 perm, seuil 0,7) sur title+summary dans le sidecar, retourne `dup_of` ; le collecteur marque l'événement secondaire au lieu de le créer. Corrige le double comptage AFP.
- Impact attendu : faux négatifs sémantiques ↓ supplémentaire (est. -15 à -20 %) [ESTIMATION] ; doublons ↓ ~40-60 % [ESTIMATION]. Casse : `isRelevant` devient async → tous les appelants dans `apps/api/src/collectors/*` à mettre à jour ; besoin d'un healthcheck du sidecar et d'un fallback synchrone (mode dégradé = étape S).
- Fichiers touchés : `relevance.ts`, appelants collecteurs, nouveau `services/enrich/`, docker-compose.

### Étape L — 1-2 sem, optionnel
7. **Recherche sémantique** : embeddings (sqlite-vec ou pgvector dans PostgreSQL 18 déjà en place) sur les summaries + seuil de similarité cosinus vs corpus cyber de référence ; ou passage à `fr_dep_news_trf` si le volume de faux négatifs résiduel le justifie (batch nightly, pas en ligne).
8. **Backfill** : réévaluer les 8 749 événements rejetés avec la nouvelle porte, via CLI batch (duckdb pour l'analyse des deltas avant/après).
- Impact attendu : mesuré, pas estimé — c'est l'objet du backfill. Casse : rien en ligne ; migration SQL des embeddings.

Ordre strict : S (risque nul, gain immédiat) → M (mesurer le taux de rejet sur 1 semaine avant de monter le sidecar en prod) → L (décision data-driven).

## 7. Géocodage des 392 organisations — données publiques françaises

| Service | Endpoint exact (testé) | Quota | Licence | Verdict |
|---|---|---|---|---|
| BAN / adresse.data.gouv.fr | `GET https://api-adresse.data.gouv.fr/search?q=<texte>&limit=1` — testé 200 le 2026-11-10, retourne GeoJSON avec `features[].geometry.coordinates` | 50 req/s par IP (doc officielle adresse.data.gouv.fr — page api-doc répond 308→200) | Licence Ouverte 2.0 / ODbL (données BAN ODbL) | **RÉUTILISER** — 392 orgs = 8 s à 50 req/s, une seule passe |
| INSEE Sirene | `https://api.insee.fr/...Sirene...` — **NON VÉRIFIÉ** : api.insee.fr injoignable depuis cette box (curl 000) ; compte + token OAuth requis | quota par abonnement | Licence Ouverte 2.0 (données Sirene) | ÉVITER pour ce besoin — **alternative vérifiée ci-dessous** |
| recherche-entreprises.api.gouv.fr | `GET https://recherche-entreprises.api.gouv.fr/search?q=crf` — testé 200, retourne `siren`, `nom_complet`, `siege` (adresse géocodée incluse) | 7 req/s par IP (doc api.gouv.fr — NON VÉRIFIÉ aujourd'hui) | open data État | **RÉUTILISER** — meilleur choix : un seul appel donne SIREN + adresse du siège + coordonnées |
| geo.api.gouv.fr | `GET https://geo.api.gouv.fr/communes?nom=Bayonne&fields=code,centre` — testé 200, retourne `{"code":"64102","centre":{"coordinates":[-1.4611,43.4844]}}` | 50 req/s [ESTIMATION, doc officielle non relue aujourd'hui] | open data État | **RÉUTILISER** pour le géocodage **commune** (orgs de type mairie/préfecture/CERT régionaux) ; BAN pour les adresses de rue |

Stratégie recommandée pour les 392 orgs : (1) matcher les orgs sur recherche-entreprises par `nom_complet` (rapidfuzz ≥ 90) → SIREN + siège géocodé ; (2) fallback BAN pour les orgs non-entreprises (hôpitaux publics ont un SIREN, donc étape 1 les couvre) ; (3) `geo.api.gouv.fr/communes` pour les orgs identifiées par commune. Une passe unique, stockée en base — pas de quota en régime permanent.

---

## Synthèse des verdicts

| Composant | Retenu | Coût |
|---|---|---|
| NER FR | spaCy `fr_core_news_lg` (service Python sidecar) | 572 Mo disque, ~800 Mo RAM, 30-80 ms/dépêche |
| Fuzzy orgs | rapidfuzz (Python) + fuzzysort (Node, étape S) | négligeable |
| Dédup | datasketch (MinHash) | ~2 Mo, 1-5 ms/item |
| Extraction page | trafilatura (Python) / readability (Node, si zéro Python) | 30-100 ms/page |
| Analytique/dédup SQL | duckdb | 40 Mo |
| Géocodage | recherche-entreprises + BAN + geo.api.gouv.fr | gratuit, quotas larges pour 392 orgs |
| Écartés | flair (torch 2 Go), camembert seul, newspaper3k (abandonné), scrapling (hors sujet), compromise (EN only), wink-nlp (pas de NER FR), deduplicate-text-datasets (sur-ingénierie) | — |
