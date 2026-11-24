-- 240 — DB-M8 : distinguer `enabled` de « prêt à collecter ».
--
-- Le catalogue contient des sources `enabled = true` jamais collectées avec
-- succès, parce que leur collecteur n'est pas branché (sitemap, source-feed,
-- regional, forum). Les désactiver serait une perte de couverture silencieuse
-- et rendrait `enabled` ambigu : il mélange intention et branchement technique.
--
-- `pret_a_collecter` est donc NULL par défaut : état non évalué, comportement
-- historique conservé pour toutes les familles non auditées. Le backfill ne
-- touche que les quatre familles nommées par l'audit, et uniquement les
-- sources `enabled` sans aucun `last_ok_at`. Aucune source n'est désactivée.
--
-- Rejouable : ALTER ... IF NOT EXISTS, UPDATE idempotent, index IF NOT EXISTS.

BEGIN;

ALTER TABLE public.source
  ADD COLUMN IF NOT EXISTS pret_a_collecter boolean;

UPDATE public.source
   SET pret_a_collecter = false
 WHERE enabled IS TRUE
   AND last_ok_at IS NULL
   AND pret_a_collecter IS NULL
   AND split_part(id, ':', 1) IN ('sitemap', 'source-feed', 'regional', 'forum');

-- Les sources des mêmes familles qui ont déjà réussi une collecte sont
-- explicitement prêtes : l'état ne reste pas ambigu (NULL) après backfill.
UPDATE public.source
   SET pret_a_collecter = true
 WHERE enabled IS TRUE
   AND last_ok_at IS NOT NULL
   AND pret_a_collecter IS NULL
   AND split_part(id, ':', 1) IN ('sitemap', 'source-feed', 'regional', 'forum');

-- Sélection bon marché des sources explicitement en attente de branchement.
CREATE INDEX IF NOT EXISTS source_en_attente_idx
  ON public.source (id)
 WHERE pret_a_collecter IS FALSE;

COMMENT ON COLUMN public.source.pret_a_collecter IS
  'NULL = état non évalué (comportement historique, collector inchangé) ; false = collecteur non branché, source activée mais à ne pas tenter ; true = collecteur branché et source déjà collectée avec succès. Les collecteurs doivent ignorer false ; l''UI doit l''afficher comme « en attente de branchement » sans laisser croire que la source est désactivée.';
COMMENT ON INDEX public.source_en_attente_idx IS
  'Liste des sources activées mais explicitement non prêtes (DB-M8).';

COMMIT;
