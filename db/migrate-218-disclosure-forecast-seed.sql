-- 218 — vérité terrain de la fenêtre de publication.
--
-- 128 incidents datés, dédupliqués par identifiant, issus de :
--   * bench/corpus/incidents-*.jsonl (69 cas, presse locale et régionale NA) ;
--   * bench/fixtures/corpus-reference-na.json (59 cas). Le corpus témoin
--     (corpus-temoin-na.json) porte les mêmes identifiants et n'ajoute aucun
--     cas : il n'est donc pas dupliqué ici.
--
-- Une date d'incident fournie au mois près (format « 2024-10 ») est ramenée
-- au premier du mois, comme le font déjà les mesures de couverture. Les dates
-- sont interprétées à 00:00 UTC. Aucun titre, aucune organisation, aucune
-- donnée personnelle : uniquement des identifiants de corpus, deux dates et
-- le chemin source exact, sans qualification géographique inventée.
--
-- Critère : SELECT count(*) FROM disclosure_forecast
--            WHERE issued_at < first_public_at
--              AND first_public_at BETWEEN window_start AND window_end;
--
-- Le rejeu est idempotent : ON CONFLICT ne modifie rien et la fonction ne
-- recalcule que les fenêtres déjà présentes, avec la même règle qu'à l'émission.

BEGIN;

INSERT INTO public.disclosure_observation
  (incident_id, occurred_at, first_public_at, source_dataset)
SELECT v.incident_id,
       (v.occurred_at || ' 00:00+00')::timestamptz,
       (v.first_public_at || ' 00:00+00')::timestamptz,
       v.source_dataset
