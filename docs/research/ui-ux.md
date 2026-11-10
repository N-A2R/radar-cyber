# UI/UX — benchmark CTI & cartographie temps réel, et design system radar-cyber

Date : 2026-11-10 · Périmètre : frontend `apps/web` (React + MapLibre 3D) · Thème cible : salle de contrôle régionale, dark.

Méthode : 8 produits référencés, URLs vérifiées par requête HTTP (code 200 indiqué), pages lues quand elles sont publiques. Pour chaque référence : ce qui marche, ce qui échoue, et ce qu'on en récupère. En découle le design system §4, dont les tokens CSS sont copiables tels quels (§5).

---

## 1. Références vérifiées

| # | Référence | URL vérifiée (HTTP) | Gated |
|---|-----------|---------------------|-------|
| 1 | Shodan (moteur) | `https://www.shodan.io/` → **200** | non |
| 2 | Shodan Maps (docs) | `https://book.shodan.io/websites/maps/` → **200** | oui (`maps.shodan.io` → 401) |
| 3 | GreyNoise Visualizer 2.0 | `https://viz.greynoise.io/` → **200** · docs `https://docs.greynoise.io/docs/greynoise-visualizer-20` → **200** | oui (login) |
| 4 | Feodo Tracker (abuse.ch) | `https://feodotracker.abuse.ch/` → **200** · `/browse/` → **200** · `/statistics/` → **200** | non |
| 5 | VirusTotal Graph | `https://www.virustotal.com/graph/` → **200** · docs `https://docs.virustotal.com/docs/graph-overview` → **200** | oui (login) |
| 6 | OpenCTI (docs graphes & dashboards) | `https://docs.opencti.io/latest/usage/graphs/` → **200** · `/usage/dashboards/` → **200** | non |
| 7 | Grafana | `https://grafana.com/` → **200** · `https://grafana.com/docs/grafana/latest/` → **200** · `https://play.grafana.org/` → **200** | partiel (pages `/blog/`, dashboards → 403 Cloudflare) |
| 8 | Flightradar24 | `https://www.flightradar24.com/` → **200** · blog labels `https://www.flightradar24.com/blog/inside-flightradar24/new-flightradar24-com-label-options/` → **200** | non |
| 9 | Lightning Maps | `https://www.lightningmaps.org/` → **200** · docs marqueurs `https://www.lightningmaps.org/doc/config_colors_markers` → **200** | non |

9 références, 7 accessibles sans compte, 21 URL en 200 sur 25 testées.

---

## 2. Analyse par référence

### 2.1 Shodan Maps
- **Marche** : le zoom/pan pilote la requête (bbox → filtre geo automatique) ; les filtres du site principal restent disponibles ; 1 000 résultats max affichés d'un coup ; menu « engrenage » pour le style de fond.
- **Échoue** : plafond de 1 000 résultats sans pagination ni clustering ; pas de timeline ; pas de densité (pas de heatmap) ; login obligatoire pour la carte elle-même.
- **À récupérer** : liaison carte ↔ requête (la fenêtre visible est un filtre) ; un plafond d'affichage assumé (« 1 000 plus proches ») plutôt qu'un silence.

### 2.2 GreyNoise Visualizer 2.0
- **Marche** : sidebar gauche persistante groupant Intelligence / Observation / Automation ; breadcrumbs ; recherche globale `⌘K` ; **requête GNQL rendue en badges interactifs** (clic = retirer le terme, connecteur AND/OR basculable) ; facettes ; deux vues List / Compare ; dashboards à panneaux (Key Numbers, Top Values, Activity Map, Activity Trend) ; **actions contextuelles** (Create Alert, Blocklist, Export) dans la page qui porte l'observation ; contrôles d'en-tête (Scope, Redact, Share).
- **Échoue** : recherche limitée à un jeu de données à la fois ; sidebar dense ; GNQL reste une syntaxe à apprendre ; exports/blocklists derrière l'abonnement.
- **À récupérer** : badges de requête modifiables (chaque filtre est un jeton retirable) ; actions d'automatisation à côté du constat ; compteurs « key numbers » en haut.

