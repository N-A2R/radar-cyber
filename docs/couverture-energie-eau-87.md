# Sources énergie-eau — Haute-Vienne (87) — vérification du 22 novembre 2026

## Résultat

OBJECTIF : atteint — 21 / 5

**21 sources vérifiées**, toutes avec une page d'actualités ou un flux répondant en **HTTP 200**.
45 URL uniques contrôlées (site, actualités, flux), 51 requêtes au total, toutes en 200.
Cible : au moins 5 sources vérifiées pour le couple secteur `energie-eau` / département `87`.

| Famille | Sources | Exemples |
|---|---|---|
| Syndicats et opérateurs eau/énergie | 7 | SABV (Aixe-sur-Vienne), SIAEP Vienne-Briance-Gorre, SEHV, SUEZ Limoges Métropole, Enedis, Saur, SYDED 87 |
| Collectivités et administration | 5 | Limoges Métropole, Conseil départemental 87, DREAL Nouvelle-Aquitaine, Agence de l'eau Loire-Bretagne, SANDRE (Limoges) |
| Chambres consulaires et fédérations | 4 | Chambre d'agriculture 87, CMA Nouvelle-Aquitaine — Haute-Vienne, CAPEB 87, e-marchespublics 87 |
| Presse et médias locaux | 5 | ici Limousin, Le Populaire du Centre, La Montagne — Limoges, France 3 Haute-Vienne, 20 Minutes Haute-Vienne |

9 sources exposent un flux RSS/Atom vérifié (SABV, SEHV, SYDED 87, Limoges Métropole,
DREAL Nouvelle-Aquitaine, SANDRE, CAPEB 87, ici Limousin et France 3) ; les 12 autres
n'ont qu'une page d'actualités.

## Méthode

Les organisations ont été recherchées sur le web (recherche sémantique Exa, sites officiels,
annuaires professionnels, chambres consulaires et presse locale), puis confirmées sur leur site.
Le périmètre retenu est soit le département 87 (SABV à Aixe-sur-Vienne, SIAEP Vienne-Briance-Gorre,
SEHV, SYDED 87, Limoges Métropole, SUEZ Limoges Métropole, presse limougeaude), soit une
autorité régionale ou nationale dont la rubrique couvre explicitement la Haute-Vienne ;
les éditions purement nationales ont été écartées.

Chaque URL du corpus a été requise en HTTP `GET` avec un User-Agent de navigateur, une
timeout de 20 secondes et suivi des redirections. Le détail des codes par URL est dans
`bench/results/verification-energie-eau-87.json` : 45 URL uniques, 51 requêtes, 51 en 200.

URL candidates écartées après mesure : `www.sehv.fr` (hors service, seul `sehv.fr` répond),
`limoges.cci.fr` et `ademe.fr` (403), `veolia.fr` (403), `actu.fr/haute-vienne/rss.xml` (404),
`www.step-lm.fr` (hors service). Elles ne figurent pas dans le corpus.

Le champ `exemple_cyber` n'est renseigné que lorsqu'un événement cyber vérifiable existe dans
le corpus local : l'article de France 3 sur la cyberattaque du service d'identification des
bovins et ovins en Haute-Vienne. Aucun incident cyber spécifiquement énergie/eau en 87 n'a pu
être confirmé ; les autres lignes portent donc une chaîne vide plutôt qu'un exemple inventé.

## Intégration

Migration `db/migrate-181-sources-energie-eau-87.sql` : 21 lignes `corpus:energie-eau-87-*`
insérées dans la table `source` (id empêchant les doublons, `ON CONFLICT DO UPDATE`).
Vérification en base : 21 lignes correspondantes, migration enregistrée dans `schema_migrations`.

## Livrables

- Corpus : `bench/corpus/sources-energie-eau-87.jsonl` (21 lignes)
- Vérification HTTP : `bench/results/verification-energie-eau-87.json` (51 requêtes, 51 en 200)
- Intégration : `db/migrate-181-sources-energie-eau-87.sql`
- Empreinte du corpus recalculée : `bench/corpus/HASH`
- Mesure reproductible : `wc -l bench/corpus/sources-energie-eau-87.jsonl` = 21 ;
  `jq -s '[.[] | select(.code_http == 200)] | length'` = 21.
