# Sources énergie-eau de la Vienne (86) — vérification du 22 novembre 2026

## Résultat

**23 sources vérifiées**, avec une page d'actualités répondant en **HTTP 200**.
57 URL uniques contrôlées (sites, pages d'actualités et flux), **57 en HTTP 200**.
Cible : au moins 5 sources vérifiées pour le couple secteur/département.

| Famille | Sources | Exemples |
| --- | --- | --- |
| Organisations du secteur | 6 | Syndicat Énergies Vienne, Sorégies, Groupe Sorégies, Eaux de Vienne, EPTB Vienne, SMVA |
| Institutions et collectivités | 7 | Agence de l'eau Loire-Bretagne, DREAL, Grand Poitiers, Grand Châtellerault, Département, Région, CC Vienne et Gartempe |
| Chambres et fédérations | 3 | CCI de la Vienne, Chambre d'agriculture, CAPEB Vienne |
| Presse et médias locaux | 7 | La Nouvelle République, actu.fr, ici Poitou, France 3, web86.info, Le7.info, La Vienne Rurale |

16 sources exposent un flux RSS/Atom ; 7 n'ont qu'une page d'actualités (SMVA,
Agence de l'eau, DREAL, Grand Châtellerault, Grand Poitiers, Chambre d'agriculture,
CAPEB — selon les cas, le flux public testé n'existait pas ou ne renvoyait pas de
contenu exploitable ; ces URL ont été laissées vides plutôt que remplacées par un
agrégateur).

## Méthode

Les organisations ont été recherchées sur le web (annuaires professionnels,
chambres consulaires, fédérations, presse locale) puis confirmées sur leur site
officiel. Le syndicat Énergies Vienne est l'autorité organisatrice de la
distribution publique d'électricité et de gaz du département ; Sorégies en est
l'entreprise locale historique. Eaux de Vienne est le syndicat départemental de
l'eau potable et de l'assainissement, complété par l'EPTB Vienne et le SMVA pour
la ressource en eau et les milieux aquatiques. La presse est prise dans ses
rubriques départementales (Vienne/86), pas dans ses éditions nationales.

Chaque URL du corpus a été requise en HTTP `GET` avec un User-Agent de navigateur,
une redirection suivie et un délai de 25 secondes. Les statuts, types de contenu
et nombres d'items observés sont consignés dans
`bench/results/verification-energie-eau-86.json`. Les URL `https://www.vienne.gouv.fr/`
et `https://www.vienne.gouv.fr/Actualites` ont répondu 200 lors de la découverte,
puis ont fermé la connexion (HTTP/2 `ENHANCE_YOUR_CALM`) lors du contrôle final :
la préfecture a été écartée du corpus au profit du Grand Châtellerault, dont les
deux URL ont été vérifiées 200. Le flux `actu.fr` répond 200 mais est vide (0 item) ;
le champ est conservé avec cette réserve.

Cinq exemples de cyberveille sont renseignés dans le corpus (rançongiciel de 2021
contre le Département de la Vienne, cyberattaque de septembre 2025 contre Poitiers
et Grand Poitiers, alerte cybersécurité de la CCI, article du 25/11/2025 du7.info,
article du 17/02/2022 de La Nouvelle République). Les autres champs
`exemple_cyber` sont volontairement vides : aucun exemple vérifié n'a été trouvé
pour ces organisations.

## Livrables

- Corpus : `bench/corpus/sources-energie-eau-86.jsonl` (23 lignes)
- Rapport de vérification : `bench/results/verification-energie-eau-86.json` (57 URL, 57 en 200)
- Intégration en base : `db/migrate-182-sources-energie-eau-86.sql` (clés `corpus:energie-eau-86-*`, 23 sources et 57 lignes `source_verification`)
- Empreinte du corpus : `bench/corpus/HASH`

OBJECTIF : atteint — 23 / 5
