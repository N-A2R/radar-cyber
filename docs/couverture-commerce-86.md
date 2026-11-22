# Couverture « commerce » — Vienne (86)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `commerce` / département `86`.

## Résultat

- **15 sources intégrées** (`bench/corpus/sources-commerce-86.jsonl`, une ligne JSON par source).
- **51 contrôles HTTP** (sites, pages d'actualités et flux), soit **50 URL uniques** : **51 réponses HTTP 200**, aucune URL en échec retenue.
- 15 lignes `source` et 44 lignes `source_verification` créées en base par `db/migrate-191-sources-commerce-86.sql`, toutes avec `department = '86'` et `region = 'Nouvelle-Aquitaine'` (FAE Loudun partage la même URL pour le site et les actualités, d'où 44 URL uniques en base).
- Preuve HTTP détaillée : `bench/results/verification-commerce-86.json`.
- Empreinte du corpus : `03b3654a1dac880b6debda54769907286440cb475cde91966e8a624d0c52b8c9`.

OBJECTIF : atteint — 15 / 5

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| CCI de la Vienne | chambre consulaire | https://www.poitiers.cci.fr/actualites/ | https://www.poitiers.cci.fr/actualites/feed/ |
| CMA Nouvelle-Aquitaine — antenne de Poitiers (Vienne) | chambre consulaire | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites | Google Actualités « CMA Nouvelle-Aquitaine + artisan/cyber » |
| MEDEF Vienne | organisation patronale | https://www.medef-vienne.fr/actualite-de-lentreprise/ | https://www.medef-vienne.fr/feed/ |
| U2P France — réseau des entreprises de proximité (Vienne) | organisation patronale | https://u2p-france.fr/articles | https://u2p-france.fr/rss.xml |
| Poitiers le Centre — association des commerçants | association de commerçants | https://www.poitierslecentre.fr/fr/actualite | Google Actualités « Poitiers le Centre + commerçants » |
| Châtellerault Ça Bouge — fédération des commerçants | fédération de commerçants | https://chatelleraultcabouge.org/actualites/ | Google Actualités « Châtellerault Ça Bouge + commerce » |
| FAE Loudun — commerçants du centre-ville | association de commerçants | https://faeloudun.com/ | https://faeloudun.com/feed/ |
| Portail économique du Pays Loudunais | portail économique local | https://www.economie-pays-loudunais.fr/actualites | Google Actualités « Pays Loudunais + commerce/économie » |
| Réseau Propuls — réseau d'entreprises de Poitiers | réseau d'entreprises | https://www.reseau-propuls.fr/blog/ | https://www.reseau-propuls.fr/feed/ |
| Département de la Vienne — développement économique | collectivité départementale | https://www.lavienne86.fr/fil-infos/actualites | Google Actualités « Vienne + commerce + cyberattaque » |
| La Nouvelle République — économie Vienne | presse locale | https://www.lanouvellerepublique.fr/vienne/economie | https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c |
| ICI Poitou — Vienne (ex-France Bleu Poitou) | radio locale / média public | https://www.ici.fr/nouvelle-aquitaine/vienne-86 | https://www.ici.fr/rss/poitou/a-la-une.xml |
| Le7.info — actualités de Poitiers et de la Vienne | presse locale | https://www.le7.info/actus | https://www.le7.info/rss.xml |
| Le Journal des Entreprises — Nouvelle-Aquitaine | presse économique régionale | https://www.lejournaldesentreprises.com/nouvelle-aquitaine | https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine |
| France 3 Nouvelle-Aquitaine — Vienne | télévision régionale / média public | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss |

## Exemples cyber observés

- CCI Vienne : « Comment protéger votre entreprise face aux nouvelles menaces ? » (page d'événement).
- CMA Nouvelle-Aquitaine : « Les artisans, des cibles de choix pour les cybercriminels » (article).
- U2P : « Cybersécurité : l'U2P plaide pour un accompagnement adapté aux réalités des TPE » (titre du flux).
- La Nouvelle République : « Cyberattaque contre des supermarchés : des établissements touchés dans la Vienne » (12/10/2026).
- Exemple local : cyberattaque des frigos de la grande distribution touchant Intermarché Chauvigny/Gençay, Super U Vouillé et Leclerc Poitiers (ici.fr).
- Le7.info : « Cyberattaque : les services rétablis progressivement » (Grand Poitiers).
- Le Journal des Entreprises : « Le campus cyber Nouvelle-Aquitaine se dote d'une convention de coopération » (titre observé dans le flux Google Actualités).
- Fontégénérique local : cyberattaque des frigos de la grande distribution touchant Intermarché Chauvigny/Gençay, Super U Vouillé et Leclerc Poitiers (ici.fr).

## Méthode et candidats écartés

Découverte par recherche web (Exa) sur cinq angles : chambres consulaires et organisations patronales, associations de commerçants, annuaires et portails économiques, collectivités, presse locale et régionale. Chaque URL a ensuite été contrôlée par GET avec un User-Agent navigateur, suivi des redirections et délai maximal de 25 s ; le nombre d'items RSS a été relevé quand le flux est du XML valide. Seules les sources dont les trois URL ont répondu 200 ont été intégrées.

Écartés : `www.cma86.fr` et `www.cma-vienne.fr` (connexion refusée/expirée), `fedcom.fr`, `cg.asso.fr` et `artisanat-vienne.fr` (noms de domaine non résolus), `poitiers.maville.com` (403 sur site, actualités et flux), `mesinfos.fr/` (403 ; seule la page Nouvelle-Aquitaine répond), `20minutes.fr/nouvelle-aquitaine/` (404), `poitiers.cci.fr/annuaire/` (404). Les flux Google Actualités sont des requêtes ciblées « organisation + Vienne/commerce » : leur contenu est agrégé, les pages d'actualités restant les sources primaires. Le site `vienne.gouv.fr` a répondu 200 lors d'un premier contrôle mais a ensuite fermé les connexions (HTTP/2 `ENHANCE_YOUR_CALM`) : non retenu faute de 200 stable. Le flux RSS `actu.fr/nouvelle-aquitaine/vienne_86/rss.xml` répond 200 mais ne contient aucun item : non retenu.
