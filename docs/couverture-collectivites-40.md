# Sources du secteur « collectivites » — Landes (40)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **15 sources, 45 URL distinctes toutes en HTTP 200** le 2026-11-22 (11 flux RSS réels).

- Corpus : `bench/corpus/sources-collectivites-40.jsonl` (15 lignes, clés `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-collectivites-40.json` — code, type de contenu et URL contrôlés (sites, pages d'actualités, flux et articles cyber).
- Intégration : `db/migrate-066-sources-collectivites-40.sql` — 15 lignes dans `source` (identifiants `corpus:collectivites-40-*`), table `source_verification` créée si absente puis 45 traces `ok200`.
- Exemples cyber : communiqués officiels (Ville de Tarnos), presse locale (actu.fr, ICI Gascogne, France 3, Les Annonces Landaises) et corpus local `bench/corpus/incidents-landes.jsonl`. Les sources sans incident propre portent une mention explicite : aucun événement n'est inventé.

## Organisations retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| CCI des Landes | chambre consulaire | https://landes.cci.fr/ | https://landes.cci.fr/actu/ | — |
| Chambre d'agriculture des Landes | chambre consulaire | https://landes.chambres-agriculture.fr/ | https://landes.chambres-agriculture.fr/actualites | https://landes.chambres-agriculture.fr/actualites.rss |
| Chambre des métiers et de l'artisanat des Landes | chambre consulaire | https://www.cma-landes.fr/ | https://www.cma-landes.fr/actualites/ | — |
| Mont de Marsan Agglomération | intercommunalité | https://www.montdemarsan.fr/ | https://www.montdemarsan.fr/actualites/ | https://www.montdemarsan.fr/feed/ |
| Agglomération du Grand Dax | intercommunalité | https://www.grand-dax.fr/ | https://www.grand-dax.fr/connaitre-lagglo/actualite-agenda/ | https://www.grand-dax.fr/feed/ |
| Ville de Dax | commune | https://www.dax.fr/ | https://www.dax.fr/actualites/ | https://www.dax.fr/feed/ |
| Ville de Tarnos | commune | https://www.ville-tarnos.fr/ | https://www.ville-tarnos.fr/actualites/ | https://www.ville-tarnos.fr/feed/ |
| Communauté de communes du Seignanx | intercommunalité | https://www.cc-seignanx.fr/ | https://www.cc-seignanx.fr/actualites/ | https://www.cc-seignanx.fr/feed/ |
| SDIS des Landes | service public départemental | https://www.sdis40.fr/ | — | https://www.sdis40.fr/rss |
| Actu Landes (actu.fr) | presse locale | https://actu.fr/landes/ | https://actu.fr/landes/dernieres-actus | https://actu.fr/landes/rss.xml |
| ICI Gascogne — Landes (40) | radio locale | https://www.ici.fr/nouvelle-aquitaine/landes-40 | idem | — |
| France 3 Nouvelle-Aquitaine — Landes | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes | idem | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/landes/rss |
| Les Annonces Landaises | presse locale | https://www.annonces-landaises.com/ | https://www.annonces-landaises.com/categories/collectivites/ | https://www.annonces-landaises.com/feed/ |
| Commune de Peyrehorade | commune | https://www.peyrehorade.fr/ | https://www.peyrehorade.fr/mairie/actualites/ | https://www.peyrehorade.fr/feed/ |
| Annuaire des communes et intercommunalités des Landes | annuaire local | https://www.annuaire-mairie.fr/departement-landes.html | idem | — |

## Candidats écartés

- `https://www.landes.gouv.fr/` (préfecture) et `https://www.landes.gouv.fr/actualites` : HTTP 200 au premier contrôle puis `ENHANCE_YOUR_CALM` / réinitialisation de connexion du serveur aux contrôles suivants ; non retenus faute de preuve stable au 22/11/2026.
- `https://www.landes.fr/` (conseil départemental) et ses pages actualités/flux : HTTP 403 (Cloudflare) au contrôle HTTP, sans preuve 200.
- `https://landes.cci.fr/feed/` et `/rss.xml` : HTTP 404/500 — la CCI des Landes ne publie pas de flux exploitable ; page d'actualités effective `/actu/`.
- `https://www.cma-landes.fr/feed/` : HTTP 200 mais contenu HTML, pas un flux RSS — champ `url_flux` laissé vide.
- `https://www.sudouest.fr/landes/` et `/landes/rss.xml` : redirections 302 non résolues par le contrôle HTTP — non retenus.
- `https://www.cc-luys.fr/` (CC Coteaux et Vallées des Luys) : site et page actualités en 200 mais aucun flux identifié ; source redondante avec les trois intercommunalités retenues.
- `https://www.chasseurs40.fr/`, `https://www.macs-landes.fr/`, `https://www.adour-armagnac.fr/`, `https://www.landes-darmagnac.fr/`, `https://www.observateur-landes.fr/` : NXDOMAIN ou serveur injoignable.
- `https://www.lereporter.fr/` : gabarit Joomla générique sans contenu landais vérifiable — non retenu.
- `https://www.ici.fr/rss/landes/a-la-une.xml` : flux ICI non disponible ; seule la page radio est retenue.
OBJECTIF : atteint — 15 / 5
