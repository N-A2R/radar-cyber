-- Sources d'information du secteur santé dans le département 87 (Haute-Vienne).
-- 10 sources, 35 contrôles HTTP (34 couples source/URL uniques, 33 URL distinctes), tous en HTTP 200 le 2026-11-22 (curl -L, GET, redirections suivies).
-- Contrôle détaillé : bench/results/verification-sources-sante-87.json

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

INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:sante87-01-chu-de-limoges', 'CHU de Limoges', 'cti', 'https://www.chu-limoges.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus": {"fichier": "sources-sante-87.jsonl", "ligne": 1}}'::jsonb, 3600, 'CHU, secteur santé, département 87 (Haute-Vienne). Exemple cyber : Cybermois au CHU de Limoges, démarche collective et exercice REMPAR25 de crise cyber systémique (18/09/2025), Chorus n°56 — https://www.chu-limoges.fr/app/uploads/1/2025/12/chorus_no_56_light.pdf', 'Nouvelle-Aquitaine', '87'),
  ('corpus:sante87-02-ars-nouvelle-aquitaine', 'ARS Nouvelle-Aquitaine', 'cti', 'https://www.nouvelle-aquitaine.ars.sante.fr/liste-actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus": {"fichier": "sources-sante-87.jsonl", "ligne": 2}}'::jsonb, 3600, 'Agence régionale de santé, secteur santé, département 87 (Haute-Vienne). Exemple cyber : incident de sécurité concernant la plateforme de recueil des autorisations parentales (12/08/2026) — https://www.nouvelle-aquitaine.ars.sante.fr/incident-de-securite-concernant-la-plateforme-de-recueil-des-autorisations-parentales-des-0', 'Nouvelle-Aquitaine', '87'),
  ('corpus:sante87-03-ordre-medecins-haute-vienne', 'Conseil départemental de l’Ordre des médecins de la Haute-Vienne', 'cti', 'https://conseil87.ordre.medecin.fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus": {"fichier": "sources-sante-87.jsonl", "ligne": 3}}'::jsonb, 3600, 'Ordre professionnel, secteur santé, département 87 (Haute-Vienne). Exemple cyber : aucun fait propre au conseil 87 trouvé ; exemple de l’Ordre national, tentatives d’hameçonnage — https://www.conseil-national.medecin.fr/publications/actualites/tentatives-dhameconnage', 'Nouvelle-Aquitaine', '87'),
  ('corpus:sante87-04-cpts-limoges', 'CPTS Limoges', 'cti', 'https://cpts-limoges.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus": {"fichier": "sources-sante-87.jsonl", "ligne": 4}}'::jsonb, 3600, 'Communauté professionnelle territoriale de santé, secteur santé, département 87 (Haute-Vienne). Exemple cyber : Cybersécurité : et si votre cabinet était le prochain ?, soirée avec le GIP ESEA — https://cpts-limoges.fr/cybersecurite-et-si-votre-cabinet-etait-le-prochain/', 'Nouvelle-Aquitaine', '87'),
  ('corpus:sante87-05-cpts-monts-barrages', 'CPTS Monts & Barrages', 'cti', 'https://www.cpts-monts-barrages.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus": {"fichier": "sources-sante-87.jsonl", "ligne": 5}}'::jsonb, 3600, 'Communauté professionnelle territoriale de santé, secteur santé, département 87 (Haute-Vienne). Exemple cyber : aucun fait propre à la CPTS trouvé ; exemple départemental, comment les hôpitaux se protègent contre les pirates informatiques, polyclinique de Limoges (23/01/2023) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/video-limoges-comment-les-hopitaux-se-protegent-contre-les-pirates-informatiques-2699598.html', 'Nouvelle-Aquitaine', '87'),
  ('corpus:sante87-06-france3-haute-vienne', 'France 3 Nouvelle-Aquitaine — Haute-Vienne', 'cti', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus": {"fichier": "sources-sante-87.jsonl", "ligne": 6}}'::jsonb, 3600, 'Presse locale, secteur santé, département 87 (Haute-Vienne). Exemple cyber : VIDÉO. Comment les hôpitaux se protègent contre les pirates informatiques, exemple à la polyclinique de Limoges (23/01/2023) — https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/video-limoges-comment-les-hopitaux-se-protegent-contre-les-pirates-informatiques-2699598.html', 'Nouvelle-Aquitaine', '87'),
  ('corpus:sante87-07-sante-publique-france-na', 'Santé publique France — Nouvelle-Aquitaine', 'cti', 'https://www.santepubliquefrance.fr/les-actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus": {"fichier": "sources-sante-87.jsonl", "ligne": 7}}'::jsonb, 3600, 'Agence de santé publique, secteur santé, département 87 (Haute-Vienne). Exemple cyber : aucun fait propre à l’antenne régionale trouvé ; exemple national, un prestataire de Santé publique France victime d’une cyberattaque, près de 80 000 données de contact concernées (13/08/2026) — https://www.franceinfo.fr/internet/securite-sur-internet/cyberattaques/un-prestataire-de-sante-publique-france-victime-d-une-cyberattaque-pres-de-80-000-donnees-de-contact-concernees_8146196.html', 'Nouvelle-Aquitaine', '87'),
  ('corpus:sante87-08-cpam-haute-vienne', 'CPAM de la Haute-Vienne (Assurance Maladie)', 'cti', 'https://www.ameli.fr/haute-vienne/assure/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus": {"fichier": "sources-sante-87.jsonl", "ligne": 8}}'::jsonb, 3600, 'Caisse primaire d’assurance maladie, secteur santé, département 87 (Haute-Vienne). Exemple cyber : fraudes en Haute-Vienne, face à la menace numérique, phishing, usurpation d’identité et faux e-mails imitant l’Assurance Maladie (20/05/2025) — https://www.assurance-maladie.ameli.fr/sites/default/files/2025-05-20-dp-Bilan_fraudes_CPAM87.pdf', 'Nouvelle-Aquitaine', '87'),
  ('corpus:sante87-09-esea-nouvelle-aquitaine', 'ESEA Nouvelle-Aquitaine (GIP e-santé)', 'cti', 'https://www.esea-na.fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus": {"fichier": "sources-sante-87.jsonl", "ligne": 9}}'::jsonb, 3600, 'Groupement d’intérêt public e-santé, secteur santé, département 87 (Haute-Vienne). Exemple cyber : face aux risques cyber, tous vigilants ! — https://wwwsec.esea-na.fr/node/402.html', 'Nouvelle-Aquitaine', '87'),
  ('corpus:sante87-10-fhf-nouvelle-aquitaine', 'FHF Nouvelle-Aquitaine (Fédération Hospitalière de France)', 'cti', 'https://www.fhf.fr/en-regions/nouvelle-aquitaine/nos-actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus": {"fichier": "sources-sante-87.jsonl", "ligne": 10}}'::jsonb, 3600, 'Fédération hospitalière, secteur santé, département 87 (Haute-Vienne). Exemple cyber : cybersécurité, le Conseil d’État conforte des financements adaptés aux hôpitaux publics — https://www.fhf.fr/actualites/articles/cybersecurite-le-conseil-detat-conforte-des-financements-adaptes-aux-specificites-des-hopitaux', 'Nouvelle-Aquitaine', '87')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de vérification HTTP des 35 URL du corpus (site, actualités, flux et article cyber), toutes en 200.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT v.source_id, v.url, 200, v.content_type, 0, 0, now(), 'RadarCyberCorpus/1.0', 'ok200', 'Corpus santé-87 : HTTP 200 vérifié le 2026-11-22'
FROM (VALUES
  ('corpus:sante87-01-chu-de-limoges', 'https://www.chu-limoges.fr/', 'text/html; charset=UTF-8'),
  ('corpus:sante87-01-chu-de-limoges', 'https://www.chu-limoges.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:sante87-01-chu-de-limoges', 'https://www.chu-limoges.fr/app/uploads/1/2025/12/chorus_no_56_light.pdf', 'application/pdf'),
  ('corpus:sante87-02-ars-nouvelle-aquitaine', 'https://www.nouvelle-aquitaine.ars.sante.fr/', 'text/html; charset=UTF-8'),
  ('corpus:sante87-02-ars-nouvelle-aquitaine', 'https://www.nouvelle-aquitaine.ars.sante.fr/liste-actualites', 'text/html; charset=UTF-8'),
  ('corpus:sante87-02-ars-nouvelle-aquitaine', 'https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:sante87-02-ars-nouvelle-aquitaine', 'https://www.nouvelle-aquitaine.ars.sante.fr/incident-de-securite-concernant-la-plateforme-de-recueil-des-autorisations-parentales-des-0', 'text/html; charset=UTF-8'),
  ('corpus:sante87-03-ordre-medecins-haute-vienne', 'https://conseil87.ordre.medecin.fr/', 'text/html; charset=UTF-8'),
  ('corpus:sante87-03-ordre-medecins-haute-vienne', 'https://conseil87.ordre.medecin.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:sante87-03-ordre-medecins-haute-vienne', 'https://www.conseil-national.medecin.fr/publications/actualites/tentatives-dhameconnage', 'text/html; charset=UTF-8'),
  ('corpus:sante87-04-cpts-limoges', 'https://cpts-limoges.fr/', 'text/html; charset=UTF-8'),
  ('corpus:sante87-04-cpts-limoges', 'https://cpts-limoges.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:sante87-04-cpts-limoges', 'https://cpts-limoges.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:sante87-04-cpts-limoges', 'https://cpts-limoges.fr/cybersecurite-et-si-votre-cabinet-etait-le-prochain/', 'text/html; charset=UTF-8'),
  ('corpus:sante87-05-cpts-monts-barrages', 'https://www.cpts-monts-barrages.fr/', 'text/html; charset=UTF-8'),
  ('corpus:sante87-05-cpts-monts-barrages', 'https://www.cpts-monts-barrages.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:sante87-05-cpts-monts-barrages', 'https://www.cpts-monts-barrages.fr/feed/', 'application/rss+xml; charset=UTF-8'),
  ('corpus:sante87-05-cpts-monts-barrages', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/video-limoges-comment-les-hopitaux-se-protegent-contre-les-pirates-informatiques-2699598.html', 'text/html; charset=UTF-8'),
  ('corpus:sante87-06-france3-haute-vienne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/', 'text/html; charset=UTF-8'),
  ('corpus:sante87-06-france3-haute-vienne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/rss', 'text/xml; charset=UTF-8'),
  ('corpus:sante87-06-france3-haute-vienne', 'https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/video-limoges-comment-les-hopitaux-se-protegent-contre-les-pirates-informatiques-2699598.html', 'text/html; charset=UTF-8'),
  ('corpus:sante87-07-sante-publique-france-na', 'https://www.santepubliquefrance.fr/regions-et-territoires/nouvelle-aquitaine', 'text/html; charset=UTF-8'),
  ('corpus:sante87-07-sante-publique-france-na', 'https://www.santepubliquefrance.fr/les-actualites', 'text/html; charset=UTF-8'),
  ('corpus:sante87-07-sante-publique-france-na', 'https://www.santepubliquefrance.fr/rss/969', 'application/rss+xml; charset=utf-8'),
  ('corpus:sante87-07-sante-publique-france-na', 'https://www.franceinfo.fr/internet/securite-sur-internet/cyberattaques/un-prestataire-de-sante-publique-france-victime-d-une-cyberattaque-pres-de-80-000-donnees-de-contact-concernees_8146196.html', 'text/html; charset=UTF-8'),
  ('corpus:sante87-08-cpam-haute-vienne', 'https://www.ameli.fr/haute-vienne/assure', 'text/html; charset=utf-8'),
  ('corpus:sante87-08-cpam-haute-vienne', 'https://www.ameli.fr/haute-vienne/assure/actualites', 'text/html; charset=utf-8'),
  ('corpus:sante87-08-cpam-haute-vienne', 'https://www.assurance-maladie.ameli.fr/sites/default/files/2025-05-20-dp-Bilan_fraudes_CPAM87.pdf', 'application/pdf'),
  ('corpus:sante87-09-esea-nouvelle-aquitaine', 'https://www.esea-na.fr/', 'text/html; charset=UTF-8'),
  ('corpus:sante87-09-esea-nouvelle-aquitaine', 'https://www.esea-na.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:sante87-09-esea-nouvelle-aquitaine', 'https://wwwsec.esea-na.fr/node/402.html', 'text/html'),
  ('corpus:sante87-10-fhf-nouvelle-aquitaine', 'https://www.fhf.fr/en-regions/nouvelle-aquitaine', 'text/html; charset=UTF-8'),
  ('corpus:sante87-10-fhf-nouvelle-aquitaine', 'https://www.fhf.fr/en-regions/nouvelle-aquitaine/nos-actualites', 'text/html; charset=UTF-8'),
  ('corpus:sante87-10-fhf-nouvelle-aquitaine', 'https://www.fhf.fr/actualites/articles/cybersecurite-le-conseil-detat-conforte-des-financements-adaptes-aux-specificites-des-hopitaux', 'text/html; charset=UTF-8')
) AS v(source_id, url, content_type)
WHERE NOT EXISTS (
  SELECT 1 FROM source_verification sv
  WHERE sv.source_id = v.source_id AND sv.url = v.url
);
