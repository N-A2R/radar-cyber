# Validation A → B → C — résultats mesurés et décisions

Date : 12 novembre 2026. Branche `arena/6c1c8e6f-radar-cyber`.
Reproduction : `bench/README.md`. Mesures brutes : `bench/results/`.

Contrainte de méthode, à garder en tête en lisant les chiffres : le réseau du
sandbox n'autorise que `github.com`, `codeload.github.com`, `api.github.com`,
`registry.npmjs.org` et `pypi.org`. Ni nos 594 sources, ni
`recherche-entreprises.api.gouv.fr` n'y sont joignables. Les benches A et B
portent donc sur des jeux locaux et un corpus externe annoté — **pas** sur le
rendement de la chaîne de collecte en production.

---

## A — Référentiel et rattachement

### A.1 Le cœur déterministe sort de la base

`apps/api/src/match/orgs.ts` faisait 384 lignes mêlant SQL, cache et règles.
Les règles sont désormais dans `apps/api/src/match/core.ts`, sans dépendance :
`orgs.ts` est retombé à ~120 lignes (chargement PostgreSQL, cache, arbitrage).
Comportement inchangé, vérifié :

- **21 tests unitaires** dédiés (`apps/api/test/match-core.test.ts`), sans base ;
- **suite API complète : 91/91** (70 existants + 21 nouveaux), base éphémère ;
- typechecks API et web : exit 0.

Un test a d'abord échoué sur `deriveAliases` : il supposait à tort qu'aucune
variante ne conserve la forme juridique. La fonction produit des *candidats*
(« Lectra SA » **et** « Lectra ») ; c'est `selectUnambiguousAliases` qui tranche.
Le test a été corrigé, pas le code.

### A.2 Bench de rattachement (75 cas annotés, 40 organisations)

| Moteur | Précision | Rappel | F1 | FP hors-sujet | Abstentions | ms/cas |
| --- | --- | --- | --- | --- | --- | --- |
| Cœur seul (avant) | 0,941 | 0,906 | 0,923 | 3 | 5 | 0,08 |
| **Hybride livré (`radar-hybrid`)** | **0,946** | **1,000** | **0,973** | 3 | 0 | 0,61 |
| Prototype Python du même hybride | 0,930 | 1,000 | 0,964 | 4 | 0 | 0,25 |
| RapidFuzz fenêtre 90 seul | 0,836 | 0,962 | 0,895 | 10 | 2 | 1,10 |
| Sous-chaîne naïve | 0,833 | 0,943 | 0,885 | 10 | 3 | 0,03 |
| RapidFuzz sac de jetons 90 | 0,818 | 0,849 | 0,833 | 10 | 8 | 0,16 |

La ligne « hybride livré » n'est pas une simulation : `bench/orgs/run-hybrid.mts`
appelle `analyzeAliasIndex` puis `fuzzyMatchAlias`, le code réellement branché
dans `orgs.ts`. Le prototype Python faisait mieux en temps mais moins bien en
précision : il lui manquait le garde-fou « alias court sans contexte », qui
lui faisait rattacher « Coupure de courant à Lectraa ». Trois cas ont été
ajoutés au jeu pour couvrir ce trou (75 au lieu de 72).

Détail par catégorie et liste des écarts : `bench-a-orgs.md`.

**Ce que ça dit.**

1. **Le cœur actuel tient son rôle** : +9 points de précision sur le flou seul,
   et 6 fois moins de rattachements hors-sujet. Les garde-fous (jetons contigus,
   contexte institutionnel pour les alias courts, refus des domaines) ne sont
   pas de la sophistication gratuite : sur les 6 cas « alias court sans
   contexte », le cœur en réussit 5, tous les moteurs flous 0.
2. **Son point faible est unique et net : les fautes de frappe** (2/6, contre
   6/6 pour RapidFuzz). « CHU de Bordeau », « université de Poitier »,
   « Bordeaux Metropôle » lui échappent.
3. **L'hybride règle ce point faible sans payer le prix du flou** : le cœur
   décide ; RapidFuzz n'est interrogé que lorsque le cœur s'abstient avec
   `no-alias` — 13 des 72 cas. Rappel 1,000, précision 0,946, F1 0,972, coût
   0,25 ms/cas. Les ambiguïtés et les refus `short-only` ne passent **jamais**
   au filet : c'est ce qui préserve la précision.
