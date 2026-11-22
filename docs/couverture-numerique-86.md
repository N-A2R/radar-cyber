# Couverture — sources « numerique » de la Vienne (86)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `numerique` / département `86`.

## Résultat

- **23 sources intégrées** (`bench/corpus/sources-numerique-86.jsonl`, une ligne JSON par source).
- **65 contrôles HTTP** (sites, pages d'actualités et flux), soit **65 URL uniques** : **65 réponses HTTP 200**, aucune URL en échec retenue.
- 23 lignes `source` et 66 lignes `source_verification` créées en base par `db/migrate-187-sources-numerique-86.sql`, toutes avec `department = '86'` et `region = 'Nouvelle-Aquitaine'`.
- Preuve HTTP détaillée : `bench/results/verification-numerique-86.json`.

OBJECTIF : atteint — 23 / 5

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| Neoloji — Technopole du Grand Poitiers | cluster — technopole, pépinière et incubateur numérique | https://www.neoloji.fr/actualites | Google Actualités « Neoloji Poitiers numérique » |
| Technopole Futuroscope (Vienne) | cluster — technopole numérique du Futuroscope | https://www.technopole-futuroscope.com/informations-transversales/actualites | Google Actualités « Technopole Futuroscope numérique » |
| Vienne Numérique — régie numérique du Département | institutionnel — transformation numérique du département | https://www.vienne-numerique.fr/une-collectivite/les-projets-numeriques-qui-preparent-lavenir | Google Actualités « Vienne Numérique » |
| PWN — Poitiers Web Nerdz | association — professionnels et étudiants du web / sécurité | https://pwn-association.org/evenements/ | Google Actualités « Poitiers Web Nerdz » |
| Université de Poitiers — Master Informatique / Iriaf | formation — informatique, recherche et cyber | https://www.univ-poitiers.fr/c/actualites/ | https://www.univ-poitiers.fr/feed/ |
| Conecti (Groupe LBS) — Poitiers / Saint-Benoît | entreprise — infogérance et services numériques | https://www.conecti.fr/actualites/ | https://www.conecti.fr/feed/ |
| MTI Poitiers — Micro Tech Informatique | entreprise — informatique et conseil numérique | https://mti86.com/ | Google Actualités « MTI Poitiers informatique » |
| Studio Digital Poitiers (poitiers.digital) | entreprise — agence web et conseil digital | https://poitiers.digital/blog | Google Actualités « poitiers.digital / Studio Digital Poitiers » |
| HTP Multimédia (Poitiers) | entreprise — infogérance et cybersécurité | https://www.htpmultimedia.fr/ | Google Actualités « HTP Multimédia Poitiers » |
| CCI de la Vienne | chambre consulaire — numérique et cybersécurité des entreprises | https://www.poitiers.cci.fr/actualites/ | https://www.poitiers.cci.fr/actualites/feed/ |
| MEDEF Vienne | organisation patronale — entreprises et transformations numériques | https://www.medef-vienne.fr/actualite-de-lentreprise/ | https://www.medef-vienne.fr/feed/ |
| Grand Poitiers Communauté urbaine | institutionnel — numérique et résilience informatique | https://www.grandpoitiers.fr/information-transversale/actualites | https://www.grandpoitiers.fr/information-transversale/actualites/rss |
| Ville de Poitiers | institutionnel — services numériques et inclusion | https://www.poitiers.fr/les-actualites | https://www.poitiers.fr/rss.xml |
| AMF86 — Association des maires de la Vienne | association — élus locaux et risques cyber | https://amf86.fr/actualites-de-lassociation/ | https://amf86.fr/feed/ |
| Région Nouvelle-Aquitaine — Portail des entreprises | institutionnel — accompagnement numérique des entreprises | https://entreprises.nouvelle-aquitaine.fr/actualites | Google Actualités « entreprises.nouvelle-aquitaine.fr cybersécurité » |
| Département de la Vienne — La Vienne le département | institutionnel — actualités du département et de Vienne Numérique | https://www.lavienne86.fr/fil-infos/actualites | Google Actualités « Vienne Numérique » |
| La Nouvelle République — édition Vienne (86) | presse — quotidien régional, rubrique Vienne | https://www.lanouvellerepublique.fr/vienne | https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c |
| Le7.info (Poitiers) | presse — média local d'information de proximité | https://www.le7.info/tag/159-numerique | https://www.le7.info/rss.xml |
| ICI Poitou (ex-France Bleu Poitou) | radio — média local, rubrique Vienne (86) | https://www.ici.fr/nouvelle-aquitaine/vienne-86 | https://www.ici.fr/rss/poitou/a-la-une.xml |
| France 3 Nouvelle-Aquitaine — Vienne | média — télévision régionale, déclinaison Vienne | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss |
| Châtellerault Mag (Ville de Châtellerault) | presse — magazine municipal, rubrique numérique | https://www.chatellerault.fr/actualites/ | https://www.chatellerault.fr/feed/ |
| Qwery — agence web de Poitiers | blog — agence web, sécurité WordPress et IA | https://qwery.fr/blog/ | https://qwery.fr/feed/ |
| Elevation Cie — agence web Poitiers / Vienne | blog — agence web, conseil référencement et numérique | https://elevation-cie.fr/blog/ | https://elevation-cie.fr/feed/ |

## Exemples cyber observés

- « Que faire de nos vieux téléphones ? À Poitiers, Neoloji et Orange ont la solution » (La Nouvelle République, flux)
- « Campus Numeria : un lieu d'apprentissage au cœur du Futuroscope » (La Vienne le département, flux)
- « Vienne Numérique dévoile son nouveau site internet » (La Vienne le département, 09/04/2026)
- « Capture The Flag #3 » — événement sécurité de Poitiers Web Nerdz (07/05/2026)
- « L'université de Poitiers en pointe sur la gestion des crises cyber » (20/10/2022)
- « Fin de Windows 10 : comment réussir votre transition vers Windows 11 avec Conecti » (15/07/2026)
- « Passez sereinement du travail au web avec Copilot Chat » (MTI, 20/04/2026)
- « Comment protéger votre entreprise face aux nouvelles menaces ? » — webinaire cybersécurité / IA (CCI Vienne, 31/03/2026)
- « Panne informatique en cours de résolution » — Ville, CCAS et Grand Poitiers (08/09/2025)
- « Gend'Élus : maintenant disponible depuis n'importe quel ordinateur » — sensibilisation aux risques cyber (AMF86, 13/10/2025)
- « Cybersécurité : les solutions pour protéger les entreprises néo-aquitaines » (Portail des entreprises, 22/09/2026)
- « Cyberattaque contre des supermarchés : des établissements touchés dans la Vienne » (La Nouvelle République, 12/10/2026)
- « Les TPE-PME de plus en plus attaquées » (Le7.info, 10/05/2025)
- « Les collectivités de Poitiers et Grand-Poitiers victimes d'une importante cyberattaque » (ICI Poitou, 02/09/2025)
- « WhatsApp est un réseau social, et la plupart des parents l'ignorent » — cyberharcèlement (France 3 Vienne, 13/11/2026, flux)

## Méthode et candidats écartés

Recherche web (annuaires professionnels, chambres consulaires, fédérations, clusters et tiers-lieux numériques, université, presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur, suivi des redirections et délai maximal de 25 s. Seules les sources dont les trois URL ont répondu 200 ont été intégrées. Les flux Google Actualités sont des requêtes ciblées « organisation + Vienne/86 + numérique/cyber » : leur contenu est agrégé, les pages d'actualités restant les sources primaires.

Écartés après vérification HTTP : SPN — Réseau des professionnels du numérique (`spn.asso.fr`, DNS non résolu depuis l'environnement de vérification ; réseau dissous en 2025), Cobalt Poitiers (`cobaltpoitiers.fr`, DNS non résolu), IFPA Poitiers (`ifpa86.fr`, chaîne de certificats SSL non validée), Réseaux 86 (`reseaux86.fr`, DNS non résolu), CPME 86 (site hors service), La Tech Valley et Digital Poitiers (clusters d'autres départements), Epitech (aucun campus à Poitiers), Campus Cyber Nouvelle-Aquitaine et Syntec Nouvelle-Aquitaine (pas d'ancrage vérifié dans le 86). Également écartés : flux morts en 404 (`vienne-numerique.fr/rss.xml`, `pwn-association.org/feed/`, `entreprises.nouvelle-aquitaine.fr/feed`, `lavienne86.fr/rss.xml`), page d'article Poitiers.fr renvoyant 403 (`fermeture-provisoire-de-grandpoitiersfr`) et article LNR situé hors du flux retenu.
