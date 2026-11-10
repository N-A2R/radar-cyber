# Design systems & briques UI — benchmark vérifié pour radar-cyber

Date : 2026-11-10 · Périmètre : `apps/web` (React 19, styles.css maison, 4 thèmes : observatoire/terminal/souverain/clair). Besoin : tableaux denses (296 sources), KPIs, timeline, badges — sans réinventer ni adopter une plateforme.

**Méthode** : chaque dépôt vérifié aujourd'hui via `gh api repos/<o>/<r>` (étoiles, licence, dernier push) ; licences ambigües lues dans le fichier LICENSE ; tailles bundle mesurées via l'API bundlephobia.com (paquet **entier**, non tree-shaké — le coût réel à l'import est souvent moindre pour les libs modulaires). Code HTTP : toutes les requêtes `gh api` → 200 sauf mention. React 19 : vérifié via `peerDependencies` npm (marqué sinon).

**Cadre légal** : usage personnel, interne, non diffusé, non commercial. Conséquence, valable pour tout ce document : **copier du code GPL/AGPL dans le repo n'est acceptable que si le repo reste privé et n'est jamais diffusé**. Dans le doute, on copie le *pattern*, pas le code. Tout dépôt sans licence est signalé.

---

## 1. Libs de composants

| Lib | URL | Licence (lue) | ★ | Dernier push | Bundle (gzip, paquet entier) | React 19 | Verdict |
|---|---|---|---|---|---|---|---|
| shadcn/ui | github.com/shadcn-ui/ui | MIT | 127 787 | 2026-11-10 | n/a (pas un paquet : code copié dans le repo) | oui (code source) | **ADAPTER** |
| Radix Primitives | github.com/radix-ui/primitives | MIT | 19 488 | 2026-10-14 | dialog 13,2 Ko · dropdown-menu 30,3 Ko (par primitive) | oui | **ADAPTER** |
| Radix Themes | github.com/radix-ui/themes | MIT | 8 832 | 2026-04-11 | ~1 Mo brut (themed, non mesuré finement) | oui | ÉVITER (thème imposé, push > 6 mois) |
| Mantine | github.com/mantinedev/mantine | MIT | 31 928 | 2026-11-09 | `@mantine/core` 9.8.0 : **191 Ko** | oui (`^19.2.0` vérifié) | ÉVITER (nous) |
| Chakra UI v3 | github.com/chakra-ui/chakra-ui | MIT | 40 720 | 2026-11-10 | `@chakra-ui/react` 3.38.0 : **331 Ko** | oui | ÉVITER |
| Headless UI | github.com/tailwindlabs/headlessui | MIT | 28 816 | 2026-04-13 | `@headlessui/react` 2.2.10 : **63 Ko** | oui | ÉVITER (orienté Tailwind) |
| Ark UI | github.com/chakra-ui/ark | MIT | 5 461 | 2026-11-10 | `@ark-ui/react` 5.40.0 : **297 Ko** (69 deps zag) | oui | ÉVITER |
| Aceternity UI | ui.aceternity.com | **NON VÉRIFIÉE** (pas de repo officiel GitHub, page `/license` → 404 ; composants gratuits + section Pro payante) | — | — | n/a (copy-paste, dépend framer-motion) | oui | ÉVITER (licence incertaine, esthétique marketing, pas ops) |

**Ce qu'on en copie vs consomme** :
- **shadcn/ui** : on *copie* le code des composants (CLI `shadcn add`), pas de dépendance runtime hormis Radix + tailwind-merge/clsx. C'est le seul modèle « copier le composant » crédible. Mais ses composants supposent Tailwind + variables CSS shadcn : notre styles.css maison devrait adopter sa convention de tokens ou adapter chaque composant.
- **Radix Primitives** : on *importe* les primitives headless (dialog, dropdown, tooltip, popover — nos popups de carte, menus de légende) et on garde 100 % de notre CSS. C'est la seule lib qui n'impose aucun style.
- **Mantine/Chakra/Ark** : on *consommerait* la lib entière — 191–331 Ko gzip, thèmes propriétaires à réécrire ×4, conflit avec nos tokens existants. Coût de migration >> gain.
- **Aceternity** : rien à prendre (licence invérifiable, animations marketing inutiles en salle de contrôle).

## 2. Tableaux denses (296 sources, + lignes IOC/CVE)

| Lib | URL | Licence (lue) | ★ | Dernier push | Bundle (gzip) | React 19 | Verdict |
|---|---|---|---|---|---|---|---|
| TanStack Table | github.com/tanstack/table | MIT | 28 559 | 2026-11-02 | `@tanstack/react-table` 9.3.1 : **31,6 Ko** | oui | **RÉUTILISER** |
| AG Grid | github.com/ag-grid/ag-grid | **Dual : MIT (community) + Commercial (enterprise)** — licence lue : « two license types: MIT and Commercial » | 15 675 | 2026-11-10 | community 36.3.0 : **392 Ko** + ag-grid-react 209 Ko | oui | ÉVITER |
| react-window | github.com/bvaughn/react-window | MIT | 17 212 | 2026-11-06 | 2.5.3 : **8,5 Ko**, 0 dep | oui | **RÉUTILISER** (si besoin virt.) |
| TanStack Virtual | github.com/tanstack/virtual | MIT | 7 196 | 2026-11-08 | 3.14.26 : **10,3 Ko** | oui | **RÉUTILISER** (alternative) |
| react-virtuoso | github.com/petyosi/react-virtuoso | MIT | 6 485 | 2026-11-09 | 4.18.21 : **19,9 Ko**, 0 dep | oui | ADAPTER |
| Glide Data Grid | github.com/glideapps/glide-data-grid | MIT | 5 433 | 2026-11-05 | 6.0.3 : **63,8 Ko** | **NON — peer deps vérifiés npm : `react ^16.12 || 17 || 18`** | **ÉVITER** (React 19 incompatible) |

- **TanStack Table** : *on importe* — headless, zéro style imposé, il pilote notre `<table class="data">` existant (tri, filtres, colonnes épinglées, grouping). 31,6 Ko pour le tri + filtre multi-colonnes de 296 sources : le meilleur ratio.
- **AG Grid** : *on consommerait* 600 Ko gzip pour des features enterprise qu'on n'aura jamais ; la partie MIT (community) est lourde et son thème est incompatible avec nos 4 thèmes sans CSS override massif.
- **react-window / TanStack Virtual** : *on importe* seulement si les 296 sources × events dépassent le DOM confortable (~1 500 lignes). À ce jour : 296 lignes → pas besoin. À garder en réserve.
- **Glide Data Grid** : canvas-based, superbe pour 100k lignes, mais **bloqué à React 18** (peer deps vérifiés aujourd'hui) → éliminé.

## 3. Graphiques (timeline, séries, sparklines)

| Lib | URL | Licence (lue) | ★ | Dernier push | Bundle (gzip) | Verdict |
|---|---|---|---|---|---|---|
| uPlot | github.com/leeoniya/uPlot | MIT | 10 628 | 2026-11-10 | 1.6.32 : **21,8 Ko**, 0 dep | **RÉUTILISER** |
| visx | github.com/airbnb/visx | MIT | 21 101 | 2026-06-22 | `@visx/visx` 4.0.0 : 162 Ko (par-package : visx/shape ~15 Ko, tree-shakeable) | ADAPTER |
| nivo | github.com/plouc/nivo | MIT | 14 133 | 2026-07-21 | `@nivo/core` 0.99 : **62 Ko** + 1 paquet par type | ADAPTER |
| Recharts | github.com/recharts/recharts | MIT | 27 694 | 2026-11-09 | 3.10.1 : **150 Ko** | ÉVITER (nous) |
| Victory | github.com/FormidableLabs/victory | MIT (fichier lu : « The MIT License, Copyright Nearform ») | 11 245 | 2026-11-10 | 38.0.1 : **122 Ko**, 27 deps | ÉVITER |
| ECharts | github.com/apache/echarts | Apache-2.0 | 67 698 | 2026-10-13 | 6.1.0 : **368 Ko** | ÉVITER |

- **uPlot** : *on importe* — timeline d'activité et séries 30 jours (pattern Feodo Tracker de `ui-ux.md` §2.3) au coût le plus bas du marché (21,8 Ko, ~100k points/s). API abrupte mais un seul usage : courbes temporelles.
- **visx** : *on copie le pattern* — primitives D3 bas niveau, import par package (ex. `@visx/axis` seul). Pertinent seulement si on veut des graphes custom fortement stylés (barres de compteur par famille).
- **Recharts/Victory/ECharts** : *on consommerait* 120–370 Ko pour des courbes qu'uPlot fait en 22 Ko. Recharts reste le choix de confort si on déléguait à un junior — pas notre cas.

## 4. Design systems « ops / salle de contrôle » (recherches GitHub)

Recherches exécutées : `security dashboard design system`, `SOC dashboard react`, `monitoring dashboard react`, `dark dashboard template react`, `command center UI react` (toutes 200). Résultat brut : **beaucoup de bruit** (repo sans lien, templates marketing), quelques briques :

| Dépôt | ★ | Licence | Dernier push | Verdict | Ce qu'on en copie |
|---|---|---|---|---|---|
| sameerk27/vigil365 (SOC dashboard M365 self-hosted) | 284 | MIT | 2026-11-08 | **ADAPTER** | structure de page SOC (KPI row → table d'alertes → détail), densité de tableau |
| ClickHouse/ClickStack (HyperDX) | 10 010 | MIT | 2026-11-10 | ADAPTER | UX de recherche/observabilité, patterns de tableaux de logs denses |
| MauriceNino/dashdot | 3 747 | MIT | 2026-11-09 | ADAPTER | panneau serveur sombre compact, graphes temps réel intégrés |
| hoangsonww/Claude-Code-Agent-Monitor | 1 164 | MIT | 2026-11-08 | ADAPTER | board temps réel WebSocket → notre flux d'events |
| 0xhav0c/ARGUS (OSINT globe 3D) | 24 | **SANS LICENCE** | 2026-04-19 | ÉVITER | à regarder pour l'inspiration visuelle uniquement — **aucune réutilisation de code possible** |
| Templates « admin dashboard » (justboil/admin-one-react-tailwind, MIT, 587★, push 2025-10) | — | MIT | — | ÉVITER | layouts génériques marketing, rien qu'on n'ait déjà |

Aucun « design system SOC » dédié crédible et maintenu n'existe en open source : la référence reste les produits fermés (GreyNoise, OpenCTI — déjà couverts dans `ui-ux.md` §2) et **Grafana** ci-dessous.

### 4.1 Cas particuliers CTI

| Projet | URL | Licence (lue) | ★ | Push | Verdict | Copier vs consommer |
|---|---|---|---|---|---|---|
| Grafana | github.com/grafana/grafana | **AGPL-3.0** | 77 809 | 2026-11-10 | **pattern only** | On copie les *patterns* (grille de panneaux, timepicker global, variables de template — déjà listés `ui-ux.md` §2.6). **On ne copie aucun code** sauf à garder le repo privé à vie ; on ne « consomme » pas Grafana (une plateforme de plus). |
| OpenBB | github.com/OpenBB-finance/OpenBB | **Apache-2.0** (fichier lu : « All files licensed under Apache License 2.0 ») | 75 290 | 2026-11-10 | ADAPTER | Ses tableaux denses financiers sont des PatternFly/AG Grid custom — on copie les patterns de densité (colonnes mono, alignement droit, rangées compactes), pas le code (stack Next.js ≠ la nôtre). |
| Tremor | github.com/tremorlabs/tremor | Apache-2.0 | 3 696 | **2025-10-10 (13 mois)** | ADAPTER | v3 = lib npm (222 Ko gzip) ; le projet a pivoté vers « copy & paste components » (tremor.so). On copie leurs patterns de KPI cards / badges de métrique en CSS maison. Repo quasi dormant → ne pas dépendre. |

## 5. Jetons de design

| Source | URL | Licence | ★ | Push | Verdict |
|---|---|---|---|---|---|
| Radix Colors | github.com/radix-ui/colors | MIT | 1 735 | 2025-12-17 | ADAPTER — paquets CSS par échelle (28 Ko gzip si tout importé ; on n'importerait qu'1-2 échelles). Échelles 12 pas avec variantes dark/auto-contraste : utile comme **référence de rampes**, pas comme dépendance. |
| Open Color | github.com/yeun/open-color | MIT | 5 584 | **2023-12-10 (stale)** | ÉVITER — figé, pas de variantes dark pensées pour fond #0a0e14 |
| Tailwind theme | github.com/tailwindlabs/tailwindcss | MIT | 98 666 | 2026-11-10 | ÉVITER (nous) — build-time only mais imposerait l'écosystme Tailwind ; nos tokens CSS existent déjà |
| Palettes `ui-ux.md` §4.1–4.3 | local | — | — | — | **RÉUTILISER** — 15 tokens de rôle + 9 familles Okabe-Ito + rampe S1–S5 déjà mesurés (contrastes WCAG, écarts CIE Lab). Aucune lib ne fera mieux pour notre fond précis. |

## 6. Recommandation — tranchée

Notre réalité : styles.css maison qui marche, 4 thèmes déjà tokenisés, 296 lignes de tableau (pas 300k), React 19, zéro dépendance UI actuelle. Les bundles mesurés ci-dessus condamnent les « design systems complets » (191–392 Ko gzip + réécriture des 4 thèmes).

### Option A — Rester sans lib + tokens CSS maison *(recommandée)*
- **Coût** : ~0 Ko ajouté. Effort : les composants badge/chip/table/legend existent déjà dans `ui-ux.md` §4.8 (CSS fourni, copiable tel quel).
- **Gain** : cohérence immédiate avec les 4 thèmes, zéro conflit de version, zéro dépendance à auditer.
- **Perdu** : accessibilité des widgets complexes (dialog focus-trap, dropdown clavier, combobox) — à écrire à la main si on en ajoute.
- **Hybride chiffré** : ajouter **uniquement** `@tanstack/react-table` (31,6 Ko, MIT) si tri/filtre multi-colonnes des 296 sources devient pénible à la main, et `uplot` (21,8 Ko, MIT) pour la timeline/séries. Total scénario réaliste : **~53 Ko gzip pour couvrir 90 % du besoin**.
- Ratio gain/effort : **élevé** (jour(s), pas semaines).

### Option B — Lib légère de composants headless (Radix Primitives + code copié)
- **Coût** : 13–30 Ko par primitive importée (dialog 13,2, dropdown 30,3) + adaptation de chaque composant à nos 4 thèmes. Effort : 1–2 semaines.
- **Gain** : a11y (focus trap, clavier, ARIA) acquise d'un coup sur dialog/dropdown/tooltip/popover — précisément nos popups de carte et menus de légende.
- **Perdu** : pureté « zéro dep » ; les primitives Radix imposent leur DOM (portails, data-attributes) → le CSS de `ui-ux.md` §4.7 doit être réécrit pour leurs sélecteurs.
- Ratio gain/effort : **moyen** — à ne déclencher que le jour où on ajoute des modales/combobox complexes. C'est l'option A + une valve d'échappement, pas un choix concurrent.

### Option C — Design system complet (Mantine ou shadcn/ui + Tailwind)
- **Coût** : Mantine 191 Ko gzip (peer `react ^19.2` ok) ou shadcn (gratuit en Ko mais exige Tailwind + sa convention de tokens + réécriture des 4 thèmes dans le format shadcn). Effort : 3–6 semaines de migration + dette permanente (2 thèmes sur 4 à maintenir manuellement à chaque montée de version).
- **Gain** : 40+ composants clés en main, docs, communauté.
- **Perdu** : les tokens mesurés de `ui-ux.md` §4 (familles Okabe-Ito, sévérité S1–S5, assertion par bordure) n'existent dans aucun de ces systems — il faudrait les réimplémenter par-dessus, donc payer deux fois. Mantine/Chakra imposent leur langage visuel : fin de l'identité « salle de contrôle ».
- Ratio gain/effort : **faible pour 296 lignes de tableau** — c'est payer une plateforme pour un besoin qu'Option A couvre à 53 Ko.

### Verdict
**Option A, avec la valve Radix Primitives (option B) au premier besoin de modale/combobox accessible, et les imports ciblés `@tanstack/react-table` + `uplot` (53 Ko gzip, MIT) au premier besoin de tri/série.** Jamais AG Grid, Glide Data Grid (React 19 bloqué), ni de code Grafana (AGPL) — patterns Grafana uniquement.
