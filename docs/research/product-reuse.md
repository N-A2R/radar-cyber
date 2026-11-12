# Réutilisation produit — orgs, sources, UX

Date : 2026-11-12. Objet : éviter de reconstruire ce qui existe déjà, sans transformer
radar-cyber en plateforme CTI généraliste. Périmètre : chantier A (référentiel organisations),
B (sources utiles), C (UX centrée usage). Hors périmètre : sécurité, auth, déploiement.

Méthode : recherches web parallèles, lecture des README/licences, métadonnées GitHub vérifiées
le 2026-11-12 via l'API REST. Les étoiles et dates ci-dessous sont des instantanés, pas des
garanties de qualité. Aucun prototype de ces briques n'a encore été exécuté dans radar-cyber.

## 1. Décision proposée

**Garder le monorepo actuel** (Fastify / React / Vite / PostgreSQL / MapLibre) et réutiliser
des briques ciblées. Ne pas migrer vers OpenCTI, MISP, Yeti, IntelFeed ou Watcher comme
socle principal : le besoin différenciant reste le référentiel Nouvelle-Aquitaine et le
rattachement fiable organisation ↔ signal, pas un graphe CTI mondial.

Trois niveaux de réutilisation :

1. **Réutiliser directement** : API publiques et bibliothèques permissives intégrées comme
   outils ou workers.
2. **Réutiliser comme référence** : architecture, taxonomies, écrans, garde-fous ; pas de
   copier-coller de code sans décision licence.
3. **Garder chez nous** : règles régionales, modèle d'assertion/confiance, matcher en ligne,
   scripts de triage/santé, rapport hebdo, carte.

## 2. Chantier A — référentiel organisations

