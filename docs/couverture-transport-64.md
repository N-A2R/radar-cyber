# Sources d'information — secteur transport, département 64 (Pyrénées-Atlantiques)

OBJECTIF : atteint — 11 / 5 sources vérifiées en HTTP 200 pour le couple secteur « transport » / département 64 (Pyrénées-Atlantiques).

## Livrable

- `bench/corpus/sources-transport-64.jsonl` — 11 lignes au schéma `{nom, type, secteur, departement, url_site, url_actualites, url_flux, code_http, exemple_cyber}`.
- `scripts/verif-corpus-transport-64.py` — rejoue le contrôle (`python3 scripts/verif-corpus-transport-64.py`) : `curl -L` avec User-Agent navigateur, redirections suivies, code final.
- `bench/results/verification-sources-transport-64.json` — 42 URL contrôlées le 2026-11-22, 42 × 200 ; 11/11 sources valides.
- `db/migrate-188-sources-transport-64.sql` — 11 sources `corpus:transport64-*` en `department='64'` et 39 couples source/url tracés dans `source_verification` en `ok200`. Migration appliquée à la base locale (`postgres://radar:radar@localhost:5433/radar`) et rejouée sans doublon : 11 sources et 39 traces avant et après le rejeu ; le département 64 passe de 143 à 154 sources.
- `bench/corpus/HASH` régénéré : `d2349ed8e7a0c5a909fb089e89dc51eabe25999b61150973bc492cbb3816f6e0`.

## Sources retenues

| # | source | type | page actualités | flux |
|---|---|---|---|---|
| 1 | Txik Txak — réseau de transports de l'Agglomération Pays Basque Adour | réseau de transport public (Pays Basque, 64) | `/category/quoi-de-neuf-sur-txik-txak/` | `/feed/` |
| 2 | Idelis — transport à la demande et mobilités du Pays Basque | réseau de transport à la demande | `/decouvrir-idelis/actualites` | — |
| 3 | Aéroport de Biarritz Pays Basque | aéroport (64) | `/actualites/` | `/fr/feed/` |
| 4 | Air'py — aéroport Pau Pyrénées | aéroport (64) | `/aeroport/actualite/` | `/rss/fr/` |
| 5 | CCI Pau Béarn | chambre consulaire (transport et logistique) | `/blog/` | `/feed/` |
| 6 | OTRE Pays Adour | fédération des transporteurs routiers (Pays Adour, dont 64) | `/actualites/` | `/feed/` |
| 7 | La République des Pyrénées — transports | presse locale (Pau) | `/economie/transports/` | `/economie/transports/rss.xml` |
| 8 | ICI Pyrénées-Atlantiques (64) | radio publique locale | page département | `/rss/pays-basque/a-la-une.xml` |
| 9 | Union TLF Sud-Ouest | fédération régionale du transport et de la logistique | `/nos-actualites/` | `/feed/` |
| 10 | FNTR | fédération professionnelle | accueil | — |
| 11 | Transport Info | presse professionnelle transport et logistique | accueil | `/feed/` |

## Limites du contrôle

- `www.bayonne.cci.fr` renvoie 403 : la CCI Bayonne Pays Basque est exclue malgré sa pertinence consulaire ; CCI Pau Béarn la remplace.
- `reseau64.fr` et `stap-pau.fr` ne répondent pas (DNS/connexion) : les réseaux actifs Txik Txak et Idelis couvrent les transports du département.
- L'ancien réseau « Réseau 64 » n'a pas de successeur en ligne vérifiable ; seule la page du conseil départemental aurait pu le relayer, sans flux dédié.
- Le flux `e-tlf.com/feed/` et le flux `actu.fr/.../rss.xml` sont en 200 mais ne contiennent pas d'items exploitable au moment du contrôle ; leurs pages d'actualités restent suivies en HTML pour `e-tlf.com`, et actu.fr n'a pas été retenu faute d'article transport vérifié.
- `audap.org/rss.xml` renvoie une page 404 en 200 : l'AUDAP n'a pas été retenue (pas de flux fiable, actualités non centrées transport).
- Aucun flux RSS dédié n'a été trouvé pour Idelis ni pour la FNTR ; leurs pages d'actualités sont suivies en HTML.
