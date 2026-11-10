-- Vague régionale 2026-11-10 : flux presse/institutions vérifiés HTTP 200
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description)
VALUES
('presse-sudouest','Sud Ouest (RSS)','cti','https://www.sudouest.fr/rss.xml','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200'),
('presse-charentelibre','Charente Libre (RSS)','cti','https://www.charentelibre.fr/rss.xml','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200'),
('univ-limoges','Université de Limoges (RSS)','cti','https://www.unilim.fr/rss','institution, diffusion publique',true,'narrative','rss','{}'::jsonb,86400,'Vérifié 2026-11-10 HTTP 200'),
('univ-larochelle','Université de La Rochelle (RSS)','cti','https://www.univ-lr.fr/rss','institution, diffusion publique',true,'narrative','rss','{}'::jsonb,86400,'Vérifié 2026-11-10 HTTP 200'),
('chu-poitiers','CHU de Poitiers (RSS)','cti','https://www.chu-poitiers.fr/rss','institution, diffusion publique',true,'narrative','rss','{}'::jsonb,86400,'Vérifié 2026-11-10 HTTP 200')
ON CONFLICT (id) DO UPDATE SET url=EXCLUDED.url, description=EXCLUDED.description;
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description)
VALUES
('presse-rue89bordeaux','Rue89 Bordeaux (feed)','cti','https://www.rue89bordeaux.com/feed','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-10 HTTP 200'),
('inria-bordeaux','Inria Bordeaux (RSS)','cti','https://www.inria.fr/rss','institution, diffusion publique',true,'narrative','rss','{}'::jsonb,86400,'Vérifié 2026-11-10 HTTP 200'),
('cert-fr-feed','CERT-FR feed','cert_fr','https://www.cert.ssi.gouv.fr/feed/','ANSSI, diffusion publique',true,'narrative','rss','{}'::jsonb,900,'Vérifié 2026-11-10 HTTP 200'),
('cert-fr-avis','CERT-FR avis','cert_fr','https://www.cert.ssi.gouv.fr/avis/feed/','ANSSI, diffusion publique',true,'narrative','rss','{}'::jsonb,900,'Vérifié 2026-11-10 HTTP 200'),
('cert-fr-alerte','CERT-FR alerte','cert_fr','https://www.cert.ssi.gouv.fr/alerte/feed/','ANSSI, diffusion publique',true,'narrative','rss','{}'::jsonb,900,'Vérifié 2026-11-10 HTTP 200')
ON CONFLICT (id) DO UPDATE SET url=EXCLUDED.url, description=EXCLUDED.description;
