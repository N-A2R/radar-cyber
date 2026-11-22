# Sources du secteur « commerce » — Charente-Maritime (17)

## Résultat

**11 sources vérifiées en HTTP 200** pour le couple secteur `commerce` / département `17` (cible : au moins 5).

- Corpus : `bench/corpus/sources-commerce-17.jsonl` (11 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-commerce-17.json` — 26 URLs contrôlées, 26 en 200, le 2026-11-22.
- Intégration : `db/migrate-072-sources-commerce-17.sql` (11 lignes dans `source`, identifiants `corpus:commerce-17-*`, 26 traces dans `source_verification`).
- 6 flux RSS/Atom exploitables : Sud Ouest Charente-Maritime, Sud Ouest La Rochelle, ICI La Rochelle, La Nouvelle République, FEVAD, Cyberattaque.org.

## Organisations retenues

| Organisation | Type | Page actualités |
|---|---|---|
| CMA Nouvelle-Aquitaine — actualités (Charente-Maritime) | chambre consulaire (métiers et commerces) | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites |
| Ville de La Rochelle — service commerces | collectivité (annuaire et actualités des commerces) | https://www.larochelle.fr/vie-quotidienne/professionnels/commerces |
| Sud Ouest — Charente-Maritime | presse locale quotidienne | https://www.sudouest.fr/charente-maritime/ |
| Sud Ouest — La Rochelle, rubrique économie | presse locale (économie et entreprises) | https://www.sudouest.fr/charente-maritime/la-rochelle/economie/ |
| actu.fr — Saintes | presse locale | https://actu.fr/nouvelle-aquitaine/saintes_17300/ |
| ICI La Rochelle — Charente-Maritime | radio locale | https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17/actu |
| La Nouvelle République — Charente-Maritime | presse régionale | https://www.lanouvellerepublique.fr/charente-maritime |
| FCD — Fédération du commerce et de la distribution | fédération professionnelle | https://www.fcd.fr/qui-sommes-nous/actualites-de-la-fcd/ |
| FEVAD — Fédération du e-commerce et de la vente à distance | fédération professionnelle | https://www.fevad.com/actualites/ |
| Cyberattaque.org — actualités des incidents cyber | presse spécialisée cyber | https://www.cyberattaque.org/ |
| Rochefort Océan — actualités économie et commerces | office de tourisme | https://www.rochefort-ocean.com/actualites/economie |

## Exemples cyber associés

Trois incidents publics de Charente-Maritime documentés dans `bench/corpus/incidents-charentemaritime.jsonl` ont été rattachés aux sources pertinentes :

- **E.Leclerc de Surgères** — cyberattaque avec vidage des vitrines et bacs (actu.fr) : cible directe d'une enseigne commerciale du département.
- **Incognito.fr (Saint-Martin-de-Ré)** — 21 352 commandes en fuite après cyberattaque (Cyberattaque.org) : commerce en ligne local, utile aux fédérations e-commerce.
- **Théâtre de la Coursive (La Rochelle)** — billetterie victime d'une attaque informatique (ICI) : incidence sur la billetterie, activité commerciale locale.

## Candidats écartés

- **CCI Charente-Maritime** (`charente-maritime.cci.fr`, avec ou sans `www`) : HTTP 403 persistant sur le site, les pages actualités et le flux ; non intégrée malgré sa pertinence consulaire.
- **Saintes Tourisme** (`saintes-tourisme.fr`) : accueil 200 mais les pages `/actualites/` et `/trouver-votre-activite/` répondent respectivement 404 et 503 ; non intégré.
- **Charente-Maritime Tourisme, CCI La Rochelle, Le Bonjour de la Charente-Maritime** : NXDOMAIN sur les domaines testés.
- **le-littoral.fr** : 200 mais il s'agit d'un hôtel de Berck-sur-Mer (Pas-de-Calais), sans lien avec le département 17.

## Méthode

Recherche web (annuaires consulaires, chambres consulaires, fédérations, organes de presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur, suivi des redirections et délai maximal de 18 s. Le service Exa étant à court de crédits (402), les candidats ont été identifiés depuis les sites officiels, les corpus départementaux existants et des moteurs alternatifs, puis tous contrôlés en HTTP direct. Seules les sources dont toutes les URLs ont répondu 200 et dont le contenu est exploitable ont été intégrées au corpus et à la base.