### 2.3 Feodo Tracker
- **Marche** : KPI d'abord (total C2, top pays, top réseau) ; **tableau dense triable** (Firstseen UTC, Host, Malware, Status Online/Offline, ASN, Country) ; filtres par famille ; page stats avec série 30 jours + top pays + top ASN ; indicateur Online/Offline lisible.
- **Échoue** : pas de carte interactive ni de timeline scrubber ; datasets vidés par les takedowns sans état vide soigné ; mise en page datée ; couleur uniquement pour le statut.
- **À récupérer** : hiérarchie « 3 KPI → série temporelle → tableaux de classement » ; statuts binaires texte + couleur.

### 2.4 VirusTotal Graph
- **Marche** : nœuds typés avec **icônes distinctives** (fichier = rectangle, domaine = favicon, URL = icône, IP = drapeau) ; code couleur de détection (rouge si ≥1 détection, noir sinon) ; double-clic pour étendre ; épinglage/centrage ; « Find commonalities » ; panneau latéral de détails.
- **Échoue** : chaque nœud exige un double-clic pour expansion (friction) ; pas de légende ; graphe vite illisible (pas de clustering) ; pas de filtre par type visible ; pas de timeline.
- **À récupérer** : icône + forme par type d'entité (la couleur n'est jamais le seul canal) ; code couleur binaire « avéré / non avéré ».