4. **Les homonymes hors région résistent à tous les moteurs** (0/2 partout) :
   « ville de Bordeaux (Ohio) », « université de Bordeaux au Sénégal ». Ce n'est
   pas un problème de matcher mais de **désambiguïsation géographique** : il
   faut confrontner le département/la commune cités au référentiel, pas ajuster
   un seuil de similarité.

**Décision, implémentée.** Le filet est en place : `apps/api/src/match/fuzzy.ts`,
appelé par `orgs.ts` uniquement quand le cœur rend `no-alias`.

- Métrique : `rapidfuzz-js` (MIT, port JS de RapidFuzz, zéro dépendance).
  **Parité vérifiée avec le RapidFuzz Python du bench sur 1 500 paires : zéro
  divergence** — les chiffres mesurés sont donc transposables au code livré.
- Même garde-fou d'alias court que le cœur ; égalité de score → null ;
  confiance plafonnée à 0,6 (0,4 pour un mono-jeton), donc **sous** le seuil
  `--min-confidence=0.7` : ces rattachements partent en revue, ils ne
  s'écrivent pas tout seuls. Nouveau motif de diagnostic `fuzzy`, visible dans
  l'histogramme de `scripts/match-orgs.mts`.
- `matchOrg()` reste **strict** (filet désactivé) : `scripts/reconcile-orgs.mts`
  s'en sert pour vérifier que des rattachements existants sont justifiés par le
  texte, et un nom approchant n'y est pas une preuve.
- Élagage par borne supérieure du ratio (`200·min/max`) pour ne pas calculer une
  distance sur chaque alias du référentiel réel.
- **9 tests unitaires** (`test/match-fuzzy.test.ts`) verrouillent seuil,
  garde-fous, égalité et plafond. Suite API : **100/100**.

**Réserve d'annotation, honnête.** Le cas c66 (« Orange Nouvelle-Aquitaine
sponsorise un salon régional ») est étiqueté « ne pas rattacher » alors que
l'organisation est bien citée : c'est un cas de **pertinence**, pas de
rattachement. Aucun moteur ne distingue un sponsoring d'un incident, et tous
échouent également — la comparaison n'est pas biaisée, mais cette étiquette
devrait être requalifiée en amont, par le filtre de pertinence.

### A.3 Déduplication d'organisations : Splink mesuré, et perdant

Jeu : 60 enregistrements pour 27 organisations réelles, 45 paires de doublons
attendues. pièges inclus (CHU vs université d'une même ville, mairie vs
métropole, cliniques homonymes dans deux départements).

| Approche | Précision | Rappel | F1 |
| --- | --- | --- | --- |
| **Table de synonymes institutionnels** | **1,000** | **0,711** | **0,831** |
| RapidFuzz 90 + même commune | 1,000 | 0,422 | 0,594 |
| Égalité de nom normalisé | 0,950 | 0,422 | 0,585 |
| Alias dérivés par le repo (`deriveAliases`) | 1,000 | 0,356 | 0,525 |
| Splink 5, seuil 0,5 | 0,296 | 0,178 | 0,222 |
| Splink 5, seuil 0,8 et 0,95 | 0,000 | 0,000 | 0,000 |

**Le résultat important n'est pas « Splink est mauvais ».** Splink avertit
lui-même que son modèle n'est pas entraîné : sur 60 lignes, les niveaux de
comparaison ne sont jamais observés, et l'estimation automatique du prior
dégénère à 1,0 (plantage `math domain error`, prior fixé à 0,025 pour pouvoir
mesurer). Ce bench dit : **Splink ne se juge pas sur 60 lignes**, il lui faut du
volume — le vrai référentiel en compte 10 261.

**Le résultat utile est ailleurs.** Toutes les méthodes de chaînes plafonnent
autour de 0,42 de rappel, parce que la moitié des doublons ne sont pas proches
en distance d'édition : « CHU de Bordeaux » vs « Centre Hospitalier
Universitaire de Bordeaux », « Mairie de Bordeaux » vs « Commune de Bordeaux ».
Une **table de dix synonymes institutionnels** écrite à la main
(CHU, CH, ARS, CCI, CU, INP, univ, mairie/ville/commune) fait bondir le F1 de
0,59 à 0,83, sans aucun faux positif. Le chaînon manquant n'est pas un
algorithme, c'est **de la connaissance métier versionnée**.

