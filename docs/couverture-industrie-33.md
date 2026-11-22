# Couverture — sources « industrie » de la Gironde (33)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **23 sources, 67 URL toutes en HTTP 200** (dont 11 flux RSS) contrôlées le 2026-11-22.

Corpus : `bench/corpus/sources-industrie-33.jsonl`
Preuve HTTP : `bench/results/verification-industrie-33.json`
Empreinte du corpus : `0b93d6b2bf56550d5d7314170d62ee0b76bc94e9abbe568e139450c5dcac4f7a`

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| CPME Gironde (Les Entrepreneurs 33) | organisation patronale départementale (TPE-PME industrie) | https://www.cpmegironde.fr/ | https://www.cpmegironde.fr/actualites/ | https://www.cpmegironde.fr/feed/ |
| MEDEF Gironde | organisation patronale départementale interprofessionnelle | https://medef-gironde.fr/ | https://medef-gironde.fr/nos-communications/ | — |
| MEDEF Nouvelle-Aquitaine (périmètre Gironde) | organisation patronale régionale | https://www.medef-nouvelle-aquitaine.fr/ | https://www.medef-nouvelle-aquitaine.fr/actualites | — |
| UIMM Nouvelle-Aquitaine (antenne Gironde) | syndicat professionnel de la métallurgie | https://www.uimmnouvelleaquitaine.com/ | https://www.uimmnouvelleaquitaine.com/actualite/news.html | — |
| UIMM — La Fabrique de l'avenir | fédération nationale des industries de la métallurgie | https://uimm.lafabriquedelavenir.fr/ | https://uimm.lafabriquedelavenir.fr/actualites/ | https://uimm.lafabriquedelavenir.fr/feed/ |
| Fibois Nouvelle-Aquitaine (périmètre Gironde) | fédération sectorielle de la filière forêt-bois | https://fibois-na.fr/ | https://fibois-na.fr/actualites/ | https://fibois-na.fr/feed/ |
| CMA Nouvelle-Aquitaine — délégation de la Gironde | chambre consulaire (artisanat et petites industries) | https://cma-nouvelleaquitaine.fr/ | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| Chambre d'agriculture de la Gironde (agro-industrie) | chambre consulaire (agro-industrie) | https://gironde.chambres-agriculture.fr/ | https://gironde.chambres-agriculture.fr/actualites-33 | — |
| Bordeaux Métropole — développement économique | communauté d'agglomération (développement industriel) | https://www.bordeaux-metropole.fr/ | https://www.bordeaux-metropole.fr/actualites-Bordeaux-Metropole | https://www.bordeaux-metropole.fr/rss.xml |
| Conseil départemental de la Gironde | collectivité départementale (développement économique) | https://www.gironde.fr/ | https://www.gironde.fr/actualites | — |
| API Recherche d'entreprises (Étalab / INSEE) | annuaire professionnel public (API) | https://recherche-entreprises.api.gouv.fr/ | https://recherche-entreprises.api.gouv.fr/search?departement=33&q=industrie | — |
| BODACC — annonces commerciales | téléservice public d'annonces légales | https://www.bodacc.fr/pages/home/ | https://www.bodacc.fr/pages/annonces-commerciales-recherche/ | — |
| actu.fr — Gironde | presse locale en ligne | https://actu.fr/ | https://actu.fr/nouvelle-aquitaine/gironde_33/ | — |
| Le Journal des Entreprises — Nouvelle-Aquitaine | presse économique régionale | https://www.lejournaldesentreprises.com/nouvelle-aquitaine | https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/gironde | https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine |
| ICI Gironde (Radio France) | radio locale | https://www.ici.fr/radio/gironde | https://www.ici.fr/nouvelle-aquitaine/gironde-33/actu | https://www.ici.fr/rss/gironde/rubrique/infos.xml |
| France 3 Nouvelle-Aquitaine — Gironde | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/ | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/ | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/gironde/rss |
| Google News — veille « Gironde industrie » | agrégateur de presse locale | https://news.google.com/ | https://news.google.com/ | https://news.google.com/rss/search?q=Gironde+industrie&hl=fr&gl=FR&ceid=FR:fr |
| Aerospace Valley (périmètre Gironde) | cluster aéronautique et spatial régional | https://www.aerospace-valley.com/ | https://www.aerospace-valley.com/actualites | — |
| French Tech Bordeaux | réseau régional d'innovation et d'industries numériques | https://www.frenchtechbordeaux.com/ | https://www.frenchtechbordeaux.com/nos-actualites | — |
| Polyvia (délégation Nouvelle-Aquitaine) | syndicat professionnel de la plasturgie et des composites (périmètre Gironde) | https://www.polyvia.fr/fr | https://www.polyvia.fr/fr/nos-actualites | — |
| 20 Minutes Bordeaux | presse quotidienne locale (édition Bordeaux) | https://www.20minutes.fr/bordeaux/ | https://www.20minutes.fr/bordeaux/ | https://www.20minutes.fr/feeds/rss-une.xml |
| Bouger à Bordeaux | média local d’actualités (Bordeaux/Gironde) | https://www.bougerabordeaux.com/ | https://www.bougerabordeaux.com/ | https://www.bougerabordeaux.com/feed/ |
| Rue89Bordeaux | média local d’investigation (Bordeaux/Gironde) | https://rue89bordeaux.com/ | https://rue89bordeaux.com/tag/economie/ | https://rue89bordeaux.com/feed/ |

