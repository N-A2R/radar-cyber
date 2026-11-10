# Stacks d'agents — orchestration, supervision, UI, bots, protocoles

> Recherche du 2026-11-10. Chaque dépôt vérifié le jour même via `gh api` (étoiles, licence, dernier push relevés en direct). Cadre légal : usage **personnel / interne, non diffusé, non commercial**. Conséquence : copier du code **GPL/AGPL** dans radar-cyber n'est acceptable que si le repo reste privé et n'est jamais diffusé ; sinon on copie le **pattern**, pas le code. Dépôts **sans licence** = signalés, on ne copie rien.

Légende verdicts : **RUNTIME** = runtime compatible avec notre stack (Node/TS/omp, ou consommable via HTTP) ; **CONCEPT** = on prend l'idée/schéma/pattern, pas le code ; **INUTILISABLE** = rien à en tirer dans notre contexte.

---

## 1. Orchestration d'agents

| Dépôt | URL | ⭐ | Licence | Dernier commit | Stack | Verdict |
|---|---|---|---|---|---|---|
| langgraph | github.com/langchain-ai/langgraph | 44 738 | MIT | 2026-11-10 | Python + **TS port officiel** | RUNTIME (branche TS) |
| autogen | github.com/microsoft/autogen | 61 769 | **CC-BY-4.0** (repo docs+code) | 2026-10-28 | Python | CONCEPT |
| crewAI | github.com/crewAIInc/crewAI | 60 717 | MIT | 2026-11-10 | Python | CONCEPT |
| agno | github.com/agno-agi/agno (⚠️ pas `agnoagi`) | 43 128 | Apache-2.0 | 2026-11-10 | Python | CONCEPT |
| mastra | github.com/mastra-ai/mastra | 29 442 | Apache-2.0 **sauf `ee/` propriétaire** (lu dans LICENSE.md) | 2026-11-10 | **TypeScript** | RUNTIME |
| swarm | github.com/openai/swarm | 22 118 | MIT | 2026-04-15 (non archivé mais quasi figé) | Python | INUTILISABLE (éducatif, remplacé par openai-agents) |
| pydantic-ai | github.com/pydantic/pydantic-ai (⚠️ pas `pydantic-ai/`) | 21 117 | MIT | 2026-11-10 | Python | CONCEPT |
| strands (harness-sdk) | github.com/strands-agents/harness-sdk (⚠️ `agent-sdk` n'existe pas → 404) | 9 106 | Apache-2.0 | 2026-11-10 | Python **+ TypeScript** | RUNTIME (branche TS) |
| openai-agents | github.com/openai/openai-agents-python | 30 596 | MIT | 2026-11-10 | Python (voice/JS en marge) | CONCEPT |

**Ce qu'on en prend :**
- **LangGraph (TS)** : le graphe d'état (nœuds/arêtes/checkpointing) est le meilleur modèle pour nos bots Hermes à étapes (collecter → dédupliquer → résumer → publier). On copie le **pattern state-machine + checkpoint** dans notre scheduler cron, pas le runtime. Effort : 2-3 j pour un mini-graphe maison en TS.
- **Mastra** : seul framework TS complet (workflows, mémoire, tools, eval). Si on veut un vrai runtime plutôt qu'un pattern, c'est le seul candidat sérieux côté Node. Effort adoption : 3-5 j ; risque : `ee/` (auth SSO, RBAC) sous licence propriétaire — on n'y touche pas, le core Apache-2.0 suffit.
- **Autogen** : licence CC-BY-4.0 = attribution obligatoire même en interne ; surtout conversation multi-agents, overkill pour des bots de veille à une seule tâche. **Concept seul** : les « toolkits » et le pattern de conversation structurée.
- **crewAI / agno / pydantic-ai / openai-agents** : Python pur → runtime incompatible avec omp/Node. On garde les **concepts** : rôles crewAI (mais nos briefs font ça mieux en prompts), outils typés de pydantic-ai (même idée que nos skills omp), handoffs d'openai-agents.

---

## 2. Supervision / observabilité

| Dépôt | URL | ⭐ | Licence | Dernier commit | Stack | Verdict |
|---|---|---|---|---|---|---|
| langfuse | github.com/langfuse/langfuse | 37 243 | MIT **core**, `ee/` propriétaire (© ClickHouse, lu dans LICENSE) | 2026-11-10 | TS, self-hostable (Docker) | RUNTIME |
| agentops | github.com/AgentOps-AI/agentops (⚠️ pas `AgentOps/` = profil vide) | 5 952 | MIT | 2026-06-25 | Python SDK | CONCEPT |
| openllmetry | github.com/traceloop/openllmetry | 7 529 | Apache-2.0 | 2026-11-09 | TS + Python, OTel | RUNTIME |
| logfire | github.com/pydantic/logfire | 4 543 | MIT | 2026-11-09 | Python | INUTILISABLE (runtime) |
| latitude-llm | github.com/latitude-dev/latitude-llm | 4 747 | MIT | 2026-11-09 | TS | RUNTIME |
| helicone | github.com/Helicone/helicone | 6 275 | Apache-2.0 | 2026-10-28 | proxy gateway | RUNTIME |
| tensorzero | github.com/tensorzero/tensorzero | 11 705 | Apache-2.0 | 2026-06-11 | Rust gateway | CONCEPT (gateway intéressante mais lourd) |

**Ce qu'on en prend :**
- **Langfuse** : le candidat n°1. Self-host (docker-compose), UI de traces/coûts/évals mature, SDK TS. On consomme **l'instance** + SDK ; on copie le **schéma de trace** (trace → spans d'agent → générations) comme modèle pour notre propre journal Hermes si on ne veut pas de Postgres en plus. Effort : ½ j pour brancher les bots ; 1 j si on copie le schéma.
- **OpenLLMetry** : si on préfère rester sur OpenTelemetry (déjà standard elsewhere), SDK TS auto-instrumentant les SDK LLM. Effort : 1 j.
- **AgentOps** : SDK Python, dernier commit > 4 mois, écosystème frameworks Python — **concept seulement** (dashboard de sessions d'agents).
- **Helicone/TensorZero** : passerelles LLM (cache, quotas, fallback). Utile si on multiplie les providers omp ; sinon overkill. Effort si adoption : 2 j.

---

## 3. UI d'agents / chat

| Dépôt | URL | ⭐ | Licence | Dernier commit | Stack | Verdict |
|---|---|---|---|---|---|---|
| AG-UI | github.com/ag-ui-protocol/ag-ui | 17 082 | MIT | 2026-11-10 | protocole + SDK TS | RUNTIME (protocole) |
| agent-chat-ui | github.com/langchain-ai/agent-chat-ui | 3 253 | MIT | 2026-11-03 | Next.js/React | CONCEPT |
| agent-ui (agno) | github.com/agno-agi/agent-ui | 1 869 | MIT | 2026-05-08 | Next.js, Tailwind | CONCEPT |
| browser-use web-ui | github.com/browser-use/web-ui | 16 646 | MIT | 2026-09-25 | React/Vite | CONCEPT |
| UI-TARS-desktop | github.com/bytedance/UI-TARS-desktop | 39 591 | Apache-2.0 | 2026-10-09 | Electron | INUTILISABLE (hors sujet) |

**Ce qu'on en prend :**
- **AG-UI** : protocole d'événements agent→UI (streaming d'états, tool calls, messages). C'est exactement la couche qu'il nous manque si on veut une **UI de supervision Hermes dans Tern** : on copie la **taxonomie d'événements** (RUN_STARTED, TOOL_CALL_*, STATE_*) plutôt que les SDK React. Effort : 1-2 j pour un flux SSE côté Fastify + rendu minimal.
- **agent-chat-ui / agent-ui** : composants de chat React (messages, tool-call rendering, human-in-the-loop). Nos styles.css maison → on copie **la structure de composants et les états**, pas le code Tailwind/Next. Effort : 1 j.
- Note : `browser-use/browser-use` (120 505 ⭐, MIT, Python) = bibliothèque d'agents navigateur, **runtime Python incompatible** ; concept (DOM sérialisé + actions) à garder si un jour on branche un browser-agent côté omp.

