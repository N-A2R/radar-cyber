# Première revendication — latence mesurée sur 7 jours

Mesure rejouée le **2026-11-21** sur la base de travail réelle : 1 673 151 organisations, 312 sources, 26 688 événements, 4710 archives, 16 901 revendications en quarantaine. Empreinte base : `ca9bc7b704396f4a`.

## Chiffre mesuré

Fenêtre glissante de **7 jours** ; cible : **moins d'une heure** entre la publication de la revendication et sa première trace dans le radar.

| Population | Revendications | p50 (h) | p90 (h) | max (h) | ≤ 1 h |
| --- | ---: | ---: | ---: | ---: | ---: |
| Flux public (`ransomlook`) | 247 | **19,07** | 43,64 | 47,60 | 41 (16,60 %) |
| Sites de fuite (`ransomware.live`) | 228 | **26,95** | 48,61 | 55,34 | 0 (0,00 %) |

Sous-ensemble Nouvelle-Aquitaine : 7 revendication(s) datée(s) sur le flux public, p50 **16,06 h**, 1 en moins d'une heure ; 0 sur les sites de fuite, p50 **0,00 h**, 0 en moins d'une heure.

**Conclusion** : sur cette fenêtre de 7 jours, l'objectif « moins d'une heure » n'est pas atteint : 41 revendication(s) sur 247 pour le flux public et 0 sur 228 pour les sites de fuite tombent sous la cible. Ce chiffre sert de référence avant correction ; il faudra rejouer la mesure sur une nouvelle fenêtre complète pour en évaluer l'effet.

## Définition

- Une **revendication** est une assertion tierce (`third_party_claim`) d'un groupe de rançongiciel, pas un incident confirmé ni une donnée personnelle de victime.
- La **publication** est la date annoncée par la source : `observed_at` pour le flux public, `claimed_at` pour les sites de fuite.
- La **première trace** est la première écriture réelle en base : `least(collected_at, created_at)` pour `event`, `received_at` pour `quarantine_raw`.
- Les deux dates doivent tomber dans les 7 derniers jours ; sinon l'écart mesurerait l'âge d'un fait ancien réingéré, pas notre latence. Un `dedup_key` compte pour un incident.
- Le sous-ensemble NA vient du département de l'organisation rattachée (16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87) ou du drapeau `regional`.

## Requêtes

```sql
WITH claims AS (
  SELECT e.dedup_key AS id,
         min(e.source_id) AS source,
         min(e.observed_at) AS published,
         min(least(e.collected_at, e.created_at)) AS first_seen,
         (bool_or(e.regional) OR max(CASE WHEN o.dept = ANY($1::text[]) THEN 1 ELSE 0 END) = 1) AS na
    FROM event e
    LEFT JOIN org o ON o.id = e.org_id
   WHERE e.assertion_type = 'third_party_claim'
     AND e.observed_at >= now() - interval '7 days'
     AND e.observed_at <= now()
   GROUP BY e.dedup_key
)
SELECT id, source, published, first_seen, na FROM claims WHERE first_seen >= published

SELECT q.id::text AS id, q.source, q.claimed_at AS published, q.received_at AS first_seen,
       EXISTS (SELECT 1 FROM org o
                WHERE lower(o.name) = lower(q.org_hint) AND o.dept = ANY($1::text[])) AS na
  FROM quarantine_raw q
 WHERE q.claimed_at >= now() - interval '7 days'
   AND q.claimed_at <= now()
   AND q.received_at >= q.claimed_at
```

## Par source (flux public)

| Source | Revendications | p50 (h) |
| --- | ---: | ---: |
| `ransomlook` | 247 | 19,07 |

## Ce que ce chiffre ne mesure pas

- Il ne mesure pas le délai entre l'attaque et sa revendication : l'horloge part de la publication annoncée par la source, pas de la survenue de l'attaque.
- Il n'inclut pas les revendications publiées il y a plus de 7 jours : elles sont mesurées ailleurs, dans l'historique de quarantaine.
- Un délai supérieur à une heure peut venir de la source elle-même (mise à jour différée du flux public) : la mesure ne distingue pas l'attente chez la source du temps de collecte local.
- Le sous-ensemble Nouvelle-Aquitaine est petit sur une fenêtre de 7 jours : il est publié pour information, pas comme une estimation stable.

## Ce qui a été corrigé

- Le collecteur `ransomlook` ne perd plus une revendication dont la date `discovered` est antérieure au dernier marqueur vu : une liste bornée de clés remplace le marqueur unique, avec fenêtre de recherche de 7 jours et curseur plafonné à 500 clés.
- Sa cadence passe de 3 600 s à 300 s (intervalle de 4 min après la marge de 20 %), pour qu'une revendication manquée soit reprise dans la fenêtre d'une heure.
- La mesure publiée ci-dessus porte sur la fenêtre écoulée, antérieure au correctif : aucun chiffre n'est présenté comme une amélioration observée.
- `apps/api/src/server.ts` n'est pas modifié : 0 ligne de diff (contrainte ≤ 10 lignes).

## Reproduire

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/mesure-premiere-revendication.mts
```

Commande unique, lecture seule, sans service payant ; aucune étape ne dépasse 60 s.
