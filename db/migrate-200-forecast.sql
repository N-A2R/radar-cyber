-- Marché de prédictions internes : un pronostic régional = une probabilité
-- chiffrée, une résolution future et un résultat binaire observable.
--
-- `forecast` est une table de marché, pas un journal d'événements : chaque
-- ligne porte la note rétrospective (probability, outcome) et l'horodatage de
-- résolution. La contrainte garantit qu'aucune ligne ne puisse être publiée
-- sans résultat connu, et l'unicité empêche de noter deux fois le même pari.

CREATE TABLE IF NOT EXISTS forecast (
  id            bigserial PRIMARY KEY,
  dept          text NOT NULL,
  window_start  timestamptz NOT NULL,
  horizon_days  integer NOT NULL CHECK (horizon_days > 0),
  probability   double precision NOT NULL CHECK (probability >= 0 AND probability <= 1),
  outcome       smallint NOT NULL CHECK (outcome IN (0, 1)),
  resolved_at   timestamptz NOT NULL,
  model         text NOT NULL,
  source        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forecast_resolved_after_window CHECK (resolved_at > window_start),
  CONSTRAINT forecast_unique_bet UNIQUE (dept, window_start, horizon_days, model)
);

CREATE INDEX IF NOT EXISTS forecast_resolved_idx
  ON forecast (resolved_at) INCLUDE (probability, outcome);

-- Observations réelles utilisées par le modèle : dates d'incidents des corpus
-- régionaux versionnés (presse locale et publications locales), sans titre,
-- sans organisation et sans aucune donnée personnelle. Le calcul est le même
-- que celui de apps/api/src/analyse/regional-forecast.ts ; le script
-- scripts/seed-forecast-market.mts peut régénérer et vérifier les paris.
CREATE TABLE IF NOT EXISTS forecast_observation (
  id          bigserial PRIMARY KEY,
  dept        text NOT NULL,
  occurred_on date NOT NULL,
  source      text NOT NULL
);

CREATE INDEX IF NOT EXISTS forecast_observation_dept_date_idx
  ON forecast_observation (dept, occurred_on);

INSERT INTO forecast_observation (dept, occurred_on, source)
SELECT
  CASE v.slug
    WHEN 'charente' THEN '16' WHEN 'charentemaritime' THEN '17'
    WHEN 'correze' THEN '19' WHEN 'creuse' THEN '23'
    WHEN 'dordogne' THEN '24' WHEN 'gironde' THEN '33'
    WHEN 'landes' THEN '40' WHEN 'lotetgaronne' THEN '47'
    WHEN 'pyreneesatlantiques' THEN '64' WHEN 'deuxsevres' THEN '79'
    WHEN 'vienne' THEN '86' WHEN 'hautevienne' THEN '87'
  END,
  d.occurred_on::date,
  'corpus régional versionné: bench/corpus/incidents-' || v.slug || '.jsonl'
