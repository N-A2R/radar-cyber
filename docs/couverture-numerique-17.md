# Sources du secteur « numérique » — Charente-Maritime (17)

## Résultat

**15 sources vérifiées en HTTP 200** pour le couple secteur `numerique` / département `17` (cible : au moins 5).

- Corpus : `bench/corpus/sources-numerique-17.jsonl` (15 lignes, champs `nom`, `type`, `secteur`, `departement`, `url_site`, `url_actualites`, `url_flux`, `code_http`, `exemple_cyber`).
- Preuve HTTP : `bench/results/verification-numerique-17.json` — 39 URLs contrôlées, 39 en 200, le 2026-11-22.
- Intégration : `db/migrate-066-sources-numerique-17.sql` (15 lignes dans `source`, identifiants `corpus:numerique-17-*`, 39 traces dans `source_verification`).
- 8 flux RSS/Atom exploitables : Collectif Rochefort Numérique — annuaire des professionnels du numérique, Digitalbay — cluster du numérique à La Rochelle, Soluris — syndicat informatique de la Charente-Maritime, Numeum — syndicat des métiers du numérique, Clubs d'entreprises 17 — annuaire CCI, Cybermalveillance.gouv.fr — actualités cybersécurité, Sud Ouest — Charente-Maritime (numérique et cyber), ICI La Rochelle — Charente-Maritime.

## Organisations retenues

| Organisation | Type | Page actualités |
|---|---|---|
| Collectif Rochefort Numérique — annuaire des professionnels du numérique | collectif d'entreprises du numérique (annuaire professionnel) | https://www.rochefort-numerique.fr/blog/ |
| Digitalbay — cluster du numérique à La Rochelle | cluster numérique (La Rochelle) | https://digitalbay.fr/toutes-nos-actualites/ |
| Soluris — syndicat informatique de la Charente-Maritime | syndicat informatique départemental | https://www.soluris.fr/actualites/ |
| Numeum — syndicat des métiers du numérique | syndicat professionnel du numérique | https://numeum.fr/les-actualites-numeum/ |
| MEDEF Charente-Maritime — commission numérique | syndicat patronal départemental (commission digitale) | https://www.medef17.fr/actualites |
| Clubs d'entreprises 17 — annuaire CCI | annuaire professionnel (CCI Charente-Maritime) | https://clubs-entreprises17.fr/evenements/ |
| Département de la Charente-Maritime — inclusion numérique | collectivité départementale (inclusion numérique) | https://la.charente-maritime.fr/inclusion-numerique |
| L3i — Laboratoire d'informatique et d'intelligence de La Rochelle | laboratoire universitaire d'informatique | https://l3i.univ-larochelle.fr/actualites/ |
| EIGSI — école d'ingénieurs informatique, IA et cybersécurité | école d'ingénieurs (formations numériques) | https://www.eigsi.fr/actualites-ecole-ingenieur/ |
| Cybermalveillance.gouv.fr — actualités cybersécurité | dispositif national de lutte contre la cybermalveillance | https://www.cybermalveillance.gouv.fr/blog |
| Sud Ouest — Charente-Maritime (numérique et cyber) | presse locale quotidienne | https://www.sudouest.fr/charente-maritime/ |
| actu.fr — Charente-Maritime | presse locale numérique | https://actu.fr/nouvelle-aquitaine/charente-maritime_17 |
| ICI La Rochelle — Charente-Maritime | radio locale (actualités numériques) | https://www.ici.fr/nouvelle-aquitaine/charente-maritime-17/actu |
| Haute Saintonge — actualités (inclusion numérique) | presse locale hebdomadaire | https://www.hautesaintonge.fr/actualites-le-fil-info.html |
| CMA Nouvelle-Aquitaine — actualités (Charente-Maritime) | chambre consulaire (transition numérique des entreprises) | https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites |

## Exemples cyber associés

Les exemples sont tirés de `bench/corpus/incidents-charentemaritime.jsonl` et des sites des organisations :

- **Soluris** (syndicat informatique de la Charente-Maritime) — un élu lance une cyberattaque pour tester les défenses du syndicat départemental (Sud Ouest).
- **Synbird / Ville de La Rochelle** — fuite de données chez l'éditeur logiciel : 1 300 communes touchées (Sud Ouest).
- **Théâtre de la Coursive (La Rochelle)** — billetterie victime d'une attaque informatique (ICI).
- **Collectif Rochefort Numérique** — ouverture d'un Centre de ressources en cybersécurité de Charente-Maritime (blog du collectif).
- **Digitalbay** — « La cybersécurité concerne aussi les TPE/PME » (article du cluster).
- **Jonzac / Haute-Saintonge** — alerte à l'arnaque sur les factures d'eau (phishing, presse locale).

## Candidats écartés

- **CCI Charente-Maritime** (`charente-maritime.cci.fr`) : HTTP 403 Cloudflare persistant sur l'accueil et `/actualites` ; non intégrée malgré sa pertinence consulaire.
- **Digitalbay** a d'abord répondu par un timeout à 16 s ; confirmé 200 en GET à 32 s, donc conservé.
- **Technopole La Rochelle, La Rochelle Numérique, Rochefort Numérique (autre domaine), numerique17.fr** : NXDOMAIN / domaines morts.
- **France Digitale** : site 200 et flux RSS 200, mais aucune page d'actualités (`/actualites/`, `/blog/` : 404) ; non retenu pour éviter une URL d'actualités factice.
- **EIGSI** : flux `/feed/` en erreur 500 ; seules les pages HTML 200 ont été intégrées.
- **actu.fr Charente-Maritime** : le flux `/rss.xml` répond 200 mais sans item ; non renseigné dans le corpus.
- **Synbird** : éditeur logiciel cité dans un incident de La Rochelle, mais siège à Chambéry — hors département 17.

## Méthode

Recherche web (Google Actualités RSS, Bing RSS, annuaires professionnels, chambres consulaires, fédérations, presse locale), identification des pages d'actualités et des flux, puis contrôle GET de chaque URL avec User-Agent navigateur, suivi des redirections et délai maximal de 32 s. Le service Exa étant hors crédits (402), les candidats ont été identifiés depuis les flux d'actualités, les sites officiels et les annuaires sectoriels, puis tous contrôlés en HTTP direct. Seules les sources dont toutes les URLs ont répondu 200 ont été intégrées au corpus et à la base.
