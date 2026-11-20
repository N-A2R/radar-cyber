-- Triage des sources Telegram — 2026-11-17
--
-- Méthode : GET https://t.me/s/<canal>, User-Agent explicite, 1 requête par
-- seconde, comptage des blocs `tgme_widget_message_wrap`, lecture de
-- `og:title` pour vérifier l'identité du canal. Croisé avec ce que le
-- collecteur a réellement parsé (`source.items_total`, `collector_run`).
--
-- Ce que la mesure a montré, et qui corrige une première conclusion trop
-- rapide : un GET à 0 message ne prouve pas qu'une source est morte. Le
-- journal de l'API montre `tg-cti` parsé à 39 items le même jour — c'est le
-- filtre de pertinence qui les écarte, pas la source qui est cassée. La
-- doctrine de `docs/sources-triage.md` s'applique : `ok_but_empty` ne se
-- désactive pas.
--
-- Idempotent : rejouable sans effet de bord.

BEGIN;

-- 1) Handles réutilisés : l'URL ne pointe plus le canal annoncé.
--    `IntelOwl` rend aujourd'hui un canal nommé « Ralf », sans rapport.
UPDATE source SET
  enabled = false,
  disabled_at = COALESCE(disabled_at, now()),
  disabled_reason = 'Handle réutilisé : t.me/s/IntelOwl rend un autre canal (« Ralf », non cyber), constaté le 2026-11-17'
WHERE id = 'tg-intelowl';

-- 2) Les autres canaux à 0 item restent ACTIFS (ok_but_empty) : ils répondent
--    200 et le collecteur les lit. Aucun UPDATE ici, c'est volontaire — le
--    silence vient du filtre de pertinence ou d'un aperçu fermé, pas d'une
--    source morte. Verdict à refaire avec `scripts/triage-sources.mts`.
--    Concerne : tg-cert-eu, tg-certfr, tg-cti, tg-cyberdefence, tg-osint,
--    tg-osint-techniques, tg-ransomware, tg-threatintel,
--    tg-threatintel-daily, tg-cybersecurity (rendu « Cyber Fighter »).

-- 3) Cinq canaux ransomware réellement lisibles (11 à 20 messages au sondage)
--    sont en `kind='quarantine'` : exclus de la boucle générique
--    (`kind <> 'quarantine'`), et le collecteur de quarantaine ne connaît que
--    `quarantine:ransomware.live`. Personne ne les lit — ce n'est pas un
--    problème de `enabled`. On ne tranche pas ici : le passage en `narrative`
--    ferait entrer des revendications non vérifiées directement dans `event`,
--    contre la doctrine du projet. Ils restent désactivés en attendant
--    l'arbitrage, avec le motif qui dit pourquoi.
--    Concerne : tg-baseleeak, tg-leaked-databases, tg-marketo-leaks,
--    tg-ransomwareg, tg-snatch-news.
UPDATE source SET
  enabled = false,
  disabled_at = COALESCE(disabled_at, now()),
  disabled_reason = 'kind=quarantine mais aucun collecteur ne la lit (le collecteur de quarantaine ne traite que quarantine:ransomware.live) — canal mesuré vivant le 2026-11-17, câblage à arbitrer'
WHERE id IN (
  'tg-baseleeak',
  'tg-leaked-databases',
  'tg-marketo-leaks',
  'tg-ransomwareg',
  'tg-snatch-news'
);

COMMIT;
