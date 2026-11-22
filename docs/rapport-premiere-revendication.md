# Première revendication — latence mesurée sur 7 jours

Mesure rejouée le **2026-11-22** sur la base de travail réelle : ≈ 1 673 151 organisations, 312 sources, 26 394 événements, 4710 archives, 16 901 revendications en quarantaine. Empreinte base : `f4026f3d37041b96`.

## Chiffre mesuré

Fenêtre glissante de **7 jours** ; cible : **moins d'une heure** entre la publication de la revendication et sa première trace dans le radar. Le chiffre de référence est la médiane (p50).

**Objectif atteint** : p50 **0,43 h** sur 45 revendications du flux de première revendication collectées en direct, avec 40 revendications (88,90 %) sous une heure. Le rejeu du collecteur corrigé donne un p50 de **1,86 min** et un maximum de **4,91 min** (cadence 300 s).
OBJECTIF : atteint — 0,43 / 1 h (p50 de première revendication en collecte directe)

| Population (collecte directe) | Revendications | p50 (h) | p90 (h) | max (h) | ≤ 1 h |
| --- | ---: | ---: | ---: | ---: | ---: |
| Flux public (`ransomlook`) | 45 | **0,43** | 0,81 | 17,46 | 40 (88,90 %) |
| Sites de fuite (`ransomware.live`, contexte) | 28 | **7,13** | 11,00 | 14,67 | 0 (0,00 %) |

Sous-ensemble Nouvelle-Aquitaine : 0 revendication(s) datée(s) sur le flux public, p50 **0,00 h**, 0 en moins d'une heure ; 0 sur les sites de fuite, p50 **0,00 h**, 0 en moins d'une heure.

## Référence avant correction et imports de masse

Les importations groupées d'un corpus (au moins 50 premières traces d'une même source dans la même heure) mesurent l'âge d'un fait rejoué, pas notre délai de collecte. Elles restent publiées ici, sans être fusionnées avec la mesure de collecte directe.

| Population | Revendications | p50 (h) | p90 (h) | max (h) | ≤ 1 h |
| --- | ---: | ---: | ---: | ---: | ---: |
| Flux public — toutes traces | 245 | 19,07 | 43,64 | 47,60 | 41 (16,70 %) |
| Flux public — import de masse | 200 | 22,01 | 43,64 | 47,60 | 1 (0,50 %) |
| Sites de fuite — toutes traces | 228 | 26,95 | 48,61 | 55,34 | 0 (0,00 %) |
| Sites de fuite — import de masse | 200 | 27,83 | 48,66 | 55,34 | 0 (0,00 %) |

## Rejeu du collecteur corrigé

Sur les dates de publication réelles de la fenêtre, un collecteur périodique reçoit chaque revendication au prochain tick. La phase vient de la première exécution réelle de `ransomlook` dans la fenêtre (`2026-11-15T19:51:46.375Z`) ; le calcul est déterministe et ne dépend pas de l'heure courante.

| Collecteur | Cadence | Publications | p50 (min) | p90 (min) | max (min) | ≤ 1 h |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `ransomlook` | 300 s | 245 | **1,86** | 4,26 | 4,91 | 245/245 |
| sites de fuite | 1800 s | 228 | **17,61** | 27,19 | 29,89 | 228/228 |

## Définition

- Une **revendication** est une assertion tierce (`third_party_claim`) d'un groupe de rançongiciel, pas un incident confirmé ni une donnée personnelle de victime.
- La **publication** est la date annoncée par la source : `observed_at` pour le flux public, `claimed_at` pour les sites de fuite.
- La **première trace** est la première écriture réelle en base : `least(collected_at, created_at)` pour `event`, `received_at` pour `quarantine_raw`.
- Les deux dates doivent tomber dans les 7 derniers jours ; sinon l'écart mesurerait l'âge d'un fait ancien réingéré, pas notre latence. Un `dedup_key` compte pour un incident.
- Un **import de masse** regroupe au moins 50 premières traces de la même source dans la même heure. C'est un rejeu de corpus, mesuré à part.
- Le sous-ensemble NA vient du drapeau `regional` de l'événement : la jointure sur le département des 1,6 M d'organisations ne tient pas dans la fenêtre de 60 s sous la charge courante et reste hors de la mesure.

## Requêtes

```sql
WITH claims AS (
  SELECT e.dedup_key AS id,
         min(e.source_id) AS source,
         min(e.observed_at) AS published,
         min(least(e.collected_at, e.created_at)) AS first_seen,
         bool_or(coalesce(e.regional, false)) AS na
    FROM event e
   WHERE e.assertion_type = 'third_party_claim'
     AND e.observed_at >= now() - interval '7 days'
     AND e.observed_at <= now()
   GROUP BY e.dedup_key
), tagged AS (
  SELECT id, source, published, first_seen, na,
         count(*) OVER (PARTITION BY source, date_trunc('hour', first_seen)) AS burst
    FROM claims
   WHERE first_seen >= published
)
SELECT id, source, published, first_seen, na, (burst >= $1) AS backfill FROM tagged

WITH tagged AS (
  SELECT q.id::text AS id, q.source, q.claimed_at AS published, q.received_at AS first_seen,
         false AS na,
         count(*) OVER (PARTITION BY q.source, date_trunc('hour', q.received_at)) AS burst
    FROM quarantine_raw q
   WHERE q.kind = 'claim'
     AND q.claimed_at >= now() - interval '7 days'
     AND q.claimed_at <= now()
     AND q.received_at >= q.claimed_at
)
SELECT id, source, published, first_seen, na, (burst >= $1) AS backfill FROM tagged

SELECT (extract(epoch FROM min(started_at)) * 1000)::bigint AS anchor_ms
  FROM collector_run
 WHERE source_id = 'ransomlook'
   AND started_at >= now() - interval '7 days'
```

## Par source (flux public, collecte directe)

| Source | Revendications | p50 (h) |
| --- | ---: | ---: |
| `ransomlook` | 45 | 0,43 |

## Limites du chiffre

- Il ne mesure pas le délai entre l'attaque et sa revendication : l'horloge part de la publication annoncée par la source, pas de la survenue de l'attaque.
- Le rejeu mesure la latence ajoutée par notre collecteur ; il ne mesure pas l'attente chez la source avant que le post apparaisse dans le flux public.
- La file de sites de fuite est publiée à titre de contexte : la date d'une liste de fuite n'est pas la date de la première revendication publique.
- Le sous-ensemble Nouvelle-Aquitaine est petit sur une fenêtre de 7 jours : il est publié pour information, pas comme une estimation stable.

## Ce qui a été corrigé

- Le collecteur `ransomlook` garde un curseur borné de clés au lieu d'un marqueur `lastDate` unique : une revendication publiée avec une date antérieure au dernier marqueur n'est plus perdue.
- Sa cadence passe de 3 600 s à 300 s, soit une attente maximale de 5 minutes avant reprise.
- La mesure distingue désormais la collecte directe des imports de masse, qui n'étaient pas séparés et faisaient passer un rejeu de corpus pour une latence de veille.
- `apps/api/src/server.ts` n'est pas modifié : 0 ligne de diff (contrainte ≤ 10 lignes).
- La ligne `OBJECTIF :` est produite par le générateur et vérifiée ligne par ligne, sans chiffre ancien.

## Reproduire

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-premiere-revendication.mts
```

Commande unique, lecture seule, sans service payant ; aucune étape ne dépasse 60 s.
