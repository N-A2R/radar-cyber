# Architecture de collecte — note de conception

> Comment le collecteur lit les sources, et pourquoi il ne lit qu'un seul type
> aujourd'hui.

## Objectif chiffré (déclaré le 23 novembre 2026)

La note décrivait 57 sources en attente d'un mode de lecture et annonçait six
modes dans sa table de décision. Sur la base fusionnée `8f1a4dab`, le
collecteur n'en branchait explicitement que trois (`auto`, `html-page`,
`indicator-list`). Mesure reproductible avant correction :
`grep -o 'reader === "[a-z-]*"' apps/api/src/collectors/generic.ts | sort -u`.

**Cible : 6 / 6 modes annoncés dispatchés par le collecteur, avec un test par
comportement.** Les trois manquants étaient `feed` (le chemin déclaré seul fait
foi), `html-links` (les liens sont forcés) et `quarantine-first` (le corps brut
est conservé avant l'extraction). `readerMode()` normalise NULL et toute valeur
inconnue vers `auto` ; le mode déclaré prime sur la détection.

Mesure reproductible après correction :
`apps/api/node_modules/.bin/tsx --test apps/api/test/source-reader.test.ts`
→ 6 tests, un par mode, 0 échec. En complément, la base courante porte 67
sources avec un `reader` déclaré, toutes honorées :
`SELECT count(*) FILTER (WHERE reader IS NOT NULL) AS declarees, count(*) FILTER (WHERE reader IN ('auto','feed','html-page','html-links','indicator-list','quarantine-first')) AS honorees FROM source;`

Les 57 sources muettes restent la motivation du chantier ; la cible mesurable
est le branchement effectif des six modes, condition de leur lecture. Périmètre
conservé : Nouvelle-Aquitaine, sources grises autorisées, aucune donnée
personnelle (fixtures synthétiques), aucun service payant.

OBJECTIF : atteint — 6 / 6 modes de lecture déclarés honorés par le collecteur

## Ce qui existe

Un seul chemin de lecture, dans `collectors/generic.ts` :

```text
fetchText(url)                  ← HTTP résilient, Retry-After, Tor si .onion
  ↓
parseNarrativeItems(body, parser, format)
  ├─ 1. contenu : le corps ressemble à un flux → parseRssItems / parseJsonItems
  ├─ 2. format déclaré : `source.format` (rss | json) → parser dédié
  └─ 3. détection automatique : detectItems(body, contentType)
        ├─ json-root-array / json-nested-array
        ├─ rss-atom  (item / entry / RDF)
        ├─ csv
        ├─ claim-cards      ← pages de revendication (victimes en cartes <h3>)
        ├─ telegram-channel ← aperçus publics t.me
        ├─ html-links       ← liens <a href>
        └─ none             ← refus explicite
  ↓
0 item → quarantaine (corps brut conservé, empreinte sha256)
```

`detectItems` est **pure** : le diagnostic (`scripts/diagnose-parsers.mts`)
l'appelle tel quel. C'est le point d'extension naturel.

## Le problème

Le parc déclaré n'est pas fait que de flux :

| Type | Nombre | État |
| --- | --- | --- |
| narrative / HTML | 110 | 263 items lus, mais la plupart extraits à 0 |
| narrative / RSS | 86 | 437 items |
| indicator (txt/json) | 43 | **5 items** — listes d'IP/domaines |
| warninglist (json) | 9 | **0** — jamais exploitées |
| quarantine (HTML) | 14 | **0** — dont 9 `.onion` |

Sur les 43 sources `indicator`, 32 sont des fichiers `txt` jamais lus, et 43
+ 14 = **57 sources attendent un mode de lecture qui n'existe pas**.

## Ce que disent les architectures existantes

Quatre projets ouvertes, quatre rôles différents :

| Projet | Rôle | Ce qu'on en retient |
| --- | --- | --- |
| **OpenCTI** | connecteurs autour d'un graphe STIX | **Un connecteur par famille de source** ; le connecteur possède auth, pagination, curseur, parsing, mapping et erreurs |
| **MISP** | définitions de flux + revue analyste | **séparer la mise en cache de l'import** ; l'extraction est une proposition, pas une vérité |
| **Rösti** | extraction spécialisée + connecteur OpenCTI | **curseur incrémental + upsert idempotent**, pas de réimport complet |
| **ThreatWatch** (ransomware) | scraper Tor/Playwright + parseurs par groupe + fallback générique | **parseurs fragiles → fallback générique obligatoire**, et parsage fréquent plus que scraping fréquent |

La règle commune : **collecter, préserver la preuve, parser, valider,
canonicaliser, publier — avec un curseur et une provenance à chaque frontière.**

## La décision : un `reader` par mode de lecture

Le registre `source` gagne un champ **`reader`** qui dit comment lire la
source. La détection automatique reste, mais en **dernier recours**, pas comme
décision par défaut.

| `reader` | Pour quoi | Implémentation |
| --- | --- | --- |
| `auto` (défaut, rétro-compatible) | flux RSS/JSON/CSV bien formés | `detectItems` actuel, inchangé |
| `feed` | flux RSS/Atom/JSON avec chemin déclaré | `parseRssItems` / `parseJsonItems` |
| `html-page` | **pages web** : sites de fuite, presse, blogs | extraction orientée contenu (titres, cartes, dates) — pas seulement les liens |
| `html-links` | pages dont on veut les liens | `parseHtmlLinks` actuel |
| `indicator-list` | txt/json d'IP/domaines/hachages | lecture ligne à ligne + `detectIndicatorType` |
| `quarantine-first` | `.onion` illisibles | corps en quarantaine, relisible plus tard |

Le champ est **nullable** : `reader IS NULL` → comportement actuel, aucune
migration de données forcée.

## Les règles qui évitent les erreurs

1. **Un lecteur par famille de source**, pas un lecteur par URL. Les sélecteurs
   HTML sont isolés dans `parsers/`, jamais noyés dans la normalisation.
2. **La preuve est conservée avant l'extraction** : URL, instant de lecture,
   empreinte, et le corps brut quand il tient.
3. **Le parsing est idempotent** : mêmes données → même résultat, pas de
   duplication.
4. **Candidat ≠ indicateur** : une IP trouvée par regex est une observation, pas
   une menace. La promotion passe par la validation et le contexte.
5. **Le HTML est fragile** : version de parseur, tests de sélecteurs, santé des
   flux, et un fallback générique obligatoire.
6. **La publication passe par des adaptateurs** : le scraper ne connaît ni la
   base ni le format de sortie, seulement la donnée canonique.