FROM (VALUES
  ('charente','2024-05-10,2024-05-18,2024-08-25,2025-06-13,2025-09-09,2025-11-10,2026-01-20,2026-01-23,2026-02-22,2026-03-02'),
  ('charentemaritime','2024-07-01,2025-02-07,2025-09-18,2025-11-27,2025-12-11,2026-02-25,2026-05-21,2026-08-17,2026-09-07,2026-10-12,2026-10-30,2026-11-12'),
  ('correze','2024-12-15,2025-02-12,2025-02-26,2025-06-05,2025-06-20,2025-10-18,2026-10-12,2026-11-05,2026-11-05'),
  ('creuse','2024-01-03,2024-12-12,2025-01-17,2025-05-15,2025-07-11,2025-11-10,2026-04-29,2026-08-05,2026-09-02'),
  ('deuxsevres','2024-11-15,2025-02-27,2025-11-14,2025-12-08,2025-12-13,2026-02-09,2026-08-23,2026-10-11,2026-11-12'),
  ('dordogne','2024-11-18,2025-01-14,2025-03-25,2025-08-11,2025-11-07,2025-11-18,2026-01-26,2026-02-27,2026-08-07,2026-10-11,2026-10-28,2026-10-29,2026-10-30'),
  ('gironde','2024-04-18,2024-06-28,2024-08-16,2024-12-31,2025-02-21,2026-01-20,2026-03-02,2026-03-03,2026-04-06,2026-04-27,2026-05-10,2026-06-15,2026-07-08,2026-09-08'),
  ('hautevienne','2024-11-07,2024-11-07,2024-12-31,2025-06-27,2025-10-18,2026-06-29,2026-09-22,2026-10-14'),
  ('landes','2024-12-31,2025-03-21,2025-04-03,2025-08-26,2026-01-20,2026-07-25,2026-08-28,2026-08-29,2026-10-12'),
  ('lotetgaronne','2024-10-01,2024-11-07,2025-01-03,2025-10-03,2026-01-26,2026-04-21,2026-05-24,2026-09-11,2026-10-12,2026-10-12,2026-11-05'),
  ('pyreneesatlantiques','2024-05-13,2024-05-31,2024-06-26,2024-12-31,2026-03-17,2026-08-17,2026-09-11,2026-10-08,2026-10-12,2026-11-05'),
  ('vienne','2024-07-03,2024-12-31,2025-08-29,2026-01-22,2026-03-02,2026-08-01,2026-10-12,2026-10-12')
) AS v(slug, dates)
CROSS JOIN LATERAL unnest(string_to_array(v.dates, ',')) AS d(occurred_on)
WHERE NOT EXISTS (SELECT 1 FROM forecast_observation);

-- Un pari par département et par fenêtre de 14 jours. Le taux de base et le
-- taux départemental ne utilisent que les fenêtres strictement antérieures ;
-- le résultat est comparé aux observations de la fenêtre résolue.
WITH bounds AS (
  SELECT min(occurred_on) AS first_day,
         max(occurred_on) AS last_day,
         count(DISTINCT dept) AS n_depts
  FROM forecast_observation
), bins AS (
  SELECT generate_series(0, (last_day - first_day) / 14) AS bin FROM bounds
), series AS (
  SELECT d.dept, b.bin, coalesce(o.n, 0) AS n
  FROM (SELECT DISTINCT dept FROM forecast_observation) d
  CROSS JOIN bins b
  LEFT JOIN (
    SELECT o.dept, (o.occurred_on - bd.first_day) / 14 AS bin, count(*) AS n
    FROM forecast_observation o CROSS JOIN bounds bd
    GROUP BY 1, 2
  ) o ON o.dept = d.dept AND o.bin = b.bin
), pooled AS (
  SELECT bin,
         coalesce(sum(n) OVER (ORDER BY bin ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS n
  FROM (SELECT bin, sum(n) AS n FROM series GROUP BY bin) t
), features AS (
  SELECT s.dept, s.bin, s.n, p.n AS pooled,
         coalesce(
           sum(s.n) OVER (PARTITION BY s.dept ORDER BY s.bin ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
           0
         ) AS past
  FROM series s JOIN pooled p USING (bin)
)
INSERT INTO forecast
  (dept, window_start, horizon_days, probability, outcome, resolved_at, model, source)
SELECT f.dept,
       ((b.first_day + f.bin * 14 * interval '1 day')::timestamp AT TIME ZONE 'UTC'),
       14,
       (8 * ((f.pooled + 1)::double precision / (f.bin * b.n_depts + b.n_depts)) + f.past)
         / (8 + f.bin),
       CASE WHEN f.n > 0 THEN 1 ELSE 0 END,
       ((b.first_day + (f.bin + 1) * 14 * interval '1 day')::timestamp AT TIME ZONE 'UTC'),
       'na-fortnight-laplace-v1',
       'corpus régional versionné (bench/corpus/incidents-*.jsonl)'
FROM features f CROSS JOIN bounds b
ON CONFLICT (dept, window_start, horizon_days, model) DO NOTHING;
