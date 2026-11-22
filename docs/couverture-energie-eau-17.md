# Couverture « energie-eau » — Charente-Maritime (17)

10 sources vérifiées, 21 URLs distinctes contrôlées en HTTP 200 le 2026-11-22.
Corpus : `bench/corpus/sources-energie-eau-17.jsonl` — preuve HTTP : `bench/results/verification-energie-eau-17.json`.

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| Eau17 — Syndicat des eaux de la Charente-Maritime (SDE17) | syndicat d'eau | https://www.eau17.fr/actualites | https://www.eau17.fr/actualites.xml |
| RESE — Votre service public de l'eau (Saintes) | régie de l'eau | https://www.rese.fr/actualites | https://www.rese.fr/actualites.xml |
| SDEER — Syndicat départemental d'électrification et d'équipement rural | syndicat d'énergie | https://www.sdeer17.fr/actualites/ | https://www.sdeer17.fr/feed/ |
| Agur — Le service public de l'eau (Saintes) | régie de l'eau | https://www.agur.fr/nos-actualites/ | — |
| Enedis | distributeur d'électricité | https://www.enedis.fr/presse | — |
| CMA Nouvelle-Aquitaine — antenne de la Charente-Maritime | chambre consulaire | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| Sud Ouest — Charente-Maritime | presse locale | https://www.sudouest.fr/charente-maritime/archives/ | https://www.sudouest.fr/rss.xml |
| ici Charente-Maritime — Radio France | radio/presse locale | https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17 | — |
| Recours France — Énergie et eau (17) | annuaire professionnel | — | — |
| Pro-RGE — Entreprises RGE en Charente-Maritime | annuaire professionnel | — | — |

Les flux d'Eau17, RESE et SDEER contiennent chacun 10 items au contrôle ; celui de Sud Ouest 20 items.

## Exemples cyber associés

Le champ `exemple_cyber` du corpus s'appuie sur des événements réels et vérifiés en HTTP 200 : arnaque à la facture d'eau en Charente-Maritime (BFMTV), faux « Flash de la RESE » (Que Choisir Ensemble), cyberattaque de contrôle du syndicat informatique départemental (Sud Ouest), arnaque aux factures d'eau à Jonzac (Haute Saintonge), démarchages frauduleux usurpant Enedis, fuite de données d'Incognito.fr à Saint-Martin-de-Ré, cyberattaque de la mairie de Marennes-Hiers-Brouage et attaque de la billetterie de la Coursive à La Rochelle.

## Candidats écartés

- CCI Charente-Maritime (`charente-maritime.cci.fr`) : challenge anti-bot, HTTP 403.
- Kompass « Eau et énergie 17 » : HTTP 403 ; PagesJaunes : accès payant/protégé.
- `https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17/rss` : HTTP 404.
- Flux `/feed/` d'Agur : HTTP 200 mais 0 item ; non déclaré comme flux.
- `sde17.fr` et `granddefi.fr` : le premier ne résout plus, le second est un domaine en vente ; Eau17 est le successeur opérationnel du SDE17 pour l'eau.
- Services de l'État en Charente-Maritime (`charente-maritime.gouv.fr`) : connexion réinitialisée par le serveur lors du contrôle.

## Méthode

Recherche web (annuaires consulaires, annuaires professionnels, sites officiels, fédérations et presse locale via DuckDuckGo/Google Actualités), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur et suivi des redirections (25 s maximum). Seules les sources dont toutes les URLs ont répondu 200 ont été intégrées au corpus et à la base.
OBJECTIF : atteint — 10 / 5
