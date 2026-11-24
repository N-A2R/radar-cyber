# Signaux de vague sectorielle : mesure group-agnostique des victimes NA

OBJECTIF : atteint — 1 hit / 60 prédictions avec signal antérieur individuel injecté (2/16 victimes couvertes, 75 rattachements, 4 signaux strictement antérieurs sur 16 paires) / 1 hit attendu sur 60.

## Ce qui est livré

La tranche précédente mesurait un signal collectif antérieur utilisable au classement **sans connaître le groupe de la future revendication** : il était observable mais pas sélectif (0 hit sur 60). Cette tranche ajoute un signal **individuel** du même type — group-agnostique, calculable à la coupure — et injecte les deux signaux dans le même rétro-test, sans modifier le classement publié.

- `apps/api/src/prediction/sector-wave.ts` : module pur, trois portées (`secteur_groupe`, `secteur`, `departement`), compteurs à la date de coupure (`waveCountsAtCutoff`) et bonus borné (`waveBonus`).
- `apps/api/src/prediction/brand-family-precursors.ts` : module pur, signal de famille de marque. Une revendication d'une **autre** organisation dont le nom partage exactement les deux premiers jetons normalisés avec une **seule** organisation NA crée un signal pour cette organisation, à condition d'être publiée avant la coupure. Les marques partagées et les jetons génériques sont écartés ; le bonus est plafonné à deux signaux.
- `apps/api/test/sector-wave.test.ts` et `apps/api/test/brand-family-precursors.test.ts` : 24 tests, un comportement par test, dont 8 nouveaux pour le signal individuel.
- `scripts/measure-sector-wave.mts` : mesure reproductible en lecture seule, avec baseline, vague injectée, marque injectée et les deux signaux combinés. Les candidats sont construits une seule fois par coupure, puis réutilisés par les quatre classements.
- `bench/results/sector-wave-2026-11-22.json` : résultat figé de la mesure.
- `package.json` : script npm `measure:sector-wave` manquant ajouté (le rapport le citait déjà).

Les signaux collectifs et individuels n'utilisent ni le groupe de la revendication future, ni la revendication de la victime elle-même, ni aucun fait postérieur à la coupure.

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  npm run measure:sector-wave -- --as-of=2026-11-22 \
  --json=bench/results/sector-wave-2026-11-22.json
```

Sortie observée (174 s, base locale réelle) :

```
Sector-wave precursors — 6 windows 2026-05-26 → 2026-11-22
Victims: 16 NA organisations x 3 scopes = 48 pairs (77 NA claims read)
  departement     5/16 victims, 6 prior signals
  secteur         4/16 victims, 4 prior signals
  secteur_groupe  10/16 victims, 24 prior signals
Prior signals: 19/48 pairs, victims covered 12/16 (0.7500)
Active sector groups at 2026-11-22: construction=1, services=1
Backtest hits: baseline 0/60, wave-injected 0/60 (16 victims)
Brand family: 75 attachments, prior signals 4/16 pairs, victims covered 2/16
Brand-injected hits: 1/60, combined wave+brand 1/60
```

Le détail figé est dans `bench/results/sector-wave-2026-11-22.json`. Le relevé historique (11/15 victimes, 74 revendications, 0 hit) avait été fait sur une base antérieure ; la reproductibilité actuelle lit 16 victimes et 77 revendications, sans changer la cible d'au moins 1 hit sur 60.

## Interprétation

Le signal collectif reste observable (12 des 16 victimes, dont 10 par le seul secteur groupé) mais non sélectif : la Nouvelle-Aquitaine compte plus de 1,67 million d'organisations réparties dans dix secteurs groupés. Son bonus (30 points par revendication récente, plafonné à trois) laisse le classement à 0 hit sur 60.

Le signal de famille de marque est, lui, **individuel et sélectif** : sur 75 rattachements sans ambiguïté, 4 signaux sont strictement antérieurs à la revendication de 2 victimes sur 16. Injecté sous forme de bonus borné (100 points par signal, deux signaux maximum), il place une de ces victimes dans le top 10 d'une des six fenêtres : **1 hit sur 60 prédictions**, la cible visée. Le signal combiné vague + marque donne le même résultat (1/60) : le hit vient bien du signal individuel, pas du secteur.

Il s'agit d'un audit du classement, pas d'une publication : le score publié dans l'API n'est pas modifié. Un hit sur 60 reste une précision faible (1,7 %) et ne doit pas être présenté comme une alerte fiable.

## Conformité

- Nouvelle-Aquitaine uniquement : victimes, organisations et revendications sources filtrées sur les 12 départements de la région.
- Sources grises déjà présentes en base ; aucun service payant, aucun appel réseau.
- Aucune donnée personnelle : ni nom de personne, ni description de revendication, ni URL de preuve ne sont lus ou exposés ; seuls des identifiants et noms d'organisation, des codes de secteur/département et des dates.
- `apps/api/src/server.ts` inchangé : **0 ligne de diff**.
- 35 tests ciblés verts (dont 8 nouveaux, un comportement par test) ; typecheck API vert ; mesure en 174 s reproductible sur la base locale.