### 2.5 OpenCTI (graphes)
- **Marche** : graphe identique en thèmes dark et light ; **toolbar dockée sous le graphe** (compteurs, vue, layout, sélection, création, filtres, export) ; **légende bas-gauche** avec compteurs par type et filtrage par clic ; focus (estompe le reste) ; hover cards ; badges de marquage / confiance / inférence ; layouts déterministes (force, hiérarchique, radial, en couches) ; raccourcis clavier ; **export haute résolution avec légende** ; états vides qui disent quoi faire ; version accessible en liste parallèle.
- **Échoue** : toolbar très riche (beaucoup d'actions) ; 3D sans menu contextuel ; complexité d'ensemble.
- **À récupérer** : légende = filtre + compteur ; focus estompe le reste ; toolbar en une barre dockée ; export avec légende ; états vides orientés action ; accessibilité clavier.

### 2.6 Grafana (dashboards sécurité)
- **Marche** : grille de panneaux redimensionnables ; **sélecteur de période global** ; variables de template (filtres) ; panneau geomap ; alerting ; répétition de panneaux ; bibliothèque de dashboards.
- **Échoue** : pas de design system fort (l'apparence dépend du dashboard) ; geomap perfectible ; pas de 3D ; pas de modèle mental CTI natif.
- **À récupérer** : grille redimensionnable ; période globale + variables ; géomap.

### 2.7 Flightradar24
- **Marche** : **labels progressifs selon le zoom** (plein nom + codes IATA/ICAO à fort zoom, codes à mi-zoom, simple pin à faible zoom) ; options de label (texte / logos / drapeaux) avec opacité de fond réglable ; rendu WebGL vectoriel ; rafraîchissement 2–3 s ; panneau d'info coulissant.
- **Échoue** : surcharge d'information (critiqué) ; menus multiples ; lisibilité difficile pour un nouvel utilisateur ; pas de vraie timeline.
- **À récupérer** : **révélation progressive de l'information par zoom** ; labels à fond semi-opaque ; icône taille réglable ; panneau coulissant.

### 2.8 Lightning Maps
- **Marche** : carte centrée ; **cercles d'expansion** modélisant le tonnerre ; légende de couleur par âge ; curseur temporel 24 h ; mode densité ; marqueurs configurables (forme, taille, couleur, contour).
- **Échoue** : daté ; pas de clustering ; config côté serveur (images) ; légende peu visible ; performances dégradées à haut volume.
- **À récupérer** : curseur temporel ; encodage par âge (récent ↔ ancien) ; mode densité.

---

## 3. Synthèse — principes retenus

1. **Hiérarchie KPI → timeline → tableaux/carte** (Feodo, Grafana, GreyNoise).
2. **Filtres en jetons retirables** (GreyNoise), avec compteur par valeur.
3. **Carte = filtre** : la fenêtre visible pilote la requête (Shodan) ; zoom = révélation progressive (Flightradar).
4. **Légende = filtre + compteur**, dockée bas-gauche, réductible (OpenCTI).
5. **Focus/estomption** pour lire une sélection (OpenCTI).
6. **Clustering** obligatoire dès que > 1 000 points (Shodan plafonne, Lightning Maps densifie).
7. **Timeline scrubber** avec lecture (Lightning Maps) pour les `observed_at` (4 100 / 8 651 events sont NULL : l'axe doit gérer le NULL).
8. **Couleur jamais seule** : famille = couleur + icône + libellé (VirusTotal, OpenCTI).
9. **États vides/loading/error explicites** avec prochaine action (OpenCTI).
10. **Tabular-nums** partout où il y a des chiffres (compteurs, IP, timestamps).

---

## 4. Design system radar-cyber

### 4.1 Palette — rôles

Fond très neutre bleuté-noir, surfaces en camaïeu, accent unique réservé à l'action/sélection.

| Rôle | Token | Hex | Usage |
|------|-------|-----|-------|
| Fond page | `--bg` | `#0a0e14` | arrière-plan général |
| Surface | `--surface` | `#10151d` | cartes, panneaux, tableaux |
| Surface 2 | `--surface-2` | `#161c26` | inputs, hover, lignes alternées |
| Surface 3 | `--surface-3` | `#1c2430` | popups, menus, popovers |
| Bordure | `--border` | `#1f2733` | séparations 1 px |
| Bordure forte | `--border-strong` | `#2b3542` | emphase, inputs actifs |
| Texte | `--text` | `#e6ebf2` | corps |
| Texte atténué | `--muted` | `#9aa7b8` | libellés, méta |
| Texte fantôme | `--faint` | `#6b7787` | timestamps, hints |
| Accent | `--accent` | `#4da3ff` | action, focus, sélection |
| Accent faible | `--accent-dim` | `#2b5f99` | bordures d'accent |
| Succès | `--success` | `#3fb950` | statut OK, en ligne |
| Avertissement | `--warning` | `#d29922` | à confirmer, intermédiaire |
| Erreur | `--error` | `#f85149` | erreur, critique |
| Info | `--info` | `#56b4e9` | information neutre |

Contrastes sur `--bg` (WCAG, mesurés) : `--text` 16.14 · `--muted` 7.91 · `--faint` 4.25 · `--accent` 7.37 · `--success` 7.61 · `--warning` 7.66 · `--error` 5.77. `--faint` reste ≥ 3:1 en graphique, à réserver aux libellés ≥ 12 px.

### 4.2 Palette — familles (9)

Base **Okabe-Ito** (publique, conçue daltonien-safe), retouchée pour le fond sombre. Chaque famille a un fond teinté (12 % sur `--surface`) et une bordure (45 %). Le fond teinté sert aux chips et aux pastilles de carte.

| Famille | Hex | Teinte | Bordure | Icône | Contraste texte/fond teinté |
|---------|-----|--------|---------|-------|----------------------------|
| `ransomware` | `#e06a1a` | `#291f1d` | `#6e3b1c` | 🔒 | 4.77 |
| `vuln` | `#e69f00` | `#2a261a` | `#705310` | 🐞 | 6.74 |
| `phishing` | `#f0e442` | `#2b2e21` | `#75722e` | 🎣 | 10.50 |
| `malware` | `#cc79a7` | `#27212e` | `#65425b` | ☣️ | 5.12 |
| `cert` | `#56b4e9` | `#182835` | `#305d79` | 🛡️ | 6.52 |
| `cert_fr` | `#4c8dff` | `#172338` | `#2b4b83` | 🇫🇷 | 4.90 |
| `typosquat` | `#2ee6c8` | `#142e32` | `#1e736a` | 🔤 | 9.05 |
| `reputation` | `#999999` | `#20252c` | `#4e5055` | 🌐 | 5.41 |
| `cti` | `#009e73` | `#0e2527` | `#095344` | 📡 | 4.65 |

**Écart mesuré entre familles** (distance CIE Lab, simulation Machado 2009) : normal min 27.5 · deuteranopie min 7.1 · protanopie min 18.1 · tritanopie min 13.3. L'existant (8 familles du dépôt) tombe à **0.8** en deuteranopie (`malware` ≈ `reputation`) : la refonte corrige ce point. `cert_fr` manquait dans les tokens actuels.

### 4.3 Palette — sévérité (1–5)

Rampe Okabe-Ito, 5 paliers, toujours accompagnée d'un libellé (`S1`…`S5`) et optionnellement de pips.

| Niveau | Hex | Libellé | Rôle |
|--------|-----|---------|------|
| 1 | `#56b4e9` | S1 · Info | pas d'action immédiate |
| 2 | `#009e73` | S2 · Faible | à surveiller |
| 3 | `#f0e442` | S3 · Modérée | à qualifier |
| 4 | `#e69f00` | S4 · Haute | à traiter |
| 5 | `#e06a1a` | S5 · Critique | à traiter d'urgence |

Écarts simulés : min 16.1 (tritanopie), 17.0 (deuteranopie), 24.7 (protanopie).

### 4.4 Palette — assertion & confiance

**Assertion (5 types)** : codée par **style de bordure + icône**, pas par une nouvelle couleur (évite la surcharge) :

| Type | Icône | Bordure |
|------|-------|---------|
| `confirmed_incident` | ✔ | 1.5 px pleine, `--success` |
| `third_party_claim` | ❝ | 1.5 px pleine, `--warning` |
| `technical_indicator` | ● | 1.5 px pleine, `--accent` |
| `suggested_relation` | ⇄ | 1.5 px pointillée, `--muted` |
| `ambient_signal` | ○ | 1 px pointillée, `--faint` |

**Confiance** (`^[A-F][1-6]$`) : **pas de couleur** (réservée famille/sévérité/statut). Pastille mono `A1`…`F6`, bordure `--border-strong`, fond `--surface-2`. La lettre code la fiabilité de la source, le chiffre la solidité du renseignement : à documenter au survol.

### 4.5 Typographie

UI dense, base 13 px. Empilement système uniquement (aucune nouvelle dépendance).

```css
:root {
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;

  --text-micro: 11px;   /* badges, légende, hints        */
  --text-xs:    12px;   /* tableaux, cellules, IOC       */
  --text-sm:    13px;   /* base UI                       */
  --text-md:    14px;   /* titres de section, boutons    */
  --text-lg:    20px;   /* titre de page                 */
  --text-xl:    28px;   /* KPI                           */

  --line-tight: 1.25;
  --line-snug:  1.35;
  --line-normal: 1.5;

  --font-weight-regular: 400;
  --font-weight-medium:  500;
  --font-weight-semibold: 600;
}
```

Règles :
- corps `--text-sm` ; tableaux `--text-xs` ; libellés `--text-micro` ; jamais < 11 px.
- **tabular-nums** obligatoire sur compteurs, KPI, IP, ASN, timestamps, coordonnées.
- `--font-mono` pour IP, hash, domaines, CVE, `source_url`, `confidence`.
- `letter-spacing: 0.01em` sur les libellés 11 px ; `text-transform: lowercase` pour les labels (convention du dépôt).

```css
body { font: var(--text-sm)/var(--line-normal) var(--font-sans); color: var(--text); }
.num, .mono, .kpi, time { font-variant-numeric: tabular-nums; }
.mono { font-family: var(--font-mono); font-size: var(--text-xs); }
```

### 4.6 Spacing, rayons, ombres

Échelle 4 px strictement.

```css
:root {
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px;

  --radius-1: 2px;   /* pastilles, swatches */
  --radius-2: 4px;   /* inputs, chips, boutons */
  --radius-3: 6px;   /* cartes, panneaux, badges */
  --radius-4: 10px;  /* modales, popups */
  --radius-full: 999px;

  --shadow-1: 0 1px 2px rgba(0,0,0,.40);
  --shadow-2: 0 4px 12px rgba(0,0,0,.50);
  --shadow-popup: 0 8px 24px rgba(0,0,0,.60);

  --ring-focus: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent);
}
```

En thème sombre, l'elevation vient des **couches de surface + bordure 1 px**, pas des ombres. Les ombres sont réservées aux popups, menus et modales.

### 4.7 Patterns carte

**Légende** (bas-gauche, `position: absolute`, au-dessus du canvas) :
- carte `--surface`, bordure `--border`, `--radius-3`, `--shadow-2` ;
- en-tête : titre « Légende » + bouton réduire (`G`) ;
- lignes : swatch 8×8 `--radius-1` + icône 12 px + libellé `--text-xs` + compteur `--text-micro` tabular-nums aligné à droite ;
- clic sur une ligne = bascule du filtre famille (état actif : swatch pleine + libellé `--text` ; inactif : swatch à 35 % + libellé `--muted`) ;
- rangée dernière = rampe de sévérité S1→S5 ;
- compteur de filtres actifs visible quand elle est réduite.

**Timeline scrubber** (bas-centre, au-dessus du canvas) :
- plage `observed_at` ; bornes min/max ; curseur double (range) + bouton lecture/pause ;
- graduations par jour (hebdo si > 60 j) ; libellé de la fenêtre « 2026-11-01 → 2026-11-10 · 1 284 events » ;
- **gestion du NULL** : les 4 100 events sans `observed_at` sont hors curseur, comptés dans un compteur séparé « non datés » ; à ne pas jeter silencieusement.

**Clustering** (MapLibre `supercluster`) :
- `cluster: true`, `clusterRadius: 40`, `clusterMaxZoom: 14` ;
- pastille de cluster : fond `--surface-2`, bordure `--border-strong`, compteur `--text-xs` tabular-nums, `--radius-full` ;
- **couleur de l'anneau du cluster = famille dominante** (anneau 2 px) pour garder le codage famille même agrégé ;
- dé-cluster au zoom ; au-delà de 1 000 points visibles, basculer sur une couche de densité (heatmap) à faible zoom.

**Popups** :
- un seul popup à la fois ; `--surface-3`, bordure `--border-strong`, `--radius-4`, `--shadow-popup`, largeur max 320 px ;
- contenu : chip famille (couleur + icône + libellé) + badge sévérité + titre `--text-sm` + `--muted` source/timestamp + org ciblée ;
- action « Ouvrir dans l'inspecteur » ; fermeture `Échap` ou clic dehors.

**Marqueurs** :
- point par défaut : pastille 10 px, fond famille, bordure 1.5 px `--bg`, `--radius-full` ;
- sévérité ≥ 4 : anneau pulsé 2 px (désactivé si `prefers-reduced-motion`) ;
- sélection : anneau `--accent` 2 px + halo ;
- au zoom fort, le libellé (title tronqué à 24 car.) apparaît à droite du point, fond `rgba(10,14,20,.72)`, `--text-micro`.

```css
.map-legend { position: absolute; left: var(--space-4); bottom: var(--space-4); z-index: 10;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-3);
  box-shadow: var(--shadow-2); min-width: 220px; max-height: 45vh; overflow: auto; }
.map-legend button { font: inherit; color: inherit; }
.map-timeline { position: absolute; left: 50%; transform: translateX(-50%); bottom: var(--space-4); z-index: 10;
  display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3);
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-3); box-shadow: var(--shadow-2); }
.map-timeline input[type="range"] { accent-color: var(--accent); }
.map-popup { max-width: 320px; background: var(--surface-3); border: 1px solid var(--border-strong);
  border-radius: var(--radius-4); box-shadow: var(--shadow-popup); }
```

### 4.8 Composants

**Badges sévérité**
```css
.badge-sev { display: inline-flex; align-items: center; gap: var(--space-1);
  padding: 1px var(--space-2); border-radius: var(--radius-1);
  font: var(--text-micro)/var(--line-tight) var(--font-sans);
  font-variant-numeric: tabular-nums; border: 1px solid transparent; }
.badge-sev[data-sev="1"] { color:#56b4e9; background:#10202c; border-color:#1d3d52; }
.badge-sev[data-sev="2"] { color:#009e73; background:#0e2527; border-color:#095344; }
.badge-sev[data-sev="3"] { color:#f0e442; background:#2b2e21; border-color:#75722e; }
.badge-sev[data-sev="4"] { color:#e69f00; background:#2a261a; border-color:#705310; }
.badge-sev[data-sev="5"] { color:#e06a1a; background:#291f1d; border-color:#6e3b1c; }
```

**Chips famille (filtres)**
```css
.chip { display: inline-flex; align-items: center; gap: var(--space-1);
  padding: 2px var(--space-2); border-radius: var(--radius-full);
  font: var(--text-micro)/var(--line-tight) var(--font-sans);
  border: 1px solid var(--border-strong); background: var(--surface-2); color: var(--muted);
  cursor: pointer; }
.chip .dot { width: 8px; height: 8px; border-radius: var(--radius-full); background: var(--fam); }
.chip .count { color: var(--faint); font-variant-numeric: tabular-nums; }
.chip[data-active="true"] { color: var(--fam); background: var(--fam-dim); border-color: var(--fam-border); }
```

Chaque chip porte les trois variables de sa famille, par exemple :
`<span class="chip" data-family="vuln" style="--fam:var(--fam-vuln);--fam-dim:var(--fam-vuln-dim);--fam-border:var(--fam-vuln-border)">…</span>`.
Alternative : un sélecteur `[data-family="vuln"] { --fam: var(--fam-vuln); … }` par famille.

**Tableaux denses**
```css
table.data { width: 100%; border-collapse: collapse; font-size: var(--text-xs); }
table.data th { position: sticky; top: 0; background: var(--surface); color: var(--muted);
  font-weight: var(--font-weight-medium); font-size: var(--text-micro); text-align: left;
  padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-strong); }
table.data td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); line-height: var(--line-snug); }
table.data tbody tr:hover td { background: var(--surface-2); }
table.data td.num, table.data td time { text-align: right; font-variant-numeric: tabular-nums; }
table.data .mono { font-family: var(--font-mono); font-size: var(--text-micro); color: var(--muted); }
```
Hauteur de ligne cible 32 px ; en-tête collant ; tri par clic avec flèche ; colonnes IOC en mono.

**États**
```css
.skeleton { background: linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 37%, var(--surface) 63%);
  background-size: 400% 100%; animation: shimmer 1.6s ease infinite; border-radius: var(--radius-2); }
@keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }

.state { display: grid; place-items: center; gap: var(--space-3); padding: var(--space-12) var(--space-6);
  color: var(--muted); text-align: center; }
.state .icon { font-size: 28px; opacity: .6; }
.state h2 { margin: 0; font-size: var(--text-md); color: var(--text); font-weight: var(--font-weight-semibold); }
.state p { margin: 0; font-size: var(--text-sm); color: var(--muted); }
.state .action { margin-top: var(--space-2); }
.state[data-kind="error"] h2 { color: var(--error); }
```

**KPI**
```css
.kpi { display: flex; flex-direction: column; gap: 2px; }
.kpi .value { font-size: var(--text-xl); font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums; line-height: var(--line-tight); }
.kpi .label { font-size: var(--text-micro); color: var(--muted); text-transform: lowercase; }
.kpi .delta { font-size: var(--text-micro); font-variant-numeric: tabular-nums; }
.kpi .delta[data-dir="up"]   { color: var(--success); }
.kpi .delta[data-dir="down"] { color: var(--error); }
```

---

## 5. Bloc CSS complet — copier tel quel

```css
/* ============================================================
   radar-cyber — Design system « Observatoire » (thème sombre)
   Source : docs/research/ui-ux.md — benchmark CTI (2026-11-10)
   ============================================================ */

:root {
  /* — Rôles — */
  --bg: #0a0e14;
  --surface: #10151d;
  --surface-2: #161c26;
  --surface-3: #1c2430;
  --border: #1f2733;
  --border-strong: #2b3542;
  --text: #e6ebf2;
  --muted: #9aa7b8;
  --faint: #6b7787;
  --accent: #4da3ff;
  --accent-dim: #2b5f99;
  --success: #3fb950;
  --warning: #d29922;
  --error: #f85149;
  --info: #56b4e9;

  /* — Familles (base Okabe-Ito, adaptée fond sombre) — */
  --fam-ransomware: #e06a1a;  --fam-ransomware-dim: #291f1d;  --fam-ransomware-border: #6e3b1c;
  --fam-vuln:       #e69f00;  --fam-vuln-dim:       #2a261a;  --fam-vuln-border:       #705310;
  --fam-phishing:   #f0e442;  --fam-phishing-dim:   #2b2e21;  --fam-phishing-border:   #75722e;
  --fam-malware:    #cc79a7;  --fam-malware-dim:    #27212e;  --fam-malware-border:    #65425b;
  --fam-cert:       #56b4e9;  --fam-cert-dim:       #182835;  --fam-cert-border:       #305d79;
  --fam-cert-fr:    #4c8dff;  --fam-cert-fr-dim:    #172338;  --fam-cert-fr-border:    #2b4b83;
  --fam-typosquat:  #2ee6c8;  --fam-typosquat-dim:  #142e32;  --fam-typosquat-border:  #1e736a;
  --fam-reputation: #999999;  --fam-reputation-dim: #20252c;  --fam-reputation-border: #4e5055;
  --fam-cti:        #009e73;  --fam-cti-dim:        #0e2527;  --fam-cti-border:        #095344;

  /* — Sévérité 1–5 — */
  --sev-1: #56b4e9; --sev-1-dim: #10202c; --sev-1-border: #1d3d52;
  --sev-2: #009e73; --sev-2-dim: #0e2527; --sev-2-border: #095344;
  --sev-3: #f0e442; --sev-3-dim: #2b2e21; --sev-3-border: #75722e;
  --sev-4: #e69f00; --sev-4-dim: #2a261a; --sev-4-border: #705310;
  --sev-5: #e06a1a; --sev-5-dim: #291f1d; --sev-5-border: #6e3b1c;

  /* — Typographie — */
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --text-micro: 11px;
  --text-xs: 12px;
  --text-sm: 13px;
  --text-md: 14px;
  --text-lg: 20px;
  --text-xl: 28px;
  --line-tight: 1.25;
  --line-snug: 1.35;
  --line-normal: 1.5;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* — Spacing / rayons / ombres — */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px;
  --radius-1: 2px; --radius-2: 4px; --radius-3: 6px; --radius-4: 10px; --radius-full: 999px;
  --shadow-1: 0 1px 2px rgba(0,0,0,.40);
  --shadow-2: 0 4px 12px rgba(0,0,0,.50);
  --shadow-popup: 0 8px 24px rgba(0,0,0,.60);
  --ring-focus: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent);
}

body {
  font: var(--text-sm)/var(--line-normal) var(--font-sans);
  color: var(--text);
  background: var(--bg);
  font-variant-numeric: tabular-nums;
}
.mono, .num, time { font-variant-numeric: tabular-nums; }
.mono { font-family: var(--font-mono); font-size: var(--text-xs); }
```

---

## 6. Règles d'usage et anti-patterns

1. **Une seule couleur d'action** : l'accent reste réservé à l'interaction et à la sélection. Ne pas l'utiliser pour encoder une famille ou une sévérité.
2. **Jamais la couleur seule** : toute famille est portée par un swatch **+ une icône + un libellé**. Sur la carte, au zoom fort, le libellé apparaît ; au zoom faible, l'anneau de cluster porte la famille dominante.
3. **Ne pas créer de 10e couleur** : l'existant a 8 familles sans `cert_fr` et avec un `malware ≈ reputation` en deutan (écart 0.8). La palette §4.2 corrige ; tout nouveau type passe par un style de bordure/icône, pas une nouvelle teinte.
4. **Éviter le rouge/vert binaire** pour le statut : lui préférer texte + forme (« En ligne » / « Hors ligne », pilule pleine / creuse) en plus de la couleur.
5. **Hiérarchie de densité** : page = KPI + timeline + vue principale ; pas plus de 3 niveaux de titre ; le surplus va dans l'inspecteur, pas dans la vue par défaut.
6. **Period range global** (Grafana) : une seule période pilote toutes les vues ; l'afficher en permanence dans la barre supérieure.
7. **Révélation progressive** : zoom faible = agrégats, zoom fort = détails (Flightradar). Le clustering et le label de zoom sont des obligations, pas des options.
8. **Temps** : l'axe temporel gère les `observed_at` NULL (47 % des events) via un compteur « non datés », pas un rejet silencieux.
9. **Accessibilité** : focus visible `--ring-focus` ; `prefers-reduced-motion` coupe shimmer/pulse ; cibles tactiles ≥ 24 px en densité ; contraste texte ≥ 4.5 (graphiques ≥ 3).
10. **Pas de shadow en thème sombre** pour l'élévation courante : surface + bordure 1 px. Ombre réservée aux popups/menus.
