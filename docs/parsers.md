# Parsers génériques — détection automatique
`apps/api/src/collectors/generic.ts` : un `parser.itemsPath` vide ou stérile ne rend plus
la source muette.
## Priorité (`detectItems`)
1. **`itemsPath` déclaré et valide** — comportement historique intact.
2. JSON **tableau racine** (objets uniquement).
3. JSON **premier tableau d'objets**, profondeur ≤ 4, chemin reporté (`data.items`).
4. **RSS / Atom / RDF** : `rss.channel.item`, `channel.item`, `feed.entry`, `rdf:RDF.item`.
5. **CSV** : en-tête nommé (≥ 2 colonnes) + lignes cohérentes.
6. **Cartes de revendication** (`parsers/claims.ts`) : pages de sites de fuite.
   Deux structures observées — fenêtre modale (`h3` + `div.meta` « secteur · pays »)
   et carte de projet (`h3.card-title` + `.card-country` + `.card-description`
   en champs `Clé: valeur` séparés par `|`). Une carte n'est retenue que si elle
   porte un champ de revendication (secteur, statut, pays, résumé) : un menu de
   navigation ne suffit pas. Les titres entre crochets (`[ ABOUT US ]`) sont
   écartés, c'étaient des titres de section comptés comme victimes.
7. **Messages Telegram** (`parsers/telegram.ts`) : `div.tgme_widget_message_text`
   avec la date du message la plus proche en amont. Les libellés d'interface
   (« Media is too big », « VIEW IN TELEGRAM », « Join chat ») sont filtrés :
   les ingérer remplissait le fil de bruit.
8. **HTML** : liens `<a href>` significatifs (hors `#`, `javascript:`, libellés < 4 car.).
9. Sinon refus explicite : `[collect] <source> : format non reconnu — refus explicite`.
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
