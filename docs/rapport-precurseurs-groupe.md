# Signaux collectifs antérieurs des victimes NA : revendications par groupe

OBJECTIF : partiel — 16/16 victimes couvertes par un signal collectif antérieur group-agnostique calculable à la coupure / 15/15 cible, et 0 hit / 60 prédictions / 1 hit attendu ; manque 1 hit sur 60, aucun signal individuel antérieur n'étant assez sélectif pour entrer dans le top 10.

## Ce qui est livré

Une treizième classe de signaux, jamais auditée par les tranches précédentes : les **revendications antérieures du même groupe** dans le même secteur ou le même département. Les douze sources déjà mesurées (`docs/rapport-signaux-precurseurs.md`, `docs/rapport-precurseurs-ct.md`, `docs/rapport-precurseurs-quarantaine.md`) ne regardaient que des signaux **individuels** rattachés à l'organisation victime. Elles étaient toutes à zéro.

Le module pur `apps/api/src/prediction/group-precursors.ts` rattache à chaque victime les revendications d'**autres organisations** dont :

- le groupe est identique après normalisation exacte (casse, espaces, diacritiques ignorés ; **jamais** de correspondance par sous-chaîne) ;
- le secteur ou le département est identique ;
- la date est **strictement antérieure** à la propre revendication de la victime.

Une organisation est comptée une fois par portée même avec plusieurs signaux. Le jour de la revendication n'est jamais compté. Seules les 74 revendications NA rattachées à une organisation de Nouvelle-Aquitaine sont lues.

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  npm run measure:group-precursors -- --as-of=2026-11-22 \
  --json=bench/results/group-precursors-2026-11-22.json
```

Sortie observée (7,6 s, base locale réelle) :

```
Group precursors — 6 windows 2026-05-26 → 2026-11-22
Victims: 15 NA organisations x 2 collective sources = 30 pairs (74 NA claims read)
  departement  5/15 victims, 7 prior signals
  secteur      3/15 victims, 9 prior signals
Prior signals: 8/30 pairs, victims covered 7/15 (0.4667)
```

Le détail est figé dans `bench/results/group-precursors-2026-11-22.json`.

## Interprétation

C'est la première mesure **non nulle** du chantier : 7 des 15 victimes du rétro-test avaient, avant leur propre revendication, une revendication antérieure d'une autre organisation par le même groupe dans leur secteur ou leur département. Les auditions précédentes n'étaient donc pas fausses, mais incomplètes : elles excluaient par construction le signal collectif.

Ce signal ne peut pas encore être injecté dans le classement top-10. Il est **conditionné au groupe de la revendication future** : il dit « si Qilin frappe ce secteur, telle organisation est à risque », mais au moment du classement on ignore quel groupe frappera. L'utiliser pour choisir les dix organisations revendiquées reviendrait à intégrer l'issue dans les caractéristiques — une fuite de données. Le score n'est donc volontairement pas modifié dans cette tranche : le classement reste à 0 hit sur 60 prédictions.

La suite utile est de rendre ce signal **inconditionnel** : mesurer, à chaque date de coupure, la concentration et l'activité récente des groupes par secteur et département, puis vérifier sur le même rétro-test que l'ajout d'une telle caractéristique produirait au moins un hit sans fuite. Tant que cette mesure n'est pas faite, le classement ne doit toujours pas être présenté comme une alerte fiable.

## Rattrapage du 24 novembre 2026 — signal group-agnostique à 365 jours

Le manque déclaré plus haut — un signal antérieur applicable au classement sans connaître le groupe de la future revendication — est traité sur le plan de la disponibilité en réutilisant le module déjà fusionné `apps/api/src/prediction/sector-wave.ts`, sans nouvelle classe de signaux et sans lire l'issue : la fenêtre passe de 30 à 365 jours. Le script de mesure accepte désormais `--lookback`, et les deux commandes npm déjà citées dans les rapports (`measure:group-precursors`, `measure:sector-wave`) sont ajoutées à `package.json` pour que ces mesures soient rejouables telles que documentées.

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  npm run measure:sector-wave -- --as-of=2026-11-22 --lookback=365 \
  --json=bench/results/sector-wave-365-2026-11-22.json
```

Sortie observée (86 s, base locale réelle) :

```
Sector-wave precursors — 6 windows 2026-05-26 → 2026-11-22
Lookback: 365 days
Victims: 16 NA organisations x 3 scopes = 48 pairs (77 NA claims read)
  departement     15/16 victims, 77 prior signals
  secteur         12/16 victims, 37 prior signals
  secteur_groupe  15/16 victims, 198 prior signals
Prior signals: 42/48 pairs, victims covered 16/16 (1.0000)
Active sector groups at 2026-11-22: services=22, commerce=5, autre=3, construction=2, enseignement=2, industrie=1, public=1
Backtest hits: baseline 0/60, wave-injected 0/60 (16 victims)
```

Le détail est figé dans `bench/results/sector-wave-365-2026-11-22.json`. La couverture passe de 7/15 (signal conditionné au groupe futur) à **16/16** (signal calculable à la coupure sans ce groupe), au-dessus de la cible de 15/15 ; entre-temps le jeu de données est passé de 15 à 16 victimes et de 74 à 77 revendications NA.

Le second écart chiffré reste ouvert : **0 hit sur 60 prédictions**, contre 1 attendu. Le signal est disponible mais non sélectif — les organisations d'un même secteur groupé reçoivent toutes le même bonus borné, et les dix premières places restent occupées par des organisations déjà revendiquées. Des variantes exploratoires (groupe anticipé à la coupure, autres fenêtres, classement des organisations non encore revendiquées) n'ont pas produit de hit non plus ; elles ne sont pas intégrées au code livré. Le classement publié ne doit toujours pas être présenté comme une alerte fiable.

Deux tests supplémentaires, un par comportement, couvrent la fenêtre explicite de 365 jours : 18 tests verts dans `sector-wave.test.ts`, typecheck API vert. `apps/api/src/server.ts` reste inchangé (0 ligne de diff).

## Conformité

- Nouvelle-Aquitaine uniquement : victimes et revendications sources filtrées sur les 12 départements de la région.
- Sources grises déjà présentes en base ; aucun service payant, aucun appel réseau.
- Aucune donnée personnelle : la mesure ne lit que des identifiants d'organisation, des libellés de groupe, des codes secteur/département et des dates ; ni nom de victime, ni description de revendication, ni URL de preuve ne sont exposés.
- `apps/api/src/server.ts` inchangé : **0 ligne de diff**.
- 14 tests pour la mesure initiale, 18 avec le rattrapage, un par comportement, verts ; typecheck API vert ; mesure initiale en 7,6 s, mesure 365 j en 86 s.
