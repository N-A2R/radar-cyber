# Couverture — sources « industrie » de la Creuse (23)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **23 sources, 51 URL uniques toutes en HTTP 200** (dont 12 flux RSS/Atom) contrôlées le 2026-11-22.

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| Chambre d'agriculture de la Creuse | chambre consulaire (agro-industrie) | https://creuse.chambres-agriculture.fr/ | https://creuse.chambres-agriculture.fr/actualites-1/ | — |
| MEDEF Nouvelle-Aquitaine | organisation patronale régionale | https://www.medef-nouvelle-aquitaine.fr/ | https://www.medef-nouvelle-aquitaine.fr/actualites | — |
| CPME Nouvelle-Aquitaine | organisation patronale TPE-PME | https://www.cpme-nouvelle-aquitaine.fr/ | https://www.cpme-nouvelle-aquitaine.fr/actualites/ | — |
| UIMM Nouvelle-Aquitaine — chambre du Limousin | syndicat de la métallurgie | https://www.uimmnouvelleaquitaine.com/ | https://www.uimmnouvelleaquitaine.com/actualite/news.html | — |
| UIMM — La Fabrique de l'avenir | fédération nationale de la métallurgie | https://uimm.lafabriquedelavenir.fr/ | https://uimm.lafabriquedelavenir.fr/actualites/ | https://uimm.lafabriquedelavenir.fr/feed/ |
| Fibois Nouvelle-Aquitaine | fédération filière forêt-bois | https://fibois-na.fr/ | https://fibois-na.fr/actualites/ | https://fibois-na.fr/feed/ |
| CMA Nouvelle-Aquitaine — délégation Creuse | chambre consulaire (artisanat) | https://cma-nouvelleaquitaine.fr/ | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | — |
| La Montagne — Creuse | presse locale | https://www.lamontagne.fr/creuse/ | https://www.lamontagne.fr/info-en-continu/creuse | — |
| Le Populaire du Centre — Guéret | presse locale | https://www.lepopulaire.fr/gueret-23000/ | idem | — |
| ICI Creuse — Radio France | radio et presse locale | https://www.ici.fr/radio/creuse | https://www.ici.fr/nouvelle-aquitaine/creuse-23 | https://www.ici.fr/rss/creuse/a-la-une.xml |
| actu.fr — Actu Creuse | presse en ligne | https://actu.fr/nouvelle-aquitaine/creuse_23/ | idem | https://actu.fr/nouvelle-aquitaine/creuse_23/rss.xml |
| France 3 Nouvelle-Aquitaine — Creuse | télévision et presse locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse | idem | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/creuse/rss |
| Le Journal des Entreprises — Creuse | presse économique | https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/creuse | idem | https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine |
| API Recherche d'entreprises (Étalab / INSEE) | annuaire professionnel public | https://recherche-entreprises.api.gouv.fr/ | https://recherche-entreprises.api.gouv.fr/search?departement=23&q=industrie | idem (JSON) |
| BODACC | annonces légales | https://www.bodacc.fr/pages/home/ | https://www.bodacc.fr/pages/annonces-commerciales-recherche/ | https://www.bodacc.fr/pages/api-bodacc/ |
| Google News — veille « Creuse industrie » | agrégateur de presse | https://news.google.com/ | idem | https://news.google.com/rss/search?q=Creuse+industrie&hl=fr&gl=FR&ceid=FR:fr |
| Google News — veille « Creuse usine » | agrégateur de presse | https://news.google.com/ | idem | https://news.google.com/rss/search?q=Creuse+usine&hl=fr&gl=FR&ceid=FR:fr |
| GIMC — Groupement des Industries Métallurgiques de la Creuse | fédération patronale départementale | https://metalcreuse.fr/ | https://metalcreuse.fr/actualites/ | https://metalcreuse.fr/feed/ |
| GMP Industries — métallerie à Gouzon | entreprise industrielle | https://gmp-industries-23.fr/ | idem | https://gmp-industries-23.fr/feed/ |
| Fonderies Fraisse — fonderie aluminium à Aubusson | entreprise industrielle | https://fonderies-fraisse.fr/ | https://fonderies-fraisse.fr/index.php/actualites/ | — |
| Microplan Group — usinage à La Forêt-du-Temple | entreprise industrielle | https://microplan-group.com/fr/ | https://microplan-group.com/fr/category/non-classifiee/ | https://microplan-group.com/fr/feed/ |
| Furmeca — micromécanique à Fursac | entreprise industrielle | https://www.fursac-mecanique.fr/ | https://www.fursac-mecanique.fr/fr/actualites-usinage | — |
| TIGR — chaudronnerie à Saint-Maurice-la-Souterraine | entreprise industrielle | https://www.tigr.fr/ | https://www.tigr.fr/actualites/ | https://www.tigr.fr/feed/ |

