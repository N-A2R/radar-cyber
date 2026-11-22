-- Sources d'information banque / assurance du département 64 (Pyrénées-Atlantiques).
-- 21 sources, 63 contrôles HTTP (56 URL uniques), tous en HTTP 200 le 2026-11-22.
-- Corpus : bench/corpus/sources-banque-assurance-64.jsonl
-- Preuve HTTP : bench/results/verification-banque-assurance-64.json

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
    'corpus:ba64-' || rtrim(regexp_replace(lower(value->>'nom'), '[^a-z0-9]+', '-', 'g'), '-') AS id,
    value AS d,
    ordinality AS ligne
  FROM jsonb_array_elements($json$[
    {"nom":"CCI Pau Béarn","type":"chambre consulaire","secteur":"banque-assurance / chambre consulaire et entreprises","site":"https://pau.cci.fr/","actus":"https://pau.cci.fr/?post_type=post","flux":"https://pau.cci.fr/feed/","items":10,"cyber":"La CCI Pau Béarn accompagne les PME face au défi de la souveraineté numérique — 2026-06-04"},
    {"nom":"Banque de France — succursale de Pau","type":"banque centrale (succursale départementale)","secteur":"banque-assurance / régulation bancaire","site":"https://www.banque-france.fr/fr","actus":"https://www.banque-france.fr/fr/actualites","flux":"https://news.google.com/rss/search?q=Banque+de+France+Pau&hl=fr&gl=FR&ceid=FR%3Afr","items":34,"cyber":"Mondial Relay touché par une cyberattaque qui a volé les données de ses clients — 2025-12-27"},
    {"nom":"ACPR — Autorité de contrôle prudentiel et de résolution","type":"autorité de régulation","secteur":"banque-assurance / régulation bancaire et assurance","site":"https://acpr.banque-france.fr/fr","actus":"https://acpr.banque-france.fr/fr/actualites","flux":"https://news.google.com/rss/search?q=ACPR+Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR%3Afr","items":2,"cyber":"L’ANSSI, l’ACPR et la Banque de France renforcent leur coopération en sécurité des systèmes d’information — 2026-07-03"},
    {"nom":"ORIAS — Registre unique des intermédiaires","type":"registre professionnel","secteur":"banque-assurance / intermédiation","site":"https://www.orias.fr/","actus":"https://www.orias.fr/home/communications","flux":"https://news.google.com/rss/search?q=ORIAS+assurance&hl=fr&gl=FR&ceid=FR%3Afr","items":55,"cyber":"Fraudes financières en ligne : comment protéger votre épargne ? — 2025-12-12"},
    {"nom":"FBF — Fédération bancaire française","type":"fédération professionnelle","secteur":"banque-assurance / banque","site":"https://fbf.fr/","actus":"https://fbf.fr/fr/rubrique-newsroom/actualites/","flux":"https://news.google.com/rss/search?q=F%C3%A9d%C3%A9ration+bancaire+fran%C3%A7aise&hl=fr&gl=FR&ceid=FR%3Afr","items":47,"cyber":"Divulgation des données FICOBA : la FBF appelle à la vigilance — 2026-02-19"},
    {"nom":"CPAM des Pyrénées-Atlantiques — Assurance Maladie","type":"organisme de protection sociale","secteur":"banque-assurance / assurance maladie","site":"https://www.ameli.fr/assure/actualites","actus":"https://www.ameli.fr/assure/actualites","flux":"https://news.google.com/rss/search?q=CPAM+Pyr%C3%A9n%C3%A9es-Atlantiques+fraude&hl=fr&gl=FR&ceid=FR%3Afr","items":10,"cyber":"Un hacker revendique le piratage du Dossier médical partagé : l’Assurance maladie exclut toute extraction massive de données — 2026-06-03"},
    {"nom":"Carsat Aquitaine","type":"caisse d'assurance retraite","secteur":"banque-assurance / retraite et prévoyance","site":"https://www.carsat-aquitaine.fr/","actus":"https://www.carsat-aquitaine.fr/home/actif/actualites-actif.html","flux":"https://news.google.com/rss/search?q=Carsat+Aquitaine&hl=fr&gl=FR&ceid=FR%3Afr","items":34,"cyber":"Attention, ce mail ne vient pas de la CNAV, c’est une tentative de phishing — 2026-09-30"},
    {"nom":"MSA — Mutualité sociale agricole","type":"sécurité sociale agricole","secteur":"banque-assurance / assurance sociale","site":"https://www.msa.fr/","actus":"https://www.msa.fr/lfp/actualites","flux":"https://news.google.com/rss/search?q=MSA+Pyr%C3%A9n%C3%A9es+Atlantique&hl=fr&gl=FR&ceid=FR%3Afr","items":17,"cyber":"Cyberattaque au ministère des Sports : 3,5 millions de foyers concernés via Pass’Sport — 2025-12-20"},
    {"nom":"MAIF","type":"assureur mutuel","secteur":"banque-assurance / assurance","site":"https://www.maif.fr/","actus":"https://entreprise.maif.fr/actualites/presse","flux":"https://news.google.com/rss/search?q=MAIF+Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR%3Afr","items":8,"cyber":"Vol de données des clients MAIF et BPCE, que faire si vous êtes concerné ? — 2025-03-24"},
    {"nom":"Groupama","type":"assureur mutualiste","secteur":"banque-assurance / assurance","site":"https://www.groupama.fr/","actus":"https://www.groupama.fr/actualites/","flux":"https://news.google.com/rss/search?q=Groupama+Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR%3Afr","items":29,"cyber":"Groupama a fait tomber un réseau de 39 noms de domaine frauduleux en .fr ciblant ses clients — 2025-05-12"},
    {"nom":"AXA","type":"assureur","secteur":"banque-assurance / assurance","site":"https://www.axa.fr/","actus":"https://www.axa.fr/particuliers/qui-sommes-nous/actualites.html","flux":"https://news.google.com/rss/search?q=AXA+Pyr%C3%A9n%C3%A9es-Atlantiques+assurance&hl=fr&gl=FR&ceid=FR%3Afr","items":9,"cyber":"Axa dément une fuite de données revendiquée visant 8 millions de clients — 2026-02-17"},
    {"nom":"Caisse d'Épargne","type":"banque","secteur":"banque-assurance / banque","site":"https://www.caisse-epargne.fr/","actus":"https://www.caisse-epargne.fr/conseils/","flux":"https://news.google.com/rss/search?q=Caisse+d%27%C3%89pargne+Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR%3Afr","items":14,"cyber":"DGFiP : 1,2 million de comptes bancaires « dérobés » par un acteur malveillant — 2026-02-19"},
    {"nom":"Harmonie Mutuelle","type":"mutuelle santé","secteur":"banque-assurance / complémentaire santé","site":"https://www.harmonie-mutuelle.fr/","actus":"https://www.harmonie-mutuelle.fr/actualites","flux":"https://news.google.com/rss/search?q=Harmonie+Mutuelle+Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR%3Afr","items":8,"cyber":"Cyberattaque : MGEN et Harmonie Mutuelle démentent tout vol de données — 2026-05-26"},
    {"nom":"AG2R La Mondiale","type":"mutuelle et prévoyance","secteur":"banque-assurance / prévoyance","site":"https://www.ag2rlamondiale.fr/","actus":"https://www.ag2rlamondiale.fr/actualites","flux":"https://news.google.com/rss/search?q=AG2R+La+Mondiale+Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR%3Afr","items":22,"cyber":"Almerys, spécialiste du tiers payant, confirme une fuite de données — 2026-05-26"},
    {"nom":"SMACL Assurances","type":"assureur mutualiste des collectivités","secteur":"banque-assurance / assurance","site":"https://www.smacl.fr/","actus":"https://www.smacl.fr/actus-et-conseils/","flux":"https://news.google.com/rss/search?q=SMACL+Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR%3Afr","items":3,"cyber":"Cybersécurité : une culture du risque qui reste à muscler au sein des collectivités — 2021-11-11"},
    {"nom":"La Semaine des Pyrénées","type":"presse locale","secteur":"banque-assurance / presse locale","site":"https://www.lasemainedespyrenees.fr/","actus":"https://www.lasemainedespyrenees.fr/","flux":"https://www.lasemainedespyrenees.fr/feed/","items":10,"cyber":"Pyrénées-Atlantiques – Faux conseiller bancaire, vraie escroquerie, trois ans de prison — 2026"},
    {"nom":"actu.fr — Pau","type":"presse locale","secteur":"banque-assurance / presse locale","site":"https://actu.fr/nouvelle-aquitaine/pau_64483/","actus":"https://actu.fr/nouvelle-aquitaine/pau_64483/","flux":"https://news.google.com/rss/search?q=actu.fr+Pau+banque+assurance&hl=fr&gl=FR&ceid=FR%3Afr","items":35,"cyber":"Sur la côte basque, un escroc condamné à trois ans de prison pour ses arnaques au faux conseiller bancaire — 2026"},
    {"nom":"ici Pays Basque","type":"radio locale","secteur":"banque-assurance / presse locale","site":"https://www.ici.fr/radio/pays-basque","actus":"https://www.ici.fr/radio/pays-basque","flux":"https://www.ici.fr/rss/pays-basque/rubrique/infos.xml","items":20,"cyber":"Escroqueries au Pays basque : faux conseiller bancaire, musique d’attente et livreur VTC — 2026-10-20"},
    {"nom":"ici Béarn Bigorre","type":"radio locale","secteur":"banque-assurance / presse locale","site":"https://www.ici.fr/radio/bearn","actus":"https://www.ici.fr/radio/bearn","flux":"https://www.ici.fr/rss/bearn/rubrique/infos.xml","items":20,"cyber":"En Béarn, au moins trois supermarchés touchés par la cyberattaque — 2026-10-12"},
    {"nom":"France 3 — Pyrénées-Atlantiques","type":"télévision locale","secteur":"banque-assurance / presse locale","site":"https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques","actus":"https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques","flux":"https://news.google.com/rss/search?q=France+3+Pyr%C3%A9n%C3%A9es-Atlantiques+banque&hl=fr&gl=FR&ceid=FR%3Afr","items":35,"cyber":"Arkéa : le président décrit une cyberattaque « inédite en termes de sophistication » — 2026-11-13"},
    {"nom":"Mediabask","type":"presse locale","secteur":"banque-assurance / presse locale","site":"https://www.mediabask.eus/","actus":"https://www.mediabask.eus/","flux":"https://news.google.com/rss/search?q=Mediabask+banque+assurance&hl=fr&gl=FR&ceid=FR%3Afr","items":7,"cyber":"Pays basque : la commune d’Espelette victime d’un piratage, des mails piégés envoyés par la mairie — 2026-09-16"}
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
      'corpus', jsonb_build_object('fichier', 'sources-banque-assurance-64.jsonl', 'ligne', d.ligne),
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
    CASE WHEN u.url LIKE '%/feed/%' THEN 'application/rss+xml' ELSE 'application/xml' END
  ELSE 'text/html' END,
  u.items,
  0,
  now(),
  'RadarCyberCorpus/1.0',
  'ok200',
  'Corpus banque-assurance-64 : HTTP 200 vérifié le 2026-11-22'
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
