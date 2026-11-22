# Signaux de vague sectorielle : mesure group-agnostique des victimes NA

OBJECTIF : partiel — 11/15 victimes couvertes par un signal antérieur group-agnostique observable à la coupure, dont 10/15 par le seul secteur groupé, et 0 hit / 60 prédictions après injection dans le classement / 1 hit attendu sur 60 ; manque un signal antérieur individuel assez sélectif pour placer une victime dans le top 10.

## Ce qui est livré

La tranche précédente identifiait le manque : un signal collectif antérieur utilisable au classement **sans connaître le groupe de la future revendication**. Cette tranche mesure ce signal et tente l'injection sur le même rétro-test, sans modifier le classement publié.

- `apps/api/src/prediction/sector-wave.ts` : module pur, trois portées (`secteur_groupe`, `secteur`, `departement`), compteurs à la date de coupure (`waveCountsAtCutoff`) et bonus borné (`waveBonus`).
- `apps/api/test/sector-wave.test.ts` : 16 tests, un comportement par test.
- `scripts/measure-sector-wave.mts` : mesure reproductible en lecture seule, avec et sans injection du signal.
- `bench/results/sector-wave-2026-11-22.json` : résultat figé de la mesure.

Un signal est une revendication d'une **autre** organisation de Nouvelle-Aquitaine, même secteur groupé/secteur/département, dans les 30 jours **strictement antérieurs** à la revendication de la victime. Aucun libellé de groupe futur n'est utilisé : le signal est calculable à la date de coupure.

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  npm run measure:sector-wave -- --as-of=2026-11-22 \
  --json=bench/results/sector-wave-2026-11-22.json
```

Sortie observée (45,8 s, base locale réelle) :

```
Sector-wave precursors — 6 windows 2026-05-26 → 2026-11-22
Victims: 15 NA organisations x 3 scopes = 45 pairs (74 NA claims read)
  departement     4/15 victims, 5 prior signals
  secteur         4/15 victims, 4 prior signals
  secteur_groupe  10/15 victims, 24 prior signals
Prior signals: 18/45 pairs, victims covered 11/15 (0.7333)
Active sector groups at 2026-11-22: services=1
Backtest hits: baseline 0/60, wave-injected 0/60 (15 victims)
```

Le détail figé est dans `bench/results/sector-wave-2026-11-22.json`.

## Interprétation

Le signal group-agnostique est bien **observable** : 11 des 15 victimes ont au moins un signal antérieur, et 10 sur 15 par le seul secteur groupé. Il répond donc à l'objectif de la tranche précédente sur le plan de la disponibilité de l'information.

Il n'est pas **sélectif** : la Nouvelle-Aquitaine compte 1 671 906 organisations réparties dans seulement dix secteurs groupés. Une alerte « activité récente dans le secteur » couvre mécaniquement des centaines de milliers d'organisations, et le bonus injecté (30 points par revendication récente, plafonné à trois) ne fait passer aucune victime dans le top 10 : **0 hit sur 60**, comme le classement publié. La mesure a aussi été vérifiée avec des bonus de 10, 30, 60 et 120 points : toujours 0 hit.

Ce résultat confirme que le blocage n'est pas la disponibilité d'un signal collectif, mais l'absence de signal **individuel** antérieur : les douze sources horodatées déjà auditées (0/180 paires) et l'absence de domaine ou de site renseigné pour les 15 victimes ferment les pistes de rattachement locales. Le classement ne doit toujours pas être présenté comme une alerte fiable.

## Conformité

- Nouvelle-Aquitaine uniquement : victimes et revendications sources filtrées sur les 12 départements de la région.
- Sources grises déjà présentes en base ; aucun service payant, aucun appel réseau.
- Aucune donnée personnelle : ni nom de victime, ni description de revendication, ni URL de preuve ne sont lus ou exposés ; seuls des identifiants d'organisation, des codes de secteur/département et des dates.
- `apps/api/src/server.ts` inchangé : **0 ligne de diff**.
- 16 tests, un par comportement, verts ; typecheck API vert ; mesure en 45,8 s (< 60 s).
