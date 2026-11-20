-- Alias d'usage pour la couverture — 2026-11-17
--
-- La mesure de couverture (scripts/mesure-couverture.mts) ne rate plus 14
-- incidents « on ne sait pas » : elle dit désormais, pour chacun, si
-- l'organisation est absente du référentiel ou présente mais non reconnue.
-- Sept cas sont « présents mais non reconnus » : l'organisation est en base,
-- c'est l'alias qui manque.
--
-- Six d'entre eux sont sans ambiguïté (l'organisation est unique et son nom
-- légal ne laisse pas de place à une autre). Le septième, Cerballiance, n'a
-- aucune entité de groupe au référentiel — 108 laboratoires, pas de tête de
-- réseau. Poser l'alias sur l'un d'eux reviendrait à choisir au hasard : il
-- n'est pas traité ici, et le trou reste publié.
--
-- Source `usage` (et non `sirene-nom`) : ces alias sont posés à la main
-- d'après l'usage constaté dans le corpus. La règle de confiance par source
-- de gazetteer@4 ne s'applique donc pas — elle ne concerne que les alias
-- auto-dérivés du stock SIRENE.
--
-- Idempotent.

BEGIN;

INSERT INTO org_alias (org_id, alias, source) VALUES
  (22044,  'Ymed',              'usage'),  -- éditeur de la plateforme Sooncare
  (34382,  'ERNAT',             'usage'),  -- Études Réalisations Négoce Assistance Technique (Orthez)
  (4403,   'Bordeaux Métropole','usage'),  -- collectivité, sans ville renseignée en base
  (38299,  'Cegedim Santé',     'usage'),  -- CEGEDIM SANTE (SOFILOCA)
  (45008,  'Weda',              'usage'),  -- éditeur de logiciel médical
  (189766, 'Cdiscount',         'usage')   -- Bordeaux, extraction frauduleuse de données clients
ON CONFLICT (org_id, alias) DO NOTHING;

INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
SELECT 'referentiel.charged', 'alias-couverture',
       '6 alias d''usage posés pour la couverture (Ymed, ERNAT, Bordeaux Métropole, Cegedim Santé, Weda, Cdiscount)',
       jsonb_build_object('aliases', 6, 'motif', 'présents au référentiel mais non reconnus par la mesure',
                          'exclus', 'Cerballiance (aucune entité de groupe)'),
       'humain:operateur', now()
WHERE NOT EXISTS (SELECT 1 FROM journal WHERE subject = 'alias-couverture');

COMMIT;
