# Sources du secteur « agriculture » — Pyrénées-Atlantiques (64)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **23 sources, 57 URL distinctes toutes en HTTP 200** le 2026-11-22 (14 flux RSS/Atom vérifiés, 78 traces `ok200` en base).

- Corpus : `bench/corpus/sources-agriculture-64.jsonl` (23 lignes, clés `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-agriculture-64.json` — code, type de contenu et URL contrôlés (sites, pages d'actualités, flux et articles cyber), GET avec User-Agent navigateur et suivi des redirections.
- Intégration : `db/migrate-152-sources-agriculture-64.sql` — 23 lignes dans `source` (identifiants `corpus:agri64-*`), 78 traces `ok200` dans `source_verification`, 57 URL distinctes. Migration appliquée le 2026-11-22 sur la base de développement PostgreSQL (vérifié en base : 23 sources, 78 traces, 57 URL distinctes, toutes HTTP 200).
- Empreinte du corpus consolidé : `bc10cfd25c2d9d240e4961d16412f09957492c99104a509dfb30b7991c315655`.
- Exemples cyber : deux faits réels et vérifiés, tous deux en HTTP 200 — cyberattaque contre des Chambres d'agriculture (18/11/2020) et cyberattaque contre la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024), tous deux rapportés par `La France Agricole`. Les organisations sans incident propre identifié portent une mention explicite : aucun événement n'est inventé.

## Organisations retenues

| Organisation | Type | Site | Actualités | Flux |
|---|---|---|---|---|
| Chambre d'agriculture des Pyrénées-Atlantiques | chambre consulaire départementale | https://pa.chambres-agriculture.fr/ | https://pa.chambres-agriculture.fr/actualites-1 | https://pa.chambres-agriculture.fr/actus-CA64.rss |
| Chambre d'agriculture France — annuaire 64 | annuaire professionnel consulaire | https://www.chambres-agriculture.fr/le-reseau-chambres/qui-sommes-nous/annuaire-des-chambres/chambre-dagriculture-des-pyrenees-atlantiques | https://www.chambres-agriculture.fr/actualites | — |
| Chambre régionale d'agriculture Nouvelle-Aquitaine — publication Agricultures Pyrénées-Atlantiques | chambre consulaire régionale | https://nouvelle-aquitaine.chambres-agriculture.fr/ | https://nouvelle-aquitaine.chambres-agriculture.fr/sinformer/toutes-les-publications/publication/agricultures-pyrenees-atlantiques | https://nouvelle-aquitaine.chambres-agriculture.fr/actualites.rss |
| DDTM 64 — Préfecture des Pyrénées-Atlantiques | service déconcentré de l'État | https://www.pyrenees-atlantiques.gouv.fr/Services-de-l-Etat/Agriculture-environnement-amenagement-et-logement | https://www.pyrenees-atlantiques.gouv.fr/Actions-de-l-Etat/Agriculture-foret-et-developpement-rural | — |
| DRAAF Nouvelle-Aquitaine | direction régionale de l'État | https://draaf.nouvelle-aquitaine.agriculture.gouv.fr/ | https://draaf.nouvelle-aquitaine.agriculture.gouv.fr/spip.php?page=liste-actualites&lang=fr | https://draaf.nouvelle-aquitaine.agriculture.gouv.fr/spip.php?page=backend-actu |
| Groupe Euralis (Lescar) | coopérative agricole | https://www.euralis.fr/ | https://www.euralis.fr/actualites/ | https://www.euralis.fr/feed/ |
| Coopérative Lur Berri (Pau) | coopérative agricole | https://www.lurberri.fr/fr/ | https://www.lurberri.fr/fr/actualites/ | https://www.lurberri.fr/fr/feed/ |
| Cave d'Irouléguy (Saint-Étienne-d'Albordy) | cave coopérative viticole | https://cave-irouleguy.com/fr/ | https://cave-irouleguy.com/fr/blog/actualites | — |
| MODEF 64 | syndicat agricole | https://www.modef.fr/nos-federations/dep64/ | https://www.modef.fr/categorie/actualites/ | https://www.modef.fr/feed/ |
| Jeunes Agriculteurs 64 | syndicat agricole départemental | https://www.ja64.fr/ | https://www.ja64.fr/ (site vitrine, sans rubrique actualités dédiée) | — |
| ICI Pays Basque (ex-France Bleu) | radio locale | https://www.ici.fr/radio/pays-basque | https://www.ici.fr/theme/agriculture | https://www.ici.fr/rss/pays-basque/a-la-une.xml |
| ICI Béarn Bigorre (ex-France Bleu) | radio locale | https://www.ici.fr/radio/bearn | https://www.ici.fr/nouvelle-aquitaine/pyrenees-atlantiques-64 | https://www.ici.fr/rss/bearn/a-la-une.xml |
| France 3 Pyrénées-Atlantiques | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques/rss |
| FranceAgriMer | établissement public agricole | https://www.franceagrimer.fr/ | https://www.franceagrimer.fr/presse | — |
| La France Agricole | presse agricole spécialisée | https://www.lafranceagricole.fr/ | https://www.lafranceagricole.fr/actualites/ | https://www.lafranceagricole.fr/rss |
| Réussir — presse agricole | presse agricole spécialisée | https://www.reussir.fr/ | https://www.reussir.fr/actualites/ | https://www.reussir.fr/rss.xml |
| Bio Nouvelle-Aquitaine | fédération régionale de l'agriculture biologique | https://www.bionouvelleaquitaine.com/ | https://www.bionouvelleaquitaine.com/actualites/ | https://www.bionouvelleaquitaine.com/feed/ |
| Terre de Liens Aquitaine | association foncière agricole | https://terredeliens.org/aquitaine/ | https://terredeliens.org/aquitaine/ | — |
| Fédération des Cuma Béarn–Landes–Pays Basque (Cuma 640) | fédération de Cuma | https://640.cuma.fr/ | https://640.cuma.fr/actualites/ | — |
| CDEO 64 — Centre départemental de l'élevage ovin | coopérative agricole d'élevage | https://www.cdeo64.fr/ | https://www.cdeo64.fr/ | https://www.cdeo64.fr/feed/ |
| Association Sur la Route des Vins du Jurançon | association de vignerons | https://www.vins-jurancon.fr/ | https://www.vins-jurancon.fr/agenda/news | — |
| GDS 64 — Groupement de défense sanitaire du cheptel | association d'éleveurs | https://www.gds64.fr/gds-pyrenees-atlantiques/ | https://www.gds64.fr/gds-pyrenees-atlantiques/ | — |
| FNAB — Fédération nationale d'agriculture biologique | fédération agricole biologique | https://www.fnab.org/ | https://www.fnab.org/actualites/ | https://www.fnab.org/feed/ |

## Périmètre

Sources strictement départementales (Chambre d'agriculture 64, DDTM 64, MODEF 64, JA 64, Euralis/Lur Berri/Irouléguy, médias locaux 64) et sources régionales ou nationales qui couvrent le département et les filières agricoles qui y sont présentes (DRAAF, Chambre régionale, FranceAgriMer, presse agricole, réseaux bio et fonciers). Les médias purement nationaux sans angle 64 ni filière agricole ne sont pas retenus.

## Candidats écartés

- `https://www.sudouest.fr/economie/agriculture/`, flux RSS Sud Ouest Pau/Bayonne, `https://www.larepubliquedespyrenees.fr/rss.xml` : HTTP 302 (anti-bot) au lieu du 200 attendu ; non retenus malgré leur pertinence locale.
- `https://pyrenees-atlantiques.chambres-agriculture.fr/`, `https://64.chambres-agriculture.fr/`, `https://www.chambre-agriculture64.fr/` : serveurs injoignables (000). L'adresse en service est `https://pa.chambres-agriculture.fr/`.
- `https://www.fdsea64.fr/`, `https://fdsea64.fr/` : injoignables (000) ; MODEF 64 et JA 64 couvrent le syndicalisme agricole départemental.
- `https://cave-irouleguy.com/fr/feed/`, `https://www.terre-net.fr/rss.xml` : HTTP 404 ; ces sources sont conservées sans flux (ou écartées) plutôt qu'avec une URL invalide.
- `https://actu.fr/rss.xml`, `https://actu.fr/nouvelle-aquitaine/pau_64445/` : HTTP 403 ; non retenues.
- `https://www.inrae.fr/actualites` et `https://www.inrae.fr/` : 200 mais aucun centre INRAE identifié dans le 64 à la date du contrôle ; hors périmètre départemental retenu.
- `https://linktr.ee/fdsea64` : HTTP 200 mais simple page de liens, sans page d'actualités propre ; `https://www.facebook.com/FDSEA64` renvoie HTTP 400 aux requêtes HTTP anonymes. FDSEA 64 n'est donc pas retenue comme source vérifiable.
- `https://www.bionouvelleaquitaine.com/feed/` : HTTP 200 mais flux sans articles à la date du contrôle ; l'URL reste renseignée et vérifiée, la page d'actualités reste la source primaire.

OBJECTIF : atteint — 23 sources vérifiées en HTTP 200 / 5 sources vérifiées en HTTP 200
