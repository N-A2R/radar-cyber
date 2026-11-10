-- Sources économiques régionales Nouvelle-Aquitaine — mesurées le 2026-11-10.
--
-- Pourquoi : le corpus ne nomme presque jamais d'organisation régionale
-- (5 478 textes sur 5 501) et la presse généraliste ne passe plus la porte
-- d'entrée. Une source économique est utile parce que ses articles *cyber*
-- passent cette porte, pas parce qu'elle remplit le fil.
--
-- Choix de colonnes (vérifié contre apps/api/src/collectors/generic.ts) :
--   family='cti'   — la porte refuse un item reclassé `presse`. Avec
--                    family='presse', classifyFamily renverrait `presse` même
--                    pour un texte cyber : la source serait morte à l'entrée.
--   relevance='strict' — désactive la règle d'admission « un département est
--                    cité », qui laisserait passer le menu économique ordinaire.
--                    Seul le texte cyber décide.
--
-- Chaque URL a été requêtée (GET) et son flux parsé : le nombre d'items et les
-- titres cités ci-dessous sont ceux observés, pas ceux annoncés.

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, relevance)
VALUES
-- Presse économique régionale (items frais, publiés le 2026-11-10)
('eco-sudouest','Sud Ouest Éco (RSS)','cti','https://www.sudouest.fr/economie/rss.xml','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,
 'Vérifié 2026-11-10 HTTP 200 size=29585 items=20 channel="Sud Ouest Éco - Actualités économique en direct" ; ex. « Un Forum des emplois est organisé mardi 17 novembre à Arvert » (2026-11-10T21:33+01)','strict'),
('eco-charentelibre','Charente Libre Économie (RSS)','cti','https://www.charentelibre.fr/economie/rss.xml','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,
 'Vérifié 2026-11-10 HTTP 200 size=28967 items=20 channel="Économie" ; ex. « Nexeya va être placée en redressement judiciaire » (2026-11-10T22:00+01)','strict'),
('eco-jde-na','Le Journal des Entreprises Nouvelle-Aquitaine (RSS)','cti','https://www.lejournaldesentreprises.com/rss-nouvelle-aquitaine','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,
 'Vérifié 2026-11-10 HTTP 200 size=15887 items=20 channel="Le Journal des Entreprises - Nouvelle-Aquitaine" ; ex. « HDF Energy obtient l''aval de ses actionnaires pour transférer sa cotation sur Euronext Growth » (2026-11-10T07:14+01)','strict'),
('eco-rep-pyrenees','La République des Pyrénées Économie (RSS)','cti','https://www.larepubliquedespyrenees.fr/economie/rss.xml','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,
 'Vérifié 2026-11-10 HTTP 200 size=30076 items=20 channel="Economie" ; ex. « Oloron : la Confédération paysanne « rassurée » par les propos du préfet au sujet de l''abattoir » (2026-11-10T21:45+01)','strict'),
('eco-dordogne-libre','Dordogne Libre Économie (RSS)','cti','https://www.dordognelibre.fr/economie/rss.xml','presse, diffusion publique',true,'narrative','rss','{}'::jsonb,3600,
 'Vérifié 2026-11-10 HTTP 200 size=30635 items=20 channel="Économie: Actualités et informations en direct" ; ex. « « DL » éco : un side-car polyvalent pour soulager des maraîchers » (2026-11-10T06:00+01)','strict'),
-- Écosystème entrepreneurial / clusters (institutionnel, cadence plus lente)
('eco-technowest','Bordeaux Technowest (RSS)','cti','https://technowest.com/feed/','institution, diffusion publique',true,'narrative','rss','{}'::jsonb,7200,
 'Vérifié 2026-11-10 HTTP 200 size=233932 items=10 channel="Bordeaux Technowest" ; ex. « New Space : Bordeaux Métropole en première ligne » (2026-10-27)','strict'),
