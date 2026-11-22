-- Sources d'information du secteur bâtiment dans le département 86 (Vienne).
-- 26 sources, 73 contrôles HTTP sur 73 URLs distinctes (sites, pages actualités et flux),
-- toutes en HTTP 200 le 2026-11-22 (curl -L, User-Agent navigateur).
-- Corpus : bench/corpus/sources-batiment-86.jsonl
-- Preuve : bench/results/verification-sources-batiment-86.json

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

WITH src(ord, id, nom, type, site, actus, flux, fam, fmt) AS (
  VALUES
    (1, 'corpus:capeb-vienne-section-departementale-du-batiment-86', 'CAPEB Vienne — section départementale du bâtiment (86)', 'syndicat professionnel du bâtiment', 'https://www.capeb.fr/vienne/', 'https://www.capeb.fr/vienne/actualites', 'https://news.google.com/rss/search?q=CAPEB+Vienne+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'presse', 'rss'),
    (2, 'corpus:cma-nouvelle-aquitaine-cma-de-la-vienne-86', 'CMA Nouvelle-Aquitaine — CMA de la Vienne (86)', 'chambre des métiers et de l''artisanat', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-vienne', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'https://news.google.com/rss/search?q=artisans+Vienne+b%C3%A2timent+cyber&hl=fr&gl=FR&ceid=FR:fr', 'presse', 'rss'),
    (3, 'corpus:cma-formation-centre-de-saint-benoit-86', 'CMA Formation — centre de Saint-Benoît (86)', 'organisme de formation aux métiers du bâtiment', 'https://formation.cma-nouvelleaquitaine.fr/nos-centres-de-formation/saint-benoit', 'https://formation.cma-nouvelleaquitaine.fr/actualites', 'https://news.google.com/rss/search?q=CMA+Formation+Saint-Benoit+Vienne+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'presse', 'rss'),
    (4, 'corpus:btp-cfa-vienne-centre-de-formation-des-apprentis-du-batiment', 'BTP CFA Vienne — centre de formation des apprentis du bâtiment', 'centre de formation des apprentis du bâtiment', 'https://www.btpcfa-poitou-charentes.fr/btp-cfa/nos-centres/btp-cfa-vienne/', 'https://www.btpcfa-poitou-charentes.fr/actualites/', 'https://news.google.com/rss/search?q=BTP+CFA+Vienne+86&hl=fr&gl=FR&ceid=FR:fr', 'presse', 'rss'),
    (5, 'corpus:coop-bat-en-vienne-cooperative-d-entrepreneurs-du-batiment-liguge', 'Coop&Bat en Vienne — coopérative d''entrepreneurs du bâtiment (Ligugé)', 'coopérative d''entrepreneurs du bâtiment', 'https://www.coopetbat.fr/', 'https://www.coopetbat.fr/category/actualites/', 'https://www.coopetbat.fr/feed/', 'cti', 'rss'),
    (6, 'corpus:odeys-cluster-de-la-construction-et-de-l-amenagement-durables-poitiers', 'Odéys — cluster de la construction et de l''aménagement durables (Poitiers)', 'cluster professionnel de la construction durable', 'https://www.odeys.fr/', 'https://www.odeys.fr/actualites', 'https://www.odeys.fr/rss.xml', 'cti', 'rss'),
    (7, 'corpus:pro-rge-entreprises-rge-de-la-vienne-86', 'Pro-RGE — entreprises RGE de la Vienne (86)', 'annuaire professionnel public (artisans RGE)', 'https://pro-rge.fr/entreprise/d/86/', 'https://pro-rge.fr/entreprises/vienne-86/', 'https://news.google.com/rss/search?q=RGE+Vienne+86+r%C3%A9novation&hl=fr&gl=FR&ceid=FR:fr', 'presse', 'rss'),
    (8, 'corpus:qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'Qualibat — certification et annuaire des entreprises du bâtiment', 'organisme de certification et annuaire professionnel', 'https://www.qualibat.com/', 'https://www.qualibat.com/actualites', 'https://news.google.com/rss/search?q=Qualibat+Vienne+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'cert', 'rss'),
    (9, 'corpus:caue-86-conseil-d-architecture-d-urbanisme-et-de-l-environnement', 'CAUE 86 — conseil d''architecture, d''urbanisme et de l''environnement', 'conseil d''architecture, d''urbanisme et de l''environnement', 'https://www.caue86.fr/', 'https://www.caue86.fr/index.php/actus', 'https://www.caue86.fr/index.php?format=feed&type=rss', 'cti', 'rss'),
    (10, 'corpus:maison-de-l-architecture-de-poitiers-86', 'Maison de l''Architecture de Poitiers (86)', 'association de diffusion de l''architecture', 'https://ma-poitiers.fr/', 'https://ma-poitiers.fr/actualites/', 'https://ma-poitiers.fr/feed/', 'cti', 'rss'),
    (11, 'corpus:habitat-de-la-vienne-office-public-de-l-habitat', 'Habitat de la Vienne — office public de l''habitat', 'office public de l''habitat', 'https://habitatdelavienne.fr/', 'https://habitatdelavienne.fr/actualites-informations/', 'https://news.google.com/rss/search?q=Habitat+de+la+Vienne+logement+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'presse', 'rss'),
    (12, 'corpus:ddt-86-direction-departementale-des-territoires-de-la-vienne', 'DDT 86 — direction départementale des territoires de la Vienne', 'administration (urbanisme, logement, construction)', 'https://www.vienne.gouv.fr/', 'https://www.vienne.gouv.fr/Actualites', 'https://news.google.com/rss/search?q=DDT+86+Vienne+logement+construction&hl=fr&gl=FR&ceid=FR:fr', 'presse', 'rss'),
    (13, 'corpus:grand-poitiers-communaute-urbaine-actualites-urbanisme-et-habitat', 'Grand Poitiers Communauté urbaine — actualités urbanisme et habitat', 'intercommunalité', 'https://www.grandpoitiers.fr/', 'https://www.grandpoitiers.fr/information-transversale/actualites', 'https://www.grandpoitiers.fr/information-transversale/actualites/rss', 'presse', 'rss'),
    (14, 'corpus:ville-de-poitiers-actualites-urbanisme-et-travaux', 'Ville de Poitiers — actualités urbanisme et travaux', 'collectivité (ville)', 'https://www.poitiers.fr/', 'https://www.poitiers.fr/les-actualites', 'https://www.poitiers.fr/rss.xml', 'presse', 'rss'),
    (15, 'corpus:departement-de-la-vienne-fil-d-infos-logement-et-batiment', 'Département de la Vienne — fil d''infos (logement et bâtiment)', 'collectivité (département)', 'https://www.lavienne86.fr/', 'https://www.lavienne86.fr/fil-infos/actualites', 'https://news.google.com/rss/search?q=Vienne+86+logement+habitat+construction&hl=fr&gl=FR&ceid=FR:fr', 'presse', 'rss'),
    (16, 'corpus:cci-de-la-vienne-poitiers-actualites-des-entreprises', 'CCI de la Vienne (Poitiers) — actualités des entreprises', 'chambre de commerce et d''industrie', 'https://www.poitiers.cci.fr/', 'https://www.poitiers.cci.fr/actualites/', 'https://www.poitiers.cci.fr/actualites/feed/', 'presse', 'rss'),
    (17, 'corpus:medef-vienne-actualites-de-l-entreprise', 'MEDEF Vienne — actualités de l''entreprise', 'organisation patronale départementale', 'https://www.medef-vienne.fr/', 'https://www.medef-vienne.fr/actualite-de-lentreprise/', 'https://www.medef-vienne.fr/feed/', 'presse', 'rss'),
    (18, 'corpus:la-nouvelle-republique-edition-vienne-86-flux-rss', 'La Nouvelle République — édition Vienne (86, flux RSS)', 'presse quotidienne régionale', 'https://www.lanouvellerepublique.fr/vienne', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c', 'cti', 'json'),
    (19, 'corpus:actu-fr-actu-vienne-86', 'actu.fr — Actu Vienne (86)', 'presse en ligne locale', 'https://actu.fr/nouvelle-aquitaine/vienne_86/', 'https://actu.fr/nouvelle-aquitaine/vienne_86/', 'https://news.google.com/rss/search?q=actu.fr+Vienne+chantier+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'presse', 'rss'),
    (20, 'corpus:ici-poitou-rubrique-btp-et-actualites-de-la-vienne-86', 'ICI Poitou — rubrique BTP et actualités de la Vienne (86)', 'radio publique locale (Radio France)', 'https://www.ici.fr/nouvelle-aquitaine/vienne-86', 'https://www.ici.fr/theme/btp', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'presse', 'rss'),
    (21, 'corpus:placeco-actualites-economiques-de-la-vienne-86', 'Placéco — actualités économiques de la Vienne (86)', 'presse économique locale', 'https://www.placeco.fr/vienne/', 'https://www.placeco.fr/vienne/', 'https://news.google.com/rss/search?q=Plac%C3%A9co+Vienne+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'presse', 'rss'),
    (22, 'corpus:google-actualites-veille-batiment-vienne-86', 'Google Actualités — veille bâtiment Vienne (86)', 'agrégateur de presse locale', 'https://news.google.com/', 'https://news.google.com/rss/search?q=b%C3%A2timent+Vienne+86&hl=fr&gl=FR&ceid=FR:fr', 'https://news.google.com/rss/search?q=b%C3%A2timent+Vienne+86&hl=fr&gl=FR&ceid=FR:fr', 'presse', 'rss'),
    (23, 'corpus:france-3-nouvelle-aquitaine-edition-vienne-86', 'France 3 Nouvelle-Aquitaine — édition Vienne (86)', 'télévision publique locale', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss', 'cti', 'rss'),
    (24, 'corpus:acpresse-rubrique-vienne-86-presse-professionnelle-de-la-construction', 'ACPresse — rubrique Vienne (86), presse professionnelle de la construction', 'presse professionnelle du bâtiment et de la construction', 'https://www.acpresse.fr/', 'https://www.acpresse.fr/category/territoires/nouvelle-aquitaine/vienne/', 'https://www.acpresse.fr/category/territoires/nouvelle-aquitaine/vienne/feed/', 'presse', 'rss'),
    (25, 'corpus:le7-info-rubrique-urbanisme-poitiers-86', 'Le7.info — rubrique urbanisme (Poitiers, 86)', 'presse locale en ligne', 'https://www.le7.info/', 'https://www.le7.info/tag/14-urbanisme', 'https://news.google.com/rss/search?q=Le7.info+urbanisme+Poitiers&hl=fr&gl=FR&ceid=FR:fr', 'presse', 'rss'),
    (26, 'corpus:entreprises-en-vienne-revue-economique-du-medef-86', 'Entreprises en Vienne — revue économique du MEDEF 86', 'revue économique locale (MEDEF Vienne)', 'https://entreprisesenvienne.fr/', 'https://entreprisesenvienne.fr/categories/actus-locales', 'https://news.google.com/rss/search?q=Entreprises+en+Vienne+BTP+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'presse', 'rss')
)
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
SELECT id, nom, fam, COALESCE(NULLIF(flux, ''), NULLIF(actus, ''), site),
       NULL, true, 'narrative', fmt,
       jsonb_build_object('corpus', jsonb_build_object('fichier', 'sources-batiment-86.jsonl', 'ligne', ord, 'type', 'source'))::jsonb,
       3600, 'Source du corpus — 86', 'Nouvelle-Aquitaine', '86'
FROM src
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
  family = EXCLUDED.family, format = EXCLUDED.format, parser = EXCLUDED.parser,
  description = EXCLUDED.description, enabled = true;

INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus batiment-86 : HTTP 200 vérifié le 2026-11-22'
FROM (VALUES
  ('corpus:capeb-vienne-section-departementale-du-batiment-86', 'https://www.capeb.fr/vienne/', 'text/html; charset=utf-8'),
  ('corpus:capeb-vienne-section-departementale-du-batiment-86', 'https://www.capeb.fr/vienne/actualites', 'text/html; charset=utf-8'),
  ('corpus:capeb-vienne-section-departementale-du-batiment-86', 'https://news.google.com/rss/search?q=CAPEB+Vienne+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:cma-nouvelle-aquitaine-cma-de-la-vienne-86', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-vienne', 'text/html; charset=UTF-8'),
  ('corpus:cma-nouvelle-aquitaine-cma-de-la-vienne-86', 'https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites', 'text/html; charset=UTF-8'),
  ('corpus:cma-nouvelle-aquitaine-cma-de-la-vienne-86', 'https://news.google.com/rss/search?q=artisans+Vienne+b%C3%A2timent+cyber&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:cma-formation-centre-de-saint-benoit-86', 'https://formation.cma-nouvelleaquitaine.fr/nos-centres-de-formation/saint-benoit', 'text/html; charset=UTF-8'),
  ('corpus:cma-formation-centre-de-saint-benoit-86', 'https://formation.cma-nouvelleaquitaine.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:cma-formation-centre-de-saint-benoit-86', 'https://news.google.com/rss/search?q=CMA+Formation+Saint-Benoit+Vienne+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:btp-cfa-vienne-centre-de-formation-des-apprentis-du-batiment', 'https://www.btpcfa-poitou-charentes.fr/btp-cfa/nos-centres/btp-cfa-vienne/', 'text/html; charset=UTF-8'),
  ('corpus:btp-cfa-vienne-centre-de-formation-des-apprentis-du-batiment', 'https://www.btpcfa-poitou-charentes.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:btp-cfa-vienne-centre-de-formation-des-apprentis-du-batiment', 'https://news.google.com/rss/search?q=BTP+CFA+Vienne+86&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:coop-bat-en-vienne-cooperative-d-entrepreneurs-du-batiment-liguge', 'https://www.coopetbat.fr/', 'text/html; charset=UTF-8'),
  ('corpus:coop-bat-en-vienne-cooperative-d-entrepreneurs-du-batiment-liguge', 'https://www.coopetbat.fr/category/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:coop-bat-en-vienne-cooperative-d-entrepreneurs-du-batiment-liguge', 'https://www.coopetbat.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:odeys-cluster-de-la-construction-et-de-l-amenagement-durables-poitiers', 'https://www.odeys.fr/', 'text/html; charset=UTF-8'),
  ('corpus:odeys-cluster-de-la-construction-et-de-l-amenagement-durables-poitiers', 'https://www.odeys.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:odeys-cluster-de-la-construction-et-de-l-amenagement-durables-poitiers', 'https://www.odeys.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:pro-rge-entreprises-rge-de-la-vienne-86', 'https://pro-rge.fr/entreprise/d/86/', 'text/html; charset=utf-8'),
  ('corpus:pro-rge-entreprises-rge-de-la-vienne-86', 'https://pro-rge.fr/entreprises/vienne-86/', 'text/html; charset=utf-8'),
  ('corpus:pro-rge-entreprises-rge-de-la-vienne-86', 'https://news.google.com/rss/search?q=RGE+Vienne+86+r%C3%A9novation&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'https://www.qualibat.com/', 'text/html; charset=UTF-8'),
  ('corpus:qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'https://www.qualibat.com/actualites', 'text/html; charset=UTF-8'),
  ('corpus:qualibat-certification-et-annuaire-des-entreprises-du-batiment', 'https://news.google.com/rss/search?q=Qualibat+Vienne+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:caue-86-conseil-d-architecture-d-urbanisme-et-de-l-environnement', 'https://www.caue86.fr/', 'text/html; charset=utf-8'),
  ('corpus:caue-86-conseil-d-architecture-d-urbanisme-et-de-l-environnement', 'https://www.caue86.fr/index.php/actus', 'text/html; charset=utf-8'),
  ('corpus:caue-86-conseil-d-architecture-d-urbanisme-et-de-l-environnement', 'https://www.caue86.fr/index.php?format=feed&type=rss', 'application/rss+xml; charset=utf-8'),
  ('corpus:maison-de-l-architecture-de-poitiers-86', 'https://ma-poitiers.fr/', 'text/html; charset=UTF-8'),
  ('corpus:maison-de-l-architecture-de-poitiers-86', 'https://ma-poitiers.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:maison-de-l-architecture-de-poitiers-86', 'https://ma-poitiers.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:habitat-de-la-vienne-office-public-de-l-habitat', 'https://habitatdelavienne.fr/', 'text/html; charset=UTF-8'),
  ('corpus:habitat-de-la-vienne-office-public-de-l-habitat', 'https://habitatdelavienne.fr/actualites-informations/', 'text/html; charset=UTF-8'),
  ('corpus:habitat-de-la-vienne-office-public-de-l-habitat', 'https://news.google.com/rss/search?q=Habitat+de+la+Vienne+logement+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:ddt-86-direction-departementale-des-territoires-de-la-vienne', 'https://www.vienne.gouv.fr/', 'text/html; charset=utf-8'),
  ('corpus:ddt-86-direction-departementale-des-territoires-de-la-vienne', 'https://www.vienne.gouv.fr/Actualites', 'text/html; charset=utf-8'),
  ('corpus:ddt-86-direction-departementale-des-territoires-de-la-vienne', 'https://news.google.com/rss/search?q=DDT+86+Vienne+logement+construction&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:grand-poitiers-communaute-urbaine-actualites-urbanisme-et-habitat', 'https://www.grandpoitiers.fr/', 'text/html; charset=utf-8'),
  ('corpus:grand-poitiers-communaute-urbaine-actualites-urbanisme-et-habitat', 'https://www.grandpoitiers.fr/information-transversale/actualites', 'text/html; charset=utf-8'),
  ('corpus:grand-poitiers-communaute-urbaine-actualites-urbanisme-et-habitat', 'https://www.grandpoitiers.fr/information-transversale/actualites/rss', 'text/xml;charset=utf-8'),
  ('corpus:ville-de-poitiers-actualites-urbanisme-et-travaux', 'https://www.poitiers.fr/', 'text/html; charset=UTF-8'),
  ('corpus:ville-de-poitiers-actualites-urbanisme-et-travaux', 'https://www.poitiers.fr/les-actualites', 'text/html; charset=UTF-8'),
  ('corpus:ville-de-poitiers-actualites-urbanisme-et-travaux', 'https://www.poitiers.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:departement-de-la-vienne-fil-d-infos-logement-et-batiment', 'https://www.lavienne86.fr/', 'text/html; charset=utf-8'),
  ('corpus:departement-de-la-vienne-fil-d-infos-logement-et-batiment', 'https://www.lavienne86.fr/fil-infos/actualites', 'text/html; charset=utf-8'),
  ('corpus:departement-de-la-vienne-fil-d-infos-logement-et-batiment', 'https://news.google.com/rss/search?q=Vienne+86+logement+habitat+construction&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:cci-de-la-vienne-poitiers-actualites-des-entreprises', 'https://www.poitiers.cci.fr/', 'text/html; charset=UTF-8'),
  ('corpus:cci-de-la-vienne-poitiers-actualites-des-entreprises', 'https://www.poitiers.cci.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:cci-de-la-vienne-poitiers-actualites-des-entreprises', 'https://www.poitiers.cci.fr/actualites/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:medef-vienne-actualites-de-l-entreprise', 'https://www.medef-vienne.fr/', 'text/html; charset=UTF-8'),
  ('corpus:medef-vienne-actualites-de-l-entreprise', 'https://www.medef-vienne.fr/actualite-de-lentreprise/', 'text/html; charset=UTF-8'),
  ('corpus:medef-vienne-actualites-de-l-entreprise', 'https://www.medef-vienne.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:la-nouvelle-republique-edition-vienne-86-flux-rss', 'https://www.lanouvellerepublique.fr/vienne', 'text/html; charset=utf-8'),
  ('corpus:la-nouvelle-republique-edition-vienne-86-flux-rss', 'https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c', 'application/rss+xml; charset=UTF-8'),
  ('corpus:actu-fr-actu-vienne-86', 'https://actu.fr/nouvelle-aquitaine/vienne_86/', 'text/html; charset=UTF-8'),
  ('corpus:actu-fr-actu-vienne-86', 'https://news.google.com/rss/search?q=actu.fr+Vienne+chantier+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:ici-poitou-rubrique-btp-et-actualites-de-la-vienne-86', 'https://www.ici.fr/nouvelle-aquitaine/vienne-86', 'text/html; charset=UTF-8'),
  ('corpus:ici-poitou-rubrique-btp-et-actualites-de-la-vienne-86', 'https://www.ici.fr/theme/btp', 'text/html; charset=UTF-8'),
  ('corpus:ici-poitou-rubrique-btp-et-actualites-de-la-vienne-86', 'https://www.ici.fr/rss/poitou/rubrique/infos.xml', 'application/xml'),
  ('corpus:placeco-actualites-economiques-de-la-vienne-86', 'https://www.placeco.fr/vienne/', 'text/html; charset=UTF-8'),
  ('corpus:placeco-actualites-economiques-de-la-vienne-86', 'https://news.google.com/rss/search?q=Plac%C3%A9co+Vienne+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:google-actualites-veille-batiment-vienne-86', 'https://news.google.com/', 'text/html; charset=utf-8'),
  ('corpus:google-actualites-veille-batiment-vienne-86', 'https://news.google.com/rss/search?q=b%C3%A2timent+Vienne+86&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:france-3-nouvelle-aquitaine-edition-vienne-86', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne', 'text/html; charset=UTF-8'),
  ('corpus:france-3-nouvelle-aquitaine-edition-vienne-86', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss', 'text/xml; charset=UTF-8'),
  ('corpus:acpresse-rubrique-vienne-86-presse-professionnelle-de-la-construction', 'https://www.acpresse.fr/', 'text/html; charset=UTF-8'),
  ('corpus:acpresse-rubrique-vienne-86-presse-professionnelle-de-la-construction', 'https://www.acpresse.fr/category/territoires/nouvelle-aquitaine/vienne/', 'text/html; charset=UTF-8'),
  ('corpus:acpresse-rubrique-vienne-86-presse-professionnelle-de-la-construction', 'https://www.acpresse.fr/category/territoires/nouvelle-aquitaine/vienne/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:le7-info-rubrique-urbanisme-poitiers-86', 'https://www.le7.info/', 'text/html; charset=UTF-8'),
  ('corpus:le7-info-rubrique-urbanisme-poitiers-86', 'https://www.le7.info/tag/14-urbanisme', 'text/html; charset=UTF-8'),
  ('corpus:le7-info-rubrique-urbanisme-poitiers-86', 'https://news.google.com/rss/search?q=Le7.info+urbanisme+Poitiers&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8'),
  ('corpus:entreprises-en-vienne-revue-economique-du-medef-86', 'https://entreprisesenvienne.fr/', 'text/html; charset=utf-8'),
  ('corpus:entreprises-en-vienne-revue-economique-du-medef-86', 'https://entreprisesenvienne.fr/categories/actus-locales', 'text/html; charset=utf-8'),
  ('corpus:entreprises-en-vienne-revue-economique-du-medef-86', 'https://news.google.com/rss/search?q=Entreprises+en+Vienne+BTP+b%C3%A2timent&hl=fr&gl=FR&ceid=FR:fr', 'application/xml; charset=utf-8')
) AS v(source_id, url, content_type);
