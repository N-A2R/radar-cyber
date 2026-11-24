-- 242 — F11 : invariant temporel des événements, codé pour les nouvelles écritures.
--
-- `event.valid_at` = quand le fait était vrai ; `event.at` = quand le radar
-- l'a appris (migration 046). Les collecteurs actuels respectent cet ordre :
--   - generic.ts : valid_at = observedAt (date de l'article), at = fetchedAt ;
--   - cycle.ts   : les deux dates sont fournies par la source ;
--   - communiques/store.ts : valid_at = at = date de publication.
--
-- Les 218 inversions `cti` à exactement +1 h ne sont donc PAS produites par
-- les écritures actuelles : ce sont des lignes historiques d'un ancien
-- convention « publication différée » jamais documentée. Les 153 écarts
-- `ransomware` sont de l'ordre de la seconde (dérive d'horloge de flux).
-- Le +1 h n'est pas érigé en règle métier : la convention à corriger est
-- décrite dans docs/database-residual.md (contrat à porter côté API).
--
-- La contrainte est NOT VALID : aucune lecture des 11,8 M lignes existantes,
-- aucun blocage prolongé sur la base live. Elle s'applique à toute insertion
-- ou mise à jour postérieure, avec une tolérance de 2 s pour les micro-écarts
-- d'horloge observés sur `ransomware`. Les lignes historiques sont normalisées
-- puis la contrainte est validée par `migrate-243` (si aucune inversion > 2 s
-- ne subsiste) ; la requête de contrôle est documentée.
--
-- Rejouable : ajout conditionnel par nom de contrainte.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.event'::regclass
       AND conname = 'event_at_not_before_valid_at'
  ) THEN
    ALTER TABLE public.event
      ADD CONSTRAINT event_at_not_before_valid_at
      CHECK (at IS NULL OR valid_at IS NULL OR at >= valid_at - interval '2 seconds')
      NOT VALID;
  END IF;
END
$$;

COMMENT ON CONSTRAINT event_at_not_before_valid_at ON public.event IS
  'F11 : le radar ne peut apprendre un fait avant qu''il soit vrai. Tolérance 2 s. Contrainte NOT VALID : les inversions historiques (cti +1 h, ransomware ~1 s) restent à normaliser par le contrat d''écriture API.';

COMMIT;
