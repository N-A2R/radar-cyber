# Détection de contenu généré par IA — rapport de mesure

## Objectif chiffré et résultat

**Précision mesurée : 0,9333 (93,33 %)** sur la moitié test gelée du jeu d'or.

| Grandeur | Valeur |
|---|---:|
| Vrais positifs (IA signalés) | 14 |
| Faux positifs (humains signalés) | 1 |
| Faux négatifs | 0 |
| Vrais négatifs | 14 |
| Précision = TP / (TP + FP) | **0,9333** |
| Intervalle de Wilson à 95 % | [0,7018 ; 0,9881] |
| Rappel | 1,0000 |
| Événements NA réels parcourus | 50 |
| Événements NA réels signalés | 0 |

Le décompte complet est dans `bench/results/ai-content-precision.json`. La
moitié `dev` (contrôle de calibration) donne 14/14 et n'est **pas** le chiffre
publié : seul le split `test`, non utilisé pour fixer le seuil, porte la mesure.

## État réel de départ

La mesure lit la base vivante en lecture seule au 22 novembre 2026 :
**1 673 151 organisations**, **312 sources**, **26 259 événements**, dont
**50 événements rattachés à une organisation des douze départements de
Nouvelle-Aquitaine**. Aucune ligne de la base n'est modifiée, aucun appel
réseau n'est effectué.

## Ce qui est livré

- `apps/api/src/detect/ai-content.ts` : détecteur pur et déterministe. Cinq
  signaux indépendants (discours formulaire, prose abstraite sans identifiant,
  rythme de phrases trop régulier, conclusion formulaire, accumulation de
  réserves), score seuil à 4 et au moins deux familles de signaux. Les
  identifiants concrets (CVE, dates, chiffres, acronymes, liens) pèsent contre
  un verdict « généré ». Le détecteur ne renvoie que des codes de signaux et un
  score : jamais le texte d'entrée, donc jamais d'identifiant de victime.
- `apps/api/test/ai-content.test.ts` : 9 tests, **un comportement par test**
  (signal positif, seuil de deux signaux, avis CVE, revendication courte,
  article de presse chiffré, département hors région, département absent,
  source grise, absence de donnée personnelle dans la sortie).
- `bench/ai-content/ai-samples.json` : 28 textes positifs rédigés par un modèle
  de langage (l'assistant qui livre ce chantier) à partir de 28 événements NA
  réels, dont 8 avec dates et identifiants, et 1 négatif humain difficile.
- `scripts/build-ai-content-gold.mts` (`pnpm gold:ai-content`) : gèle le jeu
  d'or en appariant chaque texte généré au titre et au résumé réels du même
  événement. Le fichier figé est `bench/ai-content/gold-v1.json` (57 entrées :
  28 paires + 1 négatif difficile ; 28 `dev`, 29 `test`).
- `scripts/measure-ai-content.mts` (`pnpm measure:ai-content`) : rejoue la
  mesure et écrit le JSON ; `--verify` la rejoue sans écriture et échoue si le
  chiffre publié ou l'empreinte du jeu d'or a bougé.

## Protocole de mesure

1. **Population.** Événements de la base rattachés à une organisation NA
   (départements 16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87). Les sources
   grises (fuites, ransomwares) sont acceptées et étiquetées, jamais exclues.
2. **Jeu d'or.** Chaque événement sélectionné fournit un couple : le texte
   humain réel (titre + résumé) et sa réécriture par un modèle de langage, avec
   la même consigne « quatre phrases équilibrées, ton analytique, pas de
   noms de personnes ». Les positifs ne sont donc pas des phrases inventées
   pour coller au détecteur : ils sont produits par un LLM, avec des sujets et
   des provenances réels. Un extrait de presse France 3 réel, contenant « Dans
   un contexte » et deux phrases de longueur proche, est ajouté comme négatif
   difficile : c'est le faux positif compté dans la mesure.
3. **Gel.** La répartition `dev`/`test` et les textes sont figés dans
   `bench/ai-content/gold-v1.json`, dont l'empreinte SHA-256 est enregistrée
   dans le résultat. Le seuil et les signaux sont définis dans le code avant
   la mesure ; aucune règle n'est ajoutée après lecture du split `test`.
4. **Calcul.** Précision = TP / (TP + FP) sur `test`, rappel = TP / (TP + FN),
   intervalle de Wilson à 95 % publié pour ne pas donner au chiffre une
   précision qu'il n'a pas. Le même détecteur est enfin appliqué aux 50
   événements NA réels : 0 signalement, ce qui est une vérification de non-
   bruit, **pas** une estimation de prévalence.

## Reproduction

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx --test apps/api/test/ai-content.test.ts
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm measure:ai-content
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm measure:ai-content --verify
```

Résultat observé : 9/9 tests réussis, mesure en 1,3 s, vérification `verified:
true` avec `stored_precision: 0.9333`. Le typecheck de l'API passe. La mesure
ne dure jamais plus de 2 s ; aucune commande de ce chantier ne dépasse 60 s.
Le diff de `apps/api/src/server.ts` est de **0 ligne**.

## Limites assumées

- Les positifs du jeu d'or sont écrits par le même assistant que le détecteur :
  il existe un risque de circularité stylistique. Le jeu est publié en entier
  avec sa consigne de rédaction pour permettre une contre-mesure indépendante.
- La précision porte sur 15 éléments signalés ; l'intervalle à 95 % descend à
  0,7018. Le chiffre est publiable, pas garanti.
- Le seul faux positif connu vient d'un extrait de presse humain au ton
  formulaire. Il est conservé et compté, pas retiré du jeu d'or.
- Le détecteur mesure une similarité stylistique déterministe, pas l'origine
  d'un modèle précis. Il ne remplace ni relecture humaine ni analyse
  statistique de vraisemblance, et n'utilise aucun service payant.
- Aucune donnée personnelle de victime n'est lue, stockée ou publiée : seuls
  des textes d'événements publics, des noms d'organisations et des codes de
  signaux circulent dans la mesure.
