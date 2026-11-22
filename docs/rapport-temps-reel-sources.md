# Rapport — Temps réel sur les sources

Date : 2026-11-22. Branche : `ext/chantier-b6`.

## Question

Combien de sources Nouvelle-Aquitaine peuvent être collectées en flux continu,
et quelle est la latence réelle entre la publication d'un item et son
enregistrement dans la base ?

## Ce qui a été livré

- `db/migrate-063-live-source-stream.sql` : les colonnes `source.live` et
  `source.live_interval_ms`, la table `source_live_item` et un déclencheur qui
  écrit, à l'insertion de chaque événement, `published_at`, `recorded_at` et
  `latency_ms`. Seuls les événements dont la date vient du flux
  (`date_source = 'feed'`) et dont la source est marquée `live` sont mesurés.
- `apps/api/src/collecte/live.ts` : boucle rapide indépendante du cycle général.
  Elle lit le catalogue à chaque passage, ne garde que les sources actives
  marquées `live` et situées en Nouvelle-Aquitaine (`region` ou `department`
  parmi les douze départements), puis télécharge, parse, filtre et insère avec
  le contrat d'admission commun. Chaque source est isolée : un flux mort ne
  bloque pas les autres. La cadence par défaut est 15 s
  (`RADAR_LIVE_TICK_MS`), désactivable avec `RADAR_LIVE=0`.
- `apps/api/src/server.ts` : quatre lignes seulement (un import, un appel et
  deux commentaires) pour démarrer la boucle dans le processus API.
- `scripts/measure-live-source-stream.mts` et la commande
  `pnpm measure:live-sources` : mesure reproductible sur une base réelle.
- `apps/api/test/live-source-stream.test.ts` : trois tests (cadence bornée,
  filtrage régional, latence écrite par le déclencheur).

Le cycle général de 60 secondes reste inchangé : la voie rapide s'y ajoute
sans modifier les collecteurs dédiés ni le moteur générique.

## Protocole de mesure

1. Un serveur RSS local publie des items synthétiques datés d'un `pubDate`
   ISO 8601 au moment exact de la publication. Aucune donnée personnelle,
   aucun service externe payant ; les sources grises sont autorisées.
2. Six sources `cti` de Nouvelle-Aquitaine sont enregistrées dans la base avec
   `live = true` et pointent vers ce serveur local.
3. Quatre cycles consécutifs publient un item par source, attendent 1 200 ms,
   puis appellent exactement `collectLiveSourcesOnce()`, la fonction utilisée
   par la boucle de l'API.
4. La mesure lit ensuite les lignes `source_live_item` produites par le
   déclencheur, et compte les sources distinctes et les runs réussis.
5. Toutes les lignes créées par le script sont supprimées dans un bloc
   `finally` ; la base de travail n'est pas polluée.

La latence mesurée est `recorded_at - published_at` :
`event.created_at` moins `event.observed_at`, calculé côté base au moment de
l'insertion. Elle inclut l'attente de 1 200 ms voulue avant la collecte.

## Résultats

| Indicateur | Valeur mesurée |
|---|---:|
| Sources déclarées en flux continu | 6 |
| Sources collectées (items enregistrés) | **6 / 6** |
| Sources avec un run réussi | 6 / 6 |
| Items enregistrés | 24 (4 cycles × 6 sources) |
| Latence minimale | 1 208 ms |
| Latence médiane (p50) | **1 222 ms** |
| Latence p95 | 1 340 ms |
| Latence maximale | 1 387 ms |
| Latences négatives | 0 |

Détail : `bench/results/live-source-stream.json`.

La borne supérieure théorique du cycle général est 60 000 ms ; la médiane
mesurée ici est 1 222 ms, soit environ 49 fois plus courte. comme l'attente
volontaire de 1 200 ms domine, le surcoût réel du pipeline (fetch, parse,
admission, insertion) est d'environ 22 ms au p50, 140 ms au p95 et 187 ms au
maximum observé. Aucune latence négative n'a été relevée : les horodatages de
publication et d'enregistrement sont cohérents.

## Vérification

- `tsc --noEmit -p apps/api/tsconfig.json` : aucune erreur.
- `tsx test/run.ts test/live-source-stream.test.ts` : 3 tests réussis,
  0 échec. Le test de latence insère un événement publié 2,5 s plus tôt et
  vérifie la ligne créée par le déclencheur, ainsi que l'absence de ligne
  pour une source non `live`.
- Mesure complète rejouée : 6 sources, 24 items, chiffres ci-dessus.

Commande de reproduction :

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm measure:live-sources
```

## Limites

La mesure porte sur un éditeur RSS local, pas sur des flux distants : elle
quantifie la chaîne de collecte et d'enregistrement, pas la disponibilité des
médias réels. Les latences publiées ne doivent pas être présentées comme la
fraîcheur des sources de production. Seules les sources explicitement marquées
`live` entrent dans la voie rapide ; leur nombre dépend donc du catalogue. Les
items sans date de publication fiable sont écartés de la mesure plutôt que
datés à l'heure de collecte.