('eco-unitec','Unitec (incubateur Bordeaux, RSS)','cti','https://unitec.fr/feed/','institution, diffusion publique',true,'narrative','rss','{}'::jsonb,7200,
 'Vérifié 2026-11-10 HTTP 200 size=137761 items=10 channel="Unitec" ; ex. « i-Lab : 109 lauréats ont été accompagnés par Unitec » (2026-10-23)','strict'),
('eco-aquitaine-robotics','Aquitaine Robotics (RSS)','cti','https://www.aquitaine-robotics.com/feed','institution, diffusion publique',true,'narrative','rss','{}'::jsonb,7200,
 'Vérifié 2026-11-10 HTTP 200 size=12113 items=4 channel="Aquitaine Robotics" ; ex. « Appel à Projets France 2030 « Défi Flagships » » (2026-09-17)','strict')
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  family      = EXCLUDED.family,
  url         = EXCLUDED.url,
  license     = EXCLUDED.license,
  enabled     = EXCLUDED.enabled,
  format      = EXCLUDED.format,
  interval_sec= EXCLUDED.interval_sec,
  description = EXCLUDED.description,
  relevance   = EXCLUDED.relevance;

-- Écartées (mesures du 2026-11-10) -----------------------------------------
-- latribune NA          : déjà en base deux fois (estorides:la-tribune-rubrique-
--                         nouvelle-aquitaine-74 et ...sous-rubriques-regions...),
--                         HTTP 200/20 items — inutile de tripler.
-- petitbleu.fr          : déjà en base via https://www.petitbleu.fr/rss.xml
--                         (100 items) ; le fil /economie/rss.xml dupliquerait.
-- mediacites.fr/feed/   : HTTP 200, 10 items, 0 sur Bordeaux/NA (Toulouse, Lyon) ;
--                         /bordeaux/feed/ et /bordeaux/rss = HTTP 404.
-- digital-aquitaine.com : HTTP 200 mais flux figé — dernier pubDate 2025-01-20
--                         (fusion dans ENTER), aucun article neuf.
-- lanouvellerepublique.fr : API RSS réelle (…/api/v1/rss/592bf2…, 20 items) mais
--                         généraliste (sport, tourisme), pas de fil économie
--                         exposé ; /rss/*.xml répond HTML, pas du flux.
-- lepopulaire.fr, lamontagne.fr, centrepresse.fr : /rss.xml, /rss/,
--                         /rss/economie.xml = 404 ou hôte injoignable.
-- nouvelle-aquitaine.fr : aucun flux (/, /feed, /rss.xml : HTML ou 404).
-- nouvelle-aquitaine.cci.fr, adi-na.fr : HTTP 403 (anti-bot) sur /, /feed, /rss.
-- cci16/17/19/23/24/33/40/47/64/79/86/87.fr : DNS injoignable, 404 ou sans flux.
-- frenchtechbordeaux.com : /feed, /feed/, /rss = 404, aucun <link rel=alternate>.
-- aerospace-valley.com  : /rss.xml 404, /feed 404, aucun flux annoncé.
-- bordeaux-metropole.fr, bordeaux.fr, larochelle.fr, pau.fr, limoges-metropole.fr,
--   agglo-niort.fr : 404 ou aucune découverte de flux sur la page d'accueil.
-- brive.fr/feed         : 200, 10 items, mais actualité municipale/culturelle.
-- grandangouleme.fr/feed: 200, 10 items dont 6 offres d'emploi (RMS), pas de fil éco.
-- niort-tech.fr/feed    : 200, `Niort Tech`, 0 item (flux vide).
-- xylofutur.fr, agri-sudouest.com, polemer-ba.com, forum-eco.fr : TLS/DNS en échec.
--
-- Trou assumé : Corrèze (19), Creuse (23), Deux-Sèvres (79), Vienne (86),
-- Haute-Vienne (87) n'exposent aucun flux économique natif ; ces départements
-- ne sont couverts que par les flux régionaux (eco-jde-na, La Tribune NA déjà
-- en base) et par la règle d'admission « département cité » du collecteur.
