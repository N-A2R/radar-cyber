# Couverture — sources « industrie » de la Corrèze (19)

**Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur/département.**
Résultat : **13 sources, 27 URLs toutes en HTTP 200** (dont 8 flux RSS/Atom) contrôlées le 2026-11-22.

## Sources retenues

| Organisation | Type | Site | Actualités | Flux |
| --- | --- | --- | --- | --- |
| CPME 19 | organisation patronale TPE-PME | https://cpme19.fr/ | https://cpme19.fr/evenements/ | https://cpme19.fr/feed/ |
| MEDEF Nouvelle-Aquitaine | organisation patronale régionale | https://www.medef-nouvelle-aquitaine.fr/ | https://www.medef-nouvelle-aquitaine.fr/actualites | — |
| UIMM Nouvelle-Aquitaine — chambre du Limousin (Brive) | syndicat de la métallurgie | https://www.uimmnouvelleaquitaine.com/ | https://www.uimmnouvelleaquitaine.com/actualite/news.html | — |
| UIMM — La Fabrique de l'avenir | fédération nationale de la métallurgie | https://uimm.lafabriquedelavenir.fr/ | — | https://uimm.lafabriquedelavenir.fr/feed/ |
| Nexteam Group — fonderie d'Ussel | groupe industriel | https://www.nexteam-group.com/ | https://www.nexteam-group.com/actualite-agenda/ | https://www.nexteam-group.com/feed/ |
| Le Journal des Entreprises — Corrèze | presse économique | https://www.lejournaldesentreprises.com/regions/france/nouvelle-aquitaine/correze | idem | https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine |
| Corrèze Actu | presse locale en ligne | https://correzeactu.com/actualites | idem | — |
| La Montagne — Corrèze | presse locale | https://www.lamontagne.fr/correze/ | idem | — |
| Sud Ouest — Corrèze | presse régionale | https://www.sudouest.fr/correze/ | idem | https://www.sudouest.fr/correze/rss.xml |
| ici Corrèze — Radio France | radio et presse locale | https://www.ici.fr/nouvelle-aquitaine/correze-19 | https://www.ici.fr/nouvelle-aquitaine/correze-19/actu | https://www.ici.fr/rss/limousin/rubrique/infos.xml |
| Brivemag — pays de Brive | magazine municipal | https://brivemag.brive.fr/ | idem | https://brivemag.brive.fr/feed/ |
| Google News — veille « Corrèze industrie » | agrégateur de presse | https://news.google.com/ | https://news.google.com/ | https://news.google.com/rss/search?q=Corr%C3%A8ze+industrie&hl=fr&gl=FR&ceid=FR:fr |
| Chambre d'agriculture de la Corrèze | chambre consulaire (agro-industrie) | https://correze.chambres-agriculture.fr/ | https://correze.chambres-agriculture.fr/actualites-1/ | — |

La fonderie Nexteam est bien implantée à Ussel (page `https://www.nexteam-group.com/implantations/ussel/`, HTTP 200, également vérifiée). UIMM Nouvelle-Aquitaine publie la liste de ses chambres syndicales, dont le Limousin.

## Exemples cyber associés

Le champ `exemple_cyber` s'appuie sur les incidents corréziens déjà documentés dans `bench/corpus/incidents-correze.jsonl` : ransomware chez Corrèze Fermeture à Objat (26/02/2025, 50 à 60 commandes perdues), ransomware à l'EDE 19 (15/12/2024, 30 000 éleveurs perturbés), cyberattaque de l'Intermarché d'Altillac (13/10/2026), fuite de données du laboratoire Novabio de Brive (05/11/2026), rançon de 8 000 euros au collège La Salle de Brive (12/02/2025) et cyberattaque de la mairie de Sarran (20/06/2025, 44 000 euros perdus).

## Candidats écartés

- **CCI Corrèze** (`www.correze.cci.fr/`, `/actualites`) et **CCI Nouvelle-Aquitaine** (`nouvelle-aquitaine.cci.fr`) : HTTP 403 (protection bot), comme lors de la tranche « collectivités ».
- **PagesJaunes**, **Pappers**, **Kompass**, **Verif**, **118000** : HTTP 403 ; aucun annuaire professionnel grand public n'a pu être intégré malgré la recherche.
- **actu.fr — Corrèze** : la page d'actualités répond 200 mais le flux `/rss.xml` est protégé par Cloudflare de façon intermittente (403 avec un User-Agent court, 200 avec un User-Agent navigateur complet) ; non retenu pour éviter une source instable.
- **Unilin** (panneaux bois) : site et page « stories » en 200, mais l'implantation d'Ussel n'a pas pu être confirmée sur le site officiel ; non retenu.
- **CMA Nouvelle-Aquitaine** : HTTP 200 sur `/a-cote-de-chez-vous/actualites`, mais doublon de la tranche « energie-eau-19 » déjà intégrée en base sous `corpus:e19-cma`.

## Méthode et intégration

Recherche web (annuaires professionnels, chambres consulaires, fédérations métallurgiques et patronales, entreprises industrielles d'Ussel et de Brive, presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur complet, en-tête Accept adapté, suivi des redirections et délai de 20 s. Les 27 URLs ont répondu 200 ; preuve détaillée dans `bench/results/verification-industrie-19.json`.

Corpus : `bench/corpus/sources-industrie-19.jsonl` (13 lignes, empreinte `bench/corpus/HASH` recalculée).
Base : `db/migrate-074-sources-industrie-19.sql` insère 13 lignes dans `source` (parser pointant vers le corpus) et 27 traces `source_verification` en état `ok200`.
