# Sources d'information — secteur santé, département 16 (Charente)

OBJECTIF : atteint — 22 / 5 sources vérifiées en HTTP 200 pour le couple secteur « santé » / département 16 (Charente).

## Livrable

- `bench/corpus/sources-sante-16.jsonl` — 22 lignes au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `bench/results/verification-sources-sante-16.json` — 53 URL uniques contrôlées le 2026-11-22, 53 × 200 (`curl -L`, redirections suivies, User-Agent navigateur, type de contenu relevé).
- `db/migrate-075-sources-sante-16.sql` — 22 sources `corpus:sante16-*` en `department='16'` et 53 traces `source_verification` en `ok200` ; migration appliquée à la base locale le 2026-11-22 et rejouée sans doublon.
- `bench/corpus/HASH` régénéré après ajout du corpus.

## Sources retenues

| # | source | type | page actualités | flux |
|---|---|---|---|---|
| 1 | Centre hospitalier d'Angoulême | hôpital public (16) | `/actualite` | `/rss.xml` |
| 2 | CPAM de la Charente | assurance maladie (16) | `/charente/assure/liste-actualites-locales` | — |
| 3 | ARS Nouvelle-Aquitaine — Charente | agence régionale de santé | `/liste-actualites?archive=0` | `/rss.xml?type=ars_actualite` |
| 4 | Charente Libre — Santé | presse locale (16) | `/sante/` | `/sante/rss.xml` |
| 5 | Sud Ouest — Charente | presse locale (16) | `/charente/` | `/charente/rss.xml` |
| 6 | actu.fr — Charente | presse locale (16) | `/nouvelle-aquitaine/charente_16/` | `/rss.xml` |
| 7 | ICI Charente | radio publique locale | `/nouvelle-aquitaine/charente-16` | `/rss/la-rochelle/rubrique/infos.xml` |
| 8 | France 3 Nouvelle-Aquitaine — Charente | télévision publique locale | `/nouvelle-aquitaine/charente/` | `/charente/rss` |
| 9 | FHF Nouvelle-Aquitaine | fédération hospitalière | `/en-regions/nouvelle-aquitaine/nos-actualites` | — |
| 10 | Centre hospitalier de Confolens | hôpital public (16) | `/index-module-doc-page-view.html` | `/rss/fr/news/news.xml` |
| 11 | Centre hospitalier de La Rochefoucauld | hôpital public (16) | `/actualite` | — |
| 12 | EHPAD Habrioux d'Aigre | EHPAD public (16) | `/actualites-17` | — |
| 13 | CDOM de la Charente | ordre professionnel (16) | `/actualites` | — |
| 14 | CIDOI Picto-Charentais | ordre infirmier interdépartemental | annuaire des CIDOI | — |
| 15 | Ordre infirmier de la Charente | ordre professionnel (16) | blog officiel | — |
| 16 | Ordre des MK de la Charente | ordre professionnel (16) | `/actualites` | `/feed` |
| 17 | URPS Médecins Libéraux NA | union régionale (couvre la 16) | — | — |
| 18 | URPS Infirmiers Libéraux NA | union régionale (couvre la 16) | `/actualites/` | — |
| 19 | URPS Pharmaciens NA | union régionale (couvre la 16) | `/actualites/` | — |
| 20 | Ville d'Angoulême — Santé et solidarité | bulletin municipal (16) | `/mon-quotidien/sante-solidarite/` | `/feed/` |
| 21 | Grand Cognac — Santé | bulletin intercommunal (16) | `/vivre-et-participer/sante` | `/rss.xml` |
| 22 | Journal des Entreprises — Santé | presse économique régionale | `/secteurs-activite/services/sante` | `/rss-nouvelle-aquitaine` |

Seize sources sont explicitement départementales (16) ; six sont des organismes régionaux dont la mission couvre la Charente (ARS, FHF, trois URPS, JDE). Les pages départementales de l'ARS et du Journal des Entreprises ont été vérifiées en 200 (`dossier-de-presse-france-sante-charente-16-287-structures-labellisees-en-nouvelle-aquitaine`, `/nouvelle-aquitaine`).

## Exemples cyber observés

- Cyberattaque contre 1 500 médecins : données de 15 millions de patients compromises (Charente Libre, `/sante/cyberattaque-contre-1-500-medecins-...-28065977.php`, 200).
- La médecine du travail de Charente victime d'une cyberattaque : données personnelles de salariés piratées (Charente Libre).
- Page « Cybersécurité » de l'ARS Nouvelle-Aquitaine (`/cybersecurite-0?parent=15058`, 200).
- Cyberattaque des sites de la mairie d'Angoulême et de GrandAngoulême (Charente Libre, 200).
- Certificats d'identité numérique en mairie d'Angoulême (France Identité, 200) ; investissement de Grand Cognac contre les cybercriminels.

## Méthode et exclusions

Recherche web menée le 2026-11-22 via annuaires d'établissements, Wikipédia, liens internes des sites hospitaliers, Google Actualités et moteurs publics ; chaque URL retenue a ensuite été contrôlée par `curl -L` (code final après redirections et type de contenu). L'API Exa était hors crédits (402) pendant la collecte.

Écartés après vérification : CH de Cognac (`ch-cognac.fr`, 000), CH de Ruffec (000), conseil départemental de la Charente / `charente.fr` (échec TLS), MSA Charente et FEHAP (000), URPS MK (000), CCI de Charente et PagesJaunes (403), `ordre-medecins-charente.fr` (000), rubriques `/sante/` de Sud Ouest et d'actu.fr (404), `/rss` du CDOM (renvoie du HTML). Les flux sans items (`ch-angouleme.fr/rss.xml`, ARS `?type=actualite`) ont été remplacés par les variantes actives quand elles existaient.

Prévol : la PR #394 livre 35 sources santé à l'échelle de la Nouvelle-Aquitaine, sans champ `departement` et sans source du département 16 ; le couple (santé, 16) n'était donc pas livré.
