-- Sources d'information du secteur juridique dans le departement 16 (Charente).
-- 14 sources, 39 URL uniques toutes controlees en HTTP 200 le 2026-11-22.
-- Corpus_detaille : bench/corpus/sources-juridique-16.jsonl
-- Preuve HTTP : bench/results/verification-sources-juridique-16.yaml
INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
VALUES
  ('corpus:jur16-01-cour-appel-angouleme', 'Cour d''appel d''Angoulême', 'juridique', 'https://www.cours-appel.justice.fr/angouleme/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-16.jsonl","ligne":1}}'::jsonb, 3600, 'Cour d appel, secteur juridique, departement 16 ; actualites : https://www.justice.gouv.fr/actualites', 'Nouvelle-Aquitaine', '16'),
  ('corpus:jur16-02-tj-angouleme', 'Tribunal judiciaire d''Angoulême', 'juridique', 'https://www.cours-appel.justice.fr/angouleme/tribunal-judiciaire-de-angouleme', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-16.jsonl","ligne":2}}'::jsonb, 3600, 'Tribunal judiciaire, secteur juridique, departement 16 ; actualites : https://www.justice.gouv.fr/actualites', 'Nouvelle-Aquitaine', '16'),
  ('corpus:jur16-03-notaires-charente', 'Chambre des notaires de la Charente', 'juridique', 'https://chambre-charente.notaires.fr/actualite', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-16.jsonl","ligne":3}}'::jsonb, 3600, 'Chambre des notaires, secteur juridique, departement 16', 'Nouvelle-Aquitaine', '16'),
  ('corpus:jur16-04-greffe-tc-angouleme', 'Greffe du tribunal de commerce d''Angoulême', 'juridique', 'https://www.greffe-tc-angouleme.fr/actualites/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-16.jsonl","ligne":4}}'::jsonb, 3600, 'Tribunal de commerce, secteur juridique, departement 16', 'Nouvelle-Aquitaine', '16'),
  ('corpus:jur16-05-charente-libre-justice', 'Charente Libre — rubrique Justice', 'juridique', 'https://www.charentelibre.fr/societe/justice/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-16.jsonl","ligne":5}}'::jsonb, 1800, 'Presse locale, rubrique justice, departement 16', 'Nouvelle-Aquitaine', '16'),
  ('corpus:jur16-06-sud-ouest-charente', 'Sud Ouest — Charente', 'juridique', 'https://www.sudouest.fr/charente/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-16.jsonl","ligne":6}}'::jsonb, 1800, 'Presse locale, actualites de Charente (16), hors rubrique justice dediee', 'Nouvelle-Aquitaine', '16'),
  ('corpus:jur16-07-actu-charente', 'actu.fr — Charente', 'juridique', 'https://actu.fr/nouvelle-aquitaine/charente_16/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-16.jsonl","ligne":7}}'::jsonb, 1800, 'Presse locale, actualites de Charente (16), hors rubrique justice dediee', 'Nouvelle-Aquitaine', '16'),
  ('corpus:jur16-08-cncj', 'Chambre nationale des commissaires de justice', 'juridique', 'https://commissaire-justice.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-16.jsonl","ligne":8}}'::jsonb, 3600, 'Chambre professionnelle des commissaires de justice, secteur juridique, departement 16', 'Nouvelle-Aquitaine', '16'),
  ('corpus:jur16-09-annuaire-cj', 'Annuaire officiel des commissaires de justice', 'juridique', 'https://annuaire.commissaire-justice.fr/', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-16.jsonl","ligne":9}}'::jsonb, 7200, 'Annuaire professionnel, secteur juridique, departement 16', 'Nouvelle-Aquitaine', '16'),
  ('corpus:jur16-10-notaires-france', 'Notaires de France — actualites', 'juridique', 'https://www.notaires.fr/fr/actualites', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-16.jsonl","ligne":10}}'::jsonb, 3600, 'Federation professionnelle notariale, secteur juridique, departement 16', 'Nouvelle-Aquitaine', '16'),
  ('corpus:jur16-11-annuaire-notaires-16', 'Notaires de France — annuaire de la Charente', 'juridique', 'https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/charente', 'source d information publique, diffusion libre', true, 'narrative', 'html', '{"corpus":{"fichier":"sources-juridique-16.jsonl","ligne":11}}'::jsonb, 7200, 'Annuaire des notaires de Charente (16), secteur juridique', 'Nouvelle-Aquitaine', '16'),
  ('corpus:jur16-12-avocat-fr', 'Avocat.fr — annuaire des avocats', 'juridique', 'https://www.avocat.fr/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-16.jsonl","ligne":12}}'::jsonb, 3600, 'Annuaire professionnel des avocats, filtrable sur Angouleme/Charente (16)', 'Nouvelle-Aquitaine', '16'),
  ('corpus:jur16-13-cpme16', 'CPME16 — Les Entrepreneurs Charente', 'juridique', 'https://cpme16.fr/feed/', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-16.jsonl","ligne":13}}'::jsonb, 3600, 'Federation patronale de Charente (16), actualites juridiques', 'Nouvelle-Aquitaine', '16'),
  ('corpus:jur16-14-sud-ouest-justice', 'Sud Ouest — rubrique Justice', 'juridique', 'https://www.sudouest.fr/justice/rss.xml', 'source d information publique, diffusion libre', true, 'narrative', 'rss', '{"corpus":{"fichier":"sources-juridique-16.jsonl","ligne":14}}'::jsonb, 1800, 'Presse locale, rubrique justice avec actualites de Charente (16)', 'Nouvelle-Aquitaine', '16')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  url = EXCLUDED.url,
  parser = EXCLUDED.parser,
  description = EXCLUDED.description,
  region = EXCLUDED.region,
  department = EXCLUDED.department;

-- Trace de verification HTTP : 39 URLs controlees, toutes en 200 le 2026-11-22.
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT s.id, v.url, 200, v.type, 0, 0, DATE '2026-11-22', 'RadarCyberCorpus/1.0', 'ok200',
       'Corpus juridique-16 : HTTP 200 verifie le 2026-11-22'
FROM source s
JOIN (VALUES
  ('corpus:jur16-01-cour-appel-angouleme', 'https://www.cours-appel.justice.fr/angouleme/', 'text/html; charset=utf-8'),
  ('corpus:jur16-01-cour-appel-angouleme', 'https://www.justice.gouv.fr/actualites', 'text/html; charset=utf-8'),
  ('corpus:jur16-01-cour-appel-angouleme', 'https://www.charentelibre.fr/france/piratage-du-fisc-un-membre-presume-du-groupe-de-pirates-informatiques-zerobytes-ecroue-30483652.php', 'text/html; charset=UTF-8'),
  ('corpus:jur16-02-tj-angouleme', 'https://www.cours-appel.justice.fr/angouleme/tribunal-judiciaire-de-angouleme', 'text/html; charset=utf-8'),
  ('corpus:jur16-02-tj-angouleme', 'https://www.lapresse.ca/affaires/entreprises/2026-10-29/hameconnage-de-cabinets-d-avocats/mccarthy-tetrault-et-davies-victimes-de-vols-de-donnees.php', 'text/html; charset=UTF-8'),
  ('corpus:jur16-03-notaires-charente', 'https://chambre-charente.notaires.fr/', 'text/html; charset=utf-8'),
  ('corpus:jur16-03-notaires-charente', 'https://chambre-charente.notaires.fr/actualite', 'text/html; charset=utf-8'),
  ('corpus:jur16-03-notaires-charente', 'https://www.notaires.fr/fr/actualites/face-la-recrudescence-de-fraudes-et-cyberattaques-soyons-vigilants-ensemble', 'text/html; charset=UTF-8'),
  ('corpus:jur16-04-greffe-tc-angouleme', 'https://www.greffe-tc-angouleme.fr/', 'text/html; charset=UTF-8'),
  ('corpus:jur16-04-greffe-tc-angouleme', 'https://www.greffe-tc-angouleme.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:jur16-04-greffe-tc-angouleme', 'https://www.charentelibre.fr/charente/val-de-bonnieure/en-un-clic-un-couple-de-saint-angeau-se-fait-pirater-13-600-euros-sur-ses-comptes-bancaires-la-banque-refuse-de-rembourser-20798426.php', 'text/html; charset=UTF-8'),
  ('corpus:jur16-05-charente-libre-justice', 'https://www.charentelibre.fr/societe/justice/', 'text/html; charset=UTF-8'),
  ('corpus:jur16-05-charente-libre-justice', 'https://www.charentelibre.fr/societe/justice/rss.xml', 'application/xml'),
  ('corpus:jur16-05-charente-libre-justice', 'https://www.charentelibre.fr/societe/justice/cyberattaques-visant-des-frigos-connectes-en-france-l-iran-suspecte-31461013.php', 'text/html; charset=UTF-8'),
  ('corpus:jur16-06-sud-ouest-charente', 'https://www.sudouest.fr/charente/', 'text/html; charset=UTF-8'),
  ('corpus:jur16-06-sud-ouest-charente', 'https://www.sudouest.fr/charente/rss.xml', 'application/xml'),
  ('corpus:jur16-06-sud-ouest-charente', 'https://www.sudouest.fr/politique/cyberattaque-le-parti-communiste-francais-victime-d-une-fuite-de-donnees-de-ses-adherents-31211979.php', 'text/html; charset=UTF-8'),
  ('corpus:jur16-07-actu-charente', 'https://actu.fr/nouvelle-aquitaine/charente_16/', 'text/html; charset=UTF-8'),
  ('corpus:jur16-07-actu-charente', 'https://actu.fr/nouvelle-aquitaine/charente_16/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:jur16-07-actu-charente', 'https://actu.fr/nouvelle-aquitaine/angouleme_16015/pres-d-angouleme-22-vols-a-la-roulotte-et-quatre-fraudes-a-la-carte-bancaire-un-suspect-interpelle_65076064.html', 'text/html; charset=UTF-8'),
  ('corpus:jur16-08-cncj', 'https://commissaire-justice.fr/', 'text/html; charset=UTF-8'),
  ('corpus:jur16-08-cncj', 'https://commissaire-justice.fr/actualites/', 'text/html; charset=UTF-8'),
  ('corpus:jur16-08-cncj', 'https://commissaire-justice.fr/feed/', 'text/xml;charset=UTF-8'),
  ('corpus:jur16-08-cncj', 'https://fr.news.yahoo.com/notaires-pirat%C3%A9s-hackers-vol%C3%A9-40-082607311.html', 'text/html; charset=utf-8'),
  ('corpus:jur16-09-annuaire-cj', 'https://annuaire.commissaire-justice.fr/', 'text/html; charset=utf-8'),
  ('corpus:jur16-09-annuaire-cj', 'https://commissaire-justice.fr/publications-dinformations/', 'text/html; charset=UTF-8'),
  ('corpus:jur16-09-annuaire-cj', 'https://commissaire-justice.fr/blog-juridique/fraude-location-saisonniere-eviter-arnaques-recours/', 'text/html; charset=UTF-8'),
  ('corpus:jur16-10-notaires-france', 'https://www.notaires.fr/fr', 'text/html; charset=UTF-8'),
  ('corpus:jur16-10-notaires-france', 'https://www.notaires.fr/fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:jur16-10-notaires-france', 'https://www.notaires.fr/fr/actualites/face-la-recrudescence-de-fraudes-et-cyberattaques-soyons-vigilants-ensemble', 'text/html; charset=UTF-8'),
  ('corpus:jur16-11-annuaire-notaires-16', 'https://www.notaires.fr/fr/annuaire/nouvelle-aquitaine/charente', 'text/html; charset=UTF-8'),
  ('corpus:jur16-11-annuaire-notaires-16', 'https://www.notaires.fr/fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:jur16-11-annuaire-notaires-16', 'https://www.notaires.fr/fr/actualites/face-la-recrudescence-de-fraudes-et-cyberattaques-soyons-vigilants-ensemble', 'text/html; charset=UTF-8'),
  ('corpus:jur16-12-avocat-fr', 'https://www.avocat.fr/', 'text/html; charset=UTF-8'),
  ('corpus:jur16-12-avocat-fr', 'https://www.avocat.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:jur16-12-avocat-fr', 'https://www.avocat.fr/rss.xml', 'application/rss+xml; charset=utf-8'),
  ('corpus:jur16-12-avocat-fr', 'https://www.lapresse.ca/affaires/entreprises/2026-10-29/hameconnage-de-cabinets-d-avocats/mccarthy-tetrault-et-davies-victimes-de-vols-de-donnees.php', 'text/html; charset=UTF-8'),
  ('corpus:jur16-13-cpme16', 'https://cpme16.fr/', 'text/html; charset=UTF-8'),
  ('corpus:jur16-13-cpme16', 'https://cpme16.fr/actualites', 'text/html; charset=UTF-8'),
  ('corpus:jur16-13-cpme16', 'https://cpme16.fr/feed/', 'application/rss+xml; charset=utf-8'),
  ('corpus:jur16-13-cpme16', 'https://www.charentelibre.fr/economie/piratage-informatique-la-charente-en-alerte-30327377.php', 'text/html; charset=UTF-8'),
  ('corpus:jur16-14-sud-ouest-justice', 'https://www.sudouest.fr/justice/', 'text/html; charset=UTF-8'),
  ('corpus:jur16-14-sud-ouest-justice', 'https://www.sudouest.fr/justice/rss.xml', 'application/xml'),
  ('corpus:jur16-14-sud-ouest-justice', 'https://www.sudouest.fr/politique/cyberattaque-le-parti-communiste-francais-victime-d-une-fuite-de-donnees-de-ses-adherents-31211979.php', 'text/html; charset=UTF-8')
) AS v(source_id, url, type)
ON s.id = v.source_id
WHERE NOT EXISTS (
  SELECT 1 FROM source_verification sv
  WHERE sv.source_id = s.id AND sv.url = v.url AND sv.verifie_at::date = DATE '2026-11-22'
);
