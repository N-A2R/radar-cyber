-- 029 : motifs de rejet agrégés par run de collecte.
--
-- Contexte. Une source qui lit 40 entrées et n'en retient aucune est le cas le
-- plus intéressant du parc : ce n'est ni une panne ni un silence, c'est un
-- filtre ou un parseur qui travaille trop. Le collecteur calcule ce détail
-- depuis toujours (`rejectedBy` dans `collectors/generic.ts`) — motifs
-- `hors_sujet`, `presse`, `menu_path`, `contrat:famille-inconnue`… — puis il
-- l'écrit dans les logs et le perd. Résultat : on sait qu'une source rend zéro,
-- jamais pourquoi, et le chantier 15 est aveugle.
--
-- On agrège au lieu de stocker ligne par ligne : la question est « quel motif
-- domine ce run ? », pas « quel item a été refusé ». Un objet JSON de quelques
-- clés pèse moins qu'une table de rejets, et il ne fait pas doublon avec le
-- journal (qui garde les décisions individuellement pour l'audit).
--
-- Rétrocompatible : colonne nullable, les runs antérieurs restent lisibles
-- comme « motif non mesuré » — ce qui est la vérité.

BEGIN;

ALTER TABLE collector_run
  ADD COLUMN IF NOT EXISTS items_rejected jsonb;

COMMENT ON COLUMN collector_run.items_rejected IS
  'Motifs de rejet agrégés du run : { "hors_sujet": 34, "presse": 6 }. NULL = non mesuré.';

COMMIT;
