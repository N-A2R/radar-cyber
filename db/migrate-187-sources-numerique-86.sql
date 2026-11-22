-- Sources d'information du secteur numerique du département 86 (Vienne).
-- 23 sources, 65 contrôles HTTP (65 URL uniques), tous en HTTP 200 le 2026-11-22.
-- Corpus : bench/corpus/sources-numerique-86.jsonl
-- Preuve HTTP : bench/results/verification-numerique-86.json

BEGIN;

CREATE TABLE IF NOT EXISTS source_verification (
  id               bigserial PRIMARY KEY,
  source_id        text NOT NULL REFERENCES source(id) ON DELETE CASCADE,
  url              text NOT NULL,
  code_http        integer,
  content_type     text,
  items            integer NOT NULL DEFAULT 0 CHECK (items >= 0),
  derniere_item_at timestamptz,
  ms               integer NOT NULL CHECK (ms >= 0),
  verifie_at       timestamptz NOT NULL DEFAULT now(),
  user_agent       text NOT NULL,
  etat             text NOT NULL CHECK (etat IN ('ok200', 'muette', 'morte', 'lente')),
  motif            text
);

CREATE INDEX IF NOT EXISTS idx_source_verification_source_date
  ON source_verification (source_id, verifie_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_source_verification_verifie_at
  ON source_verification (verifie_at DESC);

WITH donnees AS (
  SELECT
    'corpus:nu86-' || rtrim(regexp_replace(lower(value->>'nom'), '[^a-z0-9]+', '-', 'g'), '-') AS id,
    value AS d,
    ordinality AS ligne
  FROM jsonb_array_elements($json$[
    {
        "nom": "Neoloji — Technopole du Grand Poitiers",
        "type": "cluster — technopole, pépinière et incubateur numérique",
        "secteur": "numerique",
        "site": "https://www.neoloji.fr/",
        "actus": "https://www.neoloji.fr/actualites",
        "flux": "https://news.google.com/rss/search?q=%22Neoloji%22%20Poitiers%20num%C3%A9rique&hl=fr&gl=FR&ceid=FR:fr",
        "items": 10,
        "cyber": "Que faire de nos vieux téléphones ? À Poitiers, Neoloji et Orange ont la solution (La Nouvelle République, titre observé dans le flux)"
    },
    {
        "nom": "Technopole Futuroscope (Vienne)",
        "type": "cluster — technopole numérique du Futuroscope",
        "secteur": "numerique",
        "site": "https://www.technopole-futuroscope.com/",
        "actus": "https://www.technopole-futuroscope.com/informations-transversales/actualites",
        "flux": "https://news.google.com/rss/search?q=%22Technopole%20Futuroscope%22%20num%C3%A9rique&hl=fr&gl=FR&ceid=FR:fr",
        "items": 3,
        "cyber": "Campus Numeria : un lieu d’apprentissage au cœur du Futuroscope (La Vienne le département, titre observé dans le flux)"
    },
    {
        "nom": "Vienne Numérique — régie numérique du Département",
        "type": "institutionnel — transformation numérique du département",
        "secteur": "numerique",
        "site": "https://www.vienne-numerique.fr/",
        "actus": "https://www.vienne-numerique.fr/une-collectivite/les-projets-numeriques-qui-preparent-lavenir",
        "flux": "https://news.google.com/rss/search?q=%22Vienne%20Num%C3%A9rique%22%20cyber%20OR%20num%C3%A9rique&hl=fr&gl=FR&ceid=FR:fr",
        "items": 10,
        "cyber": "Vienne Numérique dévoile son nouveau site internet (La Vienne le département, 09/04/2026, titre observé dans le flux)"
    },
    {
        "nom": "PWN — Poitiers Web Nerdz",
        "type": "association — professionnels et étudiants du web / sécurité",
        "secteur": "numerique",
        "site": "https://pwn-association.org/",
        "actus": "https://pwn-association.org/evenements/",
        "flux": "https://news.google.com/rss/search?q=%22Poitiers%20Web%20Nerdz%22%20OR%20%22PWN%20Poitiers%22%20CTF&hl=fr&gl=FR&ceid=FR:fr",
        "items": 0,
        "cyber": "Capture The Flag #3 — événement « sécurité » de l'association (07/05/2026)"
    },
    {
        "nom": "Université de Poitiers — Master Informatique / Iriaf",
        "type": "formation — informatique, recherche et cyber",
        "secteur": "numerique",
        "site": "https://www.univ-poitiers.fr/",
        "actus": "https://www.univ-poitiers.fr/c/actualites/",
        "flux": "https://www.univ-poitiers.fr/feed/",
        "items": 10,
        "cyber": "L'université de Poitiers en pointe sur la gestion des crises cyber (20/10/2022)"
    },
    {
        "nom": "Conecti (Groupe LBS) — Poitiers / Saint-Benoît",
        "type": "entreprise — infogérance et services numériques",
        "secteur": "numerique",
        "site": "https://conecti.fr/",
        "actus": "https://www.conecti.fr/actualites/",
        "flux": "https://www.conecti.fr/feed/",
        "items": 4,
        "cyber": "Fin de Windows 10 : comment réussir votre transition vers Windows 11 avec Conecti (15/07/2026)"
    },
    {
        "nom": "MTI Poitiers — Micro Tech Informatique",
        "type": "entreprise — informatique et conseil numérique",
        "secteur": "numerique",
        "site": "https://mti86.com/",
        "actus": "https://mti86.com/",
        "flux": "https://news.google.com/rss/search?q=%22MTI%22%20Poitiers%20informatique&hl=fr&gl=FR&ceid=FR:fr",
        "items": 4,
        "cyber": "Passez sereinement du travail au web avec Copilot Chat (MTI, 20/04/2026)"
    },
    {
        "nom": "Studio Digital Poitiers (poitiers.digital)",
        "type": "entreprise — agence web et conseil digital",
        "secteur": "numerique",
        "site": "https://poitiers.digital/",
        "actus": "https://poitiers.digital/blog",
        "flux": "https://news.google.com/rss/search?q=%22poitiers.digital%22%20OR%20%22Studio%20Digital%20Poitiers%22&hl=fr&gl=FR&ceid=FR:fr",
        "items": 0,
        "cyber": "Stratégie digitale complète pour PME à Poitiers : Google Ads, SEO, IA et contenu en 2026 (blog, 20/03/2026)"
    },
    {
        "nom": "HTP Multimédia (Poitiers)",
        "type": "entreprise — infogérance et cybersécurité",
        "secteur": "numerique",
        "site": "https://www.htpmultimedia.fr/",
        "actus": "https://www.htpmultimedia.fr/",
        "flux": "https://news.google.com/rss/search?q=%22HTP%20Multim%C3%A9dia%22%20Poitiers&hl=fr&gl=FR&ceid=FR:fr",
        "items": 0,
        "cyber": ""
    },
    {
        "nom": "CCI de la Vienne",
        "type": "chambre consulaire — numérique et cybersécurité des entreprises",
        "secteur": "numerique",
        "site": "https://www.poitiers.cci.fr/",
        "actus": "https://www.poitiers.cci.fr/actualites/",
        "flux": "https://www.poitiers.cci.fr/actualites/feed/",
        "items": 10,
        "cyber": "Comment protéger votre entreprise face aux nouvelles menaces ? — webinaire cybersécurité avec un angle IA (CCI Vienne, 31/03/2026)"
    },
    {
        "nom": "MEDEF Vienne",
        "type": "organisation patronale — entreprises et transformations numériques",
        "secteur": "numerique",
        "site": "https://www.medef-vienne.fr/",
        "actus": "https://www.medef-vienne.fr/actualite-de-lentreprise/",
        "flux": "https://www.medef-vienne.fr/feed/",
        "items": 10,
        "cyber": "Cybersécurité : rappel des bonnes pratiques (MEDEF, 06/10/2022)"
    },
    {
        "nom": "Grand Poitiers Communauté urbaine",
        "type": "institutionnel — numérique et résilience informatique",
        "secteur": "numerique",
        "site": "https://www.grandpoitiers.fr/",
        "actus": "https://www.grandpoitiers.fr/information-transversale/actualites",
        "flux": "https://www.grandpoitiers.fr/information-transversale/actualites/rss",
        "items": 117,
        "cyber": "Panne informatique en cours de résolution — panne du 29/08 au 08/09 affectant Ville, CCAS et Grand Poitiers (08/09/2025)"
    },
    {
        "nom": "Ville de Poitiers",
        "type": "institutionnel — services numériques et inclusion",
        "secteur": "numerique",
        "site": "https://www.poitiers.fr/",
        "actus": "https://www.poitiers.fr/les-actualites",
        "flux": "https://www.poitiers.fr/rss.xml",
        "items": 10,
        "cyber": "Fermeture provisoire de grandpoitiers.fr — alerte de sécurité nationale impactant les sites publics (22/10/2026)"
    },
    {
        "nom": "AMF86 — Association des maires de la Vienne",
        "type": "association — élus locaux et risques cyber",
        "secteur": "numerique",
        "site": "https://amf86.fr/",
        "actus": "https://amf86.fr/actualites-de-lassociation/",
        "flux": "https://amf86.fr/feed/",
        "items": 10,
        "cyber": "Gend'Élus : maintenant disponible depuis n'importe quel ordinateur — fiches de sensibilisation aux risques cyber (13/10/2025)"
    },
    {
        "nom": "Région Nouvelle-Aquitaine — Portail des entreprises",
        "type": "institutionnel — accompagnement numérique des entreprises",
        "secteur": "numerique",
        "site": "https://entreprises.nouvelle-aquitaine.fr/",
        "actus": "https://entreprises.nouvelle-aquitaine.fr/actualites",
        "flux": "https://news.google.com/rss/search?q=%22entreprises.nouvelle-aquitaine.fr%22%20cybers%C3%A9curit%C3%A9&hl=fr&gl=FR&ceid=FR:fr",
        "items": 10,
        "cyber": "Cybersécurité : les solutions pour protéger les entreprises néo-aquitaines (22/09/2026)"
    },
    {
        "nom": "Département de la Vienne — La Vienne le département",
        "type": "institutionnel — actualités du département et de Vienne Numérique",
        "secteur": "numerique",
        "site": "https://www.lavienne86.fr/",
        "actus": "https://www.lavienne86.fr/fil-infos/actualites",
        "flux": "https://news.google.com/rss/search?q=%22Vienne%20Num%C3%A9rique%22%20cyber%20OR%20num%C3%A9rique&hl=fr&gl=FR&ceid=FR:fr",
        "items": 10,
        "cyber": "Vienne Numérique dévoile son nouveau site internet (09/04/2026)"
    },
    {
        "nom": "La Nouvelle République — édition Vienne (86)",
        "type": "presse — quotidien régional, rubrique Vienne",
        "secteur": "numerique",
        "site": "https://www.lanouvellerepublique.fr/",
        "actus": "https://www.lanouvellerepublique.fr/vienne",
        "flux": "https://www.lanouvellerepublique.fr/api/v1/rss/5e20732239a34f77578b457c",
        "items": 40,
        "cyber": "Cyberattaque contre des supermarchés : des établissements touchés dans la Vienne (12/10/2026)"
    },
    {
        "nom": "Le7.info (Poitiers)",
        "type": "presse — média local d'information de proximité",
        "secteur": "numerique",
        "site": "https://www.le7.info/",
        "actus": "https://www.le7.info/tag/159-numerique",
        "flux": "https://www.le7.info/rss.xml",
        "items": 10,
        "cyber": "Les TPE-PME de plus en plus attaquées (10/05/2025)"
    },
    {
        "nom": "ICI Poitou (ex-France Bleu Poitou)",
        "type": "radio — média local, rubrique Vienne (86)",
        "secteur": "numerique",
        "site": "https://www.ici.fr/radio/poitou",
        "actus": "https://www.ici.fr/nouvelle-aquitaine/vienne-86",
        "flux": "https://www.ici.fr/rss/poitou/a-la-une.xml",
        "items": 40,
        "cyber": "Les collectivités de Poitiers et Grand-Poitiers victimes d'une importante cyberattaque (02/09/2025)"
    },
    {
        "nom": "France 3 Nouvelle-Aquitaine — Vienne",
        "type": "média — télévision régionale, déclinaison Vienne",
        "secteur": "numerique",
        "site": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne",
        "actus": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne",
        "flux": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss",
        "items": 30,
        "cyber": "« WhatsApp est un réseau social, et la plupart des parents l'ignorent » : des collégiens formés contre le cyberharcèlement (13/11/2026, flux)"
    },
    {
        "nom": "Châtellerault Mag (Ville de Châtellerault)",
        "type": "presse — magazine municipal, rubrique numérique",
        "secteur": "numerique",
        "site": "https://www.chatellerault.fr/",
        "actus": "https://www.chatellerault.fr/actualites/",
        "flux": "https://www.chatellerault.fr/feed/",
        "items": 0,
        "cyber": "Le réemploi du numérique ? Parlons-en ! (21/11/2026)"
    },
    {
        "nom": "Qwery — agence web de Poitiers",
        "type": "blog — agence web, sécurité WordPress et IA",
        "secteur": "numerique",
        "site": "https://qwery.fr/",
        "actus": "https://qwery.fr/blog/",
        "flux": "https://qwery.fr/feed/",
        "items": 10,
        "cyber": "Intégration de l'intelligence artificielle pour les PME : comment financer votre projet grâce aux aides de l'État (05/01/2026)"
    },
    {
        "nom": "Elevation Cie — agence web Poitiers / Vienne",
        "type": "blog — agence web, conseil référencement et numérique",
        "secteur": "numerique",
        "site": "https://elevation-cie.fr/",
        "actus": "https://elevation-cie.fr/blog/",
        "flux": "https://elevation-cie.fr/feed/",
        "items": 5,
        "cyber": "Référencement local : comment être visible sur Google à Poitiers (05/11/2026)"
    }
]$json$) WITH ORDINALITY AS t(value, ordinality)
), ins AS (
  INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
  SELECT
    d.id,
    d.d->>'nom',
    CASE WHEN d.d->>'type' ~ '(presse|radio|t.l vision|m.dia)' THEN 'presse' ELSE 'cti' END,
    d.d->>'actus',
    'source d information publique, diffusion libre',
    true,
    'narrative',
    'html',
    jsonb_build_object(
      'corpus', jsonb_build_object('fichier', 'sources-numerique-86.jsonl', 'ligne', d.ligne),
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
  CASE WHEN u.url ~ '(rss|feed|xml)' THEN
    CASE WHEN u.url LIKE '%/feed/%' THEN 'application/rss+xml' ELSE 'application/xml' END
  ELSE 'text/html' END,
  u.items,
  0,
  now(),
  'RadarCyberCorpus/1.0',
  'ok200',
  'Corpus numerique-86 : HTTP 200 vérifié le 2026-11-22'
FROM donnees d
JOIN ins ON ins.id = d.id
CROSS JOIN LATERAL (VALUES
  (d.d->>'site', 0),
  (d.d->>'actus', 0),
  (d.d->>'flux', (d.d->>'items')::int)
) AS u(url, items)
WHERE NOT EXISTS (
  SELECT 1 FROM source_verification v WHERE v.source_id = d.id AND v.url = u.url
);

COMMIT;
