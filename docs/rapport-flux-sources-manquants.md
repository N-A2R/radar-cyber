# Flux RSS/Atom manquants : 31 flux découverts, 28 sources couvertes

## Objectif mesuré

**31 flux RSS/Atom enregistrés**, contre une cible d'au moins 30. Ces flux
appartenaient à **28 sources du catalogue qui n'avaient pas de flux** : elles
deviennent collectables automatiquement. Le catalogue passe de **463 à 494
sources** et de **221 à 252 sources à flux** (`format IN ('rss','atom')`).

Étape 0 effectuée : aucune PR ne traite de la découverte de flux sur les sources
déjà en base. La PR #320 (crawler de sitemaps, 46 flux) couvre un autre
mécanisme — elle part des domaines d'organisations et crée des sources
`sitemap:` ; elle n'ajoute pas de flux aux sources HTML existantes.

## Méthode

1. Sélection de **121 sources** dont l'URL est une page web (`format='html'`) ou
   ne ressemble pas déjà à un flux (`/feed`, `/rss`, `.xml`, `api`, `json`,
   `t.me`, `.onion` exclus).
2. Pour chaque source : 42 chemins candidats (`/feed`, `/feed/`, `/rss`,
   `/rss/`, `/rss.xml`, `/atom.xml`, `/?feed=rss2`, `/actualites/feed`,
   `/spip.php?page=rss`, `/feed/atom`, …), variantes profondes de l'URL d'origine,
   puis liens `rel="alternate"` et liens de page pointant vers un flux.
3. Validation identique au collecteur : HTTP 2xx + racine RSS/Atom +
   `parseSource()` avec au moins **un item**. Les flux vides (par exemple
   `eke.eus/rss.xml`, `montdemarsan.fr/feed`) sont donc écartés.
4. Enregistrement idempotent : `ON CONFLICT (id) DO NOTHING`, identifiant stable
   `source-feed:<domaine>:<hash>`, source activée, `relevance='context'`
   (grise), provenance de la source initiale dans `parser.discovery`.

Le code est en anglais, ce rapport en français ; aucune donnée personnelle de
victime n'est stockée, seulement des URL et des identifiants de sources.

## Commandes reproductibles

Mesure (sans écriture en base, **31 flux validés**, 28 sources couvertes,
5 026 candidats testés, 103 s) :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar timeout 140s \
  apps/api/node_modules/.bin/tsx scripts/discover-source-feeds.mts \
  --dry-run --json=bench/results/source-feeds-all-dryrun-2026-11-22.json
```

Application (passe réseau, 29 flux enregistrés ; les 2 flux restants ont été
ajoutés depuis l'artefact de mesure, `www.ville-tarnos.fr` répondant alors en
timeout) :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar timeout 140s \
  apps/api/node_modules/.bin/tsx scripts/discover-source-feeds.mts \
  --json=bench/results/source-feeds-applied-2026-11-22.json

DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/discover-source-feeds.mts \
  --from-json=bench/results/source-feeds-all-dryrun-2026-11-22.json \
  --json=bench/results/source-feeds-final-2026-11-22.json
```

Un troisième passage `--from-json` enregistre **0** flux supplémentaire :
l'opération est idempotente.

## Les 31 flux découverts

