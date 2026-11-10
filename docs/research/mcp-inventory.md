# Inventaire des serveurs MCP utiles à radar-cyber

Date : 2026-11-10. Toutes les URL ont été vérifiées le jour même (HTTP noté, licence lue sur l'API GitHub ou PyPI). Les commandes marquées ✅ ont été exécutées avec succès sur cette machine ; ⚠️ = commande tirée du README mais non exécutée ici ; « NON VÉRIFIÉ » = nom/URL incertain.

## 1. Déjà configuré localement (`~/.omp/agent/mcp.json`)

### Activés (7)

| Serveur | Transport | Cible | État vérifié |
|---|---|---|---|
| `gh_grep` | HTTP | `https://mcp.grep.app` | endpoint vivant (405 en GET = exige POST MCP) |
| `context7` | HTTP | `https://mcp.context7.com/mcp` | endpoint vivant (405) |
| `chrome-devtools` | stdio | `/home/jolt/.npm-global/bin/chrome-devtools-mcp` | ✅ `--help` exécuté (v1.10.1, mise à jour 1.11.0 dispo) |
| `scrapling` | stdio | `/home/jolt/.local/bin/scrapling mcp` | ✅ `scrapling --help` et `scrapling mcp --help` exécutés (v0.5.1, option `--http` pour streamable-http) |
| `repomix` | stdio | `npx -y repomix --mcp` | ✅ `npx -y repomix --help` exécuté |
| `serena` | stdio | `uvx --from git+https://github.com/oraios/serena serena-agent start-mcp-server --context ide-assistant` | ✅ commande `--help` exécutée (build uv OK, options `--project`, `--context`, `--mode`) |
| `deepwiki` | HTTP | `https://mcp.deepwiki.com/mcp` | endpoint vivant (405) |

### Désactivés (12)

`basic-memory` (HTTP local :27842), `beatapi` (https://beatapi.io/mcp, token), `firecrawl` (https://mcp.firecrawl.dev/v2/mcp, token), `github` (https://api.githubcopilot.com/mcp/, token), `x` (`/home/jolt/go/bin/x mcp --rate 15s --retries 8 --tier 2`), `open-computer-use`, `hexstrike` (venv local + serveur :8889), `steganography-mcp` (`npx -y steganography-mcp`), `cyberchef-mcp` (`npx -y cyberchef-mcp`), `gdb-mcp` (binaire `gdb-mcp`), + 2 non listés ci-dessus dans le schéma.

### Commandes CLI vérifiées ce jour

- ✅ `npx -y repomix --help` → fonctionne (options `--stdout`, `--stdin`, `--copy`, `--token-count-tree`, `--top-files-len`).
- ✅ `uvx --from git+https://github.com/oraios/serena serena-agent start-mcp-server --help` → fonctionne (74 paquets installés en ~10 s au premier appel).
- ✅ `/home/jolt/.npm-global/bin/chrome-devtools-mcp --help` → fonctionne, flags `--category*` pour désactiver des familles d'outils.
- ✅ `/home/jolt/.local/bin/scrapling mcp --help` → fonctionne (stdio par défaut, `--http` pour HTTP).

## 2. Serveurs MCP — tableau général

| MCP | URL officielle (vérifiée) | ★ | Dernier commit | Licence | Lancement (testé ⚠️ sinon) | Remplace | Verdict |
|---|---|---|---|---|---|---|---|
| repomix | https://github.com/yamadashy/repomix | 29 208 | 2026-11-08 | MIT | ✅ `npx -y repomix --mcp` (stdio) ; CLI : `npx -y repomix <dir> --stdout` | N clonages/lectures de fichiers d'un repo tiers → 1 appel | **RÉUTILISER** (déjà actif) |
| gitingest | https://github.com/coderamp-labs/gitingest | 16 105 | 2026-11-08 | MIT | ✅ `uvx gitingest <url> -o out.txt` (CLI testé) ; variante MCP communautaire : NON VÉRIFIÉ | idem repomix, orienté ingestion texte | **ÉVITER** (doublon de repomix, déjà actif) |
| serena | https://github.com/oraios/serena | 31 257 | 2026-11-09 | NOASSERTION sur l'API GitHub (README = usage libre, licence non standard) | ✅ `uvx --from git+https://github.com/oraios/serena serena-agent start-mcp-server --context ide-assistant` | grep/read pour navigation de code (LSP : définitions, refs, symboles) | **RÉUTILISER** (déjà actif) |
| deepwiki (Cognition) | https://mcp.deepwiki.com/mcp ; docs : https://docs.devin.ai/work-with-devin/deepwiki-mcp ; repo : https://github.com/CognitionAI/deepwiki (104★, pas de licence, dernier commit 2025-05) | 104 | 2025-05-22 | aucune | HTTP hébergé, sans clé pour repos publics (endpoint vivant, 405 en GET) ; ⚠️ `claude mcp add -s user -t http deepwiki https://mcp.deepwiki.com/mcp` | lecture du README/wiki d'un repo inconnu → 1 `ask_question` | **RÉUTILISER** (déjà actif). NB : `AsyncFuncAI/deepwiki-mcp` cité dans le cahier des charges → **404, NON VÉRIFIÉ** ; c'est `AsyncFuncAI/deepwiki-open` (le clone open-source, sans MCP natif) et un wrapper tiers `regenrek/deepwiki-mcp` (1 390★, MIT) |
| context7 | https://github.com/upstash/context7 | 64 447 | 2026-11-10 | MIT | HTTP hébergé `https://mcp.context7.com/mcp` (vivant) | re-lecture de docs de libs via web_search/read | **RÉUTILISER** (déjà actif) |
| gh_grep (grep.app) | https://mcp.grep.app | — | — | — (service hébergé, dépôt officiel non identifié : NON VÉRIFIÉ) | HTTP hébergé (vivant) | gh api search/code + web_search pour exemples de code | **RÉUTILISER** (déjà actif) |
| exa | https://github.com/exa-labs/exa-mcp-server ; endpoint https://mcp.exa.ai/mcp | 5 220 | 2026-11-05 | MIT | HTTP hébergé (vivant, 405) ; clé API exa pour usage sérieux | web_search généraliste | **ADAPTER** : redondant avec web_search natif ; à activer seulement si besoin de recherche sémantique/neurale (veille CTI sur blogs techniques) |
| tavily | https://github.com/tavily-ai/tavily-mcp | 2 483 | 2026-11-05 | MIT | ✅ `npx -y tavily-mcp --help` (v0.2.22, flag `--list-tools`) ; stdio, exige `TAVILY_API_KEY` | web_search + extraction de pages | **ÉVITER** : payant au-delà du free tier, redondant avec web_search natif |
| firecrawl | https://github.com/firecrawl/firecrawl-mcp-server ; endpoint https://mcp.firecrawl.dev/v2/mcp | 7 793 | 2026-11-10 | MIT | ✅ `npx -y firecrawl-mcp --help` → mode keyless confirmé : `firecrawl_scrape`/`firecrawl_search` gratuits (rate-limit par IP) | scraping JS-heavy que scrapling/curl ratent | **ADAPTER** : le mode keyless est intéressant en secours de scrapling sur les sites à JS lourd (portails de leak) ; garder désactivé par défaut |
| scrapling | https://github.com/D4Vinci/Scrapling (PyPI `scrapling` 0.5.1) | 100 796 | 2026-11-09 | BSD-3-Clause | ✅ `/home/jolt/.local/bin/scrapling mcp` (stdio) ou `scrapling mcp --http` | curl + parsing manuel pour pages statiques/dynamiques | **RÉUTILISER** (déjà actif) |
| chrome-devtools-mcp | https://github.com/ChromeDevTools/chrome-devtools-mcp | 55 047 | 2026-11-10 | Apache-2.0 | ✅ `/home/jolt/.npm-global/bin/chrome-devtools-mcp` (stdio) | scrapling quand il faut un vrai Chrome (anti-bot, sessions) | **RÉUTILISER** (déjà actif) |
| playwright-mcp | https://github.com/microsoft/playwright-mcp | 39 400 | 2026-11-10 | Apache-2.0 | ⚠️ `npx -y @playwright/mcp@latest` (npm v0.0.85 vérifiée) | chevauche chrome-devtools-mcp presque à 100 % | **ÉVITER** : doublon de chrome-devtools-mcp déjà actif |
| fetch (officiel) | https://github.com/modelcontextprotocol/servers (`src/fetch`) | 91 900 (monorepo) | 2026-11-10 | MIT | ✅ `uvx mcp-server-fetch` (installé et lancé en stdio) | read d'URL → mais le read natif fait déjà mieux (reader mode, sélecteurs) | **ÉVITER** : read natif de l'agent est plus riche |
| github-mcp-server (officiel) | https://github.com/github/github-mcp-server | 34 359 | 2026-11-09 | MIT | ⚠️ `github-mcp-server stdio` (binaire Go) ou HTTP hébergé `https://api.githubcopilot.com/mcp/` + token | `gh api` shell | **ÉVITER** : `gh` CLI déjà authentifié couvre tout, sans couche MCP |
| git-mcp | https://github.com/idosal/git-mcp ; service https://gitmcp.io | 8 510 | 2026-05-08 | Apache-2.0 | ⚠️ HTTP hébergé `https://gitmcp.io/docs` (générique) | lecture de README/docs d'un repo tiers | **ÉVITER** : deepwiki + repomix déjà actifs couvrent mieux |
| codegraph | https://github.com/colbymchenry/codegraph | 77 259 | 2026-11-01 | MIT | ⚠️ `npx @colbymchenry/codegraph` puis `codegraph init` + `codegraph serve --mcp` ; outil unique `codegraph_explore` | grep + read itératifs sur GROS codebases (graphe d'appels, blast radius) | **ADAPTER** : pertinent si le monorepo radar-cyber grossit ; aujourd'hui serena (LSP) suffit. Attention : jeune projet, index SQLite à reconstruire |
| sequential-thinking | https://github.com/modelcontextprotocol/servers (`src/sequentialthinking`) ; fork populaire `arben-adm/mcp-sequential-thinking` (961★, MIT) | — | — | MIT | ⚠️ `npx -y @modelcontextprotocol/server-sequential-thinking` | rien : c'est un cache de raisonnement | **ÉVITER** : zéro gain tokens, le modèle raisonne déjà en interne |
| supermemory | https://github.com/supermemoryai/supermemory-mcp | 1 731 | 2026-10-02 | MIT | ⚠️ `npx @supermemoryai/supermemory-mcp` — **package npm absent** (vérifié : `npm view` → absent) ; service cloud avec clé | mémoire inter-sessions | **ÉVITER** : service cloud (code sort du poste) ; Mnemopi local déjà présent |
| mem0 | https://github.com/mem0ai/mem0-mcp | 662 | 2026-03-24 | Apache-2.0 | ⚠️ serveur OpenAPI/mem0 local, dépend de la plateforme mem0 | mémoire inter-sessions | **ÉVITER** : idem, Mnemopi couvre le besoin en local |
| ast-grep (MCP) | CLI : https://github.com/ast-grep/ast-grep (16 528★, MIT, actif 2026-11-10). Serveur MCP officiel : **NON VÉRIFIÉ** (pas de MCP dans le repo officiel ; wrappers tiers non audités) | 16 528 | 2026-11-10 | MIT | CLI `sg` (déjà dispo via xd://ast_grep dans l'agent) | — | **ÉVITER** en tant que MCP : l'agent a déjà ast_grep natif |

## 3. Réduction de tokens — gains chiffrés attendus

C'est la section pivot : ce que chaque MCP évite de charger dans le contexte.

| MCP | Gain attendu (chiffré) | Justification |
|---|---|---|
| **repomix** | Remplace ~10-20 `gh api contents` + lectures de fichiers par **1 appel**. Un pack d'un repo de 200 fichiers ≈ 50-150 k tokens en sortie de tool, mais on peut cibler (`--include`) : pack de 5 fichiers ≈ 2-5 k tokens au lieu de 10 appels ≈ 15 k tokens (chaque appel tool-call + résultat a un overhead ~500-1 500 tokens). Sur une question « comment X fait Y dans le repo Z » : **-60 à -80 % de tokens**. | Le pack arrive en un bloc unique, pas de framing répété par appel. |
| **serena** | Remplace ~3-5 grep + 2-3 read par question de navigation. Un `find_referencing_symbols` retourne les refs pertinentes (≈ 200-800 tokens) au lieu de grep (2-5 k tokens de matches bruits) + reads de fichiers entiers (5-20 k tokens). Gain estimé : **-50 à -70 %** sur les tâches de refactor/navigation. | LSP = précision structurelle, pas de faux positifs de grep. |
| **deepwiki** | 1 `ask_question` ≈ 500-1 500 tokens de réponse cible au lieu de repomix d'un repo inconnu (50-150 k tokens) ou de 5-10 lectures web. Sur une question « à quoi sert ce repo / comment fonctionne son collector » : **-90 % et plus**. | Le wiki est pré-généré côté serveur ; on ne charge que la réponse. |
| **context7** | 1 `query-docs` ciblé ≈ 1-3 k tokens de docs à jour au lieu de web_search (2-5 k de snippets) + read d'une page de docs (5-20 k, souvent obsolète). **-40 à -70 %** par question de doc, et surtout moins d'erreurs d'API obsolète (coût invisible : retries). | Docs versionnées par bibliothèque. |
| **gh_grep** | 1 recherche ≈ 1-2 k tokens de résultats au lieu de cloner/packer un repo juste pour voir « comment d'autres font » (50 k+). **-80 à -95 %** pour la veille d'implémentation. | Recherche globale indexée, extraits courts. |
| **scrapling** | 1 fetch structuré (markdown/sélecteurs) ≈ 1-5 k tokens au lieu de read HTML brut (10-50 k tokens de balises). **-60 à -90 %** sur les pages cibles (leaks sites, portails CVE). | Extraction ciblée avant injection contexte. |
| **chrome-devtools-mcp** | Comme scrapling mais pour pages JS-heavy : snapshot d'accessibilité ≈ 1-3 k tokens au lieu de HTML rendu complet. **-70 %+** vs screenshot+OCR ou HTML brut. Coût : lents (2-5 s/appel), à réserver aux pages qui résistent à scrapling. | Snapshot a11y = texte compact. |
| **exa / tavily / firecrawl** | Gains similaires à web_search natif (±10 %) ; firecrawl keyless apporte un vrai gain (+) sur pages JS lourd : markdown propre ≈ 2-5 k vs HTML brut 20 k+. | Sinon redondants. |
| **codegraph** | 1 `codegraph_explore` ≈ 1-3 k tokens (symboles + call paths + blast radius) au lieu de 5-10 grep/read (20-50 k) sur une codebase de taille moyenne. **-70 à -90 %** sur les questions d'architecture — mais uniquement si l'index est maintenu. | Graphe pré-calculé, auto-sync. |
| **sequential-thinking / supermemory / mem0 / fetch / playwright-mcp / github-mcp / git-mcp / gitingest** | Gain nul ou négatif (outils de plus dans le prompt système ≈ +500-2 000 tokens de schéma chacun, chargés à chaque session). | Chaque MCP activé coûte son schéma d'outils en tokens même sans appel. |

**Règle d'or** : chaque serveur MCP activé coûte ~500-2 000 tokens de schéma d'outils en permanence. Avec 7 serveurs actifs (état actuel), le surcoût structurel est ~5-10 k tokens/session — rentabilisé dès la 2e-3e question qui évite un repomix ou une lecture de docs.

## 4. Recommandations pour radar-cyber

1. **Garder l'état actuel** (7 actifs) : couvre recherche (gh_grep, exa non nécessaire), docs (context7, deepwiki), code (serena, repomix), scraping (scrapling, chrome-devtools).
2. **Activer firecrawl en secours** (keyless, sans clé) pour les portails de leak à protection Cloudflare/JS lourd où scrapling échoue — testé : le mode keyless fonctionne.
3. **Ne pas activer** playwright-mcp, fetch, github-mcp, git-mcp, sequential-thinking, supermemory, mem0 : doublons ou zéro gain (voir §3).
4. **Surveiller codegraph** : si le monorepo dépasse ~50 k lignes et que serena rame, c'est le candidat naturel (graphe d'appels + blast radius en 1 appel).

## 5. Non-vérifié / incertitudes

- `AsyncFuncAI/deepwiki-mcp` : **404** sur l'API GitHub — le nom du cahier des charges est erroné. Le serveur deepwiki officiel est celui de Cognition (hébergé, cf. §2).
- Dépôt officiel de `mcp.grep.app` : non identifié (service hébergé sans repo public trouvé) — NON VÉRIFIÉ, mais l'endpoint répond et est déjà branché.
- Serveur MCP officiel ast-grep : inexistant dans le repo officiel → NON VÉRIFIÉ.
- Package npm `@supermemoryai/supermemory-mcp` : absent du registry (vérifié `npm view`) malgré le README du repo → commande non exécutable en l'état.
- Licence serena : `NOASSERTION` côté API GitHub (fichier LICENSE non standard) — à relire avant tout redistribution.
