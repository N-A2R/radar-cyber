-- 215 : anomalies inter-organismes par isolation forest.
--
-- Une organisation est comparée au profil médian de sa région (volumes par
-- famille, diversité des sources, concentration de la pointe), puis notée par
-- une forêt d'isolation déterministe. Plus le score est élevé, plus le profil
-- s'écarte de sa distribution régionale.
--
-- 200 candidats synthétiques, annotés par deux analystes indépendants ;
-- `label_analyste` est l'adjudication (les deux analystes positifs). Aucune
-- organisation, aucun événement, aucune source réelle, aucune donnée
-- personnelle : les identifiants `ifx-*` et `SYN-*` sont fabriqués.
--
-- Le critère de sortie se lit directement :
--   SELECT count(*) FILTER (WHERE label_analyste AND rank<=100)/100.0 FROM eval_iforest;
--   SELECT iforest_roc_auc();
--
-- Migration générée par `scripts/build-iforest-fixture.mts` depuis
-- `bench/iforest/candidates-200.json` : ne pas éditer les lignes à la main.

BEGIN;

CREATE TABLE IF NOT EXISTS eval_iforest (
  event_id       text PRIMARY KEY,
  score          double precision NOT NULL CHECK (score >= 0 AND score <= 1),
  label_analyste boolean NOT NULL,
  rank           integer NOT NULL UNIQUE CHECK (rank BETWEEN 1 AND 200),
  region         text NOT NULL,
  profil         jsonb NOT NULL,
  analyste_a     boolean NOT NULL,
  analyste_b     boolean NOT NULL,
  source         text NOT NULL,
  measured_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE eval_iforest IS
  'Classement de 200 profils d''organisations par écart au profil régional (isolation forest).';
COMMENT ON COLUMN eval_iforest.score IS
  'Score d''anomalie de la forêt, dans [0,1] ; un score élevé est plus isolé.';
COMMENT ON COLUMN eval_iforest.rank IS
  'Rang 1..200 par score décroissant, event_id croissant en cas d''égalité.';
COMMENT ON COLUMN eval_iforest.label_analyste IS
  'Adjudication : vrai seulement si les deux analystes ont annoté positif.';

CREATE INDEX IF NOT EXISTS eval_iforest_rank_idx ON eval_iforest (rank);
CREATE INDEX IF NOT EXISTS eval_iforest_score_idx ON eval_iforest (score DESC);

INSERT INTO eval_iforest
  (event_id, score, label_analyste, rank, region, profil, analyste_a, analyste_b, source)
VALUES
('ifx-157', 0.6242158521, true, 1, 'NA', '{"counts":{"ransomware":2,"phishing":36,"vuln":4,"ct":21,"leak":1},"sources":1,"peak":47}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-067', 0.6203241256, true, 2, 'PAC', '{"counts":{"ransomware":1,"phishing":27,"vuln":2,"ct":20,"leak":1},"sources":1,"peak":31}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-007', 0.6148273861, true, 3, 'PAC', '{"counts":{"ransomware":1,"phishing":22,"vuln":3,"ct":21,"leak":1},"sources":1,"peak":38}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-181', 0.6128416553, true, 4, 'NA', '{"counts":{"ransomware":23,"phishing":2,"vuln":19,"ct":4,"leak":1},"sources":1,"peak":30}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-142', 0.6009627873, true, 5, 'OCC', '{"counts":{"ransomware":2,"phishing":24,"vuln":2,"ct":16,"leak":1},"sources":1,"peak":26}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-112', 0.6004396366, true, 6, 'GE', '{"counts":{"ransomware":1,"phishing":18,"vuln":5,"ct":14,"leak":1},"sources":1,"peak":23}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-031', 0.5975713011, true, 7, 'PAC', '{"counts":{"ransomware":12,"phishing":4,"vuln":17,"ct":3,"leak":1},"sources":1,"peak":21}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-076', 0.5967051313, true, 8, 'GE', '{"counts":{"ransomware":21,"phishing":1,"vuln":20,"ct":3,"leak":1},"sources":1,"peak":23}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-187', 0.5955360492, true, 9, 'PAC', '{"counts":{"ransomware":1,"phishing":26,"vuln":2,"ct":15,"leak":1},"sources":1,"peak":26}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-172', 0.5942203257, true, 10, 'GE', '{"counts":{"ransomware":2,"phishing":23,"vuln":5,"ct":12,"leak":1},"sources":1,"peak":30}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-097', 0.5867108251, true, 11, 'NA', '{"counts":{"ransomware":2,"phishing":19,"vuln":5,"ct":19,"leak":1},"sources":1,"peak":32}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-136', 0.5865522903, true, 12, 'GE', '{"counts":{"ransomware":14,"phishing":3,"vuln":17,"ct":2,"leak":1},"sources":1,"peak":25}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-192', 0.5809707121, true, 13, 'GE', '{"counts":{"ransomware":1,"phishing":24,"vuln":4,"ct":2,"leak":1},"sources":1,"peak":17}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-196', 0.5806145319, true, 14, 'GE', '{"counts":{"ransomware":13,"phishing":2,"vuln":21,"ct":3,"leak":1},"sources":1,"peak":31}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-037', 0.5797455798, true, 15, 'NA', '{"counts":{"ransomware":2,"phishing":18,"vuln":3,"ct":23,"leak":1},"sources":1,"peak":29}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-061', 0.5778782554, true, 16, 'NA', '{"counts":{"ransomware":20,"phishing":4,"vuln":17,"ct":5,"leak":1},"sources":1,"peak":31}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-091', 0.5777526108, true, 17, 'PAC', '{"counts":{"ransomware":11,"phishing":3,"vuln":17,"ct":5,"leak":1},"sources":1,"peak":21}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-046', 0.5745441077, true, 18, 'OCC', '{"counts":{"ransomware":13,"phishing":1,"vuln":14,"ct":4,"leak":1},"sources":1,"peak":18}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-022', 0.5723752047, true, 19, 'OCC', '{"counts":{"ransomware":2,"phishing":13,"vuln":3,"ct":19,"leak":1},"sources":1,"peak":22}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-020', 0.5722546776, false, 20, 'GE', '{"counts":{"ransomware":1,"phishing":1,"vuln":4,"ct":2,"leak":1},"sources":4,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-169', 0.5720899755, false, 21, 'NA', '{"counts":{"ransomware":1,"phishing":3,"vuln":2,"ct":3,"leak":1},"sources":3,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-149', 0.5720596293, false, 22, 'NA', '{"counts":{"ransomware":1,"phishing":2,"vuln":3,"ct":3,"leak":1},"sources":4,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-052', 0.5708910717, false, 23, 'GE', '{"counts":{"ransomware":3,"phishing":14,"vuln":4,"ct":11,"leak":1},"sources":1,"peak":21}'::jsonb, true, false, 'fixture-iforest-200'),
('ifx-145', 0.5705908359, false, 24, 'NA', '{"counts":{"ransomware":1,"phishing":4,"vuln":6,"ct":7,"leak":1},"sources":5,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-016', 0.5678436733, true, 25, 'GE', '{"counts":{"ransomware":18,"phishing":2,"vuln":22,"ct":3,"leak":1},"sources":1,"peak":24}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-066', 0.5675011314, true, 26, 'OCC', '{"counts":{"ransomware":24,"phishing":1,"vuln":3,"ct":2,"leak":1},"sources":1,"peak":22}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-177', 0.5657185267, true, 27, 'NA', '{"counts":{"ransomware":1,"phishing":19,"vuln":3,"ct":7,"leak":1},"sources":1,"peak":17}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-200', 0.5633946748, false, 28, 'GE', '{"counts":{"ransomware":2,"phishing":1,"vuln":3,"ct":2,"leak":1},"sources":5,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-082', 0.5629660112, true, 29, 'OCC', '{"counts":{"ransomware":2,"phishing":15,"vuln":3,"ct":18,"leak":1},"sources":1,"peak":29}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-106', 0.5628581522, true, 30, 'OCC', '{"counts":{"ransomware":22,"phishing":2,"vuln":10,"ct":4,"leak":1},"sources":1,"peak":31}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-127', 0.5571185866, true, 31, 'PAC', '{"counts":{"ransomware":1,"phishing":23,"vuln":3,"ct":12,"leak":1},"sources":1,"peak":27}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-001', 0.5567787445, false, 32, 'NA', '{"counts":{"ransomware":15,"phishing":4,"vuln":19,"ct":5,"leak":1},"sources":1,"peak":24}'::jsonb, false, true, 'fixture-iforest-200'),
('ifx-072', 0.5522579374, true, 33, 'GE', '{"counts":{"ransomware":2,"phishing":22,"vuln":2,"ct":2,"leak":1},"sources":1,"peak":23}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-051', 0.5520086565, false, 34, 'PAC', '{"counts":{"ransomware":14,"phishing":4,"vuln":2,"ct":5,"leak":1},"sources":1,"peak":13}'::jsonb, false, true, 'fixture-iforest-200'),
('ifx-041', 0.5490250708, true, 35, 'NA', '{"counts":{"ransomware":16,"phishing":3,"vuln":4,"ct":3,"leak":1},"sources":1,"peak":14}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-182', 0.5489484235, true, 36, 'OCC', '{"counts":{"ransomware":3,"phishing":16,"vuln":4,"ct":3,"leak":1},"sources":1,"peak":20}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-017', 0.5430522750, true, 37, 'NA', '{"counts":{"ransomware":1,"phishing":21,"vuln":3,"ct":5,"leak":1},"sources":1,"peak":19}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-124', 0.5416286477, false, 38, 'GE', '{"counts":{"ransomware":1,"phishing":2,"vuln":3,"ct":2,"leak":1},"sources":5,"peak":3}'::jsonb, false, true, 'fixture-iforest-200'),
('ifx-137', 0.5412839788, true, 39, 'NA', '{"counts":{"ransomware":3,"phishing":30,"vuln":3,"ct":6,"leak":1},"sources":1,"peak":29}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-146', 0.5398093933, true, 40, 'OCC', '{"counts":{"ransomware":25,"phishing":3,"vuln":2,"ct":4,"leak":1},"sources":1,"peak":24}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-057', 0.5395117192, true, 41, 'NA', '{"counts":{"ransomware":1,"phishing":31,"vuln":5,"ct":5,"leak":1},"sources":1,"peak":22}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-021', 0.5379852443, true, 42, 'NA', '{"counts":{"ransomware":22,"phishing":3,"vuln":5,"ct":3,"leak":1},"sources":1,"peak":22}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-166', 0.5378882611, true, 43, 'OCC', '{"counts":{"ransomware":13,"phishing":2,"vuln":11,"ct":5,"leak":1},"sources":1,"peak":24}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-131', 0.5375087326, true, 44, 'PAC', '{"counts":{"ransomware":12,"phishing":4,"vuln":2,"ct":5,"leak":1},"sources":1,"peak":12}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-032', 0.5366004626, true, 45, 'GE', '{"counts":{"ransomware":1,"phishing":19,"vuln":4,"ct":4,"leak":1},"sources":1,"peak":23}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-121', 0.5355130195, true, 46, 'NA', '{"counts":{"ransomware":16,"phishing":3,"vuln":12,"ct":5,"leak":1},"sources":1,"peak":27}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-042', 0.5354789862, true, 47, 'OCC', '{"counts":{"ransomware":2,"phishing":14,"vuln":3,"ct":3,"leak":1},"sources":1,"peak":12}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-071', 0.5336823413, true, 48, 'PAC', '{"counts":{"ransomware":10,"phishing":2,"vuln":2,"ct":5,"leak":1},"sources":1,"peak":15}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-162', 0.5332304158, true, 49, 'OCC', '{"counts":{"ransomware":3,"phishing":22,"vuln":3,"ct":3,"leak":1},"sources":1,"peak":23}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-004', 0.5303823966, false, 50, 'GE', '{"counts":{"ransomware":2,"phishing":1,"vuln":3,"ct":4,"leak":1},"sources":2,"peak":1}'::jsonb, false, true, 'fixture-iforest-200'),
('ifx-012', 0.5290382687, true, 51, 'GE', '{"counts":{"ransomware":3,"phishing":22,"vuln":3,"ct":3,"leak":1},"sources":1,"peak":22}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-176', 0.5285755140, true, 52, 'GE', '{"counts":{"ransomware":24,"phishing":2,"vuln":3,"ct":2,"leak":1},"sources":1,"peak":20}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-186', 0.5283258954, true, 53, 'OCC', '{"counts":{"ransomware":16,"phishing":2,"vuln":2,"ct":3,"leak":1},"sources":1,"peak":13}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-128', 0.5263952310, false, 54, 'GE', '{"counts":{"ransomware":3,"phishing":2,"vuln":6,"ct":4,"leak":1},"sources":3,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-047', 0.5258510387, true, 55, 'PAC', '{"counts":{"ransomware":1,"phishing":31,"vuln":3,"ct":5,"leak":1},"sources":1,"peak":26}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-006', 0.5254411820, true, 56, 'OCC', '{"counts":{"ransomware":26,"phishing":2,"vuln":2,"ct":4,"leak":1},"sources":1,"peak":20}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-151', 0.5252536942, false, 57, 'PAC', '{"counts":{"ransomware":10,"phishing":3,"vuln":8,"ct":4,"leak":1},"sources":1,"peak":13}'::jsonb, false, true, 'fixture-iforest-200'),
('ifx-107', 0.5249105401, true, 58, 'PAC', '{"counts":{"ransomware":1,"phishing":27,"vuln":4,"ct":4,"leak":1},"sources":1,"peak":26}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-150', 0.5244623493, false, 59, 'OCC', '{"counts":{"ransomware":2,"phishing":1,"vuln":2,"ct":3,"leak":1},"sources":3,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-153', 0.5243956480, false, 60, 'NA', '{"counts":{"ransomware":2,"phishing":2,"vuln":3,"ct":4,"leak":1},"sources":5,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-036', 0.5241414327, true, 61, 'GE', '{"counts":{"ransomware":23,"phishing":2,"vuln":3,"ct":2,"leak":1},"sources":1,"peak":16}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-191', 0.5228795576, true, 62, 'PAC', '{"counts":{"ransomware":9,"phishing":2,"vuln":3,"ct":5,"leak":1},"sources":1,"peak":13}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-065', 0.5214385260, false, 63, 'NA', '{"counts":{"ransomware":3,"phishing":2,"vuln":3,"ct":4,"leak":1},"sources":4,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-102', 0.5207088585, false, 64, 'OCC', '{"counts":{"ransomware":2,"phishing":23,"vuln":2,"ct":4,"leak":1},"sources":1,"peak":20}'::jsonb, true, false, 'fixture-iforest-200'),
('ifx-167', 0.5199148920, true, 65, 'PAC', '{"counts":{"ransomware":1,"phishing":27,"vuln":4,"ct":4,"leak":1},"sources":1,"peak":25}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-092', 0.5191380241, true, 66, 'GE', '{"counts":{"ransomware":2,"phishing":24,"vuln":3,"ct":3,"leak":1},"sources":1,"peak":25}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-026', 0.5190448561, true, 67, 'OCC', '{"counts":{"ransomware":21,"phishing":2,"vuln":2,"ct":3,"leak":1},"sources":1,"peak":16}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-094', 0.5187180385, false, 68, 'OCC', '{"counts":{"ransomware":2,"phishing":1,"vuln":2,"ct":4,"leak":1},"sources":4,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-126', 0.5184150443, true, 69, 'OCC', '{"counts":{"ransomware":14,"phishing":2,"vuln":2,"ct":5,"leak":1},"sources":1,"peak":15}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-156', 0.5176279236, true, 70, 'GE', '{"counts":{"ransomware":24,"phishing":2,"vuln":4,"ct":4,"leak":1},"sources":1,"peak":25}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-147', 0.5173946345, true, 71, 'PAC', '{"counts":{"ransomware":1,"phishing":24,"vuln":2,"ct":5,"leak":1},"sources":1,"peak":24}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-171', 0.5173413275, true, 72, 'PAC', '{"counts":{"ransomware":12,"phishing":3,"vuln":4,"ct":5,"leak":1},"sources":1,"peak":13}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-161', 0.5165439518, true, 73, 'NA', '{"counts":{"ransomware":16,"phishing":3,"vuln":5,"ct":7,"leak":1},"sources":1,"peak":25}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-008', 0.5164226603, false, 74, 'GE', '{"counts":{"ransomware":1,"phishing":2,"vuln":3,"ct":3,"leak":1},"sources":5,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-111', 0.5164023735, true, 75, 'PAC', '{"counts":{"ransomware":13,"phishing":3,"vuln":2,"ct":5,"leak":1},"sources":1,"peak":16}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-122', 0.5162525912, true, 76, 'OCC', '{"counts":{"ransomware":2,"phishing":21,"vuln":4,"ct":4,"leak":1},"sources":1,"peak":19}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-011', 0.5159981528, true, 77, 'PAC', '{"counts":{"ransomware":9,"phishing":3,"vuln":3,"ct":4,"leak":1},"sources":1,"peak":10}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-056', 0.5152340292, true, 78, 'GE', '{"counts":{"ransomware":20,"phishing":1,"vuln":4,"ct":3,"leak":1},"sources":1,"peak":16}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-101', 0.5148157548, false, 79, 'NA', '{"counts":{"ransomware":20,"phishing":3,"vuln":5,"ct":7,"leak":1},"sources":1,"peak":22}'::jsonb, false, true, 'fixture-iforest-200'),
('ifx-060', 0.5145960237, false, 80, 'GE', '{"counts":{"ransomware":3,"phishing":1,"vuln":5,"ct":4,"leak":1},"sources":3,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-010', 0.5132845497, false, 81, 'OCC', '{"counts":{"ransomware":1,"phishing":3,"vuln":3,"ct":5,"leak":1},"sources":5,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-165', 0.5132152929, false, 82, 'NA', '{"counts":{"ransomware":3,"phishing":2,"vuln":3,"ct":7,"leak":1},"sources":4,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-002', 0.5131003403, false, 83, 'OCC', '{"counts":{"ransomware":2,"phishing":14,"vuln":3,"ct":4,"leak":1},"sources":1,"peak":12}'::jsonb, true, false, 'fixture-iforest-200'),
('ifx-132', 0.5128525394, true, 84, 'GE', '{"counts":{"ransomware":2,"phishing":16,"vuln":3,"ct":3,"leak":1},"sources":1,"peak":18}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-005', 0.5124897546, false, 85, 'NA', '{"counts":{"ransomware":1,"phishing":3,"vuln":3,"ct":5,"leak":1},"sources":5,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-062', 0.5122949367, true, 86, 'OCC', '{"counts":{"ransomware":2,"phishing":22,"vuln":2,"ct":4,"leak":1},"sources":1,"peak":22}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-197', 0.5121814435, true, 87, 'NA', '{"counts":{"ransomware":2,"phishing":27,"vuln":5,"ct":5,"leak":1},"sources":1,"peak":29}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-163', 0.5118158371, false, 88, 'PAC', '{"counts":{"ransomware":1,"phishing":2,"vuln":2,"ct":5,"leak":1},"sources":5,"peak":1}'::jsonb, true, false, 'fixture-iforest-200'),
('ifx-078', 0.5118074935, false, 89, 'OCC', '{"counts":{"ransomware":2,"phishing":1,"vuln":4,"ct":5,"leak":1},"sources":2,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-049', 0.5108298698, false, 90, 'NA', '{"counts":{"ransomware":1,"phishing":2,"vuln":5,"ct":4,"leak":1},"sources":2,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-077', 0.5098041815, true, 91, 'NA', '{"counts":{"ransomware":2,"phishing":32,"vuln":4,"ct":4,"leak":1},"sources":1,"peak":23}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-048', 0.5097972263, false, 92, 'GE', '{"counts":{"ransomware":2,"phishing":1,"vuln":5,"ct":2,"leak":1},"sources":2,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-027', 0.5091624094, true, 93, 'PAC', '{"counts":{"ransomware":1,"phishing":26,"vuln":3,"ct":5,"leak":1},"sources":1,"peak":28}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-090', 0.5091544801, false, 94, 'OCC', '{"counts":{"ransomware":1,"phishing":3,"vuln":3,"ct":3,"leak":1},"sources":2,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-134', 0.5075993856, false, 95, 'OCC', '{"counts":{"ransomware":2,"phishing":3,"vuln":2,"ct":3,"leak":1},"sources":5,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-141', 0.5074203133, true, 96, 'NA', '{"counts":{"ransomware":24,"phishing":4,"vuln":5,"ct":5,"leak":1},"sources":1,"peak":22}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-152', 0.5063356452, false, 97, 'GE', '{"counts":{"ransomware":2,"phishing":21,"vuln":5,"ct":3,"leak":1},"sources":1,"peak":23}'::jsonb, true, false, 'fixture-iforest-200'),
('ifx-024', 0.5059008651, false, 98, 'GE', '{"counts":{"ransomware":1,"phishing":3,"vuln":4,"ct":4,"leak":1},"sources":5,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-116', 0.5049915992, true, 99, 'GE', '{"counts":{"ransomware":25,"phishing":2,"vuln":4,"ct":3,"leak":1},"sources":1,"peak":25}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-038', 0.5036662339, false, 100, 'OCC', '{"counts":{"ransomware":2,"phishing":1,"vuln":2,"ct":5,"leak":1},"sources":2,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-160', 0.5030372302, false, 101, 'GE', '{"counts":{"ransomware":2,"phishing":3,"vuln":3,"ct":2,"leak":1},"sources":5,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-096', 0.5026989336, true, 102, 'GE', '{"counts":{"ransomware":15,"phishing":2,"vuln":5,"ct":4,"leak":1},"sources":1,"peak":17}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-100', 0.5025828525, false, 103, 'GE', '{"counts":{"ransomware":1,"phishing":2,"vuln":3,"ct":3,"leak":1},"sources":3,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-158', 0.5018246045, false, 104, 'OCC', '{"counts":{"ransomware":2,"phishing":2,"vuln":2,"ct":3,"leak":1},"sources":5,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-014', 0.5015230553, false, 105, 'OCC', '{"counts":{"ransomware":2,"phishing":3,"vuln":3,"ct":2,"leak":1},"sources":5,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-023', 0.5008016636, false, 106, 'PAC', '{"counts":{"ransomware":1,"phishing":4,"vuln":2,"ct":5,"leak":1},"sources":5,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-086', 0.4989321437, true, 107, 'OCC', '{"counts":{"ransomware":14,"phishing":2,"vuln":4,"ct":5,"leak":1},"sources":1,"peak":18}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-058', 0.4988490791, false, 108, 'OCC', '{"counts":{"ransomware":1,"phishing":2,"vuln":3,"ct":3,"leak":1},"sources":5,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-123', 0.4970551304, false, 109, 'PAC', '{"counts":{"ransomware":1,"phishing":2,"vuln":4,"ct":5,"leak":1},"sources":4,"peak":3}'::jsonb, true, false, 'fixture-iforest-200'),
('ifx-110', 0.4959997098, false, 110, 'OCC', '{"counts":{"ransomware":1,"phishing":2,"vuln":3,"ct":3,"leak":1},"sources":3,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-009', 0.4951126694, false, 111, 'NA', '{"counts":{"ransomware":2,"phishing":4,"vuln":3,"ct":7,"leak":1},"sources":2,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-129', 0.4949557448, false, 112, 'NA', '{"counts":{"ransomware":3,"phishing":3,"vuln":5,"ct":3,"leak":1},"sources":4,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-119', 0.4946769802, false, 113, 'PAC', '{"counts":{"ransomware":1,"phishing":3,"vuln":4,"ct":2,"leak":1},"sources":4,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-117', 0.4944099248, true, 114, 'NA', '{"counts":{"ransomware":2,"phishing":22,"vuln":4,"ct":5,"leak":1},"sources":1,"peak":25}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-105', 0.4942242705, false, 115, 'NA', '{"counts":{"ransomware":2,"phishing":2,"vuln":3,"ct":4,"leak":1},"sources":4,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-040', 0.4924501849, false, 116, 'GE', '{"counts":{"ransomware":2,"phishing":3,"vuln":5,"ct":2,"leak":1},"sources":5,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-081', 0.4917014343, true, 117, 'NA', '{"counts":{"ransomware":22,"phishing":3,"vuln":5,"ct":5,"leak":1},"sources":1,"peak":21}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-080', 0.4897809325, false, 118, 'GE', '{"counts":{"ransomware":1,"phishing":2,"vuln":4,"ct":3,"leak":1},"sources":5,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-068', 0.4897458462, false, 119, 'GE', '{"counts":{"ransomware":1,"phishing":2,"vuln":4,"ct":4,"leak":1},"sources":5,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-050', 0.4896999122, false, 120, 'OCC', '{"counts":{"ransomware":2,"phishing":3,"vuln":4,"ct":5,"leak":1},"sources":4,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-085', 0.4894522573, false, 121, 'NA', '{"counts":{"ransomware":3,"phishing":4,"vuln":3,"ct":6,"leak":1},"sources":3,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-113', 0.4846207737, false, 122, 'NA', '{"counts":{"ransomware":1,"phishing":3,"vuln":5,"ct":6,"leak":1},"sources":3,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-170', 0.4844114361, false, 123, 'OCC', '{"counts":{"ransomware":2,"phishing":1,"vuln":4,"ct":4,"leak":1},"sources":4,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-033', 0.4837748308, false, 124, 'NA', '{"counts":{"ransomware":3,"phishing":3,"vuln":4,"ct":3,"leak":1},"sources":2,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-087', 0.4835491783, true, 125, 'PAC', '{"counts":{"ransomware":1,"phishing":20,"vuln":3,"ct":5,"leak":1},"sources":1,"peak":23}'::jsonb, true, true, 'fixture-iforest-200'),
('ifx-148', 0.4832796792, false, 126, 'GE', '{"counts":{"ransomware":2,"phishing":3,"vuln":3,"ct":4,"leak":1},"sources":3,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-164', 0.4816252058, false, 127, 'GE', '{"counts":{"ransomware":2,"phishing":2,"vuln":5,"ct":4,"leak":1},"sources":5,"peak":1}'::jsonb, false, true, 'fixture-iforest-200'),
('ifx-063', 0.4799874863, false, 128, 'PAC', '{"counts":{"ransomware":1,"phishing":2,"vuln":4,"ct":3,"leak":1},"sources":4,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-138', 0.4776370910, false, 129, 'OCC', '{"counts":{"ransomware":3,"phishing":2,"vuln":4,"ct":3,"leak":1},"sources":3,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-095', 0.4768074391, false, 130, 'PAC', '{"counts":{"ransomware":1,"phishing":2,"vuln":3,"ct":5,"leak":1},"sources":5,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-154', 0.4767083508, false, 131, 'OCC', '{"counts":{"ransomware":2,"phishing":2,"vuln":2,"ct":5,"leak":1},"sources":5,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-070', 0.4763227376, false, 132, 'OCC', '{"counts":{"ransomware":3,"phishing":2,"vuln":4,"ct":3,"leak":1},"sources":2,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-015', 0.4756122265, false, 133, 'PAC', '{"counts":{"ransomware":1,"phishing":2,"vuln":2,"ct":4,"leak":1},"sources":4,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-125', 0.4752685443, false, 134, 'NA', '{"counts":{"ransomware":3,"phishing":3,"vuln":5,"ct":4,"leak":1},"sources":4,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-074', 0.4740634904, false, 135, 'OCC', '{"counts":{"ransomware":2,"phishing":3,"vuln":3,"ct":5,"leak":1},"sources":4,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-018', 0.4739728217, false, 136, 'OCC', '{"counts":{"ransomware":1,"phishing":3,"vuln":3,"ct":4,"leak":1},"sources":4,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-035', 0.4730095025, false, 137, 'PAC', '{"counts":{"ransomware":1,"phishing":2,"vuln":3,"ct":3,"leak":1},"sources":5,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-155', 0.4726499838, false, 138, 'PAC', '{"counts":{"ransomware":1,"phishing":3,"vuln":4,"ct":3,"leak":1},"sources":5,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-120', 0.4722199823, false, 139, 'GE', '{"counts":{"ransomware":2,"phishing":3,"vuln":5,"ct":4,"leak":1},"sources":3,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-003', 0.4702862975, false, 140, 'PAC', '{"counts":{"ransomware":1,"phishing":3,"vuln":2,"ct":3,"leak":1},"sources":3,"peak":1}'::jsonb, true, false, 'fixture-iforest-200'),
('ifx-083', 0.4684749846, false, 141, 'PAC', '{"counts":{"ransomware":1,"phishing":3,"vuln":4,"ct":3,"leak":1},"sources":2,"peak":1}'::jsonb, true, false, 'fixture-iforest-200'),
('ifx-189', 0.4677127355, false, 142, 'NA', '{"counts":{"ransomware":2,"phishing":3,"vuln":4,"ct":3,"leak":1},"sources":2,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-039', 0.4671067880, false, 143, 'PAC', '{"counts":{"ransomware":1,"phishing":3,"vuln":3,"ct":3,"leak":1},"sources":5,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-093', 0.4667608633, false, 144, 'NA', '{"counts":{"ransomware":2,"phishing":2,"vuln":6,"ct":5,"leak":1},"sources":3,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-133', 0.4661431985, false, 145, 'NA', '{"counts":{"ransomware":2,"phishing":3,"vuln":3,"ct":6,"leak":1},"sources":5,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-130', 0.4659950080, false, 146, 'OCC', '{"counts":{"ransomware":2,"phishing":2,"vuln":3,"ct":5,"leak":1},"sources":5,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-190', 0.4655473825, false, 147, 'OCC', '{"counts":{"ransomware":2,"phishing":3,"vuln":2,"ct":3,"leak":1},"sources":2,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-144', 0.4637643216, false, 148, 'GE', '{"counts":{"ransomware":2,"phishing":2,"vuln":5,"ct":4,"leak":1},"sources":2,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-084', 0.4621701058, false, 149, 'GE', '{"counts":{"ransomware":2,"phishing":3,"vuln":5,"ct":4,"leak":1},"sources":3,"peak":2}'::jsonb, false, true, 'fixture-iforest-200'),
('ifx-064', 0.4606006406, false, 150, 'GE', '{"counts":{"ransomware":3,"phishing":2,"vuln":4,"ct":2,"leak":1},"sources":2,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-168', 0.4602533517, false, 151, 'GE', '{"counts":{"ransomware":3,"phishing":2,"vuln":3,"ct":3,"leak":1},"sources":2,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-143', 0.4596086135, false, 152, 'PAC', '{"counts":{"ransomware":1,"phishing":2,"vuln":3,"ct":5,"leak":1},"sources":3,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-183', 0.4595502864, false, 153, 'PAC', '{"counts":{"ransomware":1,"phishing":3,"vuln":2,"ct":4,"leak":1},"sources":2,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-028', 0.4590778624, false, 154, 'GE', '{"counts":{"ransomware":2,"phishing":2,"vuln":3,"ct":3,"leak":1},"sources":3,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-114', 0.4584740659, false, 155, 'OCC', '{"counts":{"ransomware":2,"phishing":2,"vuln":4,"ct":5,"leak":1},"sources":2,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-034', 0.4580279315, false, 156, 'OCC', '{"counts":{"ransomware":2,"phishing":2,"vuln":2,"ct":3,"leak":1},"sources":2,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-054', 0.4566804477, false, 157, 'OCC', '{"counts":{"ransomware":2,"phishing":2,"vuln":4,"ct":4,"leak":1},"sources":5,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-135', 0.4564748951, false, 158, 'PAC', '{"counts":{"ransomware":1,"phishing":4,"vuln":2,"ct":4,"leak":1},"sources":4,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-104', 0.4542699946, false, 159, 'GE', '{"counts":{"ransomware":2,"phishing":2,"vuln":5,"ct":2,"leak":1},"sources":3,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-173', 0.4537415742, false, 160, 'NA', '{"counts":{"ransomware":2,"phishing":4,"vuln":5,"ct":6,"leak":1},"sources":3,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-109', 0.4537300505, false, 161, 'NA', '{"counts":{"ransomware":3,"phishing":3,"vuln":4,"ct":4,"leak":1},"sources":4,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-055', 0.4527029366, false, 162, 'PAC', '{"counts":{"ransomware":1,"phishing":4,"vuln":3,"ct":5,"leak":1},"sources":2,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-099', 0.4513158837, false, 163, 'PAC', '{"counts":{"ransomware":1,"phishing":4,"vuln":3,"ct":4,"leak":1},"sources":5,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-185', 0.4498355002, false, 164, 'NA', '{"counts":{"ransomware":2,"phishing":4,"vuln":4,"ct":6,"leak":1},"sources":2,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-013', 0.4475409876, false, 165, 'NA', '{"counts":{"ransomware":3,"phishing":4,"vuln":4,"ct":5,"leak":1},"sources":3,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-043', 0.4474689587, false, 166, 'PAC', '{"counts":{"ransomware":1,"phishing":2,"vuln":3,"ct":5,"leak":1},"sources":2,"peak":3}'::jsonb, true, false, 'fixture-iforest-200'),
('ifx-175', 0.4474262968, false, 167, 'PAC', '{"counts":{"ransomware":1,"phishing":4,"vuln":2,"ct":4,"leak":1},"sources":2,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-195', 0.4466418777, false, 168, 'PAC', '{"counts":{"ransomware":1,"phishing":3,"vuln":2,"ct":3,"leak":1},"sources":2,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-069', 0.4462271680, false, 169, 'NA', '{"counts":{"ransomware":2,"phishing":3,"vuln":5,"ct":6,"leak":1},"sources":3,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-079', 0.4448545242, false, 170, 'PAC', '{"counts":{"ransomware":1,"phishing":2,"vuln":3,"ct":3,"leak":1},"sources":2,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-098', 0.4439181950, false, 171, 'OCC', '{"counts":{"ransomware":2,"phishing":2,"vuln":3,"ct":3,"leak":1},"sources":5,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-118', 0.4423167144, false, 172, 'OCC', '{"counts":{"ransomware":2,"phishing":3,"vuln":3,"ct":5,"leak":1},"sources":3,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-174', 0.4421712470, false, 173, 'OCC', '{"counts":{"ransomware":2,"phishing":2,"vuln":4,"ct":3,"leak":1},"sources":2,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-198', 0.4417791516, false, 174, 'OCC', '{"counts":{"ransomware":2,"phishing":3,"vuln":3,"ct":4,"leak":1},"sources":3,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-103', 0.4414356263, false, 175, 'PAC', '{"counts":{"ransomware":1,"phishing":3,"vuln":3,"ct":3,"leak":1},"sources":5,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-030', 0.4410547489, false, 176, 'OCC', '{"counts":{"ransomware":2,"phishing":2,"vuln":3,"ct":3,"leak":1},"sources":5,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-025', 0.4408142648, false, 177, 'NA', '{"counts":{"ransomware":2,"phishing":3,"vuln":4,"ct":5,"leak":1},"sources":4,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-193', 0.4403380256, false, 178, 'NA', '{"counts":{"ransomware":2,"phishing":3,"vuln":4,"ct":6,"leak":1},"sources":2,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-115', 0.4402467932, false, 179, 'PAC', '{"counts":{"ransomware":1,"phishing":2,"vuln":3,"ct":5,"leak":1},"sources":3,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-139', 0.4379766010, false, 180, 'PAC', '{"counts":{"ransomware":1,"phishing":3,"vuln":3,"ct":4,"leak":1},"sources":5,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-108', 0.4346292938, false, 181, 'GE', '{"counts":{"ransomware":2,"phishing":3,"vuln":5,"ct":3,"leak":1},"sources":2,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-140', 0.4346292938, false, 182, 'GE', '{"counts":{"ransomware":2,"phishing":3,"vuln":5,"ct":3,"leak":1},"sources":2,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-180', 0.4344616556, false, 183, 'GE', '{"counts":{"ransomware":2,"phishing":2,"vuln":4,"ct":3,"leak":1},"sources":5,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-184', 0.4344616556, false, 184, 'GE', '{"counts":{"ransomware":2,"phishing":2,"vuln":4,"ct":3,"leak":1},"sources":5,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-053', 0.4342873665, false, 185, 'NA', '{"counts":{"ransomware":2,"phishing":4,"vuln":4,"ct":6,"leak":1},"sources":4,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-178', 0.4335630847, false, 186, 'OCC', '{"counts":{"ransomware":2,"phishing":3,"vuln":3,"ct":4,"leak":1},"sources":4,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-194', 0.4308429927, false, 187, 'OCC', '{"counts":{"ransomware":2,"phishing":2,"vuln":4,"ct":4,"leak":1},"sources":2,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-089', 0.4307689850, false, 188, 'NA', '{"counts":{"ransomware":2,"phishing":4,"vuln":4,"ct":4,"leak":1},"sources":2,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-073', 0.4291426333, false, 189, 'NA', '{"counts":{"ransomware":2,"phishing":3,"vuln":4,"ct":6,"leak":1},"sources":4,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-019', 0.4290424270, false, 190, 'PAC', '{"counts":{"ransomware":1,"phishing":2,"vuln":3,"ct":4,"leak":1},"sources":2,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-075', 0.4269175068, false, 191, 'PAC', '{"counts":{"ransomware":1,"phishing":3,"vuln":3,"ct":4,"leak":1},"sources":2,"peak":1}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-088', 0.4233238248, false, 192, 'GE', '{"counts":{"ransomware":2,"phishing":3,"vuln":4,"ct":3,"leak":1},"sources":2,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-044', 0.4208887411, false, 193, 'GE', '{"counts":{"ransomware":2,"phishing":2,"vuln":5,"ct":3,"leak":1},"sources":2,"peak":3}'::jsonb, false, true, 'fixture-iforest-200'),
('ifx-059', 0.4178782312, false, 194, 'PAC', '{"counts":{"ransomware":1,"phishing":3,"vuln":3,"ct":3,"leak":1},"sources":2,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-045', 0.4177905774, false, 195, 'NA', '{"counts":{"ransomware":2,"phishing":3,"vuln":4,"ct":6,"leak":1},"sources":2,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-159', 0.4165806031, false, 196, 'PAC', '{"counts":{"ransomware":1,"phishing":3,"vuln":3,"ct":4,"leak":1},"sources":4,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-188', 0.4125646857, false, 197, 'GE', '{"counts":{"ransomware":2,"phishing":2,"vuln":4,"ct":3,"leak":1},"sources":2,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-029', 0.4122143857, false, 198, 'NA', '{"counts":{"ransomware":2,"phishing":4,"vuln":4,"ct":5,"leak":1},"sources":2,"peak":2}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-199', 0.4107396110, false, 199, 'PAC', '{"counts":{"ransomware":1,"phishing":3,"vuln":3,"ct":4,"leak":1},"sources":3,"peak":3}'::jsonb, false, false, 'fixture-iforest-200'),
('ifx-179', 0.4061430290, false, 200, 'PAC', '{"counts":{"ransomware":1,"phishing":3,"vuln":3,"ct":4,"leak":1},"sources":2,"peak":2}'::jsonb, false, false, 'fixture-iforest-200')
ON CONFLICT (event_id) DO NOTHING;

-- ROC-AUC de la table courante, calculée par paires concordantes ; les
-- ex æquo comptent pour une demi-paire.
CREATE OR REPLACE FUNCTION iforest_roc_auc() RETURNS double precision
LANGUAGE sql STABLE AS $fn$
  WITH comptes AS (
    SELECT count(*) FILTER (WHERE label_analyste)::double precision AS p,
           count(*)::double precision AS n
    FROM eval_iforest
  )
  SELECT CASE WHEN p = 0 OR n = p THEN NULL::double precision
              ELSE (gains + 0.5 * exaequo) / (p * (n - p)) END
  FROM comptes
  CROSS JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE a.label_analyste AND NOT b.label_analyste AND a.score > b.score)::double precision AS gains,
      count(*) FILTER (WHERE a.label_analyste AND NOT b.label_analyste AND a.score = b.score)::double precision AS exaequo
    FROM eval_iforest a JOIN eval_iforest b ON a.event_id <> b.event_id
  ) paires;