| Format | Flux | Source initiale |
| --- | --- | --- |
| RSS | `https://actu.fr/rss.xml` | `corpus:landes-40-actu-fr-mont-de-marsan` |
| RSS | `https://haveibeenpwned.com/feed` | `osint-hibp` |
| RSS | `https://kanaldude.eus/feed/bideoak.rss` | `regional:eu:kanaldude` |
| RSS | `https://la.charente-maritime.fr/news/rss.xml` | `official-na-charente-presse` |
| RSS | `https://ransomware.live/rss` | `ransom-ransomwarelive` |
| RSS | `https://seaska.eus/rss.xml` | `regional:eu:seaska` |
| RSS | `https://securityalert.ai/ransomware.rss` | `ransom-securityalert` |
| Atom | `https://toufanleaks.org/?feed=atom` | `ransomleak-toufan` |
| RSS | `https://toufanleaks.org/?feed=rss` | `ransomleak-toufan` |
| RSS | `https://www.abuse.ch/rss` | `osint-abusech` |
| RSS | `https://www.caracterres.fr/rss.xml` | `corpus:la-vienne-rurale-caracterres` |
| RSS | `https://www.cgt-landes.org/rss` | `corpus:landes-40-cgt-landes-union-departementale-40` |
| RSS | `https://www.cisa.gov/rss.xml` | `cisa_kev` |
| RSS | `https://www.creuse.fr/spip.php?page=backend` | `cd23-a-la-une` |
| Atom | `https://www.dax.fr/feed/atom` | `corpus:landes-40-daxmag-journal-de-la-ville-de-dax` |
| RSS | `https://www.dax.fr/rss` | `corpus:landes-40-daxmag-journal-de-la-ville-de-dax` |
| RSS | `https://www.eke.eus/eu/kultura/sormen/sormen-tantak/RSS` | `regional:eu:eke` |
| RSS | `https://www.fepcfdtbbl.fr/blog-feed.xml` | `corpus:landes-40-fep-cfdt-pays-basque-bearn-landes` |
| RSS | `https://www.first.org/blog/rss.xml` | `epss` |
| RSS | `https://www.kazeta.eus/eu/rss/news.rss` | `regional:eu:kazeta` |
| RSS | `https://www.leparisien.fr/landes-40/rss.xml` | `corpus:landes-40-le-parisien-landes-40` |
| RSS | `https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml` | `official-na-ars-communiques` |
| RSS | `https://www.ransomlook.io/rss.xml` | `ransom-ransomlook` |
| RSS | `https://www.souvenirsfm.fr/rss-feed-1` | `corpus:landes-40-souvenirs-fm-dax-soustons-radio-locale-88-6-fm` |
| RSS | `https://www.spamhaus.org/rss.xml` | `spamhaus-drop` |
| Atom | `https://www.univ-larochelle.fr/feed/atom` | `official-na-univ-larochelle-presse` |
| RSS | `https://www.univ-larochelle.fr/rss` | `official-na-univ-larochelle-presse` |
| Atom | `https://www.ville-loudun.fr/actualites?format=feed&type=atom` | `corpus:ville-de-loudun` |
| RSS | `https://www.ville-loudun.fr/actualites?format=feed&type=rss` | `corpus:ville-de-loudun` |
| Atom | `https://www.ville-tarnos.fr/feed/atom` | `corpus:landes-40-tarnos-contact-journal-municipal-de-tarnos` |
| RSS | `https://www.ville-tarnos.fr/rss` | `corpus:landes-40-tarnos-contact-journal-municipal-de-tarnos` |

Deux sources (`cd23-a-la-une` et `official-na-creuse-presse`) partagent
`creuse.fr/spip.php?page=backend` : une seule source de flux est enregistrée,
les deux identifiants figurent dans la provenance.

## Vérification

- 8 tests nommés verts (`tsx --test apps/api/test/source-feed-discovery.test.ts`)
  : chemins, liens de page, rejet du HTML et des flux vides, validation
  RSS/Atom, identifiants stables, provenance, sélection et déduplication.
- `tsc --noEmit -p apps/api/tsconfig.json` : OK.
- Base réelle (`:5433`) : 31 lignes `source-feed:%`, toutes `enabled=true`
  (26 RSS, 5 Atom), 28 identifiants de sources initiales distincts dans
  `parser.discovery.sourceIds`.
- Artefacts : `bench/results/source-feeds-all-dryrun-2026-11-22.json`,
  `source-feeds-applied-2026-11-22.json`, `source-feeds-final-2026-11-22.json`.