À noter : `deriveAliases` produit « CHUB » pour le nom développé, pas « CHU » —
la dérivation automatique de sigles ne rejoint pas l'usage réel.

**Erreur d'annotation trouvée par le bench.** J'avais annoté « Bordeaux INP »
et « Institut polytechnique Bordeaux » comme deux organisations : c'est la
même. Le corrigé a été rectifié, ce qui fait passer la précision de la table de
synonymes de 0,969 à 1,000. Un bench sert aussi à corriger celui qui l'écrit.

**API Recherche d'entreprises** : toujours non joignable ici. Le branchement
(12 départements, NAF 62.x, 7 appels/s) reste à valider en environnement ouvert.

---

## B — Qualité et multiplicité des sources

### B.1 Extraction d'articles, 181 pages réelles annotées

Corpus neutre `scrapinghub/article-extraction-benchmark` (MIT), métrique du
corpus réutilisée telle quelle.

| Extracteur | F1 | Précision | Rappel | Pages vides | ms/page |
| --- | --- | --- | --- | --- | --- |
| **trafilatura 2.3.1** | **0,964** ± 0,007 | 0,958 | **0,971** | **0/181** | **25** |
| newspaper4k 0.9.6.1 | 0,925 ± 0,011 | **0,962** | 0,890 | 9/181 | 1 267 |

**Ce que ça dit.** Trafilatura gagne sur les trois axes qui comptent pour une
chaîne de collecte : meilleur F1, **aucune page vide** contre 9, et **50 fois
plus rapide**. Newspaper4k est légèrement plus précis quand il extrait — il
est plus conservateur, ce qui explique aussi ses 9 pages vides et son rappel
inférieur. Pour un poste de veille, un article manqué coûte plus cher qu'un
paragraphe de trop.

**Décision.** Trafilatura comme extracteur des pages sans RSS. Licence
Apache-2.0 depuis la v1.8, donc compatible. Newspaper4k n'apporte rien qui
justifie son coût ; il reste écarté.

### B.2 Audit du catalogue versionné

Second chantier, mené en parallèle : `bench/sources/audit-catalog.py`, sans
réseau. Trois défauts concrets, tous corrigeables sans mesure supplémentaire.

1. **8 sources utilisent une famille hors contrat** (`leaks` ×7, `paste` ×1)
   alors que `packages/shared` n'en déclare que 10. **Correction après
   vérification** : `EventSchema` n'est appelé nulle part — aucun `.parse()`
   dans l'API ni les scripts. Ces événements ne sont donc pas rejetés ; la base
   contient bien 18 événements `leaks`. Le défaut est inverse : le contrat est
   décoratif, la dérive passe en silence, et le front n'a ni libellé ni couleur
   pour ces familles.
2. **3 URL en doublon** sous des identifiants différents : le CERT-FR
   (`cert_fr` et `cert-fr-feed`), Sud Ouest (`presse-sudouest` et
   `presse-sudouest-rss`), un même `.onion`. Le flux est collecté deux fois, ce
   qui gonfle le volume brut et le nombre de sources affiché.
3. **145 sources dans le dépôt, 594 annoncées en base.** L'écart vient
   d'imports de fichiers externes absents du repo (`/tmp/estorides-sources.json`,
   un CSV `threat-intelligence-feeds`). **Un déploiement neuf ne reproduit pas
   le catalogue.** C'est le même problème que le référentiel vide signalé à
   l'audit initial, mais pour les sources.

Détail : `docs/research/sources-audit.md`.

### B.3 Non mesuré

- **Le rendement bout-en-bout** `fetched → parsed → admitted → matched → useful`
  sur 20–30 de nos flux : impossible ici, réseau fermé. C'est la mesure qui
  manque le plus, et elle doit être faite en environnement ouvert avec
  `scripts/source-health.mts` et `scripts/diagnose-parsers.mts`.
