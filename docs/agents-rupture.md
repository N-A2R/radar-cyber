# Agents de rupture

Trois détecteurs déterministes (sans LLM) dans `apps/api/src/analyse/rupture.ts`.
Les **trois agents CPU** livrés ensuite (organisation surgissante, bascule
sectorielle par z-score, source muette) sont documentés et mesurés dans
`docs/agents-cpu.md`.

## 1. Nouvelle organisation (`nouvelle-organisation`)
Déclenche quand une organisation existe au référentiel depuis au moins 180 j
mais n'apparaît dans les faits que depuis au plus 30 j.

## 2. Rafale (`rafale`)
Plusieurs faits de même famille sur la même zone en 7 j, en nombre supérieur
au double de la médiane historique de cette zone (minimum 3 faits).

## 3. Changement de nature (`changement-nature`)
Une organisation déjà vue pour un type d'incident subit un autre type, plus
grave d'au moins 2 niveaux sur l'échelle 1–5.

## Mesure du taux de fausses alertes
Protocole : échantillonner N alertes générées sur une période, les faire
relire par un analyste (aveugle au score), classer chacune vrai positif /
faux positif. Taux = faux positifs / N. Répéter sur plusieurs périodes et
reporter la médiane. Aucun chiffre n'est inventé ici : la mesure se fait sur
données réelles.
