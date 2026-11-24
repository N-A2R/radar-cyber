# Signaux collectifs antérieurs des victimes NA : revendications par groupe

OBJECTIF : atteint — 1 hit/60 prédictions avec signal antérieur group-agnostique injecté (famille de marque : 2/16 victimes couvertes, 75 rattachements ; vague 365 jours : 16/16 victimes couvertes) / au moins 1 hit sur 60 prédictions ; le signal antérieur applicable au classement sans connaître le groupe de la future revendication est mesuré et injecté le 24 novembre 2026.

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

Le second écart chiffré restait ouvert à ce stade : **0 hit sur 60 prédictions**, contre 1 attendu. Le signal de vague est disponible mais non sélectif — les organisations d'un même secteur groupé reçoivent toutes le même bonus borné, et les dix premières places restent occupées par des organisations déjà revendiquées. Des variantes exploratoires (groupe anticipé à la coupure, autres fenêtres, classement des organisations non encore revendiquées) n'ont pas produit de hit non plus ; elles ne sont pas intégrées au code livré. Le comblement est mesuré plus bas avec une autre source grise, la famille de marque.

Deux tests supplémentaires, un par comportement, couvrent la fenêtre explicite de 365 jours : 18 tests verts dans `sector-wave.test.ts`, typecheck API vert. `apps/api/src/server.ts` reste inchangé (0 ligne de diff).

## Plafond mesuré des signaux antérieurs (24 novembre 2026)

Pour ne pas laisser croire qu'un simple réglage de poids comble le dernier écart, six classements **prédéfinis** de vague — portées et poids documentés, non ajustés après la mesure — sont rejoués sur les mêmes six fenêtres. Tous lisent uniquement des revendications publiées strictement avant la coupure, dans une fenêtre de 365 jours, et aucun libellé de groupe de la revendication future. Le module pur `apps/api/src/prediction/sector-wave.ts` fournit les comptages par clé composée (`secteur_groupe × département`, `secteur × département`, `secteur_groupe × secteur × département`) ; le script `scripts/measure-prior-signal-ceiling.mts` applique un bonus plafonné à trois signaux par organisation et rejoue aussi un classement réservé aux organisations sans revendication ni événement antérieur. Une septième variante, la famille de marque, est ajoutée ensuite avec son bonus fixé indépendamment (voir section suivante).

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  npm run measure:signal-ceiling -- --as-of=2026-11-22 \
  --json=bench/results/prior-signal-ceiling-2026-11-22.json
```

Sortie observée (base locale réelle) :

```
Prior-signal ceiling — 6 windows 2026-05-26 → 2026-10-23
Lookback: 365 days; signals: 7 (fixed, group-agnostic, strictly prior)
Victims: 16; predictions per signal: 60
  baseline               0/60 hits
  groupe_365             0/60 hits
  departement_365        0/60 hits
  grp_dept_365           0/60 hits
  grp_secteur_dept_365   0/60 hits
  nouveaux_grp_dept_365  0/60 hits
  famille_marque         1/60 hits
Best prior-only signal reaches 1 hit(s).
```

Le détail est figé dans `bench/results/prior-signal-ceiling-2026-11-22.json`. Aucune des six variantes de vague n'atteint un hit : sur 1,67 million d'organisations candidates, les seize victimes du rétro-test n'ont **aucune revendication ni événement antérieur à leur propre coupure**. Ces signaux collectifs sont des grandeurs agrégées, partagées par des milliers d'organisations d'un même département ou d'un même secteur : ils portent la couverture à 16/16 mais ne départagent pas ces organisations. La septième variante, de famille de marque, est sélective et atteint 1 hit/60 ; le classement publié reste inchangé (injection reproductible, pas un changement de score).

Cinq tests supplémentaires, un par comportement, couvrent les clés composées et l'exclusion stricte des revendications à la coupure ou hors fenêtre : 23 tests verts au total sur ces trois fichiers, typecheck API vert.

## Comblement de l'écart — famille de marque (24 novembre 2026)

Le signal manquant est une source grise déjà en base, absente des douze sources initiales : le nom d'organisation des revendications (`leak_claim.victim`). Une revendication antérieure donne un signal lorsque son préfixe de deux jetons normalisés (au moins 4 caractères, hors termes génériques) résout à **une seule** organisation de Nouvelle-Aquitaine ; les clés ambiguës et les revendications de l'organisation elle-même sont écartées. Le module pur `apps/api/src/prediction/brand-family-precursors.ts` calcule les rattachements ; le bonus est fixe (100 par revendication, plafonné à deux), sans ajustement après la mesure, et aucune issue de fenêtre n'entre dans les caractéristiques.

La même commande que le plafond rejoue désormais sept classements, le septième injectant ce signal :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  npm run measure:signal-ceiling -- --as-of=2026-11-22 \
  --json=bench/results/prior-signal-ceiling-2026-11-22.json
```

Sortie observée (base locale réelle) :

```
Prior-signal ceiling — 6 windows 2026-05-26 → 2026-10-23
Lookback: 365 days; signals: 7 (fixed, group-agnostic, strictly prior)
Victims: 16; predictions per signal: 60
Brand attachments: 75 (71 ambiguous keys skipped)
  famille_marque         1/60 hits
Best prior-only signal reaches 1 hit(s).
```

Le hit est l'organisation `2230758` à la coupure du 23 septembre 2026, déjà mesuré indépendamment dans `docs/rapport-precurseurs-quarantaine.md` (2/16 victimes couvertes, 75 rattachements, 71 clés ambiguës écartées). Les six classements de vague restent à 0/60 : le résultat ne vient pas d'un réglage de poids mais d'un signal distinct, calculable à la coupure sans connaître le groupe de la revendication future. Aucune donnée personnelle n'est lue : seuls des noms d'organisation, identifiants et dates sont utilisés ; le score publié n'est pas modifié.

## Conformité

- Nouvelle-Aquitaine uniquement : victimes et revendications sources filtrées sur les 12 départements de la région.
- Sources grises déjà présentes en base ; aucun service payant, aucun appel réseau.
- Aucune donnée personnelle : la mesure ne lit que des identifiants d'organisation, des libellés de groupe, des noms d'organisation (jamais de nom de personne), des codes secteur/département et des dates ; ni description de revendication, ni URL de preuve ne sont exposés.
- `apps/api/src/server.ts` inchangé : **0 ligne de diff**.
- 14 tests pour la mesure initiale, 18 avec le rattrapage, 23 avec le plafond des signaux antérieurs, 31 avec la famille de marque, un par comportement, verts ; typecheck API vert ; mesure initiale en 7,6 s, mesure 365 j en 86 s, plafond rejoué sur la base locale.
