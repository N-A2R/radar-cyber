# Rapport de campagne — précision du rattachement

Vague « précision » (docs/plans/wave-precision.md), nuit du 21 novembre 2026.
État complet : `bench/state/wave-precision.json`. Protocole réexécutable :
docs/mesure-precision.md.

## La question et la réponse

**Quelle est la précision du rattachement indice → organisation sur les
données réelles du flux ?**

| Mesure | valeur |
|---|---|
| **Précision de départ (population)** | **4,5 %** (corpus gelé, estimateur stratifié) — **5,7 %** (échantillon frais proportionnel, brut) |
| Indécidables (hors du dénominateur) | 27 % des rattachements proposés (130/500 frais) |
| Bruit de mesure à n=100 | 0,5 point (deux tirages neufs, stratifié) |
| **Après le jeu de règles retenu** | **83,3 %** brut / **13,8 %** population (le moteur ne rattache plus que 29 % de la population — les 71 % restants étaient à ~0 % de précision) |
| Coût des règles en runtime | +0,00 ms par indice |

En clair : avant la campagne, un rattachement produit par le moteur sur une
revendication de rançongiciel avait **~5 %** de chances d'être la bonne
organisation ; après les six règles retenues, un rattachement produit en a
**~84 %** (brut sur les cas comptés) — mais le moteur ne produit plus de
rattachement que pour 29 % des indices, le reste passant en revue humaine ou
requérant un enrichissement du référentiel.

## Comment c'a été mesuré

500 rattachements réels (tirage stratifié, graine écrite) vérifiés un par un
sur deux canaux de preuve — registre (recherche-entreprises.api.gouv.fr :
SIREN, code d'entité à 9 chiffres, ou nom ; requête + réponse consignées) et
site (URL + extrait verbatim). Chaque verdict est un jugement posé sur la
preuve ; aucun verdict n'est un script comparant deux noms. Le corpus est
gelé (SHA-256 dans l'état). Le protocole est répété sur un échantillon frais
de 500 (graine neuve) et deux tirages de bruit de 100 : la précision de
population converge (4,5 % stratifié / 5,7 % frais brut), le bruit est de
0,5 point.

## Les modes d'échec (282 hors_sujet du corpus gelé)

| Mode | effectif | mécanisme |
|---|---|---|
| sigle | 123 | un seul jeton fonde le match (« CARGO », « OFFICE »…) — la strate qui pèse 70 % de la population |
| homonyme | 95 | le nom désigné existe et n'est pas l'org (société étrangère, personne physique, toponyme) |
| commentaire | 30 | les jetons du commentaire de fuite (« hacked and more », « company ») fondent le match |
| masquage | 24 | les noms masqués de la liste (`F*****H`) rattachés à des orgs de 1-2 lettres — mode nouveau |
| TLD | 5 | le domaine de l'indice appartient à une entité étrangère |
| ville | 3 | la commune citée rattachée à une org homonyme du toponyme |
| encodage | 2 | le mojibake (Santélys → « santa ») fonde le match — mode nouveau |

## Les règles retenues

Six règles (spec : `apps/api/src/match/regles-precision.ts`, tests de
régression : 7 verts, jeu d'or : 50/50) — chacune mesurée sur le corpus gelé
ET sur échantillon frais, retirée si elle n'avait pas tenu (règle 4 de la
vague) :

1. **un seul jeton ne fonde pas un rattachement** (élimine le chemin 0,7) ;
2. **l'indice doit être couvert par le nom** (à 0,75) ;
3. **un indice masqué ne fonde jamais de rattachement** ;
4. **les indices à marqueur de fuite ne matchent que par le domaine** ;
5. TLD — couvert par la règle 1, documenté sans effet propre ;
6. **le chemin ville+nom est retiré**.

Ce qu'elles cassent, mesuré : sur le gelé, **0 exacte** cassée, 1 partielle
(« Atos (Business Services · France) » — prévue par la règle 2) ; sur le
frais, 2 partielles (la même Atos, et `fujitsu.com` → FUJITSU TECHNOLOGY
SOLUTIONS — la règle 1 élimine le rattachement à jeton unique d'un
domaine-hint). Les partielles perdues sont le prix assumé de la précision :
elles repassent en revue.

## Ce qui n'a pas marché (et ce qui l'a rattrapé)

1. **Le tirage S1.1 a une allocation égale** entre strates au lieu de la
   proportionnelle documentée (le round-robin ignorait les quotas) — trouvé
   en S1.5 quand les tirages de bruit ne convergeaient pas. Le corpus gelé
   reste valable comme tirage ; l'estimateur stratifié pondéré corrige la
   mesure, et le tirage est corrigé depuis (le frais S4 l'utilise).
2. **Le préfiltre SQL livré coûte ~1,3 s par indice** sur 1,24 M
   d'organisations (jetons génériques en ILIKE sur tout le stock) : la
   population complète était inmesurable avec. Trois itérations de préfiltre
   mémoire (ILIKE borné → table de jetons → index mémoire), deux désaccords
   différentiels corrigés en route (le « rare-jeton » invalide — « J.THERM »
   face à « plasma therm » — et l'extension unaccent absente), jusqu'à la
   preuve d'équivalence 40/40 + l'audit des indices sans témoin 5/5.
3. **Un passage naïf a saturé la mémoire** (SIGKILL) : les jetons de 3
   caractères ramènent des millions de lignes. Le préfiltre final est borné
   (union des listes de jetons + tests d'inclusion par org).
4. **La garde via/confiance de la règle 2 a été perdue** en extrayant la
   spec dans le module testé — attrapée par les propres tests de S5.1 avant
   tout commit du moteur.
5. **Deux domaines du référentiel sont faux** (mauguio-carnon.com au club de
   triathlon au lieu de la mairie ; iledefrance-nature.fr à Nature et Progrès
   au lieu de l'agence régionale) — trouvés par les verdicts, à corriger dans
   le référentiel (hors périmètre de la vague).

## Ce que la vague ne prétend pas

- Les **indécidables** (27 % des rattachements frais : égalités de nom sans
  site ni domaine) ne sont pas des échecs du moteur — ce sont des cas où
  deux canaux de preuve ne suffisent pas. Leur voie est la revue humaine et
  l'enrichissement du référentiel (domaines, sites).
- Les règles sont **une spec testée**, pas encore branchées dans le moteur :
  le moteur livré n'a pas changé pendant la vague (périmètre). Brancher les
  règles dans `promote.ts` est l'étape suivante, couverte par les tests et
  le jeu d'or.
- La précision « après règles » (83,3 % brut) porte sur les **rattachements
  encore produits** — 29 % de la population d'indices. Les 71 % écartés
  l'étaient à ~0 % de précision mesurée : ne plus les produire est un gain,
  pas une perte, à condition que la file de revue absorbe les cas ambigus.

## Rejouer

docs/mesure-precision.md porte les commandes, une par étape. L'état complet
de la campagne (graines, lots de verdicts, horodatages) est dans
`bench/state/wave-precision.json` et les fichiers de `bench/precision/`.
