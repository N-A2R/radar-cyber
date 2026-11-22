# Sources énergie-eau des Deux-Sèvres (79) — vérification du 22 novembre 2026

## Résultat

**16 sources vérifiées**, toutes avec une page d'actualités ou un flux répondant en **HTTP 200**.
40 URL uniques contrôlées (site, actualités, flux), 40 en 200. Cible : au moins 5 sources.

| Famille | Sources | Exemples |
| --- | --- | --- |
| Organisations du secteur | 4 | SIEDS, Gérédis, SÉOLIS, Eklor |
| Institutions publiques | 5 | DREAL Nouvelle-Aquitaine, Agence de l'eau Loire-Bretagne, Niort Agglo, Département, Préfecture |
| Presse et médias locaux | 7 | La Nouvelle République (environnement 79), actu.fr, ici Poitou, France 3, franceinfo, Vivre à Niort, Niort info |

13 sources exposent un flux RSS/Atom ; 3 n'ont qu'une page d'actualités (Agence de l'eau, Préfecture, France 3).

## Méthode

Les organisations ont été recherchées sur le web puis confirmées sur leur site officiel :
le SIEDS est l'autorité organisatrice de l'énergie des Deux-Sèvres, Gérédis gère son réseau
électrique, SÉOLIS est l'entreprise locale de l'énergie créée par le SIEDS, et Eklor est un
distributeur photovoltaïque implanté à Niort. Le volet eau est couvert par l'Agence de l'eau
Loire-Bretagne (bassin dont dépend le 79), la DREAL Nouvelle-Aquitaine, Niort Agglo
(eau/assainissement), le Département et la Préfecture. La presse locale est prise dans ses
rubriques départementales ou environnement, pas dans ses éditions nationales.

Chaque URL du corpus a été requis en HTTP `GET` avec un User-Agent de navigateur, une
redirection suivie et un délai de 20 secondes. Les statuts observés sont consignés dans
`bench/results/verification-energie-eau-79.json`. Les pages HTML de La Nouvelle République
ne répondent qu'avec un User-Agent de navigateur (403 sans) ; leurs flux RSS sont publics
et répondent en 200 dans les deux cas.

Deux exemples d'incidents cyber cités dans le corpus viennent de `incidents-deuxsevres.jsonl`
(rançongiciel contre un Ehpad, SMS frauduleux au nom de la Ville de Niort). Les autres
sources n'ont pas d'exemple cyber vérifié dans les articles consultés : le champ
`exemple_cyber` y est volontairement vide plutôt que inventé.

## Livrables

- Corpus : `bench/corpus/sources-energie-eau-79.jsonl` (16 lignes)
- Rapport de vérification : `bench/results/verification-energie-eau-79.json`
- Intégration en base : `db/migrate-179-sources-energie-eau-79.sql` (clés `corpus:energie-eau-79-*`)
- Empreinte du corpus : `bench/corpus/HASH`
