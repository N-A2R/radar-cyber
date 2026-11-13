-- 035 : la portée régionale devient une propriété de la ligne.
--
-- Constat : le fil affichait 18 981 événements dont **87 % de bulletins de
-- vulnérabilités**, et **un seul** citait un département de la région. La
-- notion de « régional » existait dans la route (`org_id IS NOT NULL`), donc
-- valait faux partout depuis que les rattachements faux avaient été défaits.
--
-- Deux colonnes :
--   `regional`       — le drapeau, pour trier et filtrer sans recalcul ;
--   `regional_motif` — pourquoi : `rattachement` (preuve) ou `departement`
--                      (indice). Un drapeau sans motif n'est pas auditable.

ALTER TABLE event ADD COLUMN IF NOT EXISTS regional boolean NOT NULL DEFAULT false;
ALTER TABLE event ADD COLUMN IF NOT EXISTS regional_motif text;

CREATE INDEX IF NOT EXISTS event_regional_date_idx
  ON event (regional, observed_at DESC NULLS LAST);
