# Sources du secteur « collectivites » — Charente-Maritime (17)

## Résultat

**15 sources vérifiées en HTTP 200** pour le couple secteur `collectivites` / département `17` (cible : au moins 5).

- Corpus : `bench/corpus/sources-collectivites-17.jsonl` (15 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Intégration : `db/migrate-067-sources-collectivites-17.sql` (15 lignes dans `source`, identifiants `corpus:c17-*`, 31 traces dans `source_verification`).
- Preuve HTTP : `bench/results/verification-collectivites-17.json` — 31 URLs contrôlées, 31 en 200, le 2026-11-22.
- 7 flux RSS/Atom exploitables : Agglo La Rochelle, Ville de Rochefort, CDG 17, SDIS 17, Soluris, Sud Ouest Charente-Maritime, INF la Rochelle.

## Organisations retenues

| Organisation | Type | Page actualités |
|---|---|---|
| Département de la Charente-Maritime | conseil départemental | https://la.charente-maritime.fr/actualites |
| Ville de La Rochelle | commune | https://www.larochelle.fr/actualites/les-actualites |
| Agglo La Rochelle | intercommunalité | https://www.agglo-larochelle.fr/actualites |
| Ville de Saintes | commune | https://www.ville-saintes.fr/actualites/ |
| Ville de Rochefort | commune | https://www.ville-rochefort.fr/actualites |
| Agglomération Saintes Grandes Rives | intercommunalité | https://www.agglo-saintes.fr/actualites/ |
| Centre de gestion de la Charente-Maritime | centre de gestion de la FPT | https://www.cdg17.fr/actualites/ |
| SDIS 17 | service départemental d'incendie et de secours | https://www.sdis17.fr/ (flux https://sdis17.fr/feed/) |
| Soluris | syndicat intercommunal informatique | https://www.soluris.fr/actualites/ |
| CMA Nouvelle-Aquitaine (antenne 17) | chambre consulaire | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites |
| Sud Ouest — Charente-Maritime | presse locale | https://www.sudouest.fr/charente-maritime/ |
| Haute Saintonge | presse locale | https://www.hautesaintonge.fr/ |
| INF la Rochelle | presse locale | https://inf-info.fr/ |
| actu.fr — La Rochelle | presse locale | https://actu.fr/nouvelle-aquitaine/la-rochelle_17300/ |
| ici Charente-Maritime | radio publique locale | https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17 |

## Exemples cyber associés

Le champ `exemple_cyber` du corpus s'appuie sur des événements réels de Charente-Maritime, tous vérifiés en HTTP 200 : cyberattaque de la mairie de Marennes-Hiers-Brouage (17/08/2026), fuite Synbird touchant la Ville de La Rochelle, cyberattaque de contrôle du syndicat informatique départemental Soluris à Saintes (21/05/2026), piratage d'une commune empêchant le vote des comptes à Saint-Denis-d'Oléron, usurpation d'identité de la Ville d'Aytré, attaque de la billetterie de la Coursive à La Rochelle.

## Candidats écartés

- **CCI La Rochelle** (`larochelle.cci.fr`, `cci-larochelle.fr`) : NXDOMAIN ; **`www.cci.fr` et `nouvelle-aquitaine.cci.fr`** : HTTP 403. Non retenus faute de 200 observable.
- **CMA Charente-Maritime** (`cma17.fr`, `charente-maritime.artisanat.fr`) : NXDOMAIN / erreur réseau ; seule l'antenne régionale CMA Nouvelle-Aquitaine a été retenue.
- **Ville de Royan** (`ville-royan.fr`) : dépassement du délai de connexion lors des contrôles ; **Préfecture de la Charente-Maritime** (`charente-maritime.gouv.fr`) : connexion fermée par le serveur.
- **Chambre d'agriculture de la Charente-Maritime** : HTTP 503 ; **Communauté de communes de Haute-Saintonge** (`haute-saintonge.fr`) : dépassement du délai.

## Méthode

Recherche web (annuaires consulaires, sites officiels, fédérations d'élus et presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur et suivi des redirections (20 s de délai maximum). Seules les sources dont toutes les URLs ont répondu 200 ont été intégrées au corpus et à la base.
OBJECTIF : atteint — 15 / 5
