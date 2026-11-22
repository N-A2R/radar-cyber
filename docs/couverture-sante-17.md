# Sources d'information — secteur santé, département 17 (Charente-Maritime)

OBJECTIF : atteint — 21 / 5 sources vérifiées en HTTP 200 pour le couple secteur « santé » / département 17 (Charente-Maritime).

## Livrable

- `bench/corpus/sources-sante-17.jsonl` — 21 lignes au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `bench/results/verification-sources-sante-17.json` — 48 URL uniques contrôlées le 2026-11-22, 48 × 200 (`curl -L`, redirections suivies, User-Agent navigateur, type de contenu relevé), 0 anomalie.
- `db/migrate-082-sources-sante-17.sql` — 21 sources `corpus:sante17-*` en `department='17'` et 57 traces `source_verification` en `ok200` (les articles cyber sont partagés entre plusieurs sources). Migration appliquée à la base locale le 2026-11-22 et rejouée sans doublon (0 nouvelle trace au second passage).
- `bench/corpus/HASH` régénéré après ajout du corpus : `527dfc2d56819158c7b72826673496f75b9af9255f6c15f918dffa7004d1a880`.

## Sources retenues

| # | source | type | page actualités | flux |
|---|---|---|---|---|
| 1 | Centre hospitalier de La Rochelle | hôpital public | `www.ch-larochelle.fr/toutes-les-actualites/` | `www.ch-larochelle.fr/feed/` |
| 2 | Groupe hospitalier Littoral Atlantique (La Rochelle — Rochefort) | groupement hospitalier public | `www.gh-littoral-atlantique.fr/toutes-les-actualites/` | `www.gh-littoral-atlantique.fr/feed/` |
| 3 | Centre hospitalier de Rochefort | hôpital public | `www.ch-rochefort.fr/toutes-les-actualites/` | `www.ch-rochefort.fr/feed/` |
| 4 | Centre hospitalier de Saintonge — Saintes | hôpital public | `saintes.gh-saintesangely.fr/toutes-les-actualites/` | `saintes.gh-saintesangely.fr/feed/` |
| 5 | CPAM de la Charente-Maritime — Assurance Maladie | organisme de sécurité sociale | `www.ameli.fr/charente-maritime/assure/liste-actualites-locales` | — |
| 6 | ARS Nouvelle-Aquitaine — délégation de la Charente-Maritime (17) | agence régionale de santé | `www.nouvelle-aquitaine.ars.sante.fr/liste-actualites?archive=0` | `www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite` |
| 7 | Conseil départemental de l'Ordre des médecins de la Charente-Maritime | ordre professionnel | `conseil17.ordre.medecin.fr/actualites` | — |
| 8 | Annuaire santé — établissements de Charente-Maritime | annuaire professionnel | `www.sante.fr/recherche/trouver/EHPAD/Charente-Maritime` | — |
| 9 | Sud Ouest — édition Charente-Maritime | presse locale | `www.sudouest.fr/charente-maritime/` | `www.sudouest.fr/charente-maritime/rss.xml` |
| 10 | actu.fr — La Rochelle (17) | presse locale | `actu.fr/nouvelle-aquitaine/la-rochelle_17300/` | — |
| 11 | ICI La Rochelle (Radio France) | radio publique locale | `www.ici.fr/radio/la-rochelle/actu` | `www.ici.fr/rss/la-rochelle/rubrique/infos.xml` |
| 12 | France 3 Nouvelle-Aquitaine — Charente-Maritime | télévision publique locale | `france3-regions.franceinfo.fr/nouvelle-aquitaine/charente-maritime/` | `france3-regions.franceinfo.fr/nouvelle-aquitaine/charente-maritime/rss` |
| 13 | Haute Saintonge — actualités de la Charente-Maritime | presse locale | `www.hautesaintonge.fr/` | — |
| 14 | Le Littoral — actualités du littoral charentais | presse locale | `www.le-littoral.com/` | — |
| 15 | Ordre des masseurs-kinésithérapeutes de la Charente-Maritime | ordre professionnel | `charente-maritime.ordremk.fr/actualites` | `charente-maritime.ordremk.fr/feed` |
| 16 | URPS Médecins Libéraux Nouvelle-Aquitaine | union régionale de professionnels de santé | `www.urpsml-na.org/` | — |
| 17 | URPS Infirmiers Libéraux Nouvelle-Aquitaine | union régionale de professionnels de santé | `urpsinfirmiers-na.fr/actualites/` | — |
| 18 | URPS Pharmaciens Nouvelle-Aquitaine | union régionale de professionnels de santé | `www.urps-pharmaciens-na.fr/actualites/` | — |
| 19 | FHF Nouvelle-Aquitaine — Fédération Hospitalière de France | fédération hospitalière | `www.fhf.fr/en-regions/nouvelle-aquitaine/nos-actualites` | — |
| 20 | Sud Ouest — rubrique Santé | presse locale | `www.sudouest.fr/sante/` | `www.sudouest.fr/sante/rss.xml` |
| 21 | Le Journal des Entreprises — secteur Santé | presse économique régionale | `www.lejournaldesentreprises.com/secteurs-activite/services/sante` | — |

## Exemples cyber observés

- « Charente-Maritime : les hôpitaux de La Rochelle et de Rochefort victimes d'une panne informatique » (Sud Ouest, article vérifié 200) — `www.sudouest.fr/sante/charente-maritime-les-hopitaux-de-la-rochelle-et-de-rochefort-victimes-d-une-panne-informatique-12630626.php`.
- « Charente-Maritime : le centre hospitalier de Saintes victime d'un vol informatique » (Alouette, article vérifié 200) — `www.alouette.fr/charente-maritime-le-centre-hospitalier-de-saintes-victime-d-un-vol-informatique`.
- Page « Cybersécurité » de l'ARS Nouvelle-Aquitaine (200) — `www.nouvelle-aquitaine.ars.sante.fr/cybersecurite-0?parent=15058`.
- Les autres sources n'ont pas fait l'objet d'un fait cyber observé le 2026-11-22 ; le champ `exemple_cyber` indique explicitement cette absence plutôt que d'inventer un incident.

## Méthode et exclusions

Recherche web menée le 2026-11-22 via annuaires d'établissements, sites officiels d'hôpitaux, annuaires de l'Assurance Maladie, presse locale et liens internes des sites (Exa hors crédits, 402 : recherche complétée par lecture directe des pages et des flux). Chaque URL retenue a ensuite été contrôlée par `curl -L` : statut final, type de contenu et URL effective. Les pages d'actualités génériques en 404 ont été remplacées par les pages réelles (par exemple `/toutes-les-actualites/` pour les hôpitaux de La Rochelle et Rochefort).

Écartés après vérification : `chu-larochelle.fr` (000), `ch-saintes.fr` et `ch-st-jean-angelie.fr` (000 — le CH de Saintes est joignable sur `saintes.gh-saintesangely.fr`), `ch-jonzier.fr` (000), `annuaire.sante.fr` (000), les URL `/actualites` et `/rss.xml` devinées sur plusieurs sites hospitaliers (404), `sudouest.fr/charente-maritime/sante/` (404), `actu.fr/.../rss.xml` local (404), `ici.fr/nouvelle-aquitaine/la-rochelle-17` (404) et `annuairesante.ameli.fr` (200 technique mais page « interdit » : faux positif écarté).

Prévol : aucune PR ouverte pour le couple (santé, 17). La PR #394 livre 35 sources santé en Nouvelle-Aquitaine sans champ `departement`, et la PR #461 couvre le département 16 : le couple (santé, 17) n'était donc pas livré.
