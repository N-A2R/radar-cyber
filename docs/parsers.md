# Parsers génériques — détection automatique
`apps/api/src/collectors/generic.ts` : un `parser.itemsPath` vide ou stérile ne rend plus
la source muette.
## Priorité (`detectItems`)
0. **`itemsPath` déclaré et valide** — comportement historique intact, avant détection.
1. **JSON-LD** (`parsers/jsonld.ts`) : `NewsArticle`/`Article`/`BlogPosting` dans
   `<script type="application/ld+json">` ou document JSON-LD pur. Les `@graph` sont
   parcourus, les doublons de même URL dédupliqués ; un `Organization` ou un fil
   d'Ariane seul ne déclenche rien.
2. JSON **tableau racine** (objets uniquement).
3. JSON **premier tableau d'objets**, profondeur ≤ 4, chemin reporté (`data.items`).
4. **RSS 2.0 / Atom / RDF** : la racine XML choisit la stratégie `rss-2`, `atom` ou
   `rss-atom` ; les champs namespaceés sont ramenés aux champs du collecteur
   (`dc:date`, `content:encoded`, `<link href>` Atom, `guid`).
5. **JSON embarqué** (`parsers/embedded-json.ts`) : `<script type="application/json">`,
   `data-page` Inertia, `__NEXT_DATA__`. Les tableaux d'objets porteurs de titres
   sont lus même si la fin du JSON est tronquée (87 victimes sur Everest).
6. **CSV** : en-tête nommé (≥ 2 colonnes) + lignes cohérentes.
7. **Cartes de revendication** (`parsers/claims.ts`) : pages de sites de fuite.
   Deux structures observées — fenêtre modale (`h3` + `div.meta` « secteur · pays »)
   et carte de projet (`h3.card-title` + `.card-country` + `.card-description`
   en champs `Clé: valeur` séparés par `|`). Une carte n'est retenue que si elle
   porte un champ de revendication (secteur, statut, pays, résumé) : un menu de
   navigation ne suffit pas. Les titres entre crochets (`[ ABOUT US ]`) sont
   écartés, c'étaient des titres de section comptés comme victimes.
8. **Messages Telegram** (`parsers/telegram.ts`) : `div.tgme_widget_message_text`
   avec la date du message la plus proche en amont. Les libellés d'interface
   (« Media is too big », « VIEW IN TELEGRAM », « Join chat ») sont filtrés :
   les ingérer remplissait le fil de bruit.
9. **Contact Telegram** (`parsers/telegram.ts`) : page `Telegram: Contact @…`,
   sans message public. Une seule identité est extraite, pas des liens d'interface.
10. **Article HTML** (`parsers/article.ts`) : blocs `<article>` de premier niveau,
    hors commentaires et encarts. Titre, URL canonique, date et premier paragraphe
    substantiel ; un bloc sans résumé n'est pas compté.
11. **HTML** : liens `<a href>` significatifs (hors `#`, `javascript:`, libellés < 4 car.).
12. **Page d'accueil HTML** (`parsers/landing.ts`) : annonce explicite (`notice`,
    `top-band`, paragraphe substantiel). Les pages de challenge ou squelettes JS
    sans texte restent refusées : aucun item n'est inventé.
13. Sinon refus explicite : `[collect] <source> : format non reconnu — refus explicite`.
    Pour une page `.onion`, le corps illisible part en `quarantine_raw` : le jeter
    rendait 64 sources muettes invisibles.
Flux `indicator` en JSON/CSV/RSS : valeurs tirées de `value|indicator|ip|domain|host|url|
link|cidr|title|description`, puis filtre warninglists. Un `304` ne remet plus `last_items` à 0.
Diagnostic lecture seule : `apps/api/node_modules/.bin/tsx scripts/diagnose-parsers.mts`
(25 sources muettes, 1 req/s, timeout 10 s).
## Règle de décision indicator/narrative
`asIndicator = kind === "indicator" || (format !== "rss" && looksLikeBlocklist(url))`.
`looksLikeBlocklist` repose désormais sur le **contenu** de l'URL et non sur son
extension : domaine seul, `domaine.tld/chemin`, liste de domaines, préfixe
`async`/`sync` et URL complète sont reconnus. Les lignes qui ne sont pas des
domaines (texte libre) restent `narrative`. Condition fautive d'origine :
`/\.(txt|csv|json|zip)(\?|$)/i.test(url)`.