| Candidat | Licence / statut vérifié | Usage proposé | Verdict |
|---|---|---|---|
| [API Recherche d'entreprises / Annuaire DINUM](https://github.com/annuaire-entreprises-data-gouv-fr/search-api) | MIT, actif | Source d'identité : SIREN/SIRET, dénomination, NAF, adresse, établissements. L'API publique est ouverte sans clé, limitée à 7 appels/s ; ce n'est pas un export complet de SIRENE. [1](https://www.data.gouv.fr/dataservices/api-recherche-dentreprises) [1](https://github.com/annuaire-entreprises-data-gouv-fr/search-api) | **Réutiliser le service**, pas héberger le stack Elasticsearch/FastAPI. Cache + file d'appels côté import. |
| [Splink](https://github.com/moj-analytical-services/splink) | MIT, actif | Déduplication/rapprochement probabiliste offline : Fellegi-Sunter, apprentissage non supervisé, ajustements de fréquence des termes, visualisations de diagnostic ; backends DuckDB/Spark/PostgreSQL. [1](https://moj-analytical-services.github.io/splink/index.html) | **Réutiliser en batch** pour proposer des clusters et une file de revue. Pas de fusion automatique. |
| [RapidFuzz](https://github.com/rapidfuzz/RapidFuzz) | MIT, actif | Mesures de similarité de chaînes (Levenshtein, Jaro-Winkler, etc.) pour normalisation noms/alias et candidats de rapprochement. [1](https://github.com/rapidfuzz/rapidfuzz) | **Réutiliser en batch/sidecar Python** si le matcher TS actuel montre ses limites ; comparer avant remplacement. |
| [dedupe](https://github.com/dedupeio/dedupe) | MIT, actif | Déduplication/entity resolution avec apprentissage à partir d'exemples humains. [1](https://github.com/dedupeio/dedupe) | **Alternative** à Splink si on constitue un jeu de paires annotées ; pas premier choix. |
| [GLiNER](https://github.com/urchade/GLiNER) | Apache-2.0, actif | NER zero-shot léger, exécutable sur CPU, pour extraire candidats organisation/lieu/personne depuis texte. [1](https://github.com/urchade/GLiNER) | **Expérimenter** sur corpus presse française ; sortie = candidat à revoir, jamais rattachement automatique. |
| [dnstwist](https://github.com/elceef/dnstwist) | Apache-2.0 | Permutations de domaines pour typosquatting/homographes. [3](https://github.com/elceef?tab=repositories) | **Plus tard**, uniquement sur domaines d'orgs validés. |
| [CertStream](https://github.com/CaliDog/certstream-server) | MIT (serveur Elixir) | Flux Certificate Transparency. [2](https://github.com/CaliDog) | **Plus tard**, après domaines validés ; ne pas réintroduire crt.sh comme dépendance lente par domaine. |

### Architecture A proposée

```text
API Recherche d'entreprises ─
imports locaux / curated ────┼─> référentiel NA curé (SIREN, NAF, commune, dept, kind)
domaines validés ────────────┘          │
                                        ├─> Splink/RapidFuzz batch ─> clusters + scores ─> revue humaine
                                        └─> matcher TS en ligne ─> événement rattaché ou ambiguïté
```

Garder le périmètre NA explicite. Ne pas importer tout SIRENE. Splink est meilleur avec
plusieurs colonnes peu corrélées ; il n'est pas adapté à un seul champ « sac de mots ».
[1](https://moj-analytical-services.github.io/splink/index.html)

## 3. Chantier B — sources utiles et honnêtes

| Candidat | Licence / statut vérifié | Usage proposé | Verdict |
|---|---|---|---|
| [IntelFeed](https://github.com/a-oneil/IntelFeed) | AGPL-3.0, actif mais très petit/jeune | Référence la plus proche : adapters RSS/YouTube/Reddit/GitHub/NVD/Mastodon/Bluesky/Telegram/scraper, conditional GET, dédup, full-article fetch, autolinking entités, garde-fous de résolution, échelle de confiance/provenance, file de priorité. [1](https://github.com/a-oneil/IntelFeed) | **Référence produit/architecture**, pas socle. Stack Python/FastAPI/Celery/Redis/PostgreSQL/Meilisearch + React ; trop à reprendre pour notre gain. |
| [Watcher](https://github.com/thalesgroup-cert/Watcher) | AGPL-3.0, actif, porté par Thales CERT | Référence modules : RSS CERT, certstream/dnstwist, surveillance de sites, détection de fuites, NER, rapports hebdo, statuts de triage. [4](https://deepwiki.com/thalesgroup-cert/Watcher) [2](https://thalesgroup-cert.github.io/Watcher/README.html) | **Référence**, pas runtime Django/MySQL à ajouter. |
| [IntelMQ](https://github.com/certtools/intelmq) | AGPL-3.0 | Pipeline collectors/parsers de feeds sécurité, ontologie d'harmonisation, sorties PostgreSQL/REST. [1](https://github.com/certtools/intelmq) | **Catalogue de formats/parsers** à consulter ; ne pas remplacer notre ingestion par un pipeline message-queue complet. |
| [Trafilatura](https://github.com/adbar/trafilatura) | Apache-2.0 depuis v1.8.0 ; versions antérieures GPLv3+ | Extraction texte principal + métadonnées depuis HTML, sans base de données, sorties structurées. [1](https://github.com/adbar/trafilatura) | **Réutiliser** comme worker/CLI Python pour articles tronqués ou pages presse. Épingler version récente. |
| [newspaper4k](https://github.com/AndyTheFactory/newspaper4k) | MIT | Extraction articles/métadonnées, découverte de sources, multilingue. [1](https://github.com/AndyTheFactory/newspaper4k) | **Alternative** à Trafilatura ; bench sur nos pages régionales avant choix. |
| [changedetection.io](https://github.com/dgtlmoon/changedetection.io) | Apache-2.0, actif | Surveillance de pages sans RSS, filtres CSS/XPath/JSONPath, API REST, notifications. [1](https://github.com/dgtlmoon/changedetection.io) | **Réutiliser de façon ciblée** pour pages institutionnelles/régionales utiles sans flux ; pas pour remplacer le collecteur RSS. |
| [urlwatch](https://github.com/thp/urlwatch) | licence à vérifier fichier par fichier (SPDX GitHub NOASSERTION) | Surveillance de pages plus légère. [4](https://github.com/uhub/awesome-python) | **Alternative** si changedetection.io est trop lourd ; vérifier licence avant copie. |
| [osint-feed](https://github.com/DewXIT/osint-feed) | pas de licence détectée via API GitHub | Harvest Node RSS/HTML config-driven, dédup, digest. | **Concept seulement** ; ne pas copier le code sans licence. |

### Architecture B proposée

```text
RSS/Atom/JSON existants ─> collecteur générique TS ─> normalisation ─> pertinence/admission
pages sans RSS ciblées ─> changedetection.io ─> webhook/entrée collecteur
articles tronqués ──────> Trafilatura worker ─> texte + métadonnées ─> matching orgs
```

Mesurer par source : fetched, parsed, admitted, matched, regional, useful. Un HTTP 200 avec
0 item parsé ou 0 rattachement utile n'est pas un succès. Réparer/qualifier avant d'ajouter
du volume.

### Plateformes CTI : pourquoi pas comme socle

- **OpenCTI** : CE Apache-2.0, EE commerciale ; modèle STIX2, provenance/confiance très
  instructifs, mais plateforme lourde. [1](https://github.com/opencti-platform/opencti)
  Correction par rapport à d'anciennes notes du dépôt : la CE n'est pas AGPL dans le README
  actuel. Ne pas copier l'EE.
- **MISP** : AGPL-3.0 ; référence partage d'indicateurs, taxonomies/galaxies. Vérifier la
  licence de chaque jeu de données séparément du code.
- **Yeti** : Apache-2.0 ; orienté CTI/DFIR, bulk search observables, YARA/Sigma/DFIQ.
  Pas notre cœur régional. [1](https://github.com/yeti-platform/yeti)

## 4. Chantier C — UX centrée usage

| Candidat | Licence | Usage proposé | Verdict |
|---|---|---|---|
| [TanStack Table](https://github.com/TanStack/table) | MIT | Table headless : tri, filtres, grouping, sélection, pagination, server-side. [1](https://github.com/tanstack/table) | **Réutiliser** pour annuaire orgs, sources, file de revue. |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | MIT | Composants accessibles que l'on copie et personnalise : dialog, sheet, command, table, badges. [1](https://github.com/shadcn-ui/ui) | **Réutiliser** si on veut posséder le code ; introduit Tailwind. |
| [IRONSIGHT](https://github.com/NoblerWorks-HQ/IRONSIGHT) | MIT | Exemple de command center Next.js/TS, panneaux et horloge temps réel. [1](https://trendshift.io/repositories/24602) | **Adapter petits composants/patterns**, pas migrer vers Next. |
| [osiris](https://github.com/carbon-evolution/osiris) | MIT | Exemple MapLibre + collectors/workers. [1](https://trendshift.io/repositories/24602) | **Référence collecte/carte**, pas remplacement du front. |
| [worldmonitor](https://github.com/koala73/worldmonitor) | AGPL-3.0 | Dashboard global temps réel, agrégation news/infra. [2](https://github.com/topics/osint?l=typescript) | **Inspiration UX seulement** par défaut. |
| [Meilisearch](https://github.com/meilisearch/meilisearch) | MIT pour la Community Edition | Recherche typo-tolérante, facettes, search-as-you-type. [1](https://github.com/meilisearch/meilisearch) | **Différer** : commencer par la recherche Postgres existante ; n'ajouter un moteur dédié que si le besoin est mesuré. |

Note : `docs/research/design-shortlist.md` contenait déjà une préférence Carbon. Ne pas
empiler Carbon + shadcn/ui. Arbitrage à faire : **Carbon** si on veut le langage « salle de
contrôle » déjà documenté ; **shadcn/ui + TanStack Table** si on privilégie composants
possédés et assemblage rapide. Dans les deux cas, garder MapLibre et la carte secondaire.

### Écrans à construire en premier

1. Accueil : signaux régionaux récents + recherche globale.
2. Annuaire organisations : table filtrable dept/kind/NAF/statut couverture.
3. Fiche organisation : identité, domaines/alias, signaux, provenance, confiance, trous.
4. File de revue : rattachements ambigus, doublons proposés, sources muettes.
5. Sources : rendement réel, pas seulement santé HTTP.

## 5. Licences et prudence

- MIT/Apache-2.0 : réutilisation simple avec attribution/avis de licence.
- AGPL (IntelFeed, Watcher, IntelMQ, MISP, worldmonitor) : usage possible mais obligations
  de code source correspondant pour les utilisateurs réseau en cas de modification ;
  ne pas copier dans radar-cyber sans décision explicite. Par défaut : **patterns seulement**.
- Sans licence détectée (osint-feed) : pas de droit de copie par défaut ; concept seulement.
- Les licences des **données** (galaxies MISP, ransomware.live, abuse.ch, etc.) sont
  distinctes de celles des repos ; vérifier avant ingestion/redistribution.

## 6. Plan de validation parallèle

Trois lots indépendants peuvent être instruits en parallèle, puis intégrés par un seul agent :

- **A/Bench orgs** : échantillon NA + API Recherche d'entreprises ; comparer matcher TS,
  RapidFuzz, Splink sur doublons et rattachements ; mesurer faux positifs avant automatisation.
- **B/Bench sources** : 20–30 sources régionales/presse ; Trafilatura vs newspaper4k ;
  changedetection.io sur 3–5 pages sans RSS ; métriques fetched→parsed→admitted→matched→useful.
- **C/Prototype UX** : annuaire + fiche org + recherche avec TanStack Table et un seul
  design system, sur données existantes/mock ; pas de refonte carte.

Ordre d'intégration restant : **A → B → C**, avec critères de réussite déjà définis dans le
diagnostic produit.
