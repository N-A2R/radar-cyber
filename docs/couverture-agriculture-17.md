# Sources du secteur « agriculture » — Charente-Maritime (17)

## Résultat

**9 sources vérifiées en HTTP 200** pour le couple secteur `agriculture` / département `17` (cible : au moins 5).

- Corpus : `bench/corpus/sources-agriculture-17.jsonl` (9 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-agriculture-17.json` — 24 URLs contrôlées, 24 en 200, le 2026-11-22.
- Intégration : `db/migrate-071-sources-agriculture-17.sql` (9 lignes dans `source`, identifiants `corpus:agriculture-17-*`, 24 traces dans `source_verification`).
- 6 flux RSS/Atom exploitables : JA 17, ICI La Rochelle, Sud Ouest Saintes, Sud Ouest La Rochelle, France 3 Charente-Maritime, La Nouvelle République Charente-Maritime.

## Organisations retenues

| Organisation | Type | Page actualités |
|---|---|---|
| Jeunes Agriculteurs de la Charente-Maritime | syndicat agricole | https://www.ja17.fr/actualites/ (flux https://www.ja17.fr/feed/) |
| UNIRE — Union des vignerons de l'île de Ré | coopérative viticole | https://www.vigneronsiledere.com/actus.html |
| Terre de Liens Poitou-Charentes | association foncière agricole | https://terredeliens.org/poitou-charentes/actu/ |
| ICI La Rochelle — Charente-Maritime | radio locale | https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17/actu |
| Sud Ouest — Saintes | presse locale | https://www.sudouest.fr/charente-maritime/saintes/ |
| Sud Ouest — La Rochelle | presse locale | https://www.sudouest.fr/charente-maritime/la-rochelle/ |
| actu.fr — Saintes | presse locale | https://actu.fr/nouvelle-aquitaine/saintes_17300/ |
| France 3 Nouvelle-Aquitaine — Charente-Maritime | télévision publique locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/charente-maritime/ |
| La Nouvelle République — Charente-Maritime | presse régionale | https://www.lanouvellerepublique.fr/charente-maritime |

## Exemples cyber associés

Aucun exemple d'attaque spécifiquement documenté et vérifié en HTTP 200 n'a été trouvé pour ces organisations : le champ `exemple_cyber` est donc renseigné vide plutôt que d'avancer un incident non sourcé. Les flux retenus sont de toute façon exploitables pour détecter un futur incident sectoriel.

## Candidats écartés

- **Chambre d'agriculture de la Charente-Maritime** (`charente-maritime.chambres-agriculture.fr`, site et `/actualites-1`) : HTTP 503 persistant ; seule la Chambre régionale de Nouvelle-Aquitaine répond en 200, mais elle n'est pas ancrée dans le 17.
- **Comité National du Pineau des Charentes** (`pineau.fr`, `/fr/actualite`) : HTTP 200 mais le corps renvoyé est une simple page JavaScript de contrôle d'âge, sans contenu d'actualité exploitable.
- **Syndicat des Vins IGP Charentais** (`vinscharentais.fr`) : 200 confirmé, mais déjà intégré au corpus et à la base pour le département 16 avec la même URL de flux ; évité ici pour ne pas créer de doublon.
- **Sud Ouest — Charente-Maritime** (flux global) et **actu.fr — La Rochelle** : déjà intégrés au corpus `collectivites-17` ; les pages Saintes et La Rochelle ont été retenues à la place.
- **FDSEA 17, Confédération paysanne 17, CERFRANCE 17, SAFER Nouvelle-Aquitaine, Coopérative Terres de Saintonge** : NXDOMAIN ou absence de page publique d'actualités.
- **Réussir Nouvelle-Aquitaine, La France Agricole** : 200 mais ancrage départemental insuffisant (couverture régionale/nationale seulement).

## Méthode

Recherche web (annuaires consulaires, sites d'organisations professionnelles, fédérations et presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur et suivi des redirections (20 s de délai maximum). Seules les sources dont toutes les URLs ont répondu 200 et dont le contenu est exploitable ont été intégrées au corpus et à la base.
OBJECTIF : atteint — 9 / 5 (mesure reproductible rejouée le 22/11/2026 : `jq -s 'length' bench/corpus/sources-agriculture-17.jsonl` → 9 sources, dont 9 avec `code_http` 200 ; `jq '[.detail[].urls[] | select(.code == 200)] | length' bench/results/verification-agriculture-17.json` → 24 URLs en 200 sur 24 vérifiées ; cible : au moins 5 sources ; aucun code ni test modifié).
