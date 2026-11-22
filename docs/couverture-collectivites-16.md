# Sources d'information — secteur « collectivités », Charente (16)

Mesure du **22 novembre 2026**. Objectif : au moins **5 sources vérifiées en HTTP 200** pour le couple secteur `collectivités` / département `16`.

OBJECTIF : atteint — 14 / 5

## Résultat

- **14 sources intégrées** : `bench/corpus/sources-collectivites-16.jsonl` (une ligne JSON par source, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- **37 URL uniques contrôlées** en `curl -L` (redirections suivies) : **37 réponses HTTP 200**. Rapport détaillé : `bench/results/verification-sources-collectivites-16.json`.
- **11 flux RSS/Atom** confirmés comme tels (content-type `application/rss+xml` ou `application/xml`) sur 14 sources.
- **14 lignes `source`** créées en base par `db/migrate-065-sources-collectivites-16.sql`, toutes avec `department = '16'`, `region = 'Nouvelle-Aquitaine'` et un pointeur vers la ligne du corpus dans `parser`.

## Sources retenues

| Source | Type | Actualités / flux |
| --- | --- | --- |
| Conseil départemental de la Charente | département | https://www.lacharente.fr/actualite |
| Ville d'Angoulême | commune | https://www.angouleme.fr/accueil/on-se-tient-informe/ · https://www.angouleme.fr/feed/ |
| GrandAngoulême | intercommunalité | https://www.grandangouleme.fr/category/actualites/ · https://www.grandangouleme.fr/feed/rss/ |
| Grand Cognac | intercommunalité | https://www.grand-cognac.fr/comprendre-lagglo/les-actualites · https://www.grand-cognac.fr/rss.xml |
| Communauté de communes Charente Limousine | intercommunalité | https://charente-limousine.fr/actualites/ · https://charente-limousine.fr/feed/ |
| CDG 16 | centre de gestion de la FPT | https://www.cdg16.fr/categorie/actualite-de-votre-cdg/ · https://www.cdg16.fr/feed/ |
| AMF 16 | fédération d'élus | https://amf16.fr/evenements/ · https://amf16.fr/feed/ |
| Charente Numérique | syndicat mixte de collectivités | https://www.charente-numerique.fr/actualites/ · https://www.charente-numerique.fr/feed/ |
| Angoulême Tourisme | office de tourisme public | https://www.angouleme-tourisme.com/actualites/ · https://www.angouleme-tourisme.com/feed/ |
| CMA Charente (antenne 16) | chambre consulaire | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites |
| Charente Libre — Charente | presse locale | https://www.charentelibre.fr/charente/ · https://www.charentelibre.fr/charente/rss.xml |
| Charente Libre — politique | presse locale | https://www.charentelibre.fr/politique/ · https://www.charentelibre.fr/politique/rss.xml |
| Sud Ouest — Charente | presse régionale | https://www.sudouest.fr/charente/ · https://www.sudouest.fr/charente/rss.xml |
| ICI Charente (Radio France) | média public local | https://www.ici.fr/nouvelle-aquitaine/charente-16 |

## Exemple cyber

Un seul exemple rattaché à une URL vérifiée a été retenu : l'offre « Directeur des Systèmes d'Information et de l'e-administration » publiée par GrandAngoulême dans son flux RSS (URL dans le champ `exemple_cyber` du corpus). Les autres champs sont vides : aucun article de cybersécurité propre à une source n'a pu être vérifié, aucune URL ni affirmation inventée.

## Candidats écartés


- **CCI de la Charente** (`www.charente.cci.fr`) : HTTP 403 (Cloudflare), y compris page d'actualités et flux.
- **Préfecture de la Charente** (`www.charente.gouv.fr`) : HTTP/2 stream reset depuis cet hôte (`curl error 92`).
- **`www.charente.fr`** : erreur de certificat SSL ; le site officiel du Département est `www.lacharente.fr`, retenu à sa place.
- **Ville de Cognac** (`www.ville-cognac.fr`) : HTTP 403 sur la home, les actualités et le flux.
- **La Gazette des Communes** : HTTP 403.
- **Chambre d'agriculture de la Charente** (`charente.chambagri.fr`) : HTTP 503, site en maintenance.

## Méthode et reproductibilité

Recherche web (annuaires institutionnels, chambres consulaires, fédérations d'élus et d'agents publics, presse locale) puis contrôle systématique de chaque URL par `curl -L -sS -o /dev/null -w '%{http_code}' --max-time 18 -A 'Mozilla/5.0'`. Seules les sources dont les URL d'entrée répondent 200 sont intégrées. L'empreinte du corpus versionné est publiée dans `bench/corpus/HASH` (recalculée via `scripts/corpus-hash.mts`).
