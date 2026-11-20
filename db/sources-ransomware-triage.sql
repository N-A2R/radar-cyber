-- Triage des sources « ransomware » hors sujet — 2026-11-17
--
-- Deux sources de la famille `ransomware` ne publient aucune revendication :
-- ce sont des pages d'outillage. Le parseur générique y lit des compteurs de
-- pays et fabrique des « événements » qui s'appellent « 08 France 17 » ou
-- « © 2003-2026 Emsisoft ». Mesuré le 2026-11-17 par comptage des événements
-- de la famille par source : ces deux pages en fabriquaient la majorité.
-- Ces événements ont été purgés depuis (décision séparée) : le comptage
-- d'alors n'est plus rejouable sur la base courante, les nombres d'alors ne
-- sont pas republiés ici.
--
-- Désactivation réversible (aucune ligne supprimée). Les événements déjà
-- ingérés ne sont pas purgés par ce fichier : c'est une décision séparée.
--
-- Idempotent.

BEGIN;

UPDATE source SET
  enabled = false,
  disabled_at = COALESCE(disabled_at, now()),
  disabled_reason = 'Page d''outillage (outils de déchiffrement), pas une source de revendications : le parseur y lit des compteurs de pays. Constaté le 2026-11-17 (majorité des événements de la famille, purgés depuis).'
WHERE id = 'ransom-emsisoft-decrypt';

UPDATE source SET
  enabled = false,
  disabled_at = COALESCE(disabled_at, now()),
  disabled_reason = 'Page d''outillage (NoMoreRansom), pas une source de revendications ; 28 items non-claims constatés le 2026-11-17.'
WHERE id = 'ransom-nomoreransom';

COMMIT;