$fn$;

-- Accord inter-analystes (kappa de Cohen) corrigé du hasard.
CREATE OR REPLACE FUNCTION iforest_kappa() RETURNS double precision
LANGUAGE sql STABLE AS $fn$
  WITH votes AS (
    SELECT count(*) FILTER (WHERE analyste_a = analyste_b)::double precision / count(*) AS observe,
           count(*) FILTER (WHERE analyste_a)::double precision / count(*) AS a_oui,
           count(*) FILTER (WHERE analyste_b)::double precision / count(*) AS b_oui
    FROM eval_iforest
  )
  SELECT (observe - (a_oui * b_oui + (1 - a_oui) * (1 - b_oui))) /
         (1 - (a_oui * b_oui + (1 - a_oui) * (1 - b_oui)))
  FROM votes;
$fn$;

CREATE TABLE IF NOT EXISTS iforest_metric (
  version        text PRIMARY KEY,
  precision_at_100 double precision NOT NULL CHECK (precision_at_100 >= 0 AND precision_at_100 <= 1),
  roc_auc          double precision NOT NULL CHECK (roc_auc >= 0 AND roc_auc <= 1),
  kappa            double precision NOT NULL CHECK (kappa >= 0 AND kappa <= 1),
  candidates       integer NOT NULL CHECK (candidates = 200),
  model            text NOT NULL,
  source           text NOT NULL,
  measured_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE iforest_metric IS
  'Mesures livrées, recalculables depuis eval_iforest (précision@100, ROC-AUC, kappa).';

INSERT INTO iforest_metric (version, precision_at_100, roc_auc, kappa, candidates, model, source)
VALUES ('fixture-iforest-200', 0.6700000000, 0.9063585069, 0.8132586368, 200, 'iforest-region@1', 'fixture-iforest-200')
ON CONFLICT (version) DO NOTHING;

COMMIT;
