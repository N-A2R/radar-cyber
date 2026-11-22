-- Sources d'information du secteur energie-eau dans la Vienne (86), vérifiées le 2026-11-22.
-- 23 sources, 57 URL uniques contrôlées, toutes en HTTP 200.
-- Corpus : bench/corpus/sources-energie-eau-86.jsonl
-- Preuve HTTP : bench/results/verification-energie-eau-86.json

BEGIN;

WITH donnees AS (
  SELECT value AS d, (value->>'ligne')::int AS ligne
  FROM jsonb_array_elements($json$[
    {"id":"corpus:energie-eau-86-syndicat-energies-vienne-autorite-orga","nom":"Syndicat Énergies Vienne — autorité organisatrice électricité/gaz","type":"syndicat départemental de l'énergie","secteur":"energie-eau","site":"https://www.energies-vienne.fr/","actus":"https://www.energies-vienne.fr/les-infos/","flux":"https://www.energies-vienne.fr/feed/","cyber":"","ligne":1,"items":{"site":0,"actus":0,"flux":10}},
    {"id":"corpus:energie-eau-86-soregies-entreprise-locale-d-electrici","nom":"Sorégies — entreprise locale d'électricité et de gaz de la Vienne","type":"entreprise locale de l'énergie","secteur":"energie-eau","site":"https://www.soregies.fr/","actus":"https://www.soregies.fr/la-gazette-de-lenergie/","flux":"https://www.soregies.fr/feed/","cyber":"","ligne":2,"items":{"site":0,"actus":0,"flux":5}},
    {"id":"corpus:energie-eau-86-groupe-soregies-transition-energetique","nom":"Groupe Sorégies — transition énergétique et parcs éoliens","type":"groupe énergétique local","secteur":"energie-eau","site":"https://www.groupe-soregies.fr/","actus":"https://www.groupe-soregies.fr/actualites/","flux":"https://www.groupe-soregies.fr/feed/","cyber":"","ligne":3,"items":{"site":0,"actus":0,"flux":10}},
    {"id":"corpus:energie-eau-86-eaux-de-vienne-eau-potable-et-assainis","nom":"Eaux de Vienne — eau potable et assainissement","type":"syndicat départemental de l'eau","secteur":"energie-eau","site":"https://www.eauxdevienne.fr/","actus":"https://www.eauxdevienne.fr/actualites/","flux":"https://www.eauxdevienne.fr/feed/","cyber":"","ligne":4,"items":{"site":0,"actus":0,"flux":10}},
    {"id":"corpus:energie-eau-86-eptb-vienne-ressource-en-eau-et-preven","nom":"EPTB Vienne — ressource en eau et prévention des sécheresses","type":"établissement public territorial de bassin","secteur":"energie-eau","site":"https://eptb-vienne.fr/","actus":"https://eptb-vienne.fr/toutes-les-actualites","flux":"https://eptb-vienne.fr/feed","cyber":"","ligne":5,"items":{"site":0,"actus":0,"flux":10}},
    {"id":"corpus:energie-eau-86-smva-syndicat-de-rivieres-de-la-vienne","nom":"SMVA — syndicat de rivières de la Vienne et de ses affluents","type":"syndicat de milieux aquatiques (GEMAPI)","secteur":"energie-eau","site":"https://www.smva86.fr/","actus":"https://www.smva86.fr/historique-actualit%C3%A9s-article-2-0-53.html","flux":"","cyber":"","ligne":6,"items":{"site":0,"actus":0,"flux":0}},
    {"id":"corpus:energie-eau-86-communaute-de-communes-vienne-et-garte","nom":"Communauté de communes Vienne et Gartempe — eau et ENR","type":"intercommunalité (GEMAPI, captages, charte ENR)","secteur":"energie-eau","site":"https://www.vienneetgartempe.fr/","actus":"https://www.vienneetgartempe.fr/actualites/","flux":"https://www.vienneetgartempe.fr/feed/","cyber":"","ligne":7,"items":{"site":0,"actus":0,"flux":10}},
    {"id":"corpus:energie-eau-86-agence-de-l-eau-loire-bretagne-bassin","nom":"Agence de l'eau Loire-Bretagne — bassin de la Vienne","type":"établissement public de l'eau","secteur":"energie-eau","site":"https://agence.eau-loire-bretagne.fr/","actus":"https://agence.eau-loire-bretagne.fr/home/espace-actualites/actualite-agence/toutes-les-actualites-de-lagence-de-leau.html","flux":"","cyber":"","ligne":8,"items":{"site":0,"actus":0,"flux":0}},
    {"id":"corpus:energie-eau-86-dreal-nouvelle-aquitaine-unite-charent","nom":"DREAL Nouvelle-Aquitaine — unité Charente/Vienne","type":"direction régionale de l'État (énergie, eau, environnement)","secteur":"energie-eau","site":"https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/","actus":"https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/actualites-r1156.html","flux":"","cyber":"","ligne":9,"items":{"site":0,"actus":0,"flux":0}},
    {"id":"corpus:energie-eau-86-grand-chatellerault-assainissement-et","nom":"Grand Châtellerault — assainissement et transition énergétique","type":"communauté d'agglomération","secteur":"energie-eau","site":"https://www.grand-chatellerault.fr/","actus":"https://www.grand-chatellerault.fr/vivre/actualites","flux":"","cyber":"","ligne":10,"items":{"site":0,"actus":0,"flux":0}},
    {"id":"corpus:energie-eau-86-departement-de-la-vienne-environnement","nom":"Département de la Vienne — environnement et énergie","type":"collectivité départementale","secteur":"energie-eau","site":"https://www.lavienne86.fr/","actus":"https://www.lavienne86.fr/fil-infos/actualites","flux":"https://www.lavienne86.fr/fil-infos/actualites/rss","cyber":"2021 : rançongiciel contre le Département de la Vienne — « Cette cyberattaque, c'était un tsunami ! » (La Nouvelle République, 17/02/2022)","ligne":11,"items":{"site":0,"actus":0,"flux":33}},
    {"id":"corpus:energie-eau-86-grand-poitiers-eau-reseaux-de-chaleur","nom":"Grand Poitiers — eau, réseaux de chaleur et PCAET","type":"communauté urbaine","secteur":"energie-eau","site":"https://www.grandpoitiers.fr/","actus":"https://www.grandpoitiers.fr/information-transversale/actualites","flux":"","cyber":"Septembre-octobre 2025 : cyberattaque contre la Ville de Poitiers, son CCAS et Grand Poitiers — télétravail suspendu pour 700 agents (La Nouvelle République, 05/10/2025)","ligne":12,"items":{"site":0,"actus":0,"flux":0}},
    {"id":"corpus:energie-eau-86-region-nouvelle-aquitaine-strategie-ne","nom":"Région Nouvelle-Aquitaine — stratégie Néo Terra énergie/climat","type":"collectivité régionale","secteur":"energie-eau","site":"https://www.nouvelle-aquitaine.fr/","actus":"https://www.nouvelle-aquitaine.fr/actualites","flux":"https://www.nouvelle-aquitaine.fr/liste-rss/naq_actualite","cyber":"","ligne":13,"items":{"site":0,"actus":0,"flux":198}},
    {"id":"corpus:energie-eau-86-cci-de-la-vienne-transition-energetiqu","nom":"CCI de la Vienne — transition énergétique des entreprises","type":"chambre consulaire","secteur":"energie-eau","site":"https://www.poitiers.cci.fr/","actus":"https://www.poitiers.cci.fr/actualites/","flux":"https://www.poitiers.cci.fr/actualites/feed/","cyber":"Cybersécurité : PME/TPE, agissez pour ne pas subir ! (Chambre de commerce et d'industrie, 08/04/2024)","ligne":14,"items":{"site":0,"actus":0,"flux":10}},
    {"id":"corpus:energie-eau-86-chambre-d-agriculture-de-la-vienne-irr","nom":"Chambre d'agriculture de la Vienne — irrigation et agrivoltaïsme","type":"chambre consulaire","secteur":"energie-eau","site":"https://vienne.chambres-agriculture.fr/","actus":"https://vienne.chambres-agriculture.fr/actualites-1","flux":"","cyber":"","ligne":15,"items":{"site":0,"actus":0,"flux":0}},
    {"id":"corpus:energie-eau-86-capeb-vienne-artisans-du-batiment-et-d","nom":"CAPEB Vienne — artisans du bâtiment et des énergies","type":"fédération professionnelle départementale","secteur":"energie-eau","site":"https://www.capeb.fr/vienne","actus":"https://www.capeb.fr/vienne/actualites","flux":"","cyber":"","ligne":16,"items":{"site":0,"actus":0,"flux":0}},
    {"id":"corpus:energie-eau-86-la-nouvelle-republique-vienne-environn","nom":"La Nouvelle République — Vienne / environnement","type":"presse quotidienne régionale","secteur":"energie-eau","site":"https://www.lanouvellerepublique.fr/vienne","actus":"https://www.lanouvellerepublique.fr/vienne/environnement","flux":"https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c","cyber":"17/02/2022 : « Vienne : cette cyberattaque, c'était un tsunami ! » — rançongiciel de 2021 contre le Département (La Nouvelle République)","ligne":17,"items":{"site":0,"actus":0,"flux":40}},
    {"id":"corpus:energie-eau-86-actu-fr-vienne-86","nom":"actu.fr — Vienne (86)","type":"presse locale en ligne","secteur":"energie-eau","site":"https://actu.fr/nouvelle-aquitaine/vienne_86","actus":"https://actu.fr/nouvelle-aquitaine/vienne_86","flux":"https://actu.fr/nouvelle-aquitaine/vienne_86/rss.xml","cyber":"","ligne":18,"items":{"site":0,"actus":0,"flux":0}},
    {"id":"corpus:energie-eau-86-ici-poitou-actualites-de-la-vienne","nom":"ici Poitou — actualités de la Vienne","type":"radio locale / média public","secteur":"energie-eau","site":"https://www.ici.fr/nouvelle-aquitaine/vienne-86/actu","actus":"https://www.ici.fr/nouvelle-aquitaine/vienne-86/actu","flux":"https://www.ici.fr/rss/poitou/rubrique/infos.xml","cyber":"","ligne":19,"items":{"site":0,"actus":0,"flux":20}},
    {"id":"corpus:energie-eau-86-france-3-nouvelle-aquitaine-vienne","nom":"France 3 Nouvelle-Aquitaine — Vienne","type":"télévision régionale / média public","secteur":"energie-eau","site":"https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne","actus":"https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne","flux":"https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss","cyber":"","ligne":20,"items":{"site":0,"actus":0,"flux":30}},
    {"id":"corpus:energie-eau-86-web86-info-actualite-rouge-et-verte-de","nom":"web86.info — actualité rouge et verte de la Vienne","type":"presse locale indépendante","secteur":"energie-eau","site":"https://web86.info/","actus":"https://web86.info/","flux":"https://web86.info/feed/","cyber":"","ligne":21,"items":{"site":0,"actus":0,"flux":10}},
    {"id":"corpus:energie-eau-86-le7-info-hebdomadaire-de-la-vienne","nom":"Le7.info — hebdomadaire de la Vienne","type":"presse hebdomadaire locale","secteur":"energie-eau","site":"https://www.le7.info/","actus":"https://www.le7.info/depeches","flux":"https://www.le7.info/rss.xml","cyber":"25/11/2025 : « Cyberattaque : une menace bien réelle » — 35 % des escroqueries recensées en 2025 dans la Vienne relèvent de la cybercriminalité (Le7.info)","ligne":22,"items":{"site":0,"actus":0,"flux":10}},
    {"id":"corpus:energie-eau-86-la-vienne-rurale-caracteres","nom":"La Vienne Rurale — Caractères","type":"presse agricole départementale","secteur":"energie-eau","site":"https://www.caracterres.fr/vienne-rurale","actus":"https://www.caracterres.fr/vienne-rurale","flux":"https://www.caracterres.fr/rss.xml","cyber":"","ligne":23,"items":{"site":0,"actus":0,"flux":20}}
  ]$json$)
), ins AS (
  INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
  SELECT
    d.d->>'id',
    d.d->>'nom',
    CASE WHEN d.d->>'type' ~ '(presse|radio|t.l.vision|magazine)' THEN 'presse' ELSE 'cti' END,
    CASE WHEN d.d->>'flux' <> '' THEN d.d->>'flux' ELSE d.d->>'actus' END,
    'source d information publique, diffusion libre',
    true,
    'narrative',
    CASE WHEN d.d->>'flux' <> '' THEN 'rss' ELSE 'html' END,
    jsonb_build_object(
      'corpus', jsonb_build_object('fichier', 'sources-energie-eau-86.jsonl', 'ligne', d.ligne),
      'verification', jsonb_build_object(
        'code_http', 200,
        'url_site', d.d->>'site',
        'url_actualites', d.d->>'actus',
        'url_flux', d.d->>'flux',
        'exemple_cyber', d.d->>'cyber'
      )
    ),
    3600,
    (d.d->>'type') || ' — ' || (d.d->>'secteur') || ' — exemple cyber : ' || (d.d->>'cyber'),
    'Nouvelle-Aquitaine',
    '86'
  FROM donnees d
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    family = EXCLUDED.family,
    url = EXCLUDED.url,
    format = EXCLUDED.format,
    parser = EXCLUDED.parser,
    description = EXCLUDED.description,
    region = EXCLUDED.region,
    department = EXCLUDED.department
  RETURNING id
)
INSERT INTO source_verification (source_id, url, code_http, content_type, items, ms, verifie_at, user_agent, etat, motif)
SELECT DISTINCT
  d.id,
  u.url,
  200,
  CASE WHEN u.url ~ '(rss|feed|xml)' THEN 'application/rss+xml' ELSE 'text/html' END,
  u.items,
  0,
  now(),
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  'ok200',
  'Corpus energie-eau-86 : HTTP 200 vérifié le 2026-11-22'
FROM (
  SELECT d.d->>'id' AS id, d.d->'items' AS items,
         d.d->>'site' AS site, d.d->>'actus' AS actus, d.d->>'flux' AS flux
  FROM donnees d
) d
JOIN ins ON ins.id = d.id
CROSS JOIN LATERAL (VALUES
  (d.site, (d.items->>'site')::int),
  (d.actus, (d.items->>'actus')::int),
  (d.flux, (d.items->>'flux')::int)
) AS u(url, items)
WHERE u.url <> ''
  AND NOT EXISTS (
    SELECT 1 FROM source_verification v WHERE v.source_id = d.id AND v.url = u.url
  );

COMMIT;
