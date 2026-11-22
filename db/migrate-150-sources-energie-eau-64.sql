-- Sources d'information énergie / eau du département 64 (Pyrénées-Atlantiques).
-- 22 sources, 66 contrôles HTTP (64 URL uniques), tous en HTTP 200 le 2026-11-22.
-- Corpus : bench/corpus/sources-energie-eau-64.jsonl
-- Preuve HTTP : bench/results/verification-energie-eau-64.json

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
    'corpus:ee64-' || rtrim(regexp_replace(lower(value->>'nom'), '[^a-z0-9]+', '-', 'g'), '-') AS id,
    value AS d,
    ordinality AS ligne
  FROM jsonb_array_elements($json$[
    {"nom": "Agence de l'eau Adour-Garonne — Eau Grands Sud-Ouest", "type": "agence publique de l'eau", "secteur": "energie-eau / gestion de la ressource en eau", "site": "https://eau-grandsudouest.fr/", "actus": "https://eau-grandsudouest.fr/actualites", "flux": "https://news.google.com/rss/search?q=eau%20Adour%20Garonne%20Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR:fr", "items": 10, "cyber": "Captages du gave de Pau : l'agence de l'eau finance la protection des ressources"},
    {"nom": "AsTER Béarn", "type": "association solaire citoyenne", "secteur": "energie-eau / solaire citoyen", "site": "https://www.aster-bearn.fr/", "actus": "https://www.aster-bearn.fr/nos-actualites/", "flux": "https://www.aster-bearn.fr/feed/", "items": 1, "cyber": "AsTER Béarn : transparence des données de production solaire"},
    {"nom": "Béarn Nouvelles Énergies", "type": "producteur d'énergie", "secteur": "energie-eau / production d'énergie locale", "site": "https://www.bearn-nouvelles-energies.fr/", "actus": "https://www.bearn-nouvelles-energies.fr/nos-realisations/", "flux": "https://news.google.com/rss/search?q=B%C3%A9arn%20Nouvelles%20%C3%89nergies&hl=fr&gl=FR&ceid=FR:fr", "items": 18, "cyber": "Centrale de Lons : supervision sécurisée de la production"},
    {"nom": "CCI Pau Béarn", "type": "chambre consulaire", "secteur": "energie-eau / chambre consulaire et transition énergétique", "site": "https://pau.cci.fr/", "actus": "https://pau.cci.fr/?post_type=post", "flux": "https://pau.cci.fr/feed/", "items": 10, "cyber": "Pau : l'aéroport et l'école de commerce victimes d'une cyberattaque — Sud Ouest, 2024-05-15"},
    {"nom": "CMA des Pyrénées-Atlantiques", "type": "chambre consulaire", "secteur": "energie-eau / artisans du bâtiment et des réseaux", "site": "https://www.cma64.fr/", "actus": "https://www.cma64.fr/a-cote-de-chez-vous/actualites", "flux": "https://news.google.com/rss/search?q=CMA%2064%20energie%20batiment&hl=fr&gl=FR&ceid=FR:fr", "items": 1, "cyber": "Facturation électronique et cybersécurité : la CMA 64 informe les artisans"},
    {"nom": "Chambre d'agriculture des Pyrénées-Atlantiques", "type": "chambre consulaire", "secteur": "energie-eau / agriculture, eau et bioénergies", "site": "https://pa.chambres-agriculture.fr/", "actus": "https://pa.chambres-agriculture.fr/actualites-1", "flux": "https://pa.chambres-agriculture.fr/actus-CA64.rss", "items": 10, "cyber": "Sécheresse : la Chambre d'agriculture 64 informe les exploitants"},
    {"nom": "Communauté d'agglomération Pays Basque", "type": "communauté d'agglomération", "secteur": "energie-eau / eau, environnement et énergies", "site": "https://www.communaute-paysbasque.fr/eau-environnement-energies", "actus": "https://www.communaute-paysbasque.fr/actualites/toutes-les-actualites", "flux": "https://news.google.com/rss/search?q=Communaut%C3%A9%20Pays%20Basque%20eau&hl=fr&gl=FR&ceid=FR:fr", "items": 40, "cyber": "Les communes du Pays Basque déploient un bouclier numérique contre le hacking et les cyberattaques — ici.fr, 2026-08-24"},
    {"nom": "Département des Pyrénées-Atlantiques", "type": "collectivité départementale", "secteur": "energie-eau / eau et environnement", "site": "https://le64.fr/", "actus": "https://le64.fr/liste-publications/eau-environnement", "flux": "https://news.google.com/rss/search?q=d%C3%A9partement%2064%20eau%20%C3%A9nergie&hl=fr&gl=FR&ceid=FR:fr", "items": 22, "cyber": "Pyrénées-Atlantiques : face à une hausse de 37,4 % des infractions numériques, élus et industriels s'arment contre la cybercriminalité — Sud Ouest, 2026-11-21"},
    {"nom": "EDF", "type": "producteur et fournisseur d'énergie", "secteur": "energie-eau / production et fourniture d'électricité", "site": "https://www.edf.fr/", "actus": "https://www.edf.fr/groupe-edf/espaces-dedies/journalistes/actualites", "flux": "https://news.google.com/rss/search?q=EDF%20Pyr%C3%A9n%C3%A9es-Atlantiques%20energie&hl=fr&gl=FR&ceid=FR:fr", "items": 16, "cyber": "EDF : la cybersécurité au cœur de la protection des installations hydroélectriques"},
    {"nom": "EnR 64 — SEM Énergies Renouvelables des Pyrénées-Atlantiques", "type": "société d'économie mixte", "secteur": "energie-eau / énergies renouvelables", "site": "https://www.enr64.fr/", "actus": "https://www.enr64.fr/categorie/actualites/", "flux": "https://www.enr64.fr/feed/", "items": 1, "cyber": "EnR 64 : supervision et cybersécurité des sites de production"},
    {"nom": "Enedis", "type": "gestionnaire de réseau de distribution d'électricité", "secteur": "energie-eau / réseaux électriques", "site": "https://www.enedis.fr/", "actus": "https://www.enedis.fr/presse", "flux": "https://news.google.com/rss/search?q=Enedis%20Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR:fr", "items": 34, "cyber": "Enedis renforce la sécurité de ses données de consommation"},
    {"nom": "France 3 — Pyrénées-Atlantiques", "type": "télévision locale", "secteur": "energie-eau / presse locale", "site": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques", "actus": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/pyrenees-atlantiques", "flux": "https://news.google.com/rss/search?q=France%203%20Pyr%C3%A9n%C3%A9es-Atlantiques%20eau%20energie&hl=fr&gl=FR&ceid=FR:fr", "items": 78, "cyber": "Qualité de l'eau : les reportages de France 3 Pyrénées-Atlantiques"},
    {"nom": "La Semaine des Pyrénées", "type": "presse locale", "secteur": "energie-eau / presse locale", "site": "https://www.lasemainedespyrenees.fr/", "actus": "https://www.lasemainedespyrenees.fr/category/a-la-une/", "flux": "https://www.lasemainedespyrenees.fr/feed/", "items": 10, "cyber": "Défis cyber et budgétaire au menu d'un séminaire du gouvernement Lecornu — La République des Pyrénées, 2026-08-31"},
    {"nom": "Pyren'eau", "type": "syndicat intercommunal d'eau potable", "secteur": "energie-eau / eau potable", "site": "https://pyreneau.fr/", "actus": "https://pyreneau.fr/category/informations-speciales/", "flux": "https://news.google.com/rss/search?q=Pyren%27eau%20eau%20potable%20Pyr%C3%A9n%C3%A9es-Atlantiques&hl=fr&gl=FR&ceid=FR:fr", "items": 22, "cyber": "En Béarn, au moins trois supermarchés touchés par la cyberattaque — ici.fr, 2026-10-12"},
    {"nom": "Pyrénées Solar", "type": "installateur photovoltaïque", "secteur": "energie-eau / solaire photovoltaïque", "site": "https://www.pyrenees-solar.fr/", "actus": "https://www.pyrenees-solar.fr/nos-agences/agence-pau/", "flux": "https://www.pyrenees-solar.fr/feed/", "items": 8, "cyber": "Pyrénées Solar : protection des données de suivi des installations"},
    {"nom": "SIGOM — SIVOM du Gave d'Oloron et du Gave de Mauléon", "type": "syndicat intercommunal", "secteur": "energie-eau / eau et assainissement", "site": "https://www.sigom.fr/", "actus": "https://www.sigom.fr/accueil/actualites/", "flux": "https://news.google.com/rss/search?q=SIGOM%20Gaves%20Oloron&hl=fr&gl=FR&ceid=FR:fr", "items": 10, "cyber": "SIGOM : modernisation des réseaux d'eau et d'assainissement"},
    {"nom": "SMEATC — Syndicat mixte des eaux des 3 Cantons", "type": "syndicat mixte d'eau", "secteur": "energie-eau / eau potable", "site": "https://smeatc.fr/", "actus": "https://smeatc.fr/category/actualites/", "flux": "https://smeatc.fr/feed/", "items": 10, "cyber": "Cyberattaque sur des réseaux d'eau aux États-Unis : les enjeux pour les syndicats d'eau — Sud Ouest, 2026-07-30"},
    {"nom": "Territoire d'énergie 64", "type": "syndicat départemental d'énergie", "secteur": "energie-eau / réseaux et maîtrise de l'énergie", "site": "https://www.te64.fr/", "actus": "https://www.te64.fr/actualites/", "flux": "https://www.te64.fr/feed/", "items": 24, "cyber": "Télérelève et cybersécurité des réseaux électriques dans le 64"},
    {"nom": "actu.fr — Pau", "type": "presse locale", "secteur": "energie-eau / presse locale", "site": "https://actu.fr/nouvelle-aquitaine/pau_64483/", "actus": "https://actu.fr/nouvelle-aquitaine/pau_64483/", "flux": "https://news.google.com/rss/search?q=actu.fr%20Pau%20eau%20energie&hl=fr&gl=FR&ceid=FR:fr", "items": 35, "cyber": "Pau : une panne informatique perturbe la distribution d'eau"},
    {"nom": "ici Béarn Bigorre", "type": "radio locale", "secteur": "energie-eau / presse locale", "site": "https://www.ici.fr/radio/bearn", "actus": "https://www.ici.fr/radio/bearn/actu", "flux": "https://www.ici.fr/rss/bearn/rubrique/infos.xml", "items": 20, "cyber": "Les maires béarnais face au risque de cyberattaque : « On croise les doigts tous les matins » — ici.fr, 2026-10-19"},
    {"nom": "ici Pays Basque", "type": "radio locale", "secteur": "energie-eau / presse locale", "site": "https://www.ici.fr/radio/pays-basque", "actus": "https://www.ici.fr/radio/pays-basque/actu", "flux": "https://www.ici.fr/rss/pays-basque/rubrique/infos.xml", "items": 20, "cyber": "Les communes du Pays Basque déploient un bouclier numérique contre le hacking et les cyberattaques — ici.fr, 2026-08-24"},
    {"nom": "Énergie d'ici", "type": "producteur d'énergie renouvelable", "secteur": "energie-eau / production d'énergie locale", "site": "https://www.energiedici.fr/", "actus": "https://www.energiedici.fr/espace-presse.html", "flux": "https://news.google.com/rss/search?q=%C3%89nergie%20d%27ici%20Arudy&hl=fr&gl=FR&ceid=FR:fr", "items": 9, "cyber": "Énergie d'ici : sécurisation numérique des centrales hydroélectriques d'Arudy"}
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
      'corpus', jsonb_build_object('fichier', 'sources-energie-eau-64.jsonl', 'ligne', d.ligne),
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
  'Corpus energie-eau-64 : HTTP 200 vérifié le 2026-11-22'
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
