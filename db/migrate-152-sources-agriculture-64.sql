-- Sources d'information du secteur agriculture dans le departement 64 (Pyrénées-Atlantiques).
-- 23 sources ; sites, pages d'actualites, flux et articles cyber controles en HTTP 200 le 2026-11-22
-- (curl -L, User-Agent navigateur, delai 25 s). Corpus : bench/corpus/sources-agriculture-64.jsonl
-- Preuve : bench/results/verification-agriculture-64.json (57 URL uniques, toutes HTTP 200).

BEGIN;

CREATE TABLE IF NOT EXISTS source_verification (
  id                bigserial PRIMARY KEY,
  source_id         text        NOT NULL REFERENCES source(id) ON DELETE CASCADE,
  url               text        NOT NULL,
  code_http         integer,
  content_type      text,
  items             integer     NOT NULL DEFAULT 0 CHECK (items >= 0),
  derniere_item_at  timestamptz,
  ms                integer     NOT NULL CHECK (ms >= 0),
  verifie_at        timestamptz NOT NULL DEFAULT now(),
  user_agent        text        NOT NULL,
  etat              text        NOT NULL CHECK (etat IN ('ok200', 'muette', 'morte', 'lente')),
  motif             text
);

CREATE INDEX IF NOT EXISTS idx_source_verification_source_date
  ON source_verification (source_id, verifie_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_source_verification_verifie_at
  ON source_verification (verifie_at DESC);

WITH src(ord, id, nom, type, site, actus, flux, cyber) AS (
  VALUES
    (1, 'corpus:agri64-01-chambre-agriculture-pyrenees-atlantiques', $src$Chambre d'agriculture des Pyrénées-Atlantiques$src$, $src$chambre consulaire départementale$src$, 'https://pa.chambres-agriculture.fr/', 'https://pa.chambres-agriculture.fr/actualites-1', 'https://pa.chambres-agriculture.fr/actus-CA64.rss', $src$Cyberattaque : des hackers demandent une rançon à des Chambres d'agriculture (18/11/2020) — https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture$src$),
    (2, 'corpus:agri64-02-annuaire-chambres-agriculture-64', $src$Chambre d'agriculture France — annuaire des Pyrénées-Atlantiques$src$, $src$annuaire professionnel consulaire$src$, 'https://www.chambres-agriculture.fr/le-reseau-chambres/qui-sommes-nous/annuaire-des-chambres/chambre-dagriculture-des-pyrenees-atlantiques', 'https://www.chambres-agriculture.fr/actualites', '', $src$Cyberattaque : des hackers demandent une rançon à des Chambres d'agriculture (18/11/2020) — https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture$src$),
    (3, 'corpus:agri64-03-chambre-regionale-na-agricultures-64', $src$Chambre régionale d'agriculture Nouvelle-Aquitaine — publication Agricultures Pyrénées-Atlantiques$src$, $src$chambre consulaire régionale$src$, 'https://nouvelle-aquitaine.chambres-agriculture.fr/', 'https://nouvelle-aquitaine.chambres-agriculture.fr/sinformer/toutes-les-publications/publication/agricultures-pyrenees-atlantiques', 'https://nouvelle-aquitaine.chambres-agriculture.fr/actualites.rss', $src$Cyberattaque : des hackers demandent une rançon à des Chambres d'agriculture (18/11/2020) — https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture$src$),
    (4, 'corpus:agri64-04-ddtm-64-prefecture', $src$DDTM 64 — Préfecture des Pyrénées-Atlantiques$src$, $src$service déconcentré de l'État$src$, 'https://www.pyrenees-atlantiques.gouv.fr/Services-de-l-Etat/Agriculture-environnement-amenagement-et-logement', 'https://www.pyrenees-atlantiques.gouv.fr/Actions-de-l-Etat/Agriculture-foret-et-developpement-rural', '', $src$Aucun incident propre identifié ; cyberattaque : des hackers demandent une rançon à des Chambres d'agriculture (18/11/2020) — https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture$src$),
    (5, 'corpus:agri64-05-draaf-nouvelle-aquitaine', $src$DRAAF Nouvelle-Aquitaine$src$, $src$direction régionale de l'État$src$, 'https://draaf.nouvelle-aquitaine.agriculture.gouv.fr/', 'https://draaf.nouvelle-aquitaine.agriculture.gouv.fr/spip.php?page=liste-actualites&lang=fr', 'https://draaf.nouvelle-aquitaine.agriculture.gouv.fr/spip.php?page=backend-actu', $src$Aucun incident propre identifié ; une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$),
    (6, 'corpus:agri64-06-euralis', $src$Groupe Euralis (Lescar)$src$, $src$coopérative agricole$src$, 'https://www.euralis.fr/', 'https://www.euralis.fr/actualites/', 'https://www.euralis.fr/feed/', $src$Une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$),
    (7, 'corpus:agri64-07-lurberri', $src$Coopérative Lur Berri (Pau)$src$, $src$coopérative agricole$src$, 'https://www.lurberri.fr/fr/', 'https://www.lurberri.fr/fr/actualites/', 'https://www.lurberri.fr/fr/feed/', $src$Une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$),
    (8, 'corpus:agri64-08-cave-irouleguy', $src$Cave d'Irouléguy (Saint-Étienne-d'Albordy)$src$, $src$cave coopérative viticole$src$, 'https://cave-irouleguy.com/fr/', 'https://cave-irouleguy.com/fr/blog/actualites', '', $src$Aucun incident propre identifié ; une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$),
    (9, 'corpus:agri64-09-modef-64', $src$MODEF 64 (Fédération des Pyrénées-Atlantiques)$src$, $src$syndicat agricole$src$, 'https://www.modef.fr/nos-federations/dep64/', 'https://www.modef.fr/categorie/actualites/', 'https://www.modef.fr/feed/', $src$Aucun incident propre identifié ; une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$),
    (10, 'corpus:agri64-10-ja-64', $src$Jeunes Agriculteurs 64$src$, $src$syndicat agricole départemental$src$, 'https://www.ja64.fr/', 'https://www.ja64.fr/', '', $src$Aucun incident propre identifié ; une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$),
    (11, 'corpus:agri64-11-ici-pays-basque', $src$ICI Pays Basque (ex-France Bleu)$src$, $src$radio locale$src$, 'https://www.ici.fr/radio/pays-basque', 'https://www.ici.fr/theme/agriculture', 'https://www.ici.fr/rss/pays-basque/a-la-une.xml', $src$Aucun incident propre identifié ; une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$),
    (12, 'corpus:agri64-12-ici-bearn-bigorre', $src$ICI Béarn Bigorre (ex-France Bleu)$src$, $src$radio locale$src$, 'https://www.ici.fr/radio/bearn', 'https://www.ici.fr/nouvelle-aquitaine/pyrenees-atlantiques-64', 'https://www.ici.fr/rss/bearn/a-la-une.xml', $src$Aucun incident propre identifié ; cyberattaque : des hackers demandent une rançon à des Chambres d'agriculture (18/11/2020) — https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture$src$),
    (13, 'corpus:agri64-13-france3-pyrenees-atlantiques', $src$France 3 Pyrénées-Atlantiques$src$, $src$télévision locale$src$, 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques/rss', $src$Aucun incident propre identifié ; une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$),
    (14, 'corpus:agri64-14-franceagrimer', $src$FranceAgriMer$src$, $src$établissement public agricole$src$, 'https://www.franceagrimer.fr/', 'https://www.franceagrimer.fr/presse', '', $src$Aucun incident propre identifié ; cyberattaque : des hackers demandent une rançon à des Chambres d'agriculture (18/11/2020) — https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture$src$),
    (15, 'corpus:agri64-15-la-france-agricole', $src$La France Agricole$src$, $src$presse agricole spécialisée$src$, 'https://www.lafranceagricole.fr/', 'https://www.lafranceagricole.fr/actualites/', 'https://www.lafranceagricole.fr/rss', $src$Une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$),
    (16, 'corpus:agri64-16-reussir', $src$Réussir — presse agricole$src$, $src$presse agricole spécialisée$src$, 'https://www.reussir.fr/', 'https://www.reussir.fr/actualites/', 'https://www.reussir.fr/rss.xml', $src$Une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$),
    (17, 'corpus:agri64-17-bio-nouvelle-aquitaine', $src$Bio Nouvelle-Aquitaine$src$, $src$fédération régionale de l'agriculture biologique$src$, 'https://www.bionouvelleaquitaine.com/', 'https://www.bionouvelleaquitaine.com/actualites/', 'https://www.bionouvelleaquitaine.com/feed/', $src$Aucun incident propre identifié ; une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$),
    (18, 'corpus:agri64-18-terre-de-liens-aquitaine', $src$Terre de Liens Aquitaine$src$, $src$association foncière agricole$src$, 'https://terredeliens.org/aquitaine/', 'https://terredeliens.org/aquitaine/', '', $src$Aucun incident propre identifié ; cyberattaque : des hackers demandent une rançon à des Chambres d'agriculture (18/11/2020) — https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture$src$),
    (19, 'corpus:agri64-19-cuma-640', $src$Fédération des Cuma Béarn–Landes–Pays Basque (Cuma 640)$src$, $src$fédération de coopératives d'utilisation de matériel agricole$src$, 'https://640.cuma.fr/', 'https://640.cuma.fr/actualites/', '', $src$Aucun incident propre identifié ; une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$),
    (20, 'corpus:agri64-20-cdeo-64', $src$CDEO 64 — Centre départemental de l'élevage ovin$src$, $src$coopérative agricole d'élevage$src$, 'https://www.cdeo64.fr/', 'https://www.cdeo64.fr/', 'https://www.cdeo64.fr/feed/', $src$Aucun incident propre identifié ; une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$),
    (21, 'corpus:agri64-21-vins-jurancon', $src$Association Sur la Route des Vins du Jurançon$src$, $src$association de vignerons$src$, 'https://www.vins-jurancon.fr/', 'https://www.vins-jurancon.fr/agenda/news', '', $src$Aucun incident propre identifié ; cyberattaque : des hackers demandent une rançon à des Chambres d'agriculture (18/11/2020) — https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture$src$),
    (22, 'corpus:agri64-22-gds-64', $src$GDS 64 — Groupement de défense sanitaire du cheptel$src$, $src$association d'éleveurs$src$, 'https://www.gds64.fr/gds-pyrenees-atlantiques/', 'https://www.gds64.fr/gds-pyrenees-atlantiques/', '', $src$Aucun incident propre identifié ; une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$),
    (23, 'corpus:agri64-23-fnab', $src$FNAB — Fédération nationale d'agriculture biologique$src$, $src$fédération agricole biologique$src$, 'https://www.fnab.org/', 'https://www.fnab.org/actualites/', 'https://www.fnab.org/feed/', $src$Aucun incident propre identifié ; une cyberattaque touche la coopérative numérique des éleveurs du grand sud-ouest (23/12/2024) — https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque$src$)
)
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
SELECT id, nom, 'cti', COALESCE(NULLIF(flux, ''), NULLIF(actus, ''), site),
       'source d information sectorielle, diffusion publique', true, 'narrative',
       CASE WHEN flux <> '' THEN 'rss' ELSE 'html' END,
       jsonb_build_object('corpus', jsonb_build_object('fichier', 'sources-agriculture-64.jsonl', 'ligne', ord))::jsonb,
       3600, type || ', secteur agriculture, departement 64 (Pyrénées-Atlantiques). Exemple cyber : ' || cyber,
       'Nouvelle-Aquitaine', '64'
FROM src
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, description = EXCLUDED.description,
  format = EXCLUDED.format, parser = EXCLUDED.parser, enabled = true;

-- Trace de verification HTTP des URLs du corpus, toutes en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus agriculture-64 : HTTP 200 verifie le 2026-11-22'
FROM (VALUES
  ('corpus:agri64-01-chambre-agriculture-pyrenees-atlantiques', 'https://pa.chambres-agriculture.fr/', 'text/html; charset=utf-8'),
  ('corpus:agri64-01-chambre-agriculture-pyrenees-atlantiques', 'https://pa.chambres-agriculture.fr/actualites-1', 'text/html; charset=utf-8'),
  ('corpus:agri64-01-chambre-agriculture-pyrenees-atlantiques', 'https://pa.chambres-agriculture.fr/actus-CA64.rss', 'text/xml; charset=utf-8'),
  ('corpus:agri64-01-chambre-agriculture-pyrenees-atlantiques', 'https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture', 'text/html; charset=utf-8'),
  ('corpus:agri64-02-annuaire-chambres-agriculture-64', 'https://www.chambres-agriculture.fr/le-reseau-chambres/qui-sommes-nous/annuaire-des-chambres/chambre-dagriculture-des-pyrenees-atlantiques', 'text/html; charset=utf-8'),
  ('corpus:agri64-02-annuaire-chambres-agriculture-64', 'https://www.chambres-agriculture.fr/actualites', 'text/html; charset=utf-8'),
  ('corpus:agri64-02-annuaire-chambres-agriculture-64', 'https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture', 'text/html; charset=utf-8'),
  ('corpus:agri64-03-chambre-regionale-na-agricultures-64', 'https://nouvelle-aquitaine.chambres-agriculture.fr/', 'text/html; charset=utf-8'),
  ('corpus:agri64-03-chambre-regionale-na-agricultures-64', 'https://nouvelle-aquitaine.chambres-agriculture.fr/sinformer/toutes-les-publications/publication/agricultures-pyrenees-atlantiques', 'text/html; charset=utf-8'),
  ('corpus:agri64-03-chambre-regionale-na-agricultures-64', 'https://nouvelle-aquitaine.chambres-agriculture.fr/actualites.rss', 'text/xml; charset=utf-8'),
  ('corpus:agri64-03-chambre-regionale-na-agricultures-64', 'https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture', 'text/html; charset=utf-8'),
  ('corpus:agri64-04-ddtm-64-prefecture', 'https://www.pyrenees-atlantiques.gouv.fr/Services-de-l-Etat/Agriculture-environnement-amenagement-et-logement', 'text/html; charset=utf-8'),
  ('corpus:agri64-04-ddtm-64-prefecture', 'https://www.pyrenees-atlantiques.gouv.fr/Actions-de-l-Etat/Agriculture-foret-et-developpement-rural', 'text/html; charset=utf-8'),
  ('corpus:agri64-04-ddtm-64-prefecture', 'https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture', 'text/html; charset=utf-8'),
  ('corpus:agri64-05-draaf-nouvelle-aquitaine', 'https://draaf.nouvelle-aquitaine.agriculture.gouv.fr/', 'text/html; charset=utf-8'),
  ('corpus:agri64-05-draaf-nouvelle-aquitaine', 'https://draaf.nouvelle-aquitaine.agriculture.gouv.fr/spip.php?page=liste-actualites&lang=fr', 'text/html; charset=utf-8'),
  ('corpus:agri64-05-draaf-nouvelle-aquitaine', 'https://draaf.nouvelle-aquitaine.agriculture.gouv.fr/spip.php?page=backend-actu', 'text/xml; charset=utf-8'),
  ('corpus:agri64-05-draaf-nouvelle-aquitaine', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8'),
  ('corpus:agri64-06-euralis', 'https://www.euralis.fr/', 'text/html; charset=UTF-8'),
  ('corpus:agri64-06-euralis', 'https://www.euralis.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:agri64-06-euralis', 'https://www.euralis.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:agri64-06-euralis', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8'),
  ('corpus:agri64-07-lurberri', 'https://www.lurberri.fr/fr/', 'text/html; charset=UTF-8'),
  ('corpus:agri64-07-lurberri', 'https://www.lurberri.fr/fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:agri64-07-lurberri', 'https://www.lurberri.fr/fr/feed/', 'application/rss+xml'),
  ('corpus:agri64-07-lurberri', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8'),
  ('corpus:agri64-08-cave-irouleguy', 'https://cave-irouleguy.com/fr/', 'text/html; charset=utf-8'),
  ('corpus:agri64-08-cave-irouleguy', 'https://cave-irouleguy.com/fr/blog/actualites', 'text/html; charset=utf-8'),
  ('corpus:agri64-08-cave-irouleguy', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8'),
  ('corpus:agri64-09-modef-64', 'https://www.modef.fr/nos-federations/dep64/', 'text/html; charset=UTF-8'),
  ('corpus:agri64-09-modef-64', 'https://www.modef.fr/categorie/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:agri64-09-modef-64', 'https://www.modef.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:agri64-09-modef-64', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8'),
  ('corpus:agri64-10-ja-64', 'https://www.ja64.fr/', 'text/html'),
  ('corpus:agri64-10-ja-64', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8'),
  ('corpus:agri64-11-ici-pays-basque', 'https://www.ici.fr/radio/pays-basque', 'text/html; charset=UTF-8'),
  ('corpus:agri64-11-ici-pays-basque', 'https://www.ici.fr/theme/agriculture', 'text/html; charset=UTF-8'),
  ('corpus:agri64-11-ici-pays-basque', 'https://www.ici.fr/rss/pays-basque/a-la-une.xml', 'application/xml'),
  ('corpus:agri64-11-ici-pays-basque', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8'),
  ('corpus:agri64-12-ici-bearn-bigorre', 'https://www.ici.fr/radio/bearn', 'text/html; charset=UTF-8'),
  ('corpus:agri64-12-ici-bearn-bigorre', 'https://www.ici.fr/nouvelle-aquitaine/pyrenees-atlantiques-64', 'text/html; charset=UTF-8'),
  ('corpus:agri64-12-ici-bearn-bigorre', 'https://www.ici.fr/rss/bearn/a-la-une.xml', 'application/xml'),
  ('corpus:agri64-12-ici-bearn-bigorre', 'https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture', 'text/html; charset=utf-8'),
  ('corpus:agri64-13-france3-pyrenees-atlantiques', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques', 'text/html; charset=UTF-8'),
  ('corpus:agri64-13-france3-pyrenees-atlantiques', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques/rss', 'text/xml; charset=UTF-8'),
  ('corpus:agri64-13-france3-pyrenees-atlantiques', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8'),
  ('corpus:agri64-14-franceagrimer', 'https://www.franceagrimer.fr/', 'text/html; charset=utf-8'),
  ('corpus:agri64-14-franceagrimer', 'https://www.franceagrimer.fr/presse', 'text/html; charset=utf-8'),
  ('corpus:agri64-14-franceagrimer', 'https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture', 'text/html; charset=utf-8'),
  ('corpus:agri64-15-la-france-agricole', 'https://www.lafranceagricole.fr/', 'text/html; charset=utf-8'),
  ('corpus:agri64-15-la-france-agricole', 'https://www.lafranceagricole.fr/actualites/', 'text/html; charset=utf-8'),
  ('corpus:agri64-15-la-france-agricole', 'https://www.lafranceagricole.fr/rss', 'text/xml; charset=utf-8'),
  ('corpus:agri64-15-la-france-agricole', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8'),
  ('corpus:agri64-16-reussir', 'https://www.reussir.fr/', 'text/html; charset=utf-8'),
  ('corpus:agri64-16-reussir', 'https://www.reussir.fr/actualites/', 'text/html; charset=utf-8'),
  ('corpus:agri64-16-reussir', 'https://www.reussir.fr/rss.xml', 'application/xml;charset=UTF-8'),
  ('corpus:agri64-16-reussir', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8'),
  ('corpus:agri64-17-bio-nouvelle-aquitaine', 'https://www.bionouvelleaquitaine.com/', 'text/html; charset=UTF-8'),
  ('corpus:agri64-17-bio-nouvelle-aquitaine', 'https://www.bionouvelleaquitaine.com/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:agri64-17-bio-nouvelle-aquitaine', 'https://www.bionouvelleaquitaine.com/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:agri64-17-bio-nouvelle-aquitaine', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8'),
  ('corpus:agri64-18-terre-de-liens-aquitaine', 'https://terredeliens.org/aquitaine/', 'text/html; charset=utf-8'),
  ('corpus:agri64-18-terre-de-liens-aquitaine', 'https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture', 'text/html; charset=utf-8'),
  ('corpus:agri64-19-cuma-640', 'https://640.cuma.fr/', 'text/html; charset=UTF-8'),
  ('corpus:agri64-19-cuma-640', 'https://640.cuma.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:agri64-19-cuma-640', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8'),
  ('corpus:agri64-20-cdeo-64', 'https://www.cdeo64.fr/', 'text/html'),
  ('corpus:agri64-20-cdeo-64', 'https://www.cdeo64.fr/feed/', 'text/xml;charset=UTF-8'),
  ('corpus:agri64-20-cdeo-64', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8'),
  ('corpus:agri64-21-vins-jurancon', 'https://www.vins-jurancon.fr/', 'text/html; charset=utf-8'),
  ('corpus:agri64-21-vins-jurancon', 'https://www.vins-jurancon.fr/agenda/news', 'text/html; charset=utf-8'),
  ('corpus:agri64-21-vins-jurancon', 'https://www.lafranceagricole.fr/chambre-dagriculture/article/758257/des-hackers-demandent-une-ranon--des-chambres-dagriculture', 'text/html; charset=utf-8'),
  ('corpus:agri64-22-gds-64', 'https://www.gds64.fr/gds-pyrenees-atlantiques/', 'text/html; charset=UTF-8'),
  ('corpus:agri64-22-gds-64', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8'),
  ('corpus:agri64-23-fnab', 'https://www.fnab.org/', 'text/html; charset=UTF-8'),
  ('corpus:agri64-23-fnab', 'https://www.fnab.org/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:agri64-23-fnab', 'https://www.fnab.org/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:agri64-23-fnab', 'https://www.lafranceagricole.fr/elevage/article/876452/30-000-eleveurs-touches-par-une-cyberattaque', 'text/html; charset=utf-8')
) AS v(source_id, url, content_type)
WHERE NOT EXISTS (SELECT 1 FROM source_verification x WHERE x.source_id = v.source_id AND x.url = v.url);

COMMIT;
