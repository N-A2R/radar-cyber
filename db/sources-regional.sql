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

-- Vague départementale 2026-11-21 (mission « Nuit Nouvelle-Aquitaine », Task 1) :
-- chaque URL ci-dessous a été fetchée le 21/11/2026 (curl, redirections suivies),
-- item count réel et dernier <pubDate> consignés dans
-- bench/results/na-sources-sondage-2026-11-21.json avec les titres verbatim.
-- La Montagne et Le Populaire du Centre n'exposent plus de RSS public (404 sur
-- toutes les variantes, aucun <link> RSS dans le HTML) : flux Google News ciblés
-- sur leur site en remplacement, même méthode que migrate-037.
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description)
VALUES
('presse-sudouest-charente','Sud Ouest — Charente (RSS)','cti','https://www.sudouest.fr/charente/rss.xml','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,1800,'Vérifié 2026-11-21 : 20 items, dernier item 2026-11-20 18:08+01'),
('presse-sudouest-charente-maritime','Sud Ouest — Charente-Maritime (RSS)','cti','https://www.sudouest.fr/charente-maritime/rss.xml','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,1800,'Vérifié 2026-11-21 : 20 items, dernier item 2026-11-20 23:28+01'),
('presse-sudouest-dordogne','Sud Ouest — Dordogne (RSS)','cti','https://www.sudouest.fr/dordogne/rss.xml','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,1800,'Vérifié 2026-11-21 : 20 items, dernier item 2026-11-20 21:07+01'),
('presse-sudouest-landes','Sud Ouest — Landes (RSS)','cti','https://www.sudouest.fr/landes/rss.xml','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,1800,'Vérifié 2026-11-21 : 20 items, dernier item 2026-11-20 22:16+01'),
('presse-sudouest-lot-et-garonne','Sud Ouest — Lot-et-Garonne (RSS)','cti','https://www.sudouest.fr/lot-et-garonne/rss.xml','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,1800,'Vérifié 2026-11-21 : 20 items, dernier item 2026-11-20 22:46+01'),
('presse-sudouest-deux-sevres','Sud Ouest — Deux-Sèvres (RSS)','cti','https://www.sudouest.fr/deux-sevres/rss.xml','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,1800,'Vérifié 2026-11-21 : 20 items, dernier item 2026-11-20 06:30+01'),
('presse-lnr-vienne','La Nouvelle République — Vienne (RSS)','cti','https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,1800,'Vérifié 2026-11-21 : 40 items, dernier item 2026-11-20 22:37 UTC ; flux api/v1 découvert dans le HTML (les /rss* répondent 404)'),
('presse-lnr-deuxsevres','La Nouvelle République — Deux-Sèvres (RSS)','cti','https://www.lanouvellerepublique.fr/api/v1/rss/5e2072f9f30f8cdd4c8b4594','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,1800,'Vérifié 2026-11-21 : 40 items, dernier item 2026-11-20 20:03 UTC ; flux api/v1 découvert dans le HTML'),
('gn-press-lamontagne','Google News — cyber sur lamontagne.fr (30 j)','presse_cyber','https://news.google.com/rss/search?q=site:lamontagne.fr+(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+when:30d&hl=fr&gl=FR&ceid=FR:fr','Presse — citation courte',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-21 : 20 items, dernier 2026-11-17 ; La Montagne sans RSS public (404) — couvre Corrèze et Creuse'),
('gn-press-lepopulaire','Google News — cyber sur lepopulaire.fr (30 j)','presse_cyber','https://news.google.com/rss/search?q=site:lepopulaire.fr+(cyberattaque+OR+piratage+OR+ran%C3%A7ongiciel)+when:30d&hl=fr&gl=FR&ceid=FR:fr','Presse — citation courte',true,'narrative','rss','{}'::jsonb,3600,'Vérifié 2026-11-21 : 9 items, dernier 2026-11-14 ; Populaire du Centre sans RSS public (404) — couvre la Haute-Vienne')
ON CONFLICT (id) DO UPDATE
   SET url = EXCLUDED.url,
       enabled = EXCLUDED.enabled,
       description = EXCLUDED.description;
