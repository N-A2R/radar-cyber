# Audit statique du catalogue de sources

**145 sources uniques** déclarées dans `db/*.sql` (150 insertions, les réparations réécrivent certaines lignes).

Périmètre : qualité du **catalogue versionné**, pas disponibilité réseau. Le sandbox ne permet pas de sonder les flux ; les mesures de rendement restent à faire avec `scripts/source-health.mts` en environnement ouvert.

**Écart avec le README.** Le README annonce 594 sources en base ; seules **145 sont déclarées dans le dépôt**. Le complément venait d'imports de fichiers externes absents du repo : `db/import-feeds.ts` attend `/tmp/osint-repos/.../threat-intelligence-feeds.csv` et `db/import-json-sources.ts` attend `/tmp/estorides-sources.json`. Un déploiement neuf ne reproduit donc pas le catalogue mesuré : les sources manquantes ne sont reconstituables qu'en retrouvant ces fichiers.

## Familles inconnues du contrat

Le contrat partagé (`packages/shared/src/index.ts`) déclare 10 familles. Des sources en utilisent d'autres. **Vérification faite : `EventSchema` n'est appelé nulle part** (aucun `.parse()` dans l'API ni les scripts) : rien ne rejette ces événements, ils passent et la base contient bien des événements `leaks`. Le défaut est inverse et plus sournois — le contrat est décoratif, la dérive est silencieuse, et le front n'a ni libellé ni couleur pour ces familles.

| Famille | Sources | Reconnue par le contrat |
| --- | --- | --- |
| `leaks` | 7 | **non** |
| `paste` | 1 | **non** |

Sources concernées :

- `leak:hibp:latest-breaches` — Have I Been Pwned — dernières violations (RSS) (`sources-paste-leaks.sql`)
- `leak:databreaches:feed` — DataBreaches.net — flux des fuites de données (`sources-paste-leaks.sql`)
- `leak:ransomware-live:recent-rss` — ransomware.live — revendications récentes (RSS) (`sources-paste-leaks.sql`)
- `leak:ransomwatch:posts` — Ransomwatch — publications (JSON public) (`sources-paste-leaks.sql`)
- `leak:ransomlook:recent-api` — RansomLook — victimes récentes (API JSON) (`sources-paste-leaks.sql`)
- `leak:hipaajournal:feed` — HIPAA Journal — incidents et fuites (RSS) (`sources-paste-leaks.sql`)
- `leak:hibp:breaches-index` — Have I Been Pwned — index des violations (JSON public) (`sources-paste-leaks.sql`)
- `paste:github:gists-public-feed` — GitHub — gists publics (flux narratif) (`sources-paste-leaks.sql`)

## Répartition par famille

| Famille | Sources |
| --- | --- |
| `ransomware` | 47 |
| `reputation` | 33 |
| `cti` | 29 |
| `presse` | 15 |
| `leaks` ⚠️ hors contrat | 7 |
| `cert_fr` | 5 |
| `vuln` | 5 |
| `cert` | 2 |
| `phishing` | 1 |
| `paste` ⚠️ hors contrat | 1 |

## Doublons d'URL

**3 URL** sont déclarées par plusieurs identifiants : le même flux est collecté plusieurs fois, ce qui gonfle artificiellement le nombre de sources et le volume brut.

| URL | Identifiants |
| --- | --- |
| `https://www.cert.ssi.gouv.fr/feed/` | `cert_fr`, `cert-fr-feed` |
| `https://www.sudouest.fr/rss.xml` | `presse-sudouest-rss`, `presse-sudouest` |
| `http://byodxn5s7sua6oyyjj74rycgn6afncfckprt5ezskt3cni6lg3wdrgad.onion/` | `onion:ccw:byod`, `onion:rl:byod` |

## Autres comptages

- Formats : `html` 67, `rss` 32, `txt` 32, `json` 8, `?` 5, `text` 1
- Natures : `narrative` 103, `indicator` 37, `?` 5
- Flux `.onion` (nécessitent Tor) : **43**
- URL non chiffrées `http://` : **43**
- Sources désactivées : **43**
- Identifiants réécrits par plusieurs scripts : **5**
