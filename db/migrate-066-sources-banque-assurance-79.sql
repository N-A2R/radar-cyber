-- Sources d'information banque / assurance / mutuelles du département 79 (Deux-Sèvres).
-- 18 sources, 54 contrôles HTTP (50 URL uniques), tous en HTTP 200 le 2026-11-22.
-- Corpus : bench/corpus/sources-banque-assurance-79.jsonl
-- Preuve HTTP : bench/results/verification-banque-assurance-79.json

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
    'corpus:ba79-' || rtrim(regexp_replace(lower(value->>'nom'), '[^a-z0-9]+', '-', 'g'), '-') AS id,
    value AS d,
    ordinality AS ligne
  FROM jsonb_array_elements($json$[
    {"nom":"Crédit Agricole Charente-Maritime Deux-Sèvres","type":"banque régionale","secteur":"banque-assurance / banque","site":"https://www.credit-agricole.fr/ca-cmds/particulier.html","actus":"https://www.credit-agricole.fr/ca-cmds/particulier/conseils/magazine/tout-un-mag.html","flux":"https://news.google.com/rss/search?q=%22Cr%C3%A9dit+Agricole%22+%22Deux-S%C3%A8vres%22&hl=fr&gl=FR&ceid=FR:fr","items":55,"cyber":"Faux SMS du Crédit Agricole Charente-Maritime Deux-Sèvres annonçant un virement suspect et renvoyant vers une page de connexion contrefaite"},
    {"nom":"MAIF — siège de Niort","type":"compagnie d'assurance mutualiste","secteur":"banque-assurance / assurance","site":"https://www.maif.fr/","actus":"https://entreprise.maif.fr/actualites","flux":"https://news.google.com/rss/search?q=MAIF+Niort+Deux-S%C3%A8vres&hl=fr&gl=FR&ceid=FR:fr","items":42,"cyber":"Titre observé dans le flux : Vol de données des clients MAIF et BPCE, que faire si vous êtes concerné ? — 20 Minutes"},
    {"nom":"SMACL Assurances — siège de Niort","type":"compagnie d'assurance mutualiste (secteur public)","secteur":"banque-assurance / assurance","site":"https://www.smacl.fr/","actus":"https://www.smacl.fr/actus-et-conseils/","flux":"https://news.google.com/rss/search?q=SMACL+Niort&hl=fr&gl=FR&ceid=FR:fr","items":43,"cyber":"Titre observé dans le flux : Smacl et Hiscox s'attaquent au risque cyber des collectivités — La Tribune de l'Assurance"},
    {"nom":"CPAM des Deux-Sèvres — Assurance Maladie","type":"organisme de protection sociale","secteur":"banque-assurance / assurance maladie","site":"https://www.ameli.fr/deux-sevres/assure","actus":"https://www.ameli.fr/deux-sevres/assure/actualites","flux":"https://news.google.com/rss/search?q=%22CPAM+des+Deux-S%C3%A8vres%22+fraude&hl=fr&gl=FR&ceid=FR:fr","items":5,"cyber":"Titre observé dans le flux : Attention aux arnaques SMS à l'assurance maladie via votre compte AMELI — France 3 Régions"},
    {"nom":"MGEN","type":"mutuelle d'assurance","secteur":"banque-assurance / mutuelle","site":"https://www.mgen.fr/","actus":"https://www.mgen.fr/ressources/actualites","flux":"https://news.google.com/rss/search?q=MGEN+Deux-S%C3%A8vres&hl=fr&gl=FR&ceid=FR:fr","items":24,"cyber":"Titre observé dans le flux : Cyberattaque : imbroglio sur le nombre de mutuelles touchées, MGEN et Harmonie Mutuelle démentent tout vol de données — L'Argus de l'assurance"},
    {"nom":"Harmonie Mutuelle","type":"mutuelle d'assurance","secteur":"banque-assurance / mutuelle","site":"https://www.harmonie-mutuelle.fr/","actus":"https://www.harmonie-mutuelle.fr/actualites/","flux":"https://news.google.com/rss/search?q=%22Harmonie+Mutuelle%22+Deux-S%C3%A8vres&hl=fr&gl=FR&ceid=FR:fr","items":10,"cyber":"Titre observé dans le flux : Cyberattaque : imbroglio sur le nombre de mutuelles touchées, MGEN et Harmonie Mutuelle démentent tout vol de données — L'Argus de l'assurance"},
    {"nom":"Crédit Mutuel — agences des Deux-Sèvres","type":"banque","secteur":"banque-assurance / banque","site":"https://www.creditmutuel.com/fr/","actus":"https://www.creditmutuel.com/fr/actualites","flux":"https://news.google.com/rss/search?q=%22Cr%C3%A9dit+Mutuel%22+Deux-S%C3%A8vres&hl=fr&gl=FR&ceid=FR:fr","items":31,"cyber":"Titre observé dans le flux : Melle : des clients de l'agence du Crédit Mutuel ciblés par des escrocs — ici.fr"},
    {"nom":"Banque Populaire — agences des Deux-Sèvres","type":"banque","secteur":"banque-assurance / banque","site":"https://www.banquepopulaire.fr/","actus":"https://www.banquepopulaire.fr/votre-banque/actualites/","flux":"https://news.google.com/rss/search?q=%22Banque+Populaire%22+Deux-S%C3%A8vres+fraude&hl=fr&gl=FR&ceid=FR:fr","items":9,"cyber":"Titre observé dans le flux : Fuite de données chez Maif et Banque populaire : que faire ? — Capital.fr"},
    {"nom":"Caisse d'Épargne Loire Centre","type":"banque régionale","secteur":"banque-assurance / banque","site":"https://www.caisse-epargne.fr/loire-centre/","actus":"https://www.caisse-epargne.fr/votre-banque/actualites/","flux":"https://news.google.com/rss/search?q=%22Caisse+d%27%C3%89pargne%22+Deux-S%C3%A8vres&hl=fr&gl=FR&ceid=FR:fr","items":10,"cyber":"Faux courriel Caisse d'Épargne Loire Centre annonçant un prélèvement frauduleux sur un compte de Deux-Sèvres"},
    {"nom":"France Assureurs","type":"fédération professionnelle de l'assurance","secteur":"banque-assurance / fédération","site":"https://www.franceassureurs.fr/","actus":"https://www.franceassureurs.fr/actualites/","flux":"https://www.franceassureurs.fr/feed/","items":5,"cyber":"Titre observé dans le flux : Cyberattaques : une deuxième ressource pour renforcer la résilience des TPE-PME — France Assureurs"},
    {"nom":"Fédération Bancaire Française (FBF)","type":"fédération professionnelle bancaire","secteur":"banque-assurance / fédération","site":"https://fbf.fr/","actus":"https://fbf.fr/fr/rubrique-newsroom/actualites/","flux":"https://news.google.com/rss/search?q=FBF+banque+Deux-S%C3%A8vres&hl=fr&gl=FR&ceid=FR:fr","items":3,"cyber":"Titre observé dans le flux : Divulgation des données FICOBA : la FBF appelle à la vigilance — Fédération bancaire française"},
    {"nom":"ACPR — Autorité de contrôle prudentiel et de résolution","type":"autorité de régulation","secteur":"banque-assurance / régulation","site":"https://acpr.banque-france.fr/fr","actus":"https://acpr.banque-france.fr/fr/actualites","flux":"https://news.google.com/rss/search?q=ACPR+Deux-S%C3%A8vres+banque&hl=fr&gl=FR&ceid=FR:fr","items":9,"cyber":"Titre observé dans le flux : L'ANSSI, l'ACPR et la Banque de France signent un accord et renforcent leur coopération en matière de sécurité des systèmes d'information — ACPR"},
    {"nom":"ORIAS — registre des intermédiaires en assurance, banque et finance","type":"registre professionnel","secteur":"banque-assurance / registre","site":"https://www.orias.fr/","actus":"https://www.orias.fr/home/communications","flux":"https://news.google.com/rss/search?q=ORIAS+assurance+interm%C3%A9diaire&hl=fr&gl=FR&ceid=FR:fr","items":32,"cyber":"Titre observé dans le flux : Usurpation d'identité : l'Orias simplifie les démarches pour les intermédiaires — L'Argus de l'assurance"},
    {"nom":"CNCGP — Chambre nationale des conseils en gestion de patrimoine","type":"chambre professionnelle","secteur":"banque-assurance / chambre professionnelle","site":"https://www.cncgp.fr/","actus":"https://www.cncgp.fr/actualites","flux":"https://news.google.com/rss/search?q=CNCGP+conseil+patrimoine&hl=fr&gl=FR&ceid=FR:fr","items":29,"cyber":"Faux message CNCGP invitant un conseiller patrimonial des Deux-Sèvres à téléverser une pièce d'identité sur un portail contrefait"},
    {"nom":"Niort info","type":"presse locale en ligne","secteur":"banque-assurance / presse locale","site":"https://niortinfo.media/","actus":"https://niortinfo.media/","flux":"https://niortinfo.media/feed/","items":10,"cyber":"Titre observé dans le flux : Arnaque à la carte bancaire : les faux coursiers de Niort dans le box des prévenus — ici.fr"},
    {"nom":"actu.fr — Deux-Sèvres","type":"presse locale en ligne","secteur":"banque-assurance / presse locale","site":"https://actu.fr/pays-de-la-loire/deux-sevres_79/","actus":"https://actu.fr/pays-de-la-loire/deux-sevres_79/","flux":"https://news.google.com/rss/search?q=actu.fr+Deux-S%C3%A8vres+banque&hl=fr&gl=FR&ceid=FR:fr","items":70,"cyber":"Titre observé dans le flux : « Vous n'avez pas vraiment l'air d'être banquiers » : deux jeunes impliqués dans des escroqueries à la carte bancaire dans le Sud-Deux-Sèvres — La Nouvelle République"},
    {"nom":"France 3 Nouvelle-Aquitaine — Deux-Sèvres","type":"télévision locale","secteur":"banque-assurance / presse locale","site":"https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres","actus":"https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres","flux":"https://france3-regions.franceinfo.fr/nouvelle-aquitaine/deux-sevres/rss","items":30,"cyber":"Titre observé dans le flux : Attention aux arnaques SMS à l'assurance maladie via votre compte AMELI — France 3 Régions"},
    {"nom":"ICI Poitou (Radio France)","type":"radio locale","secteur":"banque-assurance / presse locale","site":"https://www.ici.fr/poitou","actus":"https://www.ici.fr/poitou","flux":"https://www.ici.fr/rss/poitou/rubrique/infos.xml","items":20,"cyber":"Titre observé dans le flux : Melle : des clients de l'agence du Crédit Mutuel ciblés par des escrocs — ici.fr"}
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
      'corpus', jsonb_build_object('fichier', 'sources-banque-assurance-79.jsonl', 'ligne', d.ligne),
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
    '79'
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
  'Corpus banque-assurance-79 : HTTP 200 vérifié le 2026-11-22'
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
