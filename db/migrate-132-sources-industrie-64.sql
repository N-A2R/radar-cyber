-- Sources d'information industrie du département 64 (Pyrénées-Atlantiques).
-- 12 sources, 36 contrôles HTTP (31 URL uniques), tous en HTTP 200 le 2026-11-22.
-- Corpus : bench/corpus/sources-industrie-64.jsonl
-- Preuve HTTP : bench/results/verification-industrie-64.json

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
    'corpus:i64-' || rtrim(regexp_replace(lower(value->>'nom'), '[^a-z0-9]+', '-', 'g'), '-') AS id,
    value AS d,
    ordinality AS ligne
  FROM jsonb_array_elements($json$[
    {"nom":"CCI Pau Béarn","type":"chambre consulaire","secteur":"industrie / chambre consulaire et entreprises","site":"https://pau.cci.fr/","actus":"https://pau.cci.fr/?post_type=post","flux":"https://pau.cci.fr/feed/","items":10,"cyber":"La CCI Pau Béarn accompagne les PME face au défi de la souveraineté numérique — 2026-06-04"},
    {"nom":"CMA Nouvelle-Aquitaine — antenne des Pyrénées-Atlantiques","type":"chambre consulaire (métiers et artisanat)","secteur":"industrie / artisanat et petites industries","site":"https://cma-nouvelleaquitaine.fr/","actus":"https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites","flux":"https://news.google.com/rss/search?q=CMA%20Nouvelle-Aquitaine%20Pyr%C3%A9n%C3%A9es-Atlantiques%20artisanat&hl=fr&gl=FR&ceid=FR%3Afr","items":15,"cyber":"Pyrénées-Atlantiques : face à une hausse de 37,4 % des infractions numériques, élus et industriels s’arment contre la cybercriminalité — 2026-11-21"},
    {"nom":"UIMM — La Fabrique de l’avenir","type":"fédération professionnelle (métallurgie)","secteur":"industrie / métallurgie et industries mécaniques","site":"https://uimm.lafabriquedelavenir.fr/","actus":"https://uimm.lafabriquedelavenir.fr/actualites/","flux":"https://uimm.lafabriquedelavenir.fr/feed/","items":10,"cyber":"Cybersécurité, compétitivité, productivité : des formations à l’intelligence artificielle proposées aux industriels par l’UIMM — 2026-09-23"},
    {"nom":"France Industrie","type":"fédération professionnelle","secteur":"industrie / interprofessionnel","site":"https://www.franceindustrie.org/","actus":"https://www.franceindustrie.org/category/actualites/","flux":"https://www.franceindustrie.org/feed/","items":10,"cyber":"Egide victime d'une cyberattaque : son usine de Bollène partiellement à l'arrêt — 2026-10-11"},
    {"nom":"MEDEF — réseau territorial Pyrénées-Atlantiques","type":"syndicat patronal","secteur":"industrie / entreprises","site":"https://www.medef.com/","actus":"https://www.medef.com/newsroom","flux":"https://news.google.com/rss/search?q=MEDEF%20Pyr%C3%A9n%C3%A9es-Atlantiques%20entreprise&hl=fr&gl=FR&ceid=FR%3Afr","items":10,"cyber":"Pour 46 % des entreprises françaises, les pertes financières commencent dès le jour de la cyberattaque — 2026-06-25"},
    {"nom":"Aerospace Valley — pôle aéronautique Sud-Ouest","type":"pôle de compétitivité (site de Pau)","secteur":"industrie / aéronautique","site":"https://www.aerospace-valley.com/","actus":"https://www.aerospace-valley.com/actualites","flux":"https://news.google.com/rss/search?q=Aerospace%20Valley%20Pau%20industrie%20a%C3%A9ronautique&hl=fr&gl=FR&ceid=FR%3Afr","items":10,"cyber":"Aucun incident cyber observé sur cette source ; actualité industrielle : Aerospace Valley : il faut soutenir les PME et PMI de la filière qui peinent à suivre — 2025-06-16"},
    {"nom":"La Semaine des Pyrénées","type":"presse locale","secteur":"industrie / presse locale","site":"https://www.lasemainedespyrenees.fr/","actus":"https://www.lasemainedespyrenees.fr/","flux":"https://www.lasemainedespyrenees.fr/feed/","items":10,"cyber":"Cyberattaque du SDIS 64 : il s’agirait d’un rançongiciel — 2023-10-14"},
    {"nom":"actu.fr — Pau","type":"presse locale","secteur":"industrie / presse locale","site":"https://actu.fr/nouvelle-aquitaine/pau_64483/","actus":"https://actu.fr/nouvelle-aquitaine/pau_64483/","flux":"https://news.google.com/rss/search?q=actu.fr%20Pau%20industrie%20Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR%3Afr","items":11,"cyber":"Cyberattaque du SDIS 64 : il s’agirait d’un rançongiciel — 2023-10-14 (Actu.fr)"},
    {"nom":"ici Béarn Bigorre","type":"radio locale","secteur":"industrie / presse locale","site":"https://www.ici.fr/radio/bearn","actus":"https://www.ici.fr/radio/bearn","flux":"https://www.ici.fr/rss/bearn/rubrique/infos.xml","items":20,"cyber":"En Béarn, au moins trois supermarchés touchés par la cyberattaque — 2026-10-12"},
    {"nom":"ici Pays Basque","type":"radio locale","secteur":"industrie / presse locale","site":"https://www.ici.fr/radio/pays-basque","actus":"https://www.ici.fr/radio/pays-basque","flux":"https://www.ici.fr/rss/pays-basque/rubrique/infos.xml","items":20,"cyber":"L’eusko, la monnaie locale basque victime d’une tentative de piratage de ses données — 2026-08-27"},
    {"nom":"France 3 — Pyrénées-Atlantiques","type":"télévision locale","secteur":"industrie / presse locale","site":"https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques","actus":"https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques","flux":"https://news.google.com/rss/search?q=France%203%20Pyr%C3%A9n%C3%A9es-Atlantiques%20industrie&hl=fr&gl=FR&ceid=FR%3Afr","items":76,"cyber":"Un piratage pas si sophistiqué que ça : ce que l'on sait de la cyberattaque qui a fait monter en température les frigos de supermarchés — 2026-10-13"},
    {"nom":"Mediabask","type":"presse locale","secteur":"industrie / presse locale","site":"https://www.mediabask.eus/","actus":"https://www.mediabask.eus/eu/info","flux":"https://news.google.com/rss/search?q=Mediabask%20Pays%20Basque%20industrie&hl=fr&gl=FR&ceid=FR%3Afr","items":10,"cyber":"Pays basque : la commune d’Espelette victime d’un piratage, des mails piégés envoyés par la mairie — 2026-09-16"}
  ]$json$) WITH ORDINALITY AS t(value, ordinality)
), ins AS (
  INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description, region, department)
  SELECT
    d.id,
    d.d->>'nom',
    CASE WHEN d.d->>'type' ~ '(presse|radio|t.l vision)' THEN 'presse' ELSE 'cti' END,
    d.d->>'actus',
    'source d information publique, diffusion libre',
    true,
    'narrative',
    'html',
    jsonb_build_object(
      'corpus', jsonb_build_object('fichier', 'sources-industrie-64.jsonl', 'ligne', d.ligne),
      'verification', jsonb_build_object(
        'code_http', 200,
        'url_site', d.d->>'site',
        'url_actualites', d.d->>'actus',
        'url_flux', d.d->>'flux'
      )
    ),
    3600,
    (d.d->>'type') || ' — ' || (d.d->>'secteur') || ' — exemple cyber : ' || (d.d->>'cyber'),
    'Nouvelle-Aquitaine',
    '64'
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
    CASE WHEN u.url LIKE '%/feed/%' OR u.url LIKE '%/feed' THEN 'application/rss+xml' ELSE 'application/xml' END
  ELSE 'text/html' END,
  u.items,
  0,
  now(),
  'RadarCyberCorpus/1.0',
  'ok200',
  'Corpus industrie-64 : HTTP 200 vérifié le 2026-11-22'
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
