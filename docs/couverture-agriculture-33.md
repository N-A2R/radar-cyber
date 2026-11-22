# Sources du secteur « agriculture » — Gironde (33)

## Résultat

**7 sources vérifiées en HTTP 200** pour le couple secteur `agriculture` / département `33` (cible : au moins 5).

- Corpus : `bench/corpus/sources-agriculture-33.jsonl` (7 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-agriculture-33.json` (18 URL contrôlées, 18 en HTTP 200, le 2026-11-22).
- Empreinte du corpus consolidé : `4fda80a42c1e3c0dd2d51ddd3a63f316be9344a28980640b033218a73faf7bf9`.
- Base : `db/migrate-090-sources-agriculture-33.sql` — 7 lignes dans `source` (département `33`, région Nouvelle-Aquitaine) et 18 traces dans `source_verification` (`etat = 'ok200'`).

| Organisation | Type | Page actualités |
|---|---|---|
| Chambre d'agriculture de la Gironde | chambre consulaire | https://gironde.chambres-agriculture.fr/actualites-33 |
| Jeunes Agriculteurs de la Gironde (JA 33) | syndicat agricole | https://ja33.fr/?page_id=9 (flux https://ja33.fr/?feed=rss2) |
| Confédération paysanne — Gironde (33) | syndicat agricole | https://gironde.confederationpaysanne.fr/recherche.php?type=A&rech=0&raz=1 (flux https://gironde.confederationpaysanne.fr/sites/34/rss/rss_communiques_de_presse.xml) |
| Vins de Bordeaux — Interprofession (CIVB) | interprofession viticole | https://www.bordeaux.com/fr/mag/blog/ |
| ICI Gironde — Radio France | presse locale | https://www.ici.fr/nouvelle-aquitaine/gironde-33/actu (flux https://www.ici.fr/rss/gironde/rubrique/infos.xml) |
| France 3 Nouvelle-Aquitaine — Gironde | presse locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/ (flux .../gironde/rss) |
| actu.fr — Bordeaux (Gironde) | presse locale | https://actu.fr/nouvelle-aquitaine/bordeaux_33000/ |

## Exemple cyber associé

La Chambre d'agriculture de la Gironde a publié une **alerte sur une tentative de fraude** (12/05/2025) :
https://gironde.chambres-agriculture.fr/actualites-33/detail-de-lactualite/alerte-sur-une-tentative-de-fraude-1-1 — URL vérifiée en HTTP 200. C'est le seul incident spécifiquement documenté et vérifié trouvé pour ces organisations ; le champ `exemple_cyber` est laissé vide pour les autres sources plutôt que d'avancer un incident non sourcé.

## Candidats écartés

- **FDSEA 33, Jeunes Agriculteurs (www.ja33.fr), SAFER Nouvelle-Aquitaine** : NXDOMAIN, échec TLS ou absence de page publique d'actualités.
- **Sud Ouest — Gironde** : boucle de redirection (testimonial anti-bot), HTTP non exploitable lors du contrôle.
- **Vitisphere, La France Agricole, Réussir Vigne** : HTTP 200 mais ancrage départemental insuffisant (couverture nationale).
- **CIVB (civb.fr), Bordeaux Sciences Agro, INRAE Bordeaux** : hors sujet (homonyme industriel) ou URL d'actualités absente (404).
- **Flux `/rss.xml` de la Chambre d'agriculture, flux d'actu.fr Bordeaux, `/feed/` de bordeaux.com** : 404 ou redirection vers du HTML — aucun flux exploitable revendiqué.

## Méthode

Recherche web (chambres consulaires, syndicats agricoles, interprofession viticole, annuaires professionnels et presse locale), identification des pages d'actualités et des flux, puis contrôle GET réel de chaque URL avec User-Agent navigateur et suivi des redirections (20 s de délai maximum). Seules les sources dont les URL ont répondu 200 sont retenues. Les flux déclarés mais momentanément vides (`?feed=rss2` de JA 33) sont signalés tels quels dans le rapport de preuve (`items_rss: 0`).
