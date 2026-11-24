-- 235 — statistiques après chargement.
--
-- Aucun ANALYZE n'avait jamais été enregistré sur les tables publiques : le
-- planificateur travaillait sur les seules estimations `reltuples` de la
-- charge initiale (11,8 M lignes sur org_unknown, 1,7 M sur org). On rafraîchit
-- les tables structurantes après les migrations, et le runner fait de même
-- après chaque lot appliqué sur une base neuve.
ANALYZE event;
ANALYZE event_archive;
ANALYZE archive_event;
ANALYZE org;
ANALYZE org_alias;
ANALYZE org_unknown;
