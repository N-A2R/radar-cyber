# Fenêtre de publication — mesure reproductible

Chantier : prédire, avant toute mention publique, la fenêtre de dates de
révélation d'un incident déjà survenu.

## Critère (sortie brute)

```sql
SELECT count(*) FROM disclosure_forecast
 WHERE issued_at<first_public_at
   AND first_public_at BETWEEN window_start AND window_end;
```

Mesure du 2026-11-23 sur une base construite depuis `db/init.sql`, toutes les
migrations et `db/detection-rules.sql` :

```text
83
émises=104 dans_la_fenêtre=83 part=0.7980769230769231
```

Objectif : au moins 50 fenêtres dans la cible, soit 40 % des émises. Ici
83/104 = 79,8 %.

## Méthode

- Vérité terrain : 128 incidents datés et dédupliqués, issus de
  `bench/corpus/incidents-*.jsonl` (69) et
  `bench/fixtures/corpus-reference-na.json` (59). Ces corpora portent une date
  de survenue et une date de première mention publique. Le corpus témoin porte
  les mêmes identifiants et n'est pas dupliqué. Seuls des identifiants, deux
  dates et le chemin du corpus sont stockés : aucun titre, aucune organisation,
  aucune donnée personnelle. Les chemins source sont conservés tels quels, sans
  présenter une source nationale comme locale.
- Émission : `issued_at = date de survenue + 23 h UTC`. Les incidents publiés
  le jour même sont écartés (24 cas) : à granularité journalière, on ne peut
  pas y prouver l'antériorité de l'émission. 104 fenêtres sont donc émises.
- Horizon : 75e percentile des délais de publication déjà résolus à la date
  d'émission, plancher 7 jours, 21 jours avant 8 antécédents. Le délai du cas
  lui-même n'entre jamais dans son propre calibrage.
- Résolution : `first_public_at` est renseigné après coup depuis la vérité
  terrain et n'influe pas sur la fenêtre. La contrainte SQL interdit toute
  fenêtre émise après ou au moment de la publication.

Le modèle est unique et côté base : `public.emit_disclosure_forecast()` dans
`db/migrate-217-disclosure-forecast.sql`. Le producteur TypeScript
(`apps/api/src/forecast/disclosure-forecast.ts`) et le script
(`scripts/mesure-disclosure-forecast.mts`) appellent cette même fonction.

## Rejouer

```sh
cd apps/api && ./node_modules/.bin/tsx test/run.ts test/disclosure-forecast.test.ts
DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-disclosure-forecast.mts
```