- **changedetection.io** sur des pages sans flux : non benché. Rappel pour
  mémoire, il est Apache-2.0 et sait produire un RSS à partir d'une page.

---

## C — Prototype UX

Arbitrage rendu : **design system maison + TanStack Table**, pas Carbon ni
shadcn/ui. Motif : le prototype doit valider l'ergonomie, pas le langage
visuel ; TanStack étant headless, repeindre plus tard ne réécrit aucune
logique. Pas de Tailwind, aucune dépendance de design system.

### C.1 Jetons CSS unifiés

Le repo avait deux vocabulaires parallèles : `--color-*` (fil, sources) et
`--surface/--text/--line` (fiche org, carte, santé). Les `--color-*` sont
devenus des **alias** des jetons historiques, seule source de vérité.
Conséquence vérifiable : les quatre thèmes (observatoire, terminal, souverain,
clair) s'appliquent maintenant partout — avant, le fil et les sources restaient
sombres en thème clair. Les ombres de relief ont une couleur par thème, au lieu
d'un noir codé en dur.

### C.2 Annuaire (`DirectoryView`)

TanStack Table **v9** — API différente de la v8 : les features et les fabriques
de modèles de lignes se déclarent via `tableFeatures()`, `useTable` remplace
`useReactTable`. `@tanstack/table-core` a été ajouté en dépendance directe.

Tri par colonne, filtre global, facettes nature et département, filtre « avec
événements », pagination 25 lignes, compteurs tabulaires. Clavier : la table est
un seul arrêt de tabulation, flèches pour parcourir, Entrée ouvre la fiche,
Échap efface. États chargement / vide / erreur explicites.

### C.3 Recherche globale (⌘K)

`CommandPalette` : `GET /api/search`, debounce 180 ms, annulation de la requête
précédente, trois natures (orgs, événements, indicateurs), rôles
combobox/listbox, navigation clavier complète. Les indicateurs sont affichés
mais non cliquables : ils n'ont pas de fiche, un faux clic serait pire.

### C.4 Fiche organisation

`OrgSheet` réutilisé, avec un mode démonstration qui construit la fiche
localement (`mockOrgDetail`) : le prototype est consultable de bout en bout
sans API ni base. Jeu de démonstration porté de 8 à 38 organisations, pour que
l'annuaire soit un vrai test de densité et de pagination.

### C.5 Vérifications

- **18 contrôles de rendu** (`apps/web/test/render.tsx`, `pnpm -F @radar/web run
  test:render`) : rendu statique React, donc exécution réelle de TanStack v9 —
  25 lignes paginées, tri décroissant, facettes, 4 états, palette ouverte et
  fermée, fiche simulée. Tous passent.
- Typecheck web exit 0, build production OK (1,74 Mo JS, 503 Ko gzip).
- Serveur de démonstration : `0.0.0.0:5173`, hôte de prévisualisation autorisé.

**Non fait en C** : test avec un utilisateur, mesure du temps pour trouver une
organisation, virtualisation au-delà de quelques milliers de lignes. Le
prototype est prêt à être regardé, pas encore validé par l'usage.

---

## Ce qui reste à faire, par ordre de valeur

1. **Versionner une table de synonymes institutionnels** et l'utiliser à la
   réconciliation : F1 0,59 → 0,83 mesuré, dix lignes de connaissance métier.
2. **Corriger les 8 sources hors contrat et les 3 doublons d'URL** : gain
   immédiat, aucune mesure nécessaire.
3. **Rendre le catalogue reproductible** : les 449 sources hors dépôt doivent
   être versionnées ou leur import documenté, sinon un déploiement neuf est
   aveugle.
4. **Mesurer le rendement réel des sources** en environnement réseau ouvert —
   c'est la seule mesure qui dira lesquelles garder.
5. **Désambiguïsation géographique** des homonymes : aucun moteur ne la résout,
   et elle produit des faux rattachements visibles sur les fiches.
6. **Rejouer Splink sur le vrai référentiel** (10 261 orgs) : le bench sur 60
   lignes ne permet pas de le juger.
7. **Requalifier c66** et annoter un échantillon aléatoire du flux réel, pour
   estimer un rappel de production et non plus seulement des modes d'échec.
