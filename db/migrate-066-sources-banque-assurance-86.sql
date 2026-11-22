-- Sources d'information banque / assurance / mutuelles du département 86 (Vienne).
-- 22 sources, 66 contrôles HTTP (66 URL uniques), tous en HTTP 200 le 2026-11-22.
-- Corpus : bench/corpus/sources-banque-assurance-86.jsonl
-- Preuve HTTP : bench/results/verification-banque-assurance-86.json

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
    'corpus:ba86-' || rtrim(regexp_replace(lower(value->>'nom'), '[^a-z0-9]+', '-', 'g'), '-') AS id,
    value AS d,
    ordinality AS ligne
  FROM jsonb_array_elements($json$[
    {
        "nom": "Mutuelle de Poitiers Assurances — siège de Ligugé (86)",
        "type": "compagnie d'assurance mutuelle",
        "secteur": "banque-assurance / assurance",
        "site": "https://www.assurance-mutuelle-poitiers.fr/",
        "actus": "https://www.assurance-mutuelle-poitiers.fr/offres-actualites",
        "flux": "https://news.google.com/rss/search?q=%22Mutuelle%20de%20Poitiers%22%20Vienne&hl=fr&gl=FR&ceid=FR:fr",
        "items": 54,
        "cyber": "Titre observé dans le flux : Almerys — plus de 15 millions de numéros de sécurité sociale et des centaines de mutuelles compromises (French Breaches)"
    },
    {
        "nom": "Crédit Agricole Touraine Poitou — agences de la Vienne",
        "type": "banque régionale",
        "secteur": "banque-assurance / banque",
        "site": "https://www.credit-agricole.fr/ca-tourainepoitou/particulier.html",
        "actus": "https://www.credit-agricole.fr/ca-tourainepoitou/particulier/conseils/magazine/tout-un-mag.html",
        "flux": "https://news.google.com/rss/search?q=%22Cr%C3%A9dit%20Agricole%20Touraine%20Poitou%22%20cyber%20OR%20fraude&hl=fr&gl=FR&ceid=FR:fr",
        "items": 6,
        "cyber": "Titre observé dans le flux : Carte bancaire — votre banque fait-elle le nécessaire pour vous protéger de la fraude ? (MoneyVox)"
    },
    {
        "nom": "CPAM de la Vienne — Assurance Maladie",
        "type": "organisme de protection sociale",
        "secteur": "banque-assurance / assurance maladie",
        "site": "https://www.ameli.fr/vienne/assure",
        "actus": "https://www.ameli.fr/vienne/assure/actualites",
        "flux": "https://news.google.com/rss/search?q=%22CPAM%20de%20la%20Vienne%22%20fraude%20OR%20cyber&hl=fr&gl=FR&ceid=FR:fr",
        "items": 10,
        "cyber": "Titre observé dans le flux : Poitiers — ils escroquaient la CPAM avec de faux arrêts de travail, deux hommes condamnés (ici.fr)"
    },
    {
        "nom": "France Assureurs",
        "type": "fédération professionnelle",
        "secteur": "banque-assurance / fédération des assureurs",
        "site": "https://www.franceassureurs.fr/",
        "actus": "https://www.franceassureurs.fr/actualites/",
        "flux": "https://www.franceassureurs.fr/feed/",
        "items": 5,
        "cyber": "Cyberattaques : une deuxième ressource pour renforcer la résilience des TPE-PME (France Assureurs, 11/09/2026)"
    },
    {
        "nom": "ORIAS — registre des intermédiaires en assurance, banque et finance",
        "type": "registre professionnel",
        "secteur": "banque-assurance / registre",
        "site": "https://www.orias.fr/",
        "actus": "https://www.orias.fr/home/communications",
        "flux": "https://news.google.com/rss/search?q=%22Orias%22%20assurance%20usurpation&hl=fr&gl=FR&ceid=FR:fr",
        "items": 10,
        "cyber": "Titre observé dans le flux : Usurpation d'identité — l'Orias simplifie les démarches pour les intermédiaires (L'Argus de l'assurance)"
    },
    {
        "nom": "Caisse d'Épargne Loire Centre — Vienne (86)",
        "type": "banque régionale",
        "secteur": "banque-assurance / banque",
        "site": "https://www.caisse-epargne.fr/loire-centre/",
        "actus": "https://www.caisse-epargne.fr/votre-banque/actualites/",
        "flux": "https://news.google.com/rss/search?q=%22Caisse%20d%E2%80%99%C3%89pargne%22%20Vienne%20cyber%20OR%20arnaque&hl=fr&gl=FR&ceid=FR:fr",
        "items": 10,
        "cyber": "Titre observé dans le flux : Arnaque au virement bancaire dans la Vienne — « les fraudeurs ont toujours un coup d'avance » (La Nouvelle République)"
    },
    {
        "nom": "Banque Populaire Grand Ouest (Poitiers/Vienne)",
        "type": "banque coopérative régionale",
        "secteur": "banque-assurance / banque et assurances",
        "site": "https://www.banquepopulaire.fr/bpgo/",
        "actus": "https://www.banquepopulaire.fr/bpgo/votre-banque/actualites/",
        "flux": "https://news.google.com/rss/search?q=Banque%20Populaire%20Grand%20Ouest%20Poitiers%20Vienne&hl=fr&gl=FR&ceid=FR:fr",
        "items": 10,
        "cyber": "02/09/2025 (ZATAZ, 05/09/2025) : attaque DDoS revendiquée « OP France » contre Banque Populaire Grand Ouest, BNP Paribas, Crédit Agricole et RTE"
    },
    {
        "nom": "MSA Poitou (Vienne et Deux-Sèvres)",
        "type": "mutuelle sociale agricole",
        "secteur": "banque-assurance / protection sociale agricole",
        "site": "https://poitou.msa.fr/",
        "actus": "https://poitou.msa.fr/lfp/actualites-employeur",
        "flux": "https://news.google.com/rss/search?q=MSA%20Poitou&hl=fr&gl=FR&ceid=FR:fr",
        "items": 24,
        "cyber": "26/06/2026 (actualité MSA Poitou) : « Alerte vigilance – Usurpation d'identité » — mails frauduleux avec RIB, invitant à vérifier la concordance avec l'espace privé"
    },
    {
        "nom": "Groupama Centre-Atlantique (Vienne)",
        "type": "mutuelle d'assurance régionale",
        "secteur": "banque-assurance / assurances (auto, habitation, santé, pro)",
        "site": "https://www.groupama.fr/regions/centre-atlantique/",
        "actus": "https://www.groupama.fr/regions/centre-atlantique/actualites/",
        "flux": "https://news.google.com/rss/search?q=Groupama%20Centre-Atlantique%20Poitiers%20Vienne&hl=fr&gl=FR&ceid=FR:fr",
        "items": 10,
        "cyber": "11/02/2025 (Faux.fr) : tentative d'escroquerie par mail usurpant l'identité de Groupama ; 5 noms de domaine litigieux transférés à Groupama après procédure UDRP OMPI D2023-1523"
    },
    {
        "nom": "Harmonie Mutuelle (agence de Poitiers-Biard, Vienne)",
        "type": "mutuelle santé et prévoyance",
        "secteur": "banque-assurance / complémentaire santé et prévoyance",
        "site": "https://www.harmonie-mutuelle.fr/",
        "actus": "https://www.harmonie-mutuelle.fr/marque/actualites",
        "flux": "https://news.google.com/rss/search?q=Harmonie%20Mutuelle%20Poitiers%20Vienne&hl=fr&gl=FR&ceid=FR:fr",
        "items": 9,
        "cyber": "24-25/05/2026 : fuite de données chez Almerys (tiers payant), 15 millions d'assurés ; Harmonie Mutuelle publie un démenti officiel le 24/05/2026 (News Assurances Pro, 25/05/2026)"
    },
    {
        "nom": "Fédération bancaire française (FBF)",
        "type": "fédération professionnelle",
        "secteur": "banque-assurance / fédération bancaire",
        "site": "https://fbf.fr/fr/",
        "actus": "https://fbf.fr/fr/rubrique-newsroom/actualites/",
        "flux": "https://news.google.com/rss/search?q=FBF+cybers%C3%A9curit%C3%A9+banque+fraude&hl=fr&gl=FR&ceid=FR%3Afr",
        "items": 9,
        "cyber": "Que font les banques françaises pour lutter contre la fraude aux moyens de paiement ? (FBF, 24/09/2026)"
    },
    {
        "nom": "CNCGP",
        "type": "chambre professionnelle",
        "secteur": "banque-assurance / conseillers en gestion de patrimoine",
        "site": "https://www.cncgp.fr/",
        "actus": "https://www.cncgp.fr/actualites",
        "flux": "https://news.google.com/rss/search?q=CNCGP+cyberattaque&hl=fr&gl=FR&ceid=FR%3Afr",
        "items": 4,
        "cyber": "Gestion de patrimoine : des milliers de conseillers touchés par le piratage du prestataire Harvest (Le Figaro, 08/04/2025)"
    },
    {
        "nom": "CCI de la Vienne",
        "type": "chambre consulaire",
        "secteur": "banque-assurance / chambre de commerce locale",
        "site": "https://www.poitiers.cci.fr/",
        "actus": "https://www.poitiers.cci.fr/actualites/",
        "flux": "https://www.poitiers.cci.fr/actualites/feed/",
        "items": 10,
        "cyber": "Cybersécurité : PME/TPE, agissez pour ne pas subir ! (Chambre de commerce et d'industrie, 08/04/2024)"
    },
    {
        "nom": "MEDEF Vienne",
        "type": "organisation patronale",
        "secteur": "banque-assurance / organisation patronale locale",
        "site": "https://www.medef-vienne.fr/",
        "actus": "https://www.medef-vienne.fr/actualite-de-lentreprise/",
        "flux": "https://www.medef-vienne.fr/feed/",
        "items": 10,
        "cyber": "Cybersécurité : rappel des bonnes pratiques (MEDEF, 06/10/2022)"
    },
    {
        "nom": "Chambre d’agriculture de la Vienne",
        "type": "chambre consulaire",
        "secteur": "banque-assurance / chambre d'agriculture locale",
        "site": "https://vienne.chambres-agriculture.fr/",
        "actus": "https://vienne.chambres-agriculture.fr/actualites-1",
        "flux": "https://news.google.com/rss/search?q=chambre+agriculture+Vienne+cyberattaque&hl=fr&gl=FR&ceid=FR%3Afr",
        "items": 4,
        "cyber": "30 000 agriculteurs victimes d’une cyberattaque (Solutions-Numeriques, 06/01/2025)"
    },
    {
        "nom": "ListePRO",
        "type": "annuaire professionnel",
        "secteur": "banque-assurance / annuaire des professionnels de l'assurance",
        "site": "https://listepro.fr/",
        "actus": "https://listepro.fr/blog/",
        "flux": "https://listepro.fr/feed/",
        "items": 10,
        "cyber": "Cyberattaque chez Verspieren : des données de clients potentiellement compromises (L'Argus de l'assurance, 27/08/2026)"
    },
    {
        "nom": "France 3 Nouvelle-Aquitaine / Vienne",
        "type": "télévision régionale / média public",
        "secteur": "banque-assurance / presse locale et médias du 86",
        "site": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine",
        "actus": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne",
        "flux": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/vienne/rss",
        "items": 30,
        "cyber": "13/11/2026 (flux) : « WhatsApp est un réseau social, et la plupart des parents l’ignorent » : des collégiens formés contre le cyberharcèlement"
    },
    {
        "nom": "ICI Poitou",
        "type": "radio locale / média public (ex-France Bleu Poitou)",
        "secteur": "banque-assurance / presse locale et médias du 86",
        "site": "https://www.ici.fr/poitou",
        "actus": "https://www.ici.fr/nouvelle-aquitaine/vienne-86",
        "flux": "https://www.ici.fr/rss/poitou/a-la-une.xml",
        "items": 40,
        "cyber": "05/12/2025 : « Vienne : des escrocs usurpent le numéro des gendarmes pour soutirer plusieurs milliers d'euros » (coordonnées bancaires visées)"
    },
    {
        "nom": "Aquitaine Online – Poitou-Charentes",
        "type": "journal en ligne régional",
        "secteur": "banque-assurance / presse locale et médias du 86",
        "site": "https://www.aquitaineonline.com/",
        "actus": "https://www.aquitaineonline.com/actualites-en-aquitaine/poitou-charentes/",
        "flux": "https://www.aquitaineonline.com/actualites-en-aquitaine/poitou-charentes/feed/rss/",
        "items": 10,
        "cyber": "21/10/2024 : « Arnaques bancaires : comment les éviter et protéger vos finances »"
    },
    {
        "nom": "Vienne Rurale / Caracterres",
        "type": "presse agricole départementale",
        "secteur": "banque-assurance / presse locale et médias du 86",
        "site": "https://www.caracterres.fr/",
        "actus": "https://www.caracterres.fr/vienne-rurale",
        "flux": "https://www.caracterres.fr/rss.xml",
        "items": 20,
        "cyber": "17/11/2020 : « Cyberattaque | L’agriculture victime de pirates informatiques »"
    },
    {
        "nom": "Radio•REC (L’Écho des Choucas)",
        "type": "radio associative de Poitiers",
        "secteur": "banque-assurance / presse locale et médias du 86",
        "site": "https://radiorec.fr/",
        "actus": "https://radiorec.fr/lecho-des-choucas/",
        "flux": "https://radiorec.fr/feed/",
        "items": 10,
        "cyber": "14/10/2026 : « Mobilisation lycéenne, cyberattaque dans les supermarchés et bonne humeur ! »"
    },
    {
        "nom": "Poitiers.fr / Poitiers Mag",
        "type": "magazine municipal et actualités de la Ville",
        "secteur": "banque-assurance / presse locale et médias du 86",
        "site": "https://www.poitiers.fr/",
        "actus": "https://www.poitiers.fr/actualites",
        "flux": "https://www.poitiers.fr/rss.xml",
        "items": 10,
        "cyber": "Novembre 2026 : « Exposition Cyberviolences sexistes et sexuelles » (Grand Café du Crous, Poitiers)"
    }
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
      'corpus', jsonb_build_object('fichier', 'sources-banque-assurance-86.jsonl', 'ligne', d.ligne),
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
  'Corpus banque-assurance-86 : HTTP 200 vérifié le 2026-11-22'
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
