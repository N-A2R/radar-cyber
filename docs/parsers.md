# Parsers génériques — détection automatique
`apps/api/src/collectors/generic.ts` : un `parser.itemsPath` vide ou stérile ne rend plus
la source muette.
## Priorité (`detectItems`)
1. **`itemsPath` déclaré et valide** — comportement historique intact.
2. JSON **tableau racine** (objets uniquement).
3. JSON **premier tableau d'objets**, profondeur ≤ 4, chemin reporté (`data.items`).
4. **RSS / Atom / RDF** : `rss.channel.item`, `channel.item`, `feed.entry`, `rdf:RDF.item`.
5. **CSV** : en-tête nommé (≥ 2 colonnes) + lignes cohérentes.
6. **HTML** : liens `<a href>` significatifs (hors `#`, `javascript:`, libellés < 4 car.).
7. Sinon refus explicite : `[collect] <source> : format non reconnu — refus explicite`.
Flux `indicator` en JSON/CSV/RSS : valeurs tirées de `value|indicator|ip|domain|host|url|
link|cidr|title|description`, puis filtre warninglists. Un `304` ne remet plus `last_items` à 0.
Diagnostic lecture seule : `apps/api/node_modules/.bin/tsx scripts/diagnose-parsers.mts`
(25 sources muettes, 1 req/s, timeout 10 s).
## Échantillon 2026-11-10
| Stratégie | Sources |
| --- | ---: |
| rss-atom | 10 |
| json-root-array | 1 |
| json-nested-array | 0 |
| csv | 1 |
| html-links | 3 |
| none (401/403/octet-stream/timeout) | 10 |
**15/25 récupérables**, surtout des flux Atom/RDF à `itemsPath` vide. Aucune source désactivée.
