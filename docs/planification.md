# Convention de planification : l'heure-humaine comme unité

> Décidée le 2026-11-21 après la vague de nuit. Un plan ne s'exprime plus en
> « tâches » ni en « heures d'agent » : il s'exprime en **heures de travail
> humain**. C'est l'unité stable ; le temps d'agent, lui, varie d'un facteur
> 5 à 8.

## Pourquoi

Le 2026-11-20, un plan de 300 minutes prévues s'est exécuté en **55 minutes**
(ratio × 5,5) ; certaines tâches scriptées ont atteint **× 8**. Le même jour, un
plan annoncé à « 30 h » sur du travail jugé n'avait aucune base : on ne savait
pas combien de temps prend un verdict vérifié à la main.

L'heure humaine règle les deux : elle ne dépend ni du modèle, ni du débit du
pont, ni de l'heure de la nuit.

## Les deux régimes

| Régime | Ce que c'est | Facteur agent/humain |
|---|---|---|
| **Scripté** | une commande fait le travail, l'agent vérifie et commite | **× 5 à 8** |
| **Jugé** | chaque cas demande une décision motivée et une preuve | **× 1 à 2** |

Un plan sérieux dit lequel il est, tâche par tâche. Un plan qui mélange les
deux sans le dire produira une estimation fausse d'un facteur 5.

## Le calibrage

- **1 nuit d'agent ≈ 1 semaine humaine** de travail **scripté** (≈ 38 h).
- **1 nuit d'agent ≈ 8 à 12 h humaines** de travail **jugé**.
- Un plan d'une semaine humaine est donc la bonne cible pour « il bosse une
  nuit », à condition de dire de quel régime il s'agit.

## La règle de calibration

Tout plan jugé commence par une **tâche de calibration** : les premiers cas
(ex. 50), puis le rythme mesuré (`verdictsParHeure`) et la projection du reste,
écrits dans le fichier d'état. Aucune projection à vue au-delà de 50 cas.

## La forme d'un plan

1. **Baseline mesurée** : des chiffres avec leur requête, pas des impressions.
2. **Budget en heures humaines**, par étape, avec le régime (scripté / jugé).
3. **Critère de sortie** par tâche : un résultat vérifiable, pas « fait ».
4. **Garde-fous** : ce qu'on refuse de faire pour tenir le délai.
5. **Reprise par état** quand la vague dépasse une session
   (`bench/state/<vague>.json`, commité à chaque tâche).
