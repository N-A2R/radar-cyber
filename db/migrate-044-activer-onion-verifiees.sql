-- 044 — Activer les sources .onion jamais activées et vérifiées comme lisibles.
--
-- Constat du 2026-11-21 (bench/results/rejouer-38.json) : sur 38 sources
-- rejouées, 18 n'ont jamais été collectées parce que `enabled = false`.
-- Douze de ces 18 proviennent de db/sources-onion-cybercrime.sql (commit
-- 2a0a448, 2026-11-10) : elles ont été enregistrées éteintes « en attente
-- d'activation manuelle une fois la collecte validée ». La validation n'a
-- jamais été faite : aucune n'a de disabled_at ni de disabled_reason.
--
-- Le rejeu du 2026-11-21 apporte cette validation pour neuf d'entre elles :
-- detectItems() extrait de 1 à 87 items sur leur page telle qu'elle est
-- accessible aujourd'hui via Tor. Les trois autres restent éteintes, avec
-- cette fois un motif explicite (page de challenge, circuit Tor en échec au
-- rejeu, clé qTox sans stratégie d'extraction) : une source éteinte sans motif
-- est une dette invisible (voir migrate-034).
--
-- Aucune cadence n'est modifiée : interval_sec reste à 3600 s pour ces neuf
-- sources. Chargement ajouté au collecteur : neuf GET .onion par heure, dans
-- la file existante de huit travailleurs — pas de changement de production.
--
-- Idempotente : une source déjà activée n'est pas réactivée, aucun doublon de
-- journal n'est écrit.

BEGIN;

WITH activees AS (
	UPDATE source
	   SET enabled = true,
	       disabled_at = NULL,
	       disabled_reason = NULL
	 WHERE id IN (
		'onion:ccw:byod',
		'onion:ccw:dark-project',
		'onion:ccw:eclipse',
		'onion:ccw:everest',
		'onion:ccw:lockbit4',
		'onion:ccw:titan',
		'onion:ccw:vypr',
		'onion:ccw:whitearmor',
		'onion:rl:byod'
	 )
	   AND enabled = false
	RETURNING id
)
INSERT INTO journal (kind, subject, summary, payload, actor, valid_at)
SELECT
	'source.changed',
	id,
	'réactivée : collecte validée le 2026-11-21 (bench/results/rejouer-38.json)',
	jsonb_build_object(
		'transition', 'réactivation',
		'cause', 'jamais-activee',
		'preuve', 'bench/results/rejouer-38.json — items extraits par detectItems() au rejeu du 2026-11-21',
		'plan', 'db/migrate-044-activer-onion-verifiees.sql'
	),
	'migration:044',
	now()
FROM activees;

-- Les trois qui restent éteintes reçoivent enfin un motif vérifiable.
UPDATE source
   SET disabled_reason = CASE id
	 WHEN 'onion:ccw:anubis' THEN 'Réactivable sous condition : page de challenge sans annonce au rejeu du 2026-11-21'
	 WHEN 'onion:ccw:arcusmedia' THEN 'Réactivable sous condition : circuit Tor en échec au rejeu du 2026-11-21 (aucun code HTTP)'
	 WHEN 'onion:rl:orova' THEN 'Réactivable sous condition : clé publique qTox, aucune stratégie d''extraction au rejeu du 2026-11-21'
	END
 WHERE id IN ('onion:ccw:anubis', 'onion:ccw:arcusmedia', 'onion:rl:orova')
   AND coalesce(disabled_reason, '') = '';

COMMIT;