Tableau historique du 13/11 (avant la distinction `rss-2`/`atom` et l'ajout de `json-ld`/`html-article`).
Mesure du 21/11 sur 10 sources réelles : `bench/results/parseurs-formats-4-avant-apres.json`.

## Parseurs complets — cinq formats, 20 sources réelles

`apps/api/src/collectors/parsers/index.ts` expose `parseSource(corps, contentType,
{ baseUrl })` : une seule entrée pour RSS 2.0, Atom, JSON-LD, HTML `<article>`/`<main>`
et flux JSON maison. Chaque parseur détecte le format dans le **corps** (le
content-type annoncé n'est qu'un indice), ramène `title`, `date`, `link`,
`summary` sans jeter les champs d'origine, et remplit `empty`, `ok` et
`diagnostics` au lieu de lever une exception. `detectItems()` du collecteur
utilise le même chemin : la canonicalisation profite à l'ingestion réelle.

| Format | Détection | Champs principaux | Test échantillon réel |
| --- | --- | --- | --- |
| RSS 2.0 | racine `<rss>`, chemin `rss.channel.item` | `pubDate`, `guid`, `description`, `content:encoded` | `rss2.xml` (CERT, 40 items) |
| Atom | racine `<feed>`, chemin `feed.entry` | `<link href rel=alternate>`, `published`/`updated`, `summary` | `atom.xml` (ZDNet, 25 entries) |
| JSON-LD | `@type: NewsArticle`/`Article` dans `@graph` ou un script | `headline`, `datePublished`, `url`, `description` | `jsonld-article.html` (BleepingComputer) |
| HTML `<article>`/`<main>` | blocs article, cartes de listing, sections de main | titre, `<time datetime>`/meta, canonique, paragraphe | `html-article.html`, `html-main.html`, `html-sections.html` |
| JSON maison | tableau racine ou tableau nommé (`items`, `vulnerabilities`, `posts`…) | `cveID`/`post_title`, `dateAdded`/`discovered`, `link`, `shortDescription`/`descriptions[]` | `json-maison.json` (NVD, 2 CVE) |

Les extraits figés sont décrits dans `apps/api/test/fixtures/parseurs/README.md`.
Les tests `apps/api/test/parseurs-sources-complets.test.ts` couvrent en plus le
JSON invalide, le XML invalide, un bloc JSON-LD cassé à côté d'un bloc valide,
les corps vides/absents, les tableaux vides et les pages sans bloc article.

Mesure du 21/11 sur **20 sources réelles** (`scripts/mesure-parseurs-20.mts`,
résultats dans `bench/results/parseurs-20-avant-apres.json`) : un GET par URL,
puis l'ancien `detectItems()` (extrait par `git archive` du commit précédent) et
le nouveau `parseSource()` sur **les mêmes octets**.

| Format | Sources | Items avant | Items après | Items à 4 champs avant → après |
| --- | ---: | ---: | ---: | ---: |
| RSS 2.0 | 8 | 480 | 480 | 480 → 480 |
| Atom 1.0 | 2 | 25 | 25 | 25 → 25 |
| JSON-LD | 3 | 3 | 3 | 3 → 3 |
| HTML `<article>` | 2 | 2 | 2 | 0 → 2 |
| HTML `<main>` | 1 | 107 | 12 | 0 → 12 |
| JSON maison | 4 | 17 982 | 17 981 | 82 → 82 |
| **Total** | **20** | **18 599** | **18 503** | **590 → 604** |

Lecture : les flux gardent leurs items (480 RSS, 25 Atom) et gagnent des dates
ISO, des titres décodés et des résumés nets. La page CISA passe de 107 liens de
menu à 12 cartes réelles, toutes datées ; les deux pages d'article passent de
zéro item complet à deux. Le léger déficit global (−96 items, dont −95 sur la
page CISA) est donc une **disparition de bruit**, pas une perte d'articles. Les
17 981 items JSON proviennent des vrais flux NVD/KEV/ransomwatch (un doublon
éliminé) : le volume est conservé, les champs sont désormais lisibles.

### Historique du 13/11 (avant RSS-2/Atom/JSON-LD/HTML-article)

| Stratégie | Sources |
| --- | ---: |
| rss-atom | 10 |
| json-root-array | 1 |
| json-nested-array | 0 |
| csv | 1 |
| html-links | 3 |
| none (401/403/octet-stream/timeout) | 10 |
**15/25 récupérables**, surtout des flux Atom/RDF à `itemsPath` vide. Aucune source désactivée.

## Motifs de rejet

Une source qui parse correctement peut rester muette parce que tous ses items
sont filtrés. Le collecteur journalise donc le motif :

```
[collect] presse-generationnt : 20/20 item(s) rejeté(s) — hors_sujet=17, presse=3
```

| Motif | Sens |
|---|---|
| `presse` | l'item a été classé presse généraliste ; refusé à l'entrée (décision du 10 novembre : la base ne contient que du cyber) |
| `hors_sujet` | ni organisation régionale reconnue, ni CVE admise par EPSS, ni département cité |
| `format non reconnu` | le corps ne correspond à aucune stratégie ci-dessus |

Sur 60 sources muettes relancées : **1 913 items rejetés comme presse**, 71 hors
sujet, et 4 seulement étaient de vraies pannes de parsing. Sans cette ligne, une
source cassée et une source filtrée produisaient le même silence : zéro
événement, statut vert.
