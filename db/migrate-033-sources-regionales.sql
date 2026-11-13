-- 033 : sources régionales vérifiées, et les trois mortes réparées ou éteintes.
--
-- Constat du 13 novembre 2026 : sur 266 sources déclarées, 14 sont réellement
-- régionales et 4 rendent des éléments. Les flux « réputés régionaux » étaient
-- enregistrés avec des URL qui redirigeaient (301) ou ne renvoyaient aucun
-- élément — le registre disait « vérifié HTTP 200 » d'une vérification qui
-- n'avait pas suivi les redirections.
--
-- Chaque URL ci-dessous a été testée le 13/11/2026 avec suivi de redirection,
-- en comptant les `<item>` réellement présents. Le nombre mesuré est écrit
-- dans la description : une source sans chiffre n'est pas une source vérifiée.

-- 1. Réparations : l'URL redirigeait, le contenu est bon derrière.
UPDATE source
   SET url = 'https://rue89bordeaux.com/feed/',
       description = 'Vérifié 2026-11-13, redirection suivie : 14 items'
 WHERE id = 'presse-rue89bordeaux';

UPDATE source
   SET url = 'https://www.ouest-france.fr/rss/france',
       description = 'Vérifié 2026-11-13, redirection suivie : 10 items'
 WHERE id = 'presse-ouestfrance-rss';

UPDATE source
   SET url = 'https://www.franceinfo.fr/titres.rss',
       description = 'Vérifié 2026-11-13, redirection suivie : 1 item (flux faible, conservé pour la une)'
 WHERE id = 'presse-francetvinfo';

-- 2. Éteinte avec motif : le domaine a changé de marque, l'ancienne URL ne
--    renvoie plus de flux. Elle n'est pas supprimée — elle pourra être
--    réactivée avec une URL valide.
UPDATE source
   SET enabled = false,
       description = 'Éteinte 2026-11-13 : francebleu.fr/rss redirige vers ici.fr/rss, qui ne renvoie aucun item RSS'
 WHERE id = 'presse-francebleu-rss';

UPDATE source
   SET enabled = false,
       description = 'Éteinte 2026-11-13 : inria.fr/rss répond 200 mais ne contient aucun item'
 WHERE id = 'inria-bordeaux';

-- 3. Ajouts vérifiés. France 3 Nouvelle-Aquitaine est la seule source de la
--    région qui couvre les douze départements : c'est la pièce qui manquait.
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description)
VALUES
('presse-france3-na','France 3 Nouvelle-Aquitaine (RSS)','cti','https://france3-regions.francetvinfo.fr/nouvelle-aquitaine/rss','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,1800,'Vérifié 2026-11-13 : 30 items, couvre les 12 départements'),
('presse-sudouest-gironde','Sud Ouest — Gironde (RSS)','cti','https://www.sudouest.fr/gironde/rss.xml','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,1800,'Vérifié 2026-11-13 : 20 items'),
('presse-sudouest-pyrenees','Sud Ouest — Pyrénées-Atlantiques (RSS)','cti','https://www.sudouest.fr/pyrenees-atlantiques/rss.xml','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,1800,'Vérifié 2026-11-13 : 20 items'),
('presse-mediacites','Médiacités (feed national, enquêtes locales)','cti','https://www.mediacites.fr/feed/','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-13 : 10 items')
ON CONFLICT (id) DO UPDATE
   SET url = EXCLUDED.url,
       enabled = true,
       description = EXCLUDED.description;