---

## 4. Agents complets / harness

| Dépôt | URL | ⭐ | Licence | Dernier commit | Stack | Verdict |
|---|---|---|---|---|---|---|
| OpenHands | github.com/OpenHands/OpenHands (ex All-Hands-AI/OpenHands, redirect OK) | 93 094 | MIT | 2026-11-10 | Python backend + Next.js front | CONCEPT |
| goose | github.com/block/goose → **redirige vers github.com/aaif-goose/goose** (56 418, Apache-2.0, push 2026-11-10) | 56 418 | Apache-2.0 | 2026-11-10 | Rust | CONCEPT |

**Ce qu'on en prend :**
- **OpenHands** : plateforme complète de dev-agent — trop grosse pour adoption, mais le **modèle d'événements** (event stream : action/observation, agent state machine) est une excellente référence pour l'UI de supervision. Effort : lecture ½ j, réutilisation pattern 1-2 j.
- **goose** : harness Rust extensible par MCP ; l'architecture **extensions MCP + recettes** est transposable à Hermes (chaque bot = recette déclarative). Effort : concept ½ j.

---

## 5. Bots / veille automatisée

| Dépôt | URL | ⭐ | Licence | Dernier commit | Stack | Verdict |
|---|---|---|---|---|---|---|
| RSS-to-Telegram-Bot | github.com/Rongronggg9/RSS-to-Telegram-Bot | 2 175 | **AGPL-3.0** ⚠️ | 2026-11-09 | Python | CONCEPT (code GPL : copier seulement si repo privé à vie) |
| flowerss-bot | github.com/indes/flowerss-bot | 1 827 | MIT | **2023-08-21 (mort)** | Go | INUTILISABLE |
| rssbot | github.com/iovxw/rssbot | 1 699 | Unlicense | 2026-08-17 | Rust | CONCEPT |
| NodeRSSBot | github.com/fengkx/NodeRSSBot | 405 | MIT | 2026-11-10 | **Node.js/TypeScript** | RUNTIME |
| el_monitorro | github.com/ayrat555/el_monitorro | 215 | MIT | 2026-07-09 | Rust/Elixir | INUTILISABLE |
| ThreatIntelligenceDiscordBot | github.com/vxunderground/ThreatIntelligenceDiscordBot | 439 | MIT | **2024-04-24 (mort)** | Python | CONCEPT |
| CyBot | github.com/cylance/CyBot | 316 | **SANS LICENCE** ⚠️ | **2020-03-30** | Python | INUTILISABLE (pas de licence = pas de droit d'utilisation) |

**Ce qu'on en prend :**
- **NodeRSSBot** : seul du lot en Node ; pattern **déduplication par hash + anti-spam + formatage Telegram** directement réutilisable pour notre pont Hermes→Telegram. Effort : ½ j.
- **RSS-to-Telegram-Bot** : la meilleure gestion des formats/filters, mais AGPL — on **copie le pattern** (fila de dédup, filtres par regex par canal) sans le code, sauf si le repo radar-cyber reste définitivement privé. Effort pattern : 1 j.
- **ThreatIntelligenceDiscordBot** : la liste de **sources CTI** (clearnet + ransomware actor domains) est la vraie valeur, pas le code (mort 2 ans). À extraire dans `osint-catalogs.md`. Effort : ½ j.

---

## 6. Protocoles d'échange

| Dépôt | URL | ⭐ | Licence | Dernier commit | Verdict |
|---|---|---|---|---|---|
| MCP | github.com/modelcontextprotocol/modelcontextprotocol | 9 655 | MIT → **transition Apache-2.0** (annoncée dans LICENSE : nouvelles contributions Apache-2.0, docs CC-BY-4.0) | 2026-11-10 | RUNTIME (déjà notre standard) |
| A2A | github.com/a2aproject/A2A | 26 472 | Apache-2.0 | 2026-11-05 | CONCEPT |
| ACP | github.com/i-am-bee/acp (IBM BeeAI) | 1 020 | Apache-2.0 | **2025-08-25 (calme)** | CONCEPT |
| ANP | github.com/agent-network-protocol/AgentNetworkProtocol | 1 472 | Apache-2.0 | 2026-11-09 | INUTILISABLE (DNS décentralisé, hors besoin) |
| AG-UI | github.com/ag-ui-protocol/ag-ui | 17 082 | MIT | 2026-11-10 | RUNTIME (voir §3) |

**Ce qu'on en prend :**
- **MCP** : déjà en place côté omp. Rien à changer ; la transition de licence ne nous affecte pas (on consomme la spec).
- **A2A** : pertinent uniquement si un jour des agents **indépendants** (Hermes ↔ omp ↔ tiers) doivent se découvrir et déléguer par HTTP. Pour l'instant : **concept** — l'idée d'Agent Card (manifeste JSON des capacités d'un agent) vaut ½ j à imiter pour décrire nos bots Hermes.
- **ACP** : dormant depuis un an, superseeded de fait par A2A/MCP. Éviter.

