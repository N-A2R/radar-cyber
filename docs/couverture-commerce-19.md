# Sources du secteur « commerce » — Corrèze (19)

## Résultat

**11 sources vérifiées en HTTP 200** pour le couple secteur `commerce` / département `19` (cible : au moins 5).

- Corpus : `bench/corpus/sources-commerce-19.jsonl` (11 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-commerce-19.json` — 26 URLs contrôlées, 26 en 200, le 2026-11-22.
- Intégration : `db/migrate-080-sources-commerce-19.sql` (11 lignes dans `source`, identifiants `corpus:commerce-19-*`, 26 traces dans `source_verification`).
- 4 flux RSS/Atom exploitables : ICI Limousin, Sud Ouest Corrèze, FEVAD, Cyberattaque.org.

## Organisations retenues

| Organisation | Type | Page actualités |
|---|---|---|
| CMA Nouvelle-Aquitaine — actualités (Corrèze) | chambre consulaire (métiers et commerces) | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites |
| Ville de Brive-la-Gaillarde — actualités | collectivité (annuaire et actualités des commerces) | https://www.brive.fr/actualites/ |
| La Montagne — Corrèze (économie) | presse locale quotidienne | https://www.lamontagne.fr/economie/ |
| actu.fr — Brive-la-Gaillarde | presse locale | https://actu.fr/nouvelle-aquitaine/brive-la-gaillarde_19031/ |
| ICI Corrèze (Radio France) | radio locale | https://www.ici.fr/nouvelle-aquitaine/correze-19/actu |
| Sud Ouest — Corrèze | presse régionale | https://www.sudouest.fr/correze/ |
| France 3 Nouvelle-Aquitaine — Corrèze | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/correze/ |
| Terres de Corrèze — office de tourisme | office de tourisme | https://www.terresdecorreze.com/destination/actualites/ |
| FCD — Fédération du commerce et de la distribution | fédération professionnelle | https://www.fcd.fr/qui-sommes-nous/actualites-de-la-fcd/ |
| FEVAD — Fédération du e-commerce et de la vente à distance | fédération professionnelle (e-commerce) | https://www.fevad.com/actualites/ |
| Cyberattaque.org — actualités des incidents cyber | presse spécialisée cyber | https://www.cyberattaque.org/ |

## Exemples cyber associés

Trois incidents publics documentés dans `bench/corpus/incidents-correze.jsonl` ont été rattachés aux sources pertinentes :

- **Intermarché d'Altillac** — supermarché victime d'une cyberattaque (La Montagne) : cible directe d'une enseigne commerciale du département.
- **Corrèze Fermeture (site d'Objat)** — 50 à 60 commandes perdues après cyberattaque (France 3) : impact sur une petite entreprise commerciale.
- **Novabio Brive-Rivet** — données de santé en fuite après deux cyberattaques (Cyberattaque.org) : incident touchant un site commercial du département.
- **Office de Tourisme Terres de Corrèze** — alerte arnaque publiee sur le site officiel.

## Candidats écartés

- **CCI Corrèze** (`correze.cci.fr`, avec ou sans `www`) : HTTP 403 persistant sur le site et les pages actualités ; non intégrée malgré sa pertinence consulaire.
- **Ville de Tulle** (`tulle.fr`, `www.tulle.fr`, `mairie-tulle.fr`, `tulle-agglo.fr`) : NXDOMAIN sur les domaines testés.
- **La Montagne — `/economie/rss.xml`** : 200 mais contenu HTML, pas un flux RSS.
- **actu.fr — flux Corrèze** : 200 en `application/rss+xml` mais canal vide (0 item) ; non retenu.

## Méthode

Recherche web (annuaires consulaires, chambres consulaires, fédérations, organes de presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur, suivi des redirections et délai maximal de 18 s. Seules les sources dont toutes les URLs ont répondu 200 et dont le contenu est exploitable ont été intégrées au corpus et à la base.
