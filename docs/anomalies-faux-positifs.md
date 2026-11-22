# Anomalies de séries — taux de fausses alertes sous 10 %

Chantier `ext/chantier-e4`, suite directe de la PR #288 (« Anomalies de séries :
z-score robuste explicable »). La PR livrait le détecteur mais publiquait
**85,7 %** de fausses alertes (6 sur 7) : son objectif chiffré n'était donc pas
atteint. Les fichiers du détecteur et du rejeu étaient identiques sur cette
branche ; le travail a repris exactement cette base, sans écraser les autres
chantiers fusionnés depuis.

## Résultat mesuré

**Taux de fausses alertes : 0 %** (0 fausse sur 1 alerte émise), contre 85,7 %
dans la PR #288 et 83,3 % (5 sur 6) sur la base courante avant correction.
L'objectif « sous 10 % » est atteint.

```
Avant garde-fou : 6 alertes — 5 fausses, 1 vraie — 83,3 %
Après garde-fou : 1 alerte  — 0 fausse, 1 vraie  —  0,0 %
```

Le dénominateur est petit : il faut le lire avec la liste des alertes retirées,
pas comme une promesse statistique. Les cinq alertes retirées portaient toutes
un verdict manuel « fausse » pour le même motif (import différé) ; l'unique
alerte conservée porte un verdict manuel « vraie ». Aucune vraie alerte connue
n'a été supprimée. Si un rejeu n'émet aucune alerte, le taux reste `null`
(règle déjà en place), jamais 0 %.

## Cause mesurée

Le détecteur de la PR #288 calcule ses séries sur `event.observed_at`. Or les
six alertes fausses du rapport d'origine sont des lots `cisa_kev` dont les faits
ont été observés entre 24 et 215 jours avant d'être collectés (par exemple
`2026-04-13` observé, importé le `2026-11-13`). Le pic journalier est un effet
d'import, pas un signal nouveau. Sur la base courante, les cinq alertes fausses
restantes ont des retards de collecte de 24,86 à 214,86 jours ; l'alerte vraie
(`poc_github`, 6 PoC publics distincts) a été collectée en moins d'un jour.

## Correction, par étapes testables

1. `apps/api/src/analyse/evidence-freshness.ts` (code en anglais, fonction pure) :
   `collectionLagDays`, `assessFreshness` et `filterFreshAlerts`. Une alerte est
   conservée si au moins 50 % de ses faits ont été collectés dans les 7 jours
   suivant leur observation ; le retard maximal est joint au motif de rejet.
   Un horodatage absent ou invalide n'entraîne jamais une suppression : le
   signal est conservé par défaut. Le seuil de 7 jours laisse une marge large
   entre l'alerte vraie (< 1 jour) et le premier import différé (24,86 jours).
2. `scripts/mesure-anomalies-series.mts` lit désormais `collected_at`, associe
   chaque fait à son horodatage, applique le garde-fou avant l'échantillonnage
   et publie un bloc `fraicheur` (seuils, conservées, rejetées, motifs).
3. `apps/api/test/evidence-freshness.test.ts` : sept tests, un par comportement
   — rafale fraîche conservée, import différé rejeté, minorité fraîche
   insuffisante, valeur exactement au seuil, horodatage inutilisable, options
   invalides, filtrage des alertes par identifiant de fait.

La mesure porte sur la même base réelle que la PR #288 : **1 673 151**
organisations du référentiel et **312** sources au catalogue ; **26 394**
événements datés portent une série (73 organisations, 98 sources), du
2015-07-24 au 2026-11-21, sur 589 jours distincts. Aucune source nouvelle,
aucune donnée personnelle de victime (seuls identifiants d'événements, titres et
URL publiques des preuves), aucun service payant. `apps/api/src/server.ts`
n'est pas modifié (0 ligne de diff).

## Commande reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-anomalies-series.mts \
  --json=bench/results/anomalies-faux-positifs-2026-11-22.json \
  --verdicts=bench/results/anomalies-series-verdicts.json --echantillon=20
```

Sortie : `bench/results/anomalies-faux-positifs-2026-11-22.json` — chiffres
`fraicheur.alertesConservees = 1`, `fraicheur.alertesRejetees = 5`,
`echantillon.tauxFaussesAlertes = 0`. Le champ `dateMesure` reprend la date du
dernier événement observé (2026-11-21), pas la date d'exécution du script.
Les verdicts manuels restent dans `bench/results/anomalies-series-verdicts.json`
et n'ont pas été réécrits.

La requête trie les faits par identifiant : deux exécutions de cette commande
produisent un JSON octet pour octet identique (sha256 vérifié à 84b8afce…).

## Vérifications

- 19 tests ciblés verts (7 nouveaux + 12 hérités des anomalies) ;
- `tsc --noEmit -p apps/api/tsconfig.json` : sortie vide, code 0 ;
- rejeu rejoué sur la base locale réelle, commande ci-dessus.

OBJECTIF : atteint — 0 % de fausses alertes (0/1 alerte émise) / 10 %