---

## 7. Recommandation chiffrée

### Adopter (runtime)
| Quoi | Dépôt | Effort | Pourquoi |
|---|---|---|---|
| Observabilité self-host | **langfuse** (MIT core) | ½–1 j | traces/coûts/évals des bots Hermes, SDK TS, docker-compose |
| Framework TS si besoin de workflow | **mastra** (Apache-2.0 sauf ee/) | 3–5 j | seul framework agent TS mature ; on reste hors `ee/` |
| Formatage Telegram RSS | **NodeRSSBot** (MIT) | ½ j | pattern dédup + rendu, même runtime |
| Protocole agent→UI | **AG-UI** (MIT) | 1–2 j | taxonomie d'événements pour une UI Tern de supervision |

### Adapter (concept → code maison)
| Quoi | Source | Effort |
|---|---|---|
| Graphe d'état + checkpoints pour les pipelines de veille | langgraph (pattern) | 2–3 j |
| Event stream action/observation pour l'UI | OpenHands, AG-UI | 1–2 j |
| Agent Card (manifeste de capacités par bot) | A2A | ½ j |
| Sources CTI du Discord bot de vxunderground | extraction vers catalogs | ½ j |

### Éviter
| Quoi | Raison |
|---|---|
| swarm | figé depuis 2026-04, éducatif, remplacé par openai-agents |
| Autogen (runtime) | CC-BY-4.0 + Python + multi-agents conversationnel surdimensionné |
| crewAI/agno/pydantic-ai/logfire (runtime) | Python pur, incompatible omp/Node |
| goose (runtime) | Rust, harness complet — on a déjà omp |
| flowerss-bot, CyBot, ThreatIntelligenceDiscordBot (code) | morts (2020–2023) ; CyBot sans licence |
| tensorzero/helicone | passerelles LLM : redondant avec la config providers d'omp |

### Total effort recommandé : ~6–10 j
Priorité : **langfuse (½ j)** → **NodeRSSBot pattern (½ j)** → **AG-UI events (1–2 j)** → **mini-graphe langgraph maison (2–3 j)**. Mastra seulement si les workflows Hermes dépassent le cron simple.
