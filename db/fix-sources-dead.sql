-- Réparation des sources mortes — 2026-11-10
BEGIN;

UPDATE source
SET enabled = false,
    description = COALESCE(description,'') || ' [DÉSACTIVÉ 2026-11-10: HTTP 403 Cloudflare]'
WHERE (id LIKE 'estorides:actu-%' OR id LIKE 'estorides:le-r-publicain-%')
  AND enabled = true;

UPDATE source
SET enabled = false,
    description = COALESCE(description,'') || ' [DÉSACTIVÉ 2026-11-10: HTTP 400]'
WHERE id = 'estorides:ripe-stat' AND enabled = true;

UPDATE source
SET enabled = false,
    description = COALESCE(description,'') || ' [DÉSACTIVÉ 2026-11-10: HTTP 403 auth]'
WHERE id LIKE 'feed:censys:osint:%' AND enabled = true;

UPDATE source
SET enabled = false,
    description = COALESCE(description,'') || ' [DÉSACTIVÉ 2026-11-10: HTTP 403]'
WHERE id LIKE 'feed:james-brine:ip:%' AND enabled = true;

UPDATE source
SET enabled = false,
    description = COALESCE(description,'') || ' [DÉSACTIVÉ 2026-11-10: HTTP 404]'
WHERE id = 'inria-bordeaux' AND enabled = true;

UPDATE source
SET enabled = false,
    description = COALESCE(description,'') || ' [DÉSACTIVÉ 2026-11-10: POST requis, collecteur dédié à venir]'
WHERE id = 'estorides:threatfox-iocs' AND enabled = true;

COMMIT;
