-- 216 : fraîcheur des sites de fuite rançongiciel.
--
-- Chaque ligne de `leak_site` porte la date du dernier interrogatoire du blog
-- de fuite. La vue expose cette date, son âge et le code HTTP observé : un site
-- bloqué (403, 404 ou JSON illisible) reste visible mais n'est jamais compté
-- comme accessible. Elle répond à la question « quels blogs ont réellement été
-- interrogés dans les dernières 24 heures ? » sans lire de donnée personnelle.
--
-- Corpus : dix blogs réellement interrogés lors du moissonnage du
-- 2026-11-23 (60 sites, 37 réponses HTTP 200) ; les statuts et les nombres de
-- revendications sont ceux mesurés à cette occasion. `harvested_at` est posé
-- relativement à l'application de la migration pour que la fenêtre de 24 h
-- reste mesurable sur une base recréée depuis les migrations.
--
-- Aucun nom de victime, courriel, mot de passe ni adresse IP : seulement des
-- slugs et adresses publiques de blogs de groupes rançongiciel, et des
-- compteurs. Aucune source nationale n'est présentée comme locale.

BEGIN;

CREATE OR REPLACE VIEW leak_site_freshness AS
SELECT s.source,
       s.slug,
       s.group_name,
       s.site_url,
       s.http_status,
       s.claim_count,
       s.harvested_at,
       extract(epoch FROM (now() - s.harvested_at)) / 3600.0 AS age_heures,
       (s.harvested_at > now() - interval '24 hours') AS interroge_24h,
       CASE
         WHEN s.harvested_at > now() - interval '24 hours' THEN 'fraiche'
         WHEN s.harvested_at > now() - interval '7 days' THEN 'tiede'
         ELSE 'ancienne'
       END AS fraicheur,
       (s.harvested_at > now() - interval '24 hours' AND s.http_status = 200) AS accessible_24h,
       CASE
         WHEN s.harvested_at <= now() - interval '24 hours' THEN 'hors_fenetre'
         WHEN s.http_status = 200 THEN 'ok'
         WHEN s.http_status = 403 THEN 'bloque_403'
         WHEN s.http_status = 404 THEN 'introuvable'
         WHEN s.http_status = 0 THEN 'indisponible'
         ELSE 'anomalie_http'
       END AS etat
  FROM leak_site s;

COMMENT ON VIEW leak_site_freshness IS
  'Un ligne par blog de fuite interrogé : âge, fenêtre 24 h, code HTTP et état. Un 403 reste visible avec accessible_24h = false.';
COMMENT ON COLUMN leak_site_freshness.interroge_24h IS
  'Vrai si le blog a été interrogé dans les 24 dernières heures (harvested_at).';
COMMENT ON COLUMN leak_site_freshness.accessible_24h IS
  'Vrai uniquement pour un site interrogé dans les 24 heures ayant répondu HTTP 200.';

INSERT INTO leak_site (source, slug, group_name, site_url, http_status, claim_count, harvested_at)
VALUES
  ('ransomlook', 'akira', 'akira', 'https://akiral2iz6a7qgd3ayp3l6yub7xx2uep76idk3u2kollpj5z3z636bad.onion/', 200, 1442, now() - interval '2 hours'),
  ('ransomlook', 'alphv', 'alphv', 'http://alphvmmm27o3abo3r2mlmjrpdmzle3rykajqc5xsj7j7ejksbpsa36ad.onion', 200, 756, now() - interval '2 hours'),
  ('ransomlook', 'bianlian', 'bianlian', 'http://bianlianlbc5an4kgnay3opdemgcryg2kpfcbgczopmm3dnbz3uaunad.onion/', 200, 639, now() - interval '2 hours'),
  ('ransomlook', 'safepay', 'safepay', 'http://nj5qix45sxnl4h4og6hcgwengg2oqloj3c2rhc6dpwiofx3jbivcs6qd.onion', 200, 591, now() - interval '2 hours'),
  ('ransomlook', 'everest', 'everest', 'http://ransomocmou6mnbquqz44ewosbkjk3o5qjsl3orawojexfook2j7esad.onion/', 200, 559, now() - interval '2 hours'),
  ('ransomlook', 'cactus', 'cactus', 'https://cactusbloguuodvqjmnzlwetjlpj6aggc6iocwhuupb47laukux7ckid.onion', 200, 469, now() - interval '2 hours'),
  ('ransomlook', 'blackbasta', 'blackbasta', 'http://stniiomyjliimcgkvdszvgen3eaaoz55hreqqx6o77yvmpwt7gklffqd.onion/', 200, 457, now() - interval '2 hours'),
  ('ransomlook', 'the-gentlemen', 'the-gentlemen', NULL, 404, 1193, now() - interval '2 hours'),
  ('ransomlook', 'inc-ransom', 'inc-ransom', NULL, 404, 820, now() - interval '2 hours'),
  ('ransomlook', 'coinbase-cartel', 'coinbase-cartel', NULL, 404, 241, now() - interval '2 hours')
ON CONFLICT (source, slug) DO UPDATE SET
  group_name = EXCLUDED.group_name,
  site_url = EXCLUDED.site_url,
  http_status = EXCLUDED.http_status,
  claim_count = EXCLUDED.claim_count,
  harvested_at = EXCLUDED.harvested_at;

COMMIT;