L'ancrage départemental des entreprises est attesté par l'annuaire des adhérents du GIMC
(`https://metalcreuse.fr/entreprise-industrie-metallurgie/`, HTTP 200) et par les pages
officielles des sociétés (Gouzon, Aubusson, La Forêt-du-Temple, Fursac,
Saint-Maurice-la-Souterraine). La page CMA contient un sélecteur explicite « Creuse ».

## Exemples cyber associés

Le champ `exemple_cyber` s'appuie sur les incidents déjà documentés dans
`bench/corpus/incidents-creuse.jsonl` : phishing au faux RIB contre une entreprise de
maçonnerie de la Creuse (03/01/2024, près de 50 000 € détournés), boîte mail d'artisan
piratée avec faux RIB sur devis (12/12/2024), arnaque au président contre l'APAJH 23
(15/05/2025, 173 000 €), defacement du camping d'Évaux-les-Bains (11/07/2025),
cyberattaque du logiciel Weda touchant une rhumatologue de Creuse (10/11/2025),
fraude aux réservations en Creuse Sud-Ouest (29/04/2026) et ransomware revendiqué
contre FOL 23 à Guéret (12/11/2026). Ces exemples illustrent le risque pour les
organisations suivies ; ils n'attribuent pas d'incident aux entreprises listées.

## Candidats écartés

- **CCI de la Creuse** (`www.creuse.cci.fr`, `/actualites`, `/rss.xml`) : HTTP 403 (Cloudflare).
- **Pappers**, **Kompass** : HTTP 403 (protection anti-bot). **Societe.com** répond 200 mais
  n'expose ni page d'actualités ni flux exploitable.
- **CPME de la Creuse** (`cpme23.fr`) : page unique « Site en Maintenance », sans
  actualités ; la CPME Nouvelle-Aquitaine est retenue à la place.
- **SEELEC**, **AMB Mecapole**, **ID Conception** : sites HTTP 200 et implantation creusoise
  confirmée, mais aucune page d'actualités ni flux public (404 sur les URL candidates).
- **Annuaire des Entreprises** (`annuaire-entreprises.data.gouv.fr/departement/23`) :
  boucle de redirection côté client ; son API dédiée, qui répond 200, est retenue.

## Méthode et intégration

Recherche web multi-angles (chambres consulaires, fédérations métallurgiques et bois,
entreprises implantées dans la Creuse, annuaires professionnels, presse locale), puis
contrôle GET de chaque URL avec User-Agent navigateur complet, en-tête Accept adapté,
suivi des redirections et délai de 25 s. Les 51 URL ont répondu 200 ; la preuve
détaillée est dans `bench/results/verification-industrie-23.json`.

Corpus : `bench/corpus/sources-industrie-23.jsonl` (23 lignes, empreinte `bench/corpus/HASH`
recalculée). Base : `db/migrate-081-sources-industrie-23.sql` insère 23 lignes dans
`source` et 52 traces `source_verification` en état `ok200` (51 URL uniques).
OBJECTIF : atteint — 23 / 5
