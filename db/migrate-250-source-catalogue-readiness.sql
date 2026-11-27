-- 250 — Correction P1 du catalogue : identification univoque du collecteur PoC,
-- ligne source du collecteur `fuites` et disponibilité explicite des `corpus:*`.
--
-- Le filtre du moteur générique réserve `poc` au collecteur dédié, mais la
-- source active et le collecteur portaient `poc_github` : le même flux était
-- collecté deux fois. `poc` devient l'identifiant actif ; `poc_github` reste
-- comme simple référence des événements historiques, désactivé.
-- Le collecteur dédié `fuites` était absent de `source` : le planificateur le
-- classait « source-absente ». Les sources `corpus:*` sont activées et
-- vérifiées (HTTP 200 + item visible) mais leur `pret_a_collecter` restait NULL.
--
-- Idempotent : INSERT ... ON CONFLICT DO NOTHING, UPDATE sans effet sur une
-- base déjà corrigée.

BEGIN;

INSERT INTO public.source (id, name, family, url, license, retain_raw, enabled, kind, format, parser, interval_sec, description)
VALUES
  ('poc', 'PoC publics GitHub (nomi-sec/PoC-in-GitHub)', 'vuln', 'https://github.com/nomi-sec/PoC-in-GitHub', 'public', false, true, 'indicator', 'json', '{}'::jsonb, 86400, 'Existence d un PoC public pour une CVE (exploitabilite)'),
  ('fuites', 'Fuites documentees (HIBP, LeakIX, DataBreaches, Pwned Passwords)', 'leaks', 'https://haveibeenpwned.com/api/v3/breaches', 'public', false, true, 'indicator', 'json', '{}'::jsonb, 86400, 'Collecteur dedie : métadonnées de violations vérifiées et expositions LeakIX, sans donnée personnelle')
ON CONFLICT (id) DO NOTHING;

-- L'ancien identifiant reste dans `event.source_id` (FK) mais ne correspond
-- plus à un flux actif : ni ratissage, ni ingestion générique, ni relance.
UPDATE public.source
   SET enabled = false,
       url = 'urn:source:poc_github',
       description = 'Identifiant historique conservé pour les événements déjà collectes ; remplacé par poc.'
 WHERE id = 'poc_github';

UPDATE public.source
   SET pret_a_collecter = true
 WHERE enabled IS TRUE
   AND pret_a_collecter IS NULL
   AND (id LIKE 'corpus:%' OR id IN ('poc', 'fuites'));

COMMIT;