FROM (VALUES
  ('gir-couv-001', '2024-04-18', '2024-04-19', 'bench/corpus/incidents-gironde.jsonl'),
  ('na-2026-056', '2024-05-13', '2024-05-15', 'bench/fixtures/corpus-reference-na.json'),
  ('pa-inc-001', '2024-05-13', '2024-05-15', 'bench/corpus/incidents-pyreneesatlantiques.jsonl'),
  ('pa-inc-002', '2024-05-31', '2024-05-31', 'bench/corpus/incidents-pyreneesatlantiques.jsonl'),
  ('na-2026-058', '2024-05-10', '2024-06-14', 'bench/fixtures/corpus-reference-na.json'),
  ('na-charente-001', '2024-05-10', '2024-06-14', 'bench/corpus/incidents-charente.jsonl'),
  ('cm-inc-001', '2024-07-01', '2024-07-01', 'bench/corpus/incidents-charentemaritime.jsonl'),
  ('na-vienne-001', '2024-07-03', '2024-07-03', 'bench/corpus/incidents-vienne.jsonl'),
  ('pa-inc-003', '2024-06-26', '2024-07-04', 'bench/corpus/incidents-pyreneesatlantiques.jsonl'),
  ('gir-couv-009', '2024-06-28', '2024-07-04', 'bench/corpus/incidents-gironde.jsonl'),
  ('na-charente-002', '2024-05-18', '2024-08-01', 'bench/corpus/incidents-charente.jsonl'),
  ('na-charente-003', '2024-08-25', '2024-08-27', 'bench/corpus/incidents-charente.jsonl'),
  ('gir-couv-011', '2024-08-16', '2024-10-05', 'bench/corpus/incidents-gironde.jsonl'),
  ('na-dordogne-001', '2024-11-18', '2024-11-27', 'bench/corpus/incidents-dordogne.jsonl'),
  ('na-2026-051', '2024-12-15', '2024-12-31', 'bench/fixtures/corpus-reference-na.json'),
  ('gir-couv-007', '2024-12-31', '2025-01-02', 'bench/corpus/incidents-gironde.jsonl'),
  ('na-2026-057', '2024-12-31', '2025-01-02', 'bench/fixtures/corpus-reference-na.json'),
  ('na-vienne-002', '2024-12-31', '2025-01-02', 'bench/corpus/incidents-vienne.jsonl'),
  ('pa-inc-004', '2024-12-31', '2025-01-02', 'bench/corpus/incidents-pyreneesatlantiques.jsonl'),
  ('na-landes-006', '2024-12-31', '2025-01-06', 'bench/corpus/incidents-landes.jsonl'),
  ('cor-004', '2024-12-15', '2025-01-16', 'bench/corpus/incidents-correze.jsonl'),
  ('na-2026-008', '2025-01-15', '2025-02-14', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-053', '2022-01-01', '2025-02-20', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-049', '2025-02-21', '2025-02-28', 'bench/fixtures/corpus-reference-na.json'),
  ('gir-couv-002', '2025-02-21', '2025-03-01', 'bench/corpus/incidents-gironde.jsonl'),
  ('na-ds-003', '2025-02-27', '2025-03-26', 'bench/corpus/incidents-deuxsevres.jsonl'),
  ('na-dordogne-003', '2025-03-25', '2025-03-26', 'bench/corpus/incidents-dordogne.jsonl'),
  ('na-2026-015', '2024-09-01', '2025-06-20', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-055', '2023-09-01', '2025-06-27', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-052', '2025-06-20', '2025-07-11', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-048', '2025-08-11', '2025-08-11', 'bench/fixtures/corpus-reference-na.json'),
  ('na-dordogne-004', '2025-08-11', '2025-08-12', 'bench/corpus/incidents-dordogne.jsonl'),
  ('na-2026-017', '2025-08-29', '2025-09-05', 'bench/fixtures/corpus-reference-na.json'),
  ('na-vienne-003', '2025-08-29', '2025-09-05', 'bench/corpus/incidents-vienne.jsonl'),
  ('na-2026-059', '2025-07-24', '2025-09-09', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-047', '2025-09-29', '2025-09-29', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-007', '2025-10-03', '2025-10-03', 'bench/fixtures/corpus-reference-na.json'),
  ('na-lg-001', '2025-10-03', '2025-10-04', 'bench/corpus/incidents-lotetgaronne.jsonl'),
  ('na-2026-054', '2025-08-26', '2025-10-06', 'bench/fixtures/corpus-reference-na.json'),
  ('na-landes-005', '2025-08-26', '2025-10-06', 'bench/corpus/incidents-landes.jsonl'),
  ('na-2026-050', '2025-10-18', '2025-10-23', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-043', '2025-11-10', '2025-11-13', 'bench/fixtures/corpus-reference-na.json'),
  ('na-charente-006', '2025-11-10', '2025-11-13', 'bench/corpus/incidents-charente.jsonl'),
  ('na-ds-002', '2025-11-14', '2025-11-14', 'bench/corpus/incidents-deuxsevres.jsonl'),
  ('na-dordogne-006', '2025-11-18', '2025-11-18', 'bench/corpus/incidents-dordogne.jsonl'),
  ('cor-007', '2025-10-18', '2025-11-21', 'bench/corpus/incidents-correze.jsonl'),
  ('na-hv-005', '2025-10-18', '2025-11-21', 'bench/corpus/incidents-hautevienne.jsonl'),
  ('na-creuse-006', '2025-11-10', '2025-11-21', 'bench/corpus/incidents-creuse.jsonl'),
  ('na-2026-028', '2025-10-24', '2025-11-24', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-060', '2020-12-01', '2025-12-09', 'bench/fixtures/corpus-reference-na.json'),
  ('na-ds-001', '2025-12-08', '2025-12-10', 'bench/corpus/incidents-deuxsevres.jsonl'),
  ('na-2026-018', '2025-12-09', '2025-12-10', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-005', '2025-12-08', '2025-12-11', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-030', '2025-12-11', '2025-12-12', 'bench/fixtures/corpus-reference-na.json'),
  ('na-lg-009', '2024-10-01', '2025-12-15', 'bench/corpus/incidents-lotetgaronne.jsonl'),
  ('na-2026-016', '2026-01-20', '2026-01-22', 'bench/fixtures/corpus-reference-na.json'),
  ('na-vienne-007', '2026-01-22', '2026-01-22', 'bench/corpus/incidents-vienne.jsonl'),
  ('gir-couv-010', '2026-01-20', '2026-01-23', 'bench/corpus/incidents-gironde.jsonl'),
  ('na-landes-002', '2026-01-20', '2026-01-23', 'bench/corpus/incidents-landes.jsonl'),
  ('na-2026-044', '2026-02-05', '2026-02-05', 'bench/fixtures/corpus-reference-na.json'),
  ('na-ds-009', '2026-02-09', '2026-02-09', 'bench/corpus/incidents-deuxsevres.jsonl'),
  ('na-charente-008', '2026-01-20', '2026-02-22', 'bench/corpus/incidents-charente.jsonl'),
  ('na-2026-046', '2026-01-28', '2026-02-22', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-040', '2025-10-27', '2026-02-26', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-027', '2025-11-15', '2026-03-02', 'bench/fixtures/corpus-reference-na.json'),
  ('gir-couv-012', '2026-03-03', '2026-03-04', 'bench/corpus/incidents-gironde.jsonl'),
  ('na-2026-031', '2026-03-02', '2026-03-15', 'bench/fixtures/corpus-reference-na.json'),
  ('na-vienne-004', '2026-03-02', '2026-03-15', 'bench/corpus/incidents-vienne.jsonl'),
  ('na-2026-039', '2026-03-25', '2026-03-28', 'bench/fixtures/corpus-reference-na.json'),
  ('pa-inc-005', '2026-03-17', '2026-04-02', 'bench/corpus/incidents-pyreneesatlantiques.jsonl'),
  ('na-charente-010', '2026-03-02', '2026-04-03', 'bench/corpus/incidents-charente.jsonl'),
  ('gir-couv-004', '2026-04-06', '2026-04-09', 'bench/corpus/incidents-gironde.jsonl'),
  ('na-2026-001', '2026-04-06', '2026-04-09', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-022', '2026-04-06', '2026-04-09', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-041', '2026-04-06', '2026-04-09', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-026', '2026-04-06', '2026-04-10', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-025', '2026-04-08', '2026-04-10', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-029', '2026-04-27', '2026-04-27', 'bench/fixtures/corpus-reference-na.json'),
  ('gir-couv-005', '2026-05-10', '2026-05-13', 'bench/corpus/incidents-gironde.jsonl'),
  ('na-2026-006', '2026-05-10', '2026-05-13', 'bench/fixtures/corpus-reference-na.json'),
  ('cm-inc-007', '2026-05-21', '2026-06-15', 'bench/corpus/incidents-charentemaritime.jsonl'),
  ('gir-couv-013', '2026-06-15', '2026-06-26', 'bench/corpus/incidents-gironde.jsonl'),
  ('na-2026-042', '2026-06-22', '2026-06-26', 'bench/fixtures/corpus-reference-na.json'),
  ('na-lg-010', '2026-05-24', '2026-07-01', 'bench/corpus/incidents-lotetgaronne.jsonl'),
  ('na-2026-010', '2026-07-16', '2026-07-16', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-011', '2026-07-23', '2026-07-23', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-021', '2026-07-25', '2026-07-27', 'bench/fixtures/corpus-reference-na.json'),
  ('na-landes-007', '2026-07-25', '2026-07-27', 'bench/corpus/incidents-landes.jsonl'),
  ('na-2026-023', '2026-08-07', '2026-08-07', 'bench/fixtures/corpus-reference-na.json'),
  ('cm-inc-008', '2026-08-17', '2026-08-19', 'bench/corpus/incidents-charentemaritime.jsonl'),
  ('na-2026-002', '2026-08-17', '2026-08-19', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-020', '2026-08-17', '2026-08-28', 'bench/fixtures/corpus-reference-na.json'),
  ('pa-inc-006', '2026-08-17', '2026-08-28', 'bench/corpus/incidents-pyreneesatlantiques.jsonl'),
  ('na-landes-001', '2026-08-28', '2026-08-28', 'bench/corpus/incidents-landes.jsonl'),
  ('na-2026-003', '2026-08-27', '2026-08-29', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-024', '2026-08-01', '2026-08-31', 'bench/fixtures/corpus-reference-na.json'),
  ('na-vienne-005', '2026-08-01', '2026-08-31', 'bench/corpus/incidents-vienne.jsonl'),
  ('na-landes-008', '2026-08-29', '2026-09-02', 'bench/corpus/incidents-landes.jsonl'),
  ('na-2026-045', '2026-09-04', '2026-09-04', 'bench/fixtures/corpus-reference-na.json'),
  ('cm-inc-009', '2026-09-07', '2026-09-08', 'bench/corpus/incidents-charentemaritime.jsonl'),
  ('gir-couv-006', '2026-09-08', '2026-09-15', 'bench/corpus/incidents-gironde.jsonl'),
  ('na-2026-009', '2026-09-08', '2026-09-15', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-004', '2026-09-11', '2026-09-16', 'bench/fixtures/corpus-reference-na.json'),
  ('pa-inc-007', '2026-09-11', '2026-09-16', 'bench/corpus/incidents-pyreneesatlantiques.jsonl'),
  ('na-hv-007', '2026-09-22', '2026-09-29', 'bench/corpus/incidents-hautevienne.jsonl'),
  ('na-2026-033', '2026-10-11', '2026-10-12', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-034', '2026-10-11', '2026-10-12', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-035', '2026-10-11', '2026-10-12', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-036', '2026-10-11', '2026-10-12', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-037', '2026-10-11', '2026-10-12', 'bench/fixtures/corpus-reference-na.json'),
  ('na-2026-038', '2026-10-11', '2026-10-12', 'bench/fixtures/corpus-reference-na.json'),
  ('na-dordogne-010', '2026-10-11', '2026-10-12', 'bench/corpus/incidents-dordogne.jsonl'),
  ('na-ds-006', '2026-10-11', '2026-10-12', 'bench/corpus/incidents-deuxsevres.jsonl'),
  ('cm-inc-010', '2026-10-12', '2026-10-12', 'bench/corpus/incidents-charentemaritime.jsonl'),
  ('na-2026-013', '2026-10-12', '2026-10-12', 'bench/fixtures/corpus-reference-na.json'),
  ('na-landes-009', '2026-10-12', '2026-10-12', 'bench/corpus/incidents-landes.jsonl'),
  ('na-lg-005', '2026-10-12', '2026-10-12', 'bench/corpus/incidents-lotetgaronne.jsonl'),
  ('na-lg-006', '2026-10-12', '2026-10-12', 'bench/corpus/incidents-lotetgaronne.jsonl'),
  ('na-vienne-006', '2026-10-12', '2026-10-12', 'bench/corpus/incidents-vienne.jsonl'),
  ('pa-inc-009', '2026-10-12', '2026-10-12', 'bench/corpus/incidents-pyreneesatlantiques.jsonl'),
  ('na-2026-032', '2026-10-11', '2026-10-13', 'bench/fixtures/corpus-reference-na.json'),
  ('cor-006', '2026-10-12', '2026-10-13', 'bench/corpus/incidents-correze.jsonl'),
  ('na-2026-012', '2026-10-12', '2026-10-13', 'bench/fixtures/corpus-reference-na.json'),
  ('na-vienne-008', '2026-10-12', '2026-10-15', 'bench/corpus/incidents-vienne.jsonl'),
  ('na-dordogne-011', '2026-10-28', '2026-10-29', 'bench/corpus/incidents-dordogne.jsonl'),
  ('na-dordogne-013', '2026-10-29', '2026-11-06', 'bench/corpus/incidents-dordogne.jsonl'),
  ('na-2026-014', '2023-12-07', '2026-11-10', 'bench/fixtures/corpus-reference-na.json'),
  ('na-creuse-003', '2025-01-17', '2026-11-12', 'bench/corpus/incidents-creuse.jsonl')
) AS v(incident_id, occurred_at, first_public_at, source_dataset)
ON CONFLICT (incident_id) DO NOTHING;

COMMIT;

-- Émission après la vérité terrain : la fonction lit les observations, jamais
-- l'inverse. Cette ligne est hors transaction pour rester rejouable seule.
SELECT public.emit_disclosure_forecast();
