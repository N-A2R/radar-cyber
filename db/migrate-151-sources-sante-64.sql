-- Sources d'information santé du département 64 (Pyrénées-Atlantiques).
-- 21 sources, 63 contrôles HTTP (58 URL uniques), tous en HTTP 200 le 2026-11-22.
-- Corpus : bench/corpus/sources-sante-64.jsonl
-- Preuve HTTP : bench/results/verification-sources-sante-64.json

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
    'corpus:s64-' || rtrim(regexp_replace(lower(value->>'nom'), '[^a-z0-9]+', '-', 'g'), '-') AS id,
    value AS d,
    ordinality AS ligne
  FROM jsonb_array_elements($json$[
    {"nom":"Centre hospitalier universitaire de Pau","type":"hôpital public (CHU)","secteur":"santé","site":"https://www.ch-pau.fr/","actus":"https://www.ch-pau.fr/actualites/","flux":"https://www.ch-pau.fr/feed/","items":10,"cyber":"Un hôpital des Pyrénées-Atlantiques visé à son tour par une cyberattaque — Le Monde, 2021-03-09"},
    {"nom":"Centre hospitalier d’Oloron-Sainte-Marie","type":"hôpital public","secteur":"santé","site":"https://www.ch-oloron.fr/","actus":"https://www.ch-oloron.fr/actualites/","flux":"https://news.google.com/rss/search?q=cyberattaque%20h%C3%B4pital%20Oloron%20Sainte-Marie&hl=fr&gl=FR&ceid=FR%3Afr","items":10,"cyber":"Béarn : l’hôpital d’Oloron Sainte-Marie victime d’une cyberattaque, le parquet de Paris saisi — Sud Ouest, 2021-03-09"},
    {"nom":"ARS Nouvelle-Aquitaine — délégation des Pyrénées-Atlantiques","type":"agence régionale de santé","secteur":"santé","site":"https://www.nouvelle-aquitaine.ars.sante.fr/","actus":"https://www.nouvelle-aquitaine.ars.sante.fr/liste-actualites?archive=0","flux":"https://www.nouvelle-aquitaine.ars.sante.fr/rss.xml?type=ars_actualite","items":16,"cyber":"Incident de sécurité concernant la plateforme de recueil des autorisations parentales — ARS Nouvelle-Aquitaine, 2026"},
    {"nom":"Santé publique France — Nouvelle-Aquitaine","type":"agence sanitaire","secteur":"santé","site":"https://www.santepubliquefrance.fr/","actus":"https://www.santepubliquefrance.fr/regions-et-territoires/nouvelle-aquitaine","flux":"https://news.google.com/rss/search?q=sant%C3%A9%20publique%20France%20Nouvelle-Aquitaine&hl=fr&gl=FR&ceid=FR%3Afr","items":30,"cyber":"Cyberattaque des chambres froides de l’Établissement français du sang — La Croix, 2026-11-04"},
    {"nom":"ESEA Nouvelle-Aquitaine — GRADeS e-santé","type":"groupement régional e-santé","secteur":"santé","site":"https://www.esea-na.fr/","actus":"https://www.esea-na.fr/actualites","flux":"https://news.google.com/rss/search?q=ESEA%20Nouvelle-Aquitaine%20e-sant%C3%A9&hl=fr&gl=FR&ceid=FR%3Afr","items":15,"cyber":"Cybersécurité des systèmes d’information de santé — GRADeS e-santé, https://wwwsec.esea-na.fr/node/402.html"},
    {"nom":"Conseil national de l’Ordre des médecins","type":"ordre professionnel","secteur":"santé","site":"https://www.conseil-national.medecin.fr/","actus":"https://www.conseil-national.medecin.fr/actualites","flux":"https://www.conseil-national.medecin.fr/rss.xml","items":10,"cyber":"Fuite de dossiers de patients au CH de Perpignan — cyberattaque.org, 2026"},
    {"nom":"Ordre des sages-femmes — conseil départemental 64","type":"ordre professionnel départemental","secteur":"santé","site":"https://www.ordre-sages-femmes.fr/conseil-departemental-64/","actus":"https://www.ordre-sages-femmes.fr/conseil-departemental-64/actualites-evenements/","flux":"https://news.google.com/rss/search?q=ordre%20des%20sages-femmes%20Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR%3Afr","items":10,"cyber":"CHU de Reims : données personnelles de patients dérobées après piratage — France 3, 2026"},
    {"nom":"Ordre national des infirmiers — publications locales","type":"ordre professionnel","secteur":"santé","site":"https://www.ordre-infirmiers.fr/","actus":"https://www.ordre-infirmiers.fr/publications-locales","flux":"https://news.google.com/rss/search?q=ordre%20national%20des%20infirmiers%20Nouvelle-Aquitaine&hl=fr&gl=FR&ceid=FR%3Afr","items":10,"cyber":"Fuite de dossiers de patients au CH de Perpignan — cyberattaque.org, 2026"},
    {"nom":"Ordre national des pharmaciens","type":"ordre professionnel","secteur":"santé","site":"https://www.ordre.pharmacien.fr/","actus":"https://www.ordre.pharmacien.fr/les-communications/focus-sur/les-actualites","flux":"https://news.google.com/rss/search?q=ordre%20des%20pharmaciens%20Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR%3Afr","items":10,"cyber":"Cyberattaque du laboratoire Novabio : données de santé en fuite — cyberattaque.org, 2026"},
    {"nom":"URPS pharmaciens Nouvelle-Aquitaine","type":"union professionnelle régionale","secteur":"santé","site":"https://www.urps-pharmaciens-na.fr/","actus":"https://www.urps-pharmaciens-na.fr/actualites/","flux":"https://www.urps-pharmaciens-na.fr/feed/","items":10,"cyber":"Cybermenaces et professionnels libéraux — URPS pharmaciens Nouvelle-Aquitaine"},
    {"nom":"AVECSanté Nouvelle-Aquitaine","type":"réseau régional de santé","secteur":"santé","site":"https://avecsantena.fr/","actus":"https://avecsantena.fr/nos-actus/","flux":"https://avecsantena.fr/feed/","items":10,"cyber":"Cyberattaque du logiciel WEDA : que s’est-il passé et comment réagir pour une MSP ? — AVECSanté"},
    {"nom":"Mutualité française Nouvelle-Aquitaine","type":"mutuelle santé","secteur":"santé","site":"https://nouvelle-aquitaine.mutualite.fr/","actus":"https://nouvelle-aquitaine.mutualite.fr/actualites/","flux":"https://nouvelle-aquitaine.mutualite.fr/actualites/feed/","items":10,"cyber":"Cyberattaque des chambres froides de l’Établissement français du sang — La Croix, 2026-11-04"},
    {"nom":"FHF Nouvelle-Aquitaine — Fédération hospitalière de France","type":"fédération hospitalière","secteur":"santé","site":"https://fhf-na.fr/","actus":"https://fhf-na.fr/2021/12/02/actualites/","flux":"https://fhf-na.fr/feed/","items":10,"cyber":"Cyberattaque : les solutions utilisées par le CHU de Bordeaux pour résister à WannaCry — Sud Ouest"},
    {"nom":"FHP Nouvelle-Aquitaine — Fédération des hôpitaux privés","type":"fédération hospitalière privée","secteur":"santé","site":"https://fhp.fr/la-federation/les-fhp-regions/nouvelle-aquitaine/","actus":"https://fhp.fr/actualites/","flux":"https://fhp.fr/feed/","items":10,"cyber":"Cyberattaque : une clinique privée sanctionnée d’une amende de 500 000 € après un vol de données — Le Figaro, 2026-09-03"},
    {"nom":"La Semaine des Pyrénées","type":"presse locale","secteur":"santé","site":"https://www.lasemainedespyrenees.fr/","actus":"https://www.lasemainedespyrenees.fr/","flux":"https://www.lasemainedespyrenees.fr/feed/","items":10,"cyber":"Béarn : l’hôpital d’Oloron Sainte-Marie victime d’une cyberattaque — Sud Ouest, 2021-03-09"},
    {"nom":"actu.fr — Pau (64)","type":"presse locale en ligne","secteur":"santé","site":"https://actu.fr/nouvelle-aquitaine/pau_64483/","actus":"https://actu.fr/nouvelle-aquitaine/pau_64483/","flux":"https://news.google.com/rss/search?q=actu.fr%20Pau%20sant%C3%A9%20Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR%3Afr","items":35,"cyber":"Cyberattaque : l’hôpital d’Oloron-Sainte-Marie visé à son tour, les pirates demandent 50 000 euros — ladepeche.fr"},
    {"nom":"ici Béarn Bigorre","type":"radio locale publique","secteur":"santé","site":"https://www.ici.fr/radio/bearn","actus":"https://www.ici.fr/infos/sante-sciences","flux":"https://www.ici.fr/rss/bearn/rubrique/infos.xml","items":20,"cyber":"L’hôpital de Dax au ralenti après une importante attaque informatique — ici, 2022-03-21"},
    {"nom":"ici Pays Basque","type":"radio locale publique","secteur":"santé","site":"https://www.ici.fr/radio/pays-basque","actus":"https://www.ici.fr/infos/sante-sciences","flux":"https://www.ici.fr/rss/pays-basque/rubrique/infos.xml","items":20,"cyber":"Cyberattaques : qui sont ces experts qui protègent les hôpitaux de Nouvelle-Aquitaine ? — Sud Ouest"},
    {"nom":"France 3 — Pyrénées-Atlantiques","type":"télévision locale publique","secteur":"santé","site":"https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques","actus":"https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques","flux":"https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques/rss","items":30,"cyber":"Cyberattaque de l'hôpital de Dax : une rançon demandée pour décrypter les données — France 3"},
    {"nom":"Le Parisien — Pyrénées-Atlantiques (64)","type":"presse quotidienne locale","secteur":"santé","site":"https://www.leparisien.fr/pyrenees-atlantiques-64/","actus":"https://www.leparisien.fr/pyrenees-atlantiques-64/","flux":"https://feeds.leparisien.fr/leparisien/rss/pyrenees-atlantiques-64","items":100,"cyber":"Cyberattaque à l’hôpital de Dax : une situation grave et complexe — Sud Ouest, 2022"},
    {"nom":"Mediabask — Pays Basque","type":"presse locale","secteur":"santé","site":"https://www.mediabask.eus/","actus":"https://www.mediabask.eus/eu/info","flux":"https://news.google.com/rss/search?q=Mediabask%20sant%C3%A9%20Pays%20Basque&hl=fr&gl=FR&ceid=FR%3Afr","items":13,"cyber":"Cyberattaque : l’hôpital d’Oloron-Sainte-Marie visé à son tour — Sud Ouest, 2021-03-09"}
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
      'corpus', jsonb_build_object('fichier', 'sources-sante-64.jsonl', 'ligne', d.ligne),
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
  'Corpus sante-64 : HTTP 200 vérifié le 2026-11-22'
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
