# Délai de détection — publication → première apparition en base

Mesure rejouée sur la base de travail le **2026-11-21**. 7781 exécutions de collecteur, 214 sources, 26719 événements, 4710 archivés, 312 sources déclarées.
Fenêtre de collecte effective : **2026-11-13 → 2026-11-21 (bornes incluses)**. Empreinte base : `a384c4cf3ae21062bf6ad9522ae34a548cc8e4c4603b05252980001b6f316a84`.

## Définition — ce qui compte comme « vu »

Un incident **vu** est une ligne réellement écrite en base (`event` ou `event_archive`), pas un incident rejoué par un bench. La publication est `observed_at` ; la première apparition est `least(collected_at, created_at)` (les archives n'ont pas de `created_at`, on prend `collected_at`). L'écart est calculé en SQL, en heures, sans arrondi intermédiaire.

- **Périmètre** : publication tombée dans la fenêtre de collecte 2026-11-13 → 2026-11-21 (bornes incluses) ; familles `cti`, `ransomware`, `leaks`, `paste`, `presse_cyber`.
- **Motif d'exclusion** : en dehors de cette fenêtre, `observed_at` est la date d'un fait ancien (CVE, brèche déjà connue) réingéré par un flux : l'écart mesurerait l'âge du fait, pas notre latence. Les familles `vuln`, `cert` et `cert_fr` sont exclues pour la même raison : `observed_at` y est la date de la notice de vulnérabilité, pas d'un incident.
- **Exclus de la mesure** : `cert` 285, `cert_fr` 271, `vuln` 23564.
- **Unité** : un `dedup_key` = un incident, même si plusieurs sources l'ont collecté.

## Requête SQL

```sql
WITH apparitions AS (
  SELECT e.dedup_key, e.source_id, e.family, e.observed_at,
         least(e.collected_at, e.created_at) AS apparition
    FROM event e WHERE e.observed_at IS NOT NULL
  UNION ALL
  SELECT a.dedup_key, a.source_id, a.family, a.observed_at,
         a.collected_at AS apparition
    FROM event_archive a WHERE a.observed_at IS NOT NULL
), fenetre AS (
  SELECT date_trunc('day', min(started_at))::date AS debut,
         (date_trunc('day', max(started_at)) + interval '1 day')::date AS fin
    FROM collector_run
), incidents AS (
  SELECT a.dedup_key,
         min(a.source_id) AS source_id,
         min(a.family) AS family,
         min(a.observed_at) AS publication,
         min(a.apparition) AS apparition
    FROM apparitions a, fenetre f
   WHERE a.observed_at >= f.debut AND a.observed_at < f.fin
     AND a.apparition >= a.observed_at
     AND a.family IN ('cti', 'ransomware', 'leaks', 'paste', 'presse_cyber')
   GROUP BY a.dedup_key
)
SELECT source_id AS "sourceId", family, publication, apparition,
       extract(epoch FROM (apparition - publication)) / 3600.0 AS heures
  FROM incidents ORDER BY heures, dedup_key
```

## Résultats

**1902 incident(s) vu(s) daté(s).**

| Statistique | Heures | Jours |
| --- | ---: | ---: |
| min | 0,00 | 0,0 |
| **p50** | **0,68** | **0,0** |
| **p90** | **40,46** | **1,7** |
| max | 173,85 | 7,2 |
| moyenne | 11,59 | 0,5 |

Histogramme (seau de 24 h) :

```
    0–24 h | ######################################## 1547
   24–48 h | #######                                   256
   48–72 h | ##                                         74
   72–96 h |                                            13
  96–120 h |                                             0
 120–144 h |                                             7
 144–168 h |                                             3
 168–192 h |                                             2
```

## Par source (au moins 20 incidents)

| Source | Incidents | p50 (h) | p90 (h) |
| --- | ---: | ---: | ---: |
| `ransom-nomoreransom` | 20 | 0,00 | 0,00 |
| `cat-circl-news` | 20 | 0,00 | 0,00 |
| `ransom-securityalert` | 35 | 0,00 | 0,01 |
| `ransom-emsisoft-decrypt` | 312 | 0,00 | 0,02 |
| `ransom-ransomwarelive` | 103 | 0,01 | 0,01 |
| `tg-cvenotify` | 392 | 0,36 | 0,76 |
| `leak:databreaches:feed` | 31 | 1,75 | 49,07 |
| `ransomlook` | 311 | 16,99 | 43,64 |
| `actu-securityaffairs` | 32 | 17,69 | 34,73 |
| `leak:ransomlook:recent-api` | 251 | 18,07 | 43,68 |
| `leak:ransomware-live:recent-rss` | 58 | 21,36 | 50,59 |
| `actu-hackread` | 27 | 26,22 | 50,96 |
| `actu-infosecurity-magazine` | 32 | 27,33 | 54,93 |
| `tg-darkfeednews` | 65 | 29,34 | 53,01 |

## Dix délais les plus longs

| Source | Famille | Publication | 1ʳᵉ apparition | Délai (h) |
| --- | --- | --- | --- | ---: |
| `gn-23` | cti | 2026-11-13 | 2026-11-20T16:58:13.888Z | 173,85 |
| `gn-17` | cti | 2026-11-13 | 2026-11-20T22:20:16.024Z | 169,70 |
| `gn-mairie-cyber` | cti | 2026-11-13 | 2026-11-20T18:35:19.538Z | 166,14 |
| `gn-fuite-metropoles` | cti | 2026-11-14 | 2026-11-21T16:08:45.569Z | 164,71 |
| `gn-fuite-metropoles` | cti | 2026-11-14 | 2026-11-21T09:40:01.737Z | 157,66 |
| `gn-cyber-na` | cti | 2026-11-14 | 2026-11-20T16:58:16.392Z | 140,88 |
| `gn-17` | cti | 2026-11-15 | 2026-11-20T22:20:11.737Z | 134,45 |
| `gn-press-lamontagne` | presse_cyber | 2026-11-15 | 2026-11-20T23:27:07.572Z | 133,30 |
| `gn-fuite-metropoles` | cti | 2026-11-15 | 2026-11-21T00:45:25.023Z | 126,80 |
| `gn-fuite-metropoles` | cti | 2026-11-15 | 2026-11-20T16:58:17.414Z | 125,93 |

## Ce que ce chiffre ne mesure pas

- Il ne mesure pas la couverture des incidents publics de Nouvelle-Aquitaine : aucune des 20 URL du corpus vérifié (`bench/couverture/incidents.jsonl`) et aucune des 60 URL du corpus de référence ne figure dans `event` ou `event_archive` (0 correspondance(s) sur 60). Voir `docs/faux-negatifs.md`.
- Il ne mesure pas la vitesse de la rédaction source : le départ est `observed_at`, la date à laquelle le flux a publié le fait, pas la date de survenue de l'attaque.
- Il n'inclut pas les incidents publiés hors de la fenêtre de collecte : l'absence de délai mesurable n'y est pas une absence de retard, c'est une absence de collecte.

## Reproduire

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/delai-detection.mts
```
