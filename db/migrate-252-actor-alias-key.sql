-- 252 : corrige la fausse fusion des désignations APT-C-* dans `actor_alias`.
--
-- L'ancienne clé `actorAliasKey` retirait le numéro détaché de `APT-C-36`,
-- `APT-C-27`, `APT-C-34`, `APT-C-12` et `APT-C-60`. Le radical commun `aptc`
-- réunissait donc cinq grappes MISP Galaxy distinctes sous `APT-C-36` :
--   - APT-C-36 / Blind Eagle : ae1c64ff-5a37-4291-97f8-ea402c63efd0
--   - APT-C-12 / Blue Mushroom : 53771ca5-f1cb-47b6-a92a-53a485307cf7
--   - APT-C-27 / GoldMouse : ee7f535d-cc3e-40f3-99f3-c97963cfa250
--   - APT-C-34 / Golden Falcon : feb0cfef-0472-4108-83d7-1a322d8ab86b
--   - APT-C-60 / APT-Q-12 : 6a83b2bf-0c51-4c9b-89b0-35df7cab1dd5
-- Source publique : https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json
-- Chaque URL ci-dessous porte l'UUID de la grappe qui atteste l'alias.
--
-- `migrate-211-actor-alias.sql` n'est pas réécrit (migration déjà appliquée).
-- Cette correction est rejouable : DELETE ciblé, UPDATE conditionnel et
-- INSERT ... ON CONFLICT DO NOTHING. Aucune écriture hors migration.

-- 1. Retire les douze lignes des quatre grappes absorbées à tort.
DELETE FROM actor_alias
 WHERE canonique = 'APT-C-36'
   AND source_url IN (
     'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#53771ca5-f1cb-47b6-a92a-53a485307cf7',
     'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#ee7f535d-cc3e-40f3-99f3-c97963cfa250',
     'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#feb0cfef-0472-4108-83d7-1a322d8ab86b',
     'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#6a83b2bf-0c51-4c9b-89b0-35df7cab1dd5'
   );

-- 2. Aligne la clé conservée sur la nouvelle règle (les numéros comptent).
UPDATE actor_alias
   SET alias_norm = 'aptc36'
 WHERE canonique = 'APT-C-36'
   AND alias = 'APT-C-36'
   AND alias_norm = 'aptc';

-- 3. Réinsère chaque alias sous le canonique de sa propre grappe.
INSERT INTO actor_alias (canonique, alias, alias_norm, source, source_url, galaxy_uuid) VALUES
  ('APT-C-12', 'APT-C-12', 'aptc12', 'misp-galaxy:threat-actor', 'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#53771ca5-f1cb-47b6-a92a-53a485307cf7', '53771ca5-f1cb-47b6-a92a-53a485307cf7'::uuid),
  ('APT-C-12', 'Blue Mushroom', 'bluemushroom', 'misp-galaxy:threat-actor', 'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#53771ca5-f1cb-47b6-a92a-53a485307cf7', '53771ca5-f1cb-47b6-a92a-53a485307cf7'::uuid),
  ('APT-C-12', 'NuclearCrisis', 'nuclearcrisis', 'misp-galaxy:threat-actor', 'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#53771ca5-f1cb-47b6-a92a-53a485307cf7', '53771ca5-f1cb-47b6-a92a-53a485307cf7'::uuid),
  ('APT-C-12', 'Sapphire Mushroom', 'sapphiremushroom', 'misp-galaxy:threat-actor', 'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#53771ca5-f1cb-47b6-a92a-53a485307cf7', '53771ca5-f1cb-47b6-a92a-53a485307cf7'::uuid),
  ('APT-C-27', 'APT-C-27', 'aptc27', 'misp-galaxy:threat-actor', 'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#ee7f535d-cc3e-40f3-99f3-c97963cfa250', 'ee7f535d-cc3e-40f3-99f3-c97963cfa250'::uuid),
  ('APT-C-27', 'ATK80', 'atk80', 'misp-galaxy:threat-actor', 'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#ee7f535d-cc3e-40f3-99f3-c97963cfa250', 'ee7f535d-cc3e-40f3-99f3-c97963cfa250'::uuid),
  ('APT-C-27', 'Golden RAT', 'goldenrat', 'misp-galaxy:threat-actor', 'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#ee7f535d-cc3e-40f3-99f3-c97963cfa250', 'ee7f535d-cc3e-40f3-99f3-c97963cfa250'::uuid),
  ('APT-C-27', 'GoldMouse', 'goldmouse', 'misp-galaxy:threat-actor', 'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#ee7f535d-cc3e-40f3-99f3-c97963cfa250', 'ee7f535d-cc3e-40f3-99f3-c97963cfa250'::uuid),
  ('APT-C-34', 'APT-C-34', 'aptc34', 'misp-galaxy:threat-actor', 'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#feb0cfef-0472-4108-83d7-1a322d8ab86b', 'feb0cfef-0472-4108-83d7-1a322d8ab86b'::uuid),
  ('APT-C-34', 'Golden Falcon', 'goldenfalcon', 'misp-galaxy:threat-actor', 'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#feb0cfef-0472-4108-83d7-1a322d8ab86b', 'feb0cfef-0472-4108-83d7-1a322d8ab86b'::uuid),
  ('APT-C-60', 'APT-C-60', 'aptc60', 'misp-galaxy:threat-actor', 'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#6a83b2bf-0c51-4c9b-89b0-35df7cab1dd5', '6a83b2bf-0c51-4c9b-89b0-35df7cab1dd5'::uuid),
  ('APT-C-60', 'APT-Q-12', 'aptq12', 'misp-galaxy:threat-actor', 'https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#6a83b2bf-0c51-4c9b-89b0-35df7cab1dd5', '6a83b2bf-0c51-4c9b-89b0-35df7cab1dd5'::uuid)
ON CONFLICT ON CONSTRAINT actor_alias_alias_source_unique DO NOTHING;