## Preuve

Chaque URL a fait l'objet d'un `GET` réel (`curl -L`, User-Agent navigateur, délai 25 s). Le relevé
`bench/results/verification-industrie-33.json` consigne pour chaque URL le code, le type de contenu,
le nombre d'items RSS et la détection de pages de blocage. Bilan : **67/67 URL en HTTP 200**, aucun
blocage détecté, 11 flux RSS non vides (10 à 100 items selon le flux).

Application PostgreSQL 18 (`docker exec ... psql -f db/migrate-094-sources-industrie-33.sql`) :
**23 lignes `source`** au préfixe `corpus:industrie-33-` et **71 lignes `source_verification`**,
toutes en `code_http = 200` / `etat = 'ok200'`. La migration est idempotente (remplacement des seules
lignes de cette tranche).

## Exemples cyber rattachés

- CPME Gironde : « Cybermois 2026 : les PME appelées à se mobiliser » — https://www.cpmegironde.fr/cybermois-2026-les-pme-appelees-a-se-mobiliser/
- MEDEF Gironde : « Mon entreprise est une cible : la cyber et la sécurité économique » — https://medef-gironde.fr/events/matinee-dinformation-mon-entreprise-est-une-cible-la-cyber-et-la-securite-economique-risque-strategique-pour-le-dirigeant/
- MEDEF Nouvelle-Aquitaine : « Cybersécurité : des réflexes essentiels pour protéger son activité » — https://www.medef-nouvelle-aquitaine.fr/actualite/cybersecurite-des-reflexes-essentiels-pour-proteger-son-activite
- CMA Nouvelle-Aquitaine : « Les artisans, des cibles de choix pour les cybercriminels » — https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites/les-artisans-des-cibles-de-choix-pour-les-cybercriminels
- Conseil départemental de la Gironde : « Cybersécurité, prévenir, protéger, inclure » — https://www.gironde.fr/actualites/cybersecurite-prevenir-proteger-inclure
- French Tech Bordeaux : « Données personnelles : comment SFBX cherche à rétablir la confiance » — https://www.frenchtechbordeaux.com/nos-actualites/donnees-personnelles-comment-sfbx-cherche-a-retablir-la-confiance
- Bouger à Bordeaux : « Fin de l'ADSL en Gironde : 44 communes concernées dès le 31 janvier 2027 » — https://www.bougerabordeaux.com/actu/news/fin-adsl-gironde-44-communes-31-janvier-2027/
- Rue89Bordeaux : « À Pessac, un data center s’apprête à sortir de terre » — https://rue89bordeaux.com/2026/07/a-pessac-un-data-center-sapprete-a-sortir-de-terre-et-souleve-de-nombreuses-questions/
- Autres exemples (IA/risques numériques) dans le corpus JSONL, champ `exemple_cyber`.

## Candidats écartés

- `https://www.bordeauxgironde.cci.fr/` (CCI Bordeaux Gironde) : HTTP 403 sur le site et les pages d'actualités — exclue.
- `https://www.sudouest.fr/gironde/`, `/economie/`, `rss.xml` : boucle de redirections 302/307 (Incapsula) — exclus.
- `https://annuaire-entreprises.data.gouv.fr/` : boucle de redirections — exclu au profit de l'API Étalab/INSEE.
- Flux `https://medef-gironde.fr/feed/` : HTTP 200 mais 0 item — exclu ; la page « communications » est retenue.
- `https://www.cpme-nouvelle-aquitaine.fr/` : page statique `noindex`, sans actualités effective — exclue.
- `https://www.usinenouvelle.com/`, `actu.fr` (flux), `mesinfos.fr` : 403 sous l'User-Agent imposé — exclus.
- `https://www.aerospace-valley.com/rss.xml` : 404 — le site et la page d'actualités sont retenus sans flux.

Limite de périmètre : MEDEF NA, Fibois NA, UIMM FdA, Polyvia NA et Aerospace Valley sont des
organisations régionales/nationales dont l'activité couvre la Gironde ; le type le précise. Les sources
strictement girondines (CPME Gironde, MEDEF Gironde, CMA/Chambre d'agriculture, Bordeaux Métropole,
Conseil départemental, presse locale) suffisent à elles seules à dépasser l'objectif de 5 sources.

OBJECTIF : atteint — 23 / 5
