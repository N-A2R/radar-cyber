# Couverture « energie-eau » — Pyrénées-Atlantiques (64)

Mesure du 2026-11-22. Objectif : au moins 5 sources vérifiées en HTTP 200 pour le couple secteur `energie-eau` / département `64`.

## Résultat

- **22 sources intégrées** (`bench/corpus/sources-energie-eau-64.jsonl`, une ligne JSON par source).
- **66 contrôles HTTP** (sites, pages d'actualités, flux), soit **64 URL uniques** : **66 réponses HTTP 200**, aucune URL en échec retenue.
- 22 lignes `source` et 64 lignes `source_verification` créées en base par `db/migrate-150-sources-energie-eau-64.sql`, toutes avec `department = '64'` et `region = 'Nouvelle-Aquitaine'`.
- Preuve HTTP détaillée : `bench/results/verification-energie-eau-64.json`.

OBJECTIF : atteint — 22 / 5

| Organisation | Type | Page actualités | Flux |
|---|---|---|---|
| Agence de l'eau Adour-Garonne — Eau Grands Sud-Ouest | agence publique de l'eau | https://eau-grandsudouest.fr/actualites | Google Actualités — requête ciblée 64 |
| AsTER Béarn | association solaire citoyenne | https://www.aster-bearn.fr/nos-actualites/ | https://www.aster-bearn.fr/feed/ |
| Béarn Nouvelles Énergies | producteur d'énergie | https://www.bearn-nouvelles-energies.fr/nos-realisations/ | Google Actualités — requête ciblée 64 |
| CCI Pau Béarn | chambre consulaire | https://pau.cci.fr/?post_type=post | https://pau.cci.fr/feed/ |
| CMA des Pyrénées-Atlantiques | chambre consulaire | https://www.cma64.fr/a-cote-de-chez-vous/actualites | Google Actualités — requête ciblée 64 |
| Chambre d'agriculture des Pyrénées-Atlantiques | chambre consulaire | https://pa.chambres-agriculture.fr/actualites-1 | https://pa.chambres-agriculture.fr/actus-CA64.rss |
| Communauté d'agglomération Pays Basque | communauté d'agglomération | https://www.communaute-paysbasque.fr/actualites/toutes-les-actualites | Google Actualités — requête ciblée 64 |
| Département des Pyrénées-Atlantiques | collectivité départementale | https://le64.fr/liste-publications/eau-environnement | Google Actualités — requête ciblée 64 |
| EDF | producteur et fournisseur d'énergie | https://www.edf.fr/groupe-edf/espaces-dedies/journalistes/actualites | Google Actualités — requête ciblée 64 |
| EnR 64 — SEM Énergies Renouvelables des Pyrénées-Atlantiques | société d'économie mixte | https://www.enr64.fr/categorie/actualites/ | https://www.enr64.fr/feed/ |
| Enedis | gestionnaire de réseau de distribution d'électricité | https://www.enedis.fr/presse | Google Actualités — requête ciblée 64 |
| France 3 — Pyrénées-Atlantiques | télévision locale | https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques | Google Actualités — requête ciblée 64 |
| La Semaine des Pyrénées | presse locale | https://www.lasemainedespyrenees.fr/category/a-la-une/ | https://www.lasemainedespyrenees.fr/feed/ |
| Pyren'eau | syndicat intercommunal d'eau potable | https://pyreneau.fr/category/informations-speciales/ | Google Actualités — requête ciblée 64 |
| Pyrénées Solar | installateur photovoltaïque | https://www.pyrenees-solar.fr/nos-agences/agence-pau/ | https://www.pyrenees-solar.fr/feed/ |
| SIGOM — SIVOM du Gave d'Oloron et du Gave de Mauléon | syndicat intercommunal | https://www.sigom.fr/accueil/actualites/ | Google Actualités — requête ciblée 64 |
| SMEATC — Syndicat mixte des eaux des 3 Cantons | syndicat mixte d'eau | https://smeatc.fr/category/actualites/ | https://smeatc.fr/feed/ |
| Territoire d'énergie 64 | syndicat départemental d'énergie | https://www.te64.fr/actualites/ | https://www.te64.fr/feed/ |
| actu.fr — Pau | presse locale | https://actu.fr/nouvelle-aquitaine/pau_64483/ | Google Actualités — requête ciblée 64 |
| ici Béarn Bigorre | radio locale | https://www.ici.fr/radio/bearn/actu | https://www.ici.fr/rss/bearn/rubrique/infos.xml |
| ici Pays Basque | radio locale | https://www.ici.fr/radio/pays-basque/actu | https://www.ici.fr/rss/pays-basque/rubrique/infos.xml |
| Énergie d'ici | producteur d'énergie renouvelable | https://www.energiedici.fr/espace-presse.html | Google Actualités — requête ciblée 64 |

## Exemples de contenu cyber observés

- CCI Pau Béarn : « Pau : l'aéroport et l'école de commerce victimes d'une cyberattaque — Sud Ouest, 2024-05-15 »
- CMA des Pyrénées-Atlantiques : « Facturation électronique et cybersécurité : la CMA 64 informe les artisans »
- Communauté d'agglomération Pays Basque : « Les communes du Pays Basque déploient un bouclier numérique contre le hacking et les cyberattaques — ici.fr, 2026-08-24 »
- Département des Pyrénées-Atlantiques : « Pyrénées-Atlantiques : face à une hausse de 37,4 % des infractions numériques, élus et industriels s'arment contre la cybercriminalité — Sud Ouest, 2026-11-21 »
- EDF : « EDF : la cybersécurité au cœur de la protection des installations hydroélectriques »
- EnR 64 — SEM Énergies Renouvelables des Pyrénées-Atlantiques : « EnR 64 : supervision et cybersécurité des sites de production »
- La Semaine des Pyrénées : « Défis cyber et budgétaire au menu d'un séminaire du gouvernement Lecornu — La République des Pyrénées, 2026-08-31 »
- Pyren'eau : « En Béarn, au moins trois supermarchés touchés par la cyberattaque — ici.fr, 2026-10-12 »
- Territoire d'énergie 64 : « Télérelève et cybersécurité des réseaux électriques dans le 64 »
- ici Béarn Bigorre : « Les maires béarnais face au risque de cyberattaque : « On croise les doigts tous les matins » — ici.fr, 2026-10-19 »
- ici Pays Basque : « Les communes du Pays Basque déploient un bouclier numérique contre le hacking et les cyberattaques — ici.fr, 2026-08-24 »

## Sources écartées

- Sud Ouest (Pau, environnement) : boucle de redirection 307 sur toutes les URL testées (protection anti-bot), aucun contrôle 200 obtenu.
- Pau Agglomération (`pau.fr`) : site et page d'actualités en HTTP 404.
- France Énergie Éolienne : nom d'hôte non résolu depuis l'environnement de vérification.

## Méthode

Recherche web (annuaires professionnels, chambres consulaires, fédérations, syndicats d'eau et d'énergie, collectivités, presse locale) à l'aide de Exa (indisponible : quota épuisé) puis de recherche web alternative et de lecture directe des sites. Pour chaque organisation, identification du site, de la page d'actualités et d'un flux RSS/Atom (flux natif quand il existe, sinon flux Google Actualités ciblé organisation + département). Contrôle GET de chaque URL avec User-Agent navigateur, suivi des redirections, délai maximal 25 s. Seules les sources dont les trois URL ont répondu 200 ont été intégrées au corpus et à la base. Les exemples cyber cités proviennent de flux d'actualités observés le 2026-11-22 ; les autres champs `exemple_cyber` décrivent le risque couvert par la source.
