# Sources d'information — secteur santé, département 19 (Corrèze)

OBJECTIF : atteint — 24 / 5 sources vérifiées en HTTP 200 pour le couple secteur « santé » / département 19 (Corrèze).

## Livrable

- `bench/corpus/sources-sante-19.jsonl` — 24 lignes au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `bench/results/verification-sources-sante-19.json` — 65 URL uniques contrôlées le 2026-11-22, 65 × 200 (`curl -L`, User-Agent navigateur, code final après redirections et type de contenu relevés).
- `db/migrate-082-sources-sante-19.sql` — 24 sources `corpus:sante19-*` en `department='19'`, 85 traces `source_verification` en `ok200`. Migration appliquée à la base locale le 2026-11-22 : 24 sources, 85 traces, rejeu sans doublon (24/85 après rejeu).
- `bench/corpus/HASH` régénéré après ajout du corpus (`170649f1…`).

## Sources retenues

| # | source | type | page actualités | flux |
|---|---|---|---|---|
| 1 | Centre hospitalier de Brive-la-Gaillarde | hôpital public (19) | `/category/actualites/` | `/category/actualites/feed/` |
| 2 | Centre hospitalier de Tulle | hôpital public (19) | `/fr/actualites` | `/fr/actualites?rss` |
| 3 | Centre hospitalier de Haute-Corrèze (Ussel) | hôpital public (19) | `/le-centre-hospitalier-de-haute-correze/actualite.html` | — |
| 4 | EHPAD Les Écureuils (CHHC Ussel) | EHPAD public (19) | actualités du CHHC | — |
| 5 | CPAM de la Corrèze | sécurité sociale (19) | `/correze/assure/liste-actualites-locales` | — |
| 6 | ARS Nouvelle-Aquitaine — Corrèze | agence régionale | `/liste-actualites?archive=0` | `/rss.xml?type=ars_actualite` |
| 7 | Corrèze Santé (département) | bulletin départemental (19) | `#home-actus` | `/rss` |
| 8 | CMC Clinique Les Cèdres (ELSAN), Brive | clinique privée (19) | `/fr/nos-actualites?etablissement=1746` | — |
| 9 | Laboratoire Novabio (Brive-Rivet, Malemort) | biologie médicale (19) | `/Actualites-Novabio-…` | — |
| 10 | CDOM de la Corrèze | ordre professionnel (19) | `/actualites` | — |
| 11 | Ordre national des infirmiers | ordre professionnel | `/publications` | — |
| 12 | Ordre national des MK | ordre professionnel | `/actualites/ordre/` | `/feed/` |
| 13 | Ordre national des pharmaciens | ordre professionnel | `/les-communications/les-communications` | — |
| 14 | URPS Médecins Libéraux NA | union régionale | `/organisation-des-soins/` | `/feed/` |
| 15 | FHF Nouvelle-Aquitaine | fédération hospitalière | `/category/newsletter/` | `/feed/` |
| 16 | France Assos Santé NA (Limousin) | association d'usagers | `/actualites/` | `/feed/` |
| 17 | CMA Nouvelle-Aquitaine — CMA Corrèze | chambre consulaire (19) | `/a-cote-de-chez-vous/actualites/` | — |
| 18 | La Montagne — Corrèze | presse locale (19) | `/actualites/sante` | — |
| 19 | Sud Ouest — Corrèze | presse locale (19) | `/sante/` | `/correze/rss.xml` |
| 20 | actu.fr — Corrèze | presse locale (19) | `/tag/sante` | `/nouvelle-aquitaine/correze_19/rss.xml` |
| 21 | ICI Corrèze | radio locale publique (19) | `/infos/sante-sciences` | `/rss/limousin/rubrique/infos.xml` |
| 22 | France 3 Nouvelle-Aquitaine — Corrèze | télévision locale | `/sante/` (franceinfo) | — |
| 23 | Journal des Entreprises — NA Santé | presse économique régionale | `/secteurs-activite/services/sante` | `/rss-nouvelle-aquitaine` |
| 24 | Brivemag — Ville de Brive | magazine municipal (19) | `brivemag.brive.fr` | `/feed/` |

Seize sources sont explicitement départementales ou locales (CH, EHPAD, CPAM, CDOM, clinique, Novabio, Brivemag, presse 19, CMA Corrèze) ; huit sont des organismes régionaux ou nationaux dont la mission couvre la Corrèze (ARS, URPS, FHF, France Assos Santé, ordres, presse régionale).

## Exemples cyber observés

- Le laboratoire Novabio (Brive-Rivet / Malemort) victime de deux cyberattaques, données de santé en fuite (05/11/2026) — `https://www.cyberattaque.org/le-laboratoire-novabio-victime-de-deux-cyberattaques-des-donnees-de-sante-en-fuite/` (200), avec information patient sur la page actualités de Novabio (200).
- Incident de sécurité de l'ARS Nouvelle-Aquitaine concernant la plateforme de recueil des autorisations parentales (08/07/2026) — URL vérifiée 200.
- « Les Bonnes Pratiques de Cybersécurité » du CDOM de la Corrèze — `https://conseil19.ordre.medecin.fr/actualites/les-bonnes-pratiques-de-cybersecurite` (200).
- Réunions FHF Nouvelle-Aquitaine : systèmes d'information et cybersécurité — `https://fhf-na.fr/2024/01/29/actualites-4/` (200).
- « # CYBER ATTAQUES » de France Assos Santé Nouvelle-Aquitaine — `https://nouvelle-aquitaine.france-assos-sante.org/2024/02/21/15328/` (200).

## Méthode et exclusions

Recherche menée le 2026-11-22 : annuaires d'établissements, sites officiels, Google Actualités RSS, Ecosia/Bing et liens internes des sites (API Exa hors crédits, HTTP 402). Chaque URL retenue a ensuite été contrôlée par `curl -L` avec code final et type de contenu ; seules les URL en 200 ont été intégrées. Le flux `/rss.xml` du CDOM 19 renvoie du HTML : il n'a donc pas été déclaré comme flux. Le `rss.xml` du CH de Tulle redirige vers la page d'accueil ; la variante active `?rss` (application/xml) a été retenue.

Écartés après vérification : `ch-brive.fr/actualites`, `/rss.xml` (404), `ch-ussel.fr/actualites` (404), `correze.fr/sante-solidarite` et `/actualites` (404), `lamontagne.fr/brive-la-gaillarde-19100/actualites/` et `/rss.xml` (404), `france3-regions.franceinfo.fr/.../correze/rss.xml` (404), `cci-correze.fr` (403), `hopitaux-correze.fr`, `clinique-des-cedres.fr`, `cpts19.fr`, `cdi19.fr` (DNS/refus). Aucun article cyber-santé spécifiquement corrézien n'a pu être rattaché à un établissement public autre que l'ARS ; les exemples ci-dessus sont soit locaux (Novabio, CDOM), soit régionaux (FHF, France Assos Santé).

Prévol : aucune PR ni branche distante pour le couple (santé, 19) ; la PR #461 livre 22 sources santé en Charente (16), sans chevauchement avec la Corrèze. Base utilisée : `origin/main` (worktree `ext/src-sante-19`).
