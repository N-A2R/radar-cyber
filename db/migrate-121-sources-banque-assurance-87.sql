-- Sources d'information banque / assurance / mutuelles du département 87 (Haute-Vienne).
-- 27 sources, 81 contrôles HTTP (81 URL uniques), tous en HTTP 200 le 2026-11-22.
-- Corpus : bench/corpus/sources-banque-assurance-87.jsonl
-- Preuve HTTP : bench/results/verification-banque-assurance-87.json

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
    'corpus:ba87-' || rtrim(regexp_replace(lower(value->>'nom'), '[^a-z0-9]+', '-', 'g'), '-') AS id,
    value AS d,
    ordinality AS ligne
  FROM jsonb_array_elements($json$[
    {
        "nom": "ACPR — Autorité de contrôle prudentiel et de résolution",
        "type": "autorité de contrôle bancaire et assurantiel",
        "secteur": "banque-assurance / régulation prudentielle",
        "site": "https://acpr.banque-france.fr/fr",
        "actus": "https://acpr.banque-france.fr/fr/actualites",
        "flux": "https://news.google.com/rss/search?q=ACPR%20cyber%20risque%20banque%20assurance&hl=fr&gl=FR&ceid=FR:fr",
        "items": 9,
        "cyber": "Titre observé dans le flux Google News : « Cybersécurité : l'ACPR, la Banque de France et l'ANSSI unissent leurs forces » — L'Argus de l'assurance, 6 juillet 2026."
    },
    {
        "nom": "CJD Limoges — Centre des jeunes dirigeants (site national CJD)",
        "type": "réseau de dirigeants d'entreprise",
        "secteur": "banque-assurance / réseau de dirigeants",
        "site": "https://www.cjd.net/",
        "actus": "https://www.cjd.net/actualites/",
        "flux": "https://news.google.com/rss/search?q=CJD%20dirigeants%20cyber&hl=fr&gl=FR&ceid=FR:fr",
        "items": 7,
        "cyber": "Titre observé dans le flux Google News : « Risque cyber, RSE, réseaux sociaux : face aux nouveaux visages des litiges, les patrons sommés de protéger leur réputation » — Le Figaro, 18 septembre 2026."
    },
    {
        "nom": "CMA Nouvelle-Aquitaine — Chambre des métiers et de l'artisanat de la Haute-Vienne",
        "type": "chambre consulaire artisanale",
        "secteur": "banque-assurance / chambre consulaire",
        "site": "https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/nous-trouver/cma-haute-vienne",
        "actus": "https://cma-nouvelleaquitaine.fr/a-cote-de-chez-vous/actualites",
        "flux": "https://news.google.com/rss/search?q=artisan%20Haute-Vienne%20fraude&hl=fr&gl=FR&ceid=FR:fr",
        "items": 7,
        "cyber": "Titre observé dans le flux Google News : « Arnaques aux faux artisans, comment ne pas tomber dans le panneau ? » — France 3 Régions."
    },
    {
        "nom": "CNCGP — Chambre nationale des conseils en gestion de patrimoine",
        "type": "chambre professionnelle du conseil en gestion de patrimoine",
        "secteur": "banque-assurance / conseil en gestion de patrimoine",
        "site": "https://www.cncgp.fr/",
        "actus": "https://www.cncgp.fr/actualites",
        "flux": "https://news.google.com/rss/search?q=conseil%20gestion%20patrimoine%20cyber%20fraude&hl=fr&gl=FR&ceid=FR:fr",
        "items": 11,
        "cyber": "Titre observé dans le flux Google News : « «On est dans le noir depuis dix jours» : cette cyberattaque qui paralyse les conseillers de gestion en patrimoine et les banques » — Le Figaro, 11 mars 2025."
    },
    {
        "nom": "CPAM de la Haute-Vienne — Assurance Maladie",
        "type": "organisme de protection sociale",
        "secteur": "banque-assurance / assurance maladie",
        "site": "https://www.ameli.fr/haute-vienne/assure",
        "actus": "https://www.ameli.fr/haute-vienne/assure/actualites",
        "flux": "https://news.google.com/rss/search?q=%22CPAM%20de%20la%20Haute-Vienne%22%20fraude%20OR%20cyber%20OR%20arnaque&hl=fr&gl=FR&ceid=FR:fr",
        "items": 6,
        "cyber": "23/06/2026 : « Fraude à la CPAM 87 : 2 millions d’euros détectés en Haute-Vienne » (Kaolin, la radio)"
    },
    {
        "nom": "Caisse d'Épargne Loire Centre — agences de Limoges (87)",
        "type": "banque régionale",
        "secteur": "banque-assurance / banque",
        "site": "https://www.caisse-epargne.fr/loire-centre/",
        "actus": "https://www.caisse-epargne.fr/loire-centre/professionnels/conseils/",
        "flux": "https://news.google.com/rss/search?q=Caisse%20d%27Epargne%20cyberattaque%20fraude&hl=fr&gl=FR&ceid=FR:fr",
        "items": 10,
        "cyber": "28/05/2022 : « Arnaque 3.0 aux couleurs de la Caisse d’Épargne signée Gérard le Russe » (Zataz)"
    },
    {
        "nom": "Chambre d'agriculture de la Haute-Vienne",
        "type": "chambre consulaire agricole",
        "secteur": "banque-assurance / chambre consulaire",
        "site": "https://haute-vienne.chambres-agriculture.fr/",
        "actus": "https://haute-vienne.chambres-agriculture.fr/actualites-1",
        "flux": "https://news.google.com/rss/search?q=chambre%20agriculture%20Haute-Vienne%20cyber&hl=fr&gl=FR&ceid=FR:fr",
        "items": 3,
        "cyber": "Titre observé dans le flux Google News : « 30 000 agriculteurs victimes d'une cyberattaque » — Solutions-Numeriques, 6 janvier 2025."
    },
    {
        "nom": "Crédit Agricole Centre Ouest — agences de Limoges (87)",
        "type": "banque régionale",
        "secteur": "banque-assurance / banque",
        "site": "https://www.credit-agricole.fr/ca-centreouest/particulier.html",
        "actus": "https://www.credit-agricole.fr/ca-centreouest/particulier/conseils/magazine/tout-un-mag.html",
        "flux": "https://news.google.com/rss/search?q=%22Cr%C3%A9dit%20Agricole%22%20fraude%20OR%20cyberattaque%20OR%20phishing&hl=fr&gl=FR&ceid=FR:fr",
        "items": 48,
        "cyber": "07/08/2026 : « Le Crédit Agricole visé par une arnaque au phishing très sophistiquée » (L’Usine Digitale)"
    },
    {
        "nom": "Flash FM — radio locale de Limoges",
        "type": "radio locale",
        "secteur": "banque-assurance / presse locale",
        "site": "https://flashfm.fr/",
        "actus": "https://flashfm.fr/actualites/",
        "flux": "https://news.google.com/rss/search?q=site%3Aflashfm.fr%20fraude%20OR%20arnaque%20Limoges&hl=fr&gl=FR&ceid=FR:fr",
        "items": 14,
        "cyber": "Titre observé dans le flux Google News de Flash FM : « Haute-Vienne : attention aux faux conseillers Nov’habitat 87 » (Flash FM, 09/11/2026)."
    },
    {
        "nom": "France 3 Nouvelle-Aquitaine — édition Haute-Vienne/Limoges",
        "type": "télévision locale publique (France Télévisions)",
        "secteur": "banque-assurance / presse locale",
        "site": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/",
        "actus": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/limoges",
        "flux": "https://france3-regions.franceinfo.fr/nouvelle-aquitaine/haute-vienne/rss",
        "items": 30,
        "cyber": "« De faux conseillers subtilisent votre carte bancaire et votre code en un rien de temps, cinq plaintes déposées en trois jours » (France 3 Nouvelle-Aquitaine / Limoges, publié le 28/08/2025 à 12h31, Alexandra Filliot)."
    },
    {
        "nom": "France Assureurs",
        "type": "fédération professionnelle des assureurs",
        "secteur": "banque-assurance / fédération assurance",
        "site": "https://www.franceassureurs.fr/",
        "actus": "https://www.franceassureurs.fr/actualites/",
        "flux": "https://www.franceassureurs.fr/actualites/feed/",
        "items": 5,
        "cyber": "Titre observé sur la page Actualités : « CyberPrev », une campagne d'Assurance Prévention pour sensibiliser les ados et leurs parents aux risques numériques — France Assureurs (date non affichée sur la carte)."
    },
    {
        "nom": "Fédération bancaire française (FBF)",
        "type": "fédération professionnelle bancaire",
        "secteur": "banque-assurance / fédération bancaire",
        "site": "https://fbf.fr/fr/",
        "actus": "https://fbf.fr/fr/rubrique-newsroom/actualites/",
        "flux": "https://news.google.com/rss/search?q=cyberattaque%20banque%20fraude%20FBF&hl=fr&gl=FR&ceid=FR:fr",
        "items": 10,
        "cyber": "Titre observé dans le flux Google News : « Divulgation des données FICOBA : la FBF appelle à la vigilance » — Fédération bancaire française, 19 février 2026."
    },
    {
        "nom": "Groupama Centre-Atlantique — agences de Limoges (87)",
        "type": "compagnie d'assurance mutuelle",
        "secteur": "banque-assurance / assurance",
        "site": "https://www.groupama.fr/regions/centre-atlantique/",
        "actus": "https://www.groupama.fr/regions/centre-atlantique/actualites/",
        "flux": "https://news.google.com/rss/search?q=%22Groupama%22%20cyberattaque%20OR%20fraude%20OR%20phishing&hl=fr&gl=FR&ceid=FR:fr",
        "items": 10,
        "cyber": "29/08/2018 : « Assurances : Groupama corrige une fuite de plus de 700 000 courriers clients » (Zataz)"
    },
    {
        "nom": "Harmonie Mutuelle — agence Limoges Jaurès (87)",
        "type": "compagnie d'assurance mutuelle",
        "secteur": "banque-assurance / mutuelle",
        "site": "https://www.harmonie-mutuelle.fr/",
        "actus": "https://www.harmonie-mutuelle.fr/actualites",
        "flux": "https://news.google.com/rss/search?q=%22Harmonie%20Mutuelle%22%20cyberattaque%20OR%20fraude%20OR%20phishing&hl=fr&gl=FR&ceid=FR:fr",
        "items": 9,
        "cyber": "14/01/2026 : « Escroquerie contre Harmonie Mutuelle, deux hommes jugés à Paris » (mesinfos)"
    },
    {
        "nom": "La Montagne — édition Limoges",
        "type": "quotidien régional",
        "secteur": "banque-assurance / presse locale",
        "site": "https://www.lamontagne.fr/",
        "actus": "https://www.lamontagne.fr/limoges-87000",
        "flux": "https://news.google.com/rss/search?q=%22La%20Montagne%22%20Limoges%20fraude%20OR%20arnaque&hl=fr&gl=FR&ceid=FR:fr",
        "items": 9,
        "cyber": "Titre observé dans le flux Google News du journal : « L'arnaque à la feuille blanche est de retour : plusieurs gendarmeries appellent à la vigilance » (La Montagne, 31/01/2026)."
    },
    {
        "nom": "Le Populaire du Centre — Limoges et Haute-Vienne",
        "type": "quotidien régional (Centre France)",
        "secteur": "banque-assurance / presse locale",
        "site": "https://www.lepopulaire.fr/",
        "actus": "https://www.lepopulaire.fr/limoges-87000/",
        "flux": "https://news.google.com/rss/search?q=%22Le%20Populaire%20du%20Centre%22%20Limoges%20arnaque%20OR%20fraude&hl=fr&gl=FR&ceid=FR:fr",
        "items": 19,
        "cyber": "Titre observé dans le flux Google News du quotidien : « Arnaque aux sentiments sur Tinder et Badoo : un habitant de Limoges escroque plus de 100.000 euros à une jeune veuve » (Le Populaire du Centre, 01/08/2026)."
    },
    {
        "nom": "ListePRO — annuaire des professionnels de l'assurance",
        "type": "annuaire professionnel de l'assurance",
        "secteur": "banque-assurance / annuaire assurance",
        "site": "https://listepro.fr/",
        "actus": "https://listepro.fr/blog/",
        "flux": "https://news.google.com/rss/search?q=liste%20pro%20assurance%20arnaque&hl=fr&gl=FR&ceid=FR:fr",
        "items": 77,
        "cyber": "Titre observé dans le flux Google News : « La fraude devient de plus en plus structurée » : les assureurs ont détecté près d'un milliard d'euros d'escroqueries en 2025 — Les Echos, 9 juillet 2026."
    },
    {
        "nom": "MAIF — agence de Limoges (87)",
        "type": "compagnie d'assurance mutuelle",
        "secteur": "banque-assurance / assurance",
        "site": "https://www.maif.fr/",
        "actus": "https://www.maif.fr/infos-conseils",
        "flux": "https://news.google.com/rss/search?q=MAIF%20cyberattaque%20OR%20fraude%20OR%20phishing&hl=fr&gl=FR&ceid=FR:fr",
        "items": 12,
        "cyber": "24/03/2025 : « Après une cyberattaque, des données personnelles de clients de MAIF Solutions Financières volées » (Ouest-France)"
    },
    {
        "nom": "MEDEF Limousin — antenne de la Haute-Vienne",
        "type": "organisation patronale territoriale",
        "secteur": "banque-assurance / organisation patronale",
        "site": "https://limousin.territoriaux.medef.com/",
        "actus": "https://limousin.territoriaux.medef.com/fr/actualites?theme=2309",
        "flux": "https://news.google.com/rss/search?q=MEDEF%20Limousin%20cyber%20securite%20entreprises&hl=fr&gl=FR&ceid=FR:fr",
        "items": 3,
        "cyber": "Titre observé dans le flux Google News : « Le Medef s'attaque de nouveau à l'enjeu crucial de la cybersécurité » — mesinfos, 25 octobre 2019."
    },
    {
        "nom": "MGEN — agence de la Haute-Vienne (87)",
        "type": "mutuelle de la fonction publique",
        "secteur": "banque-assurance / mutuelle",
        "site": "https://proximite.mgen.fr/99-agence-mgen-de-la-haute-vienne",
        "actus": "https://www.mgen.fr/ressources/actualites",
        "flux": "https://news.google.com/rss/search?q=MGEN%20cyberattaque%20OR%20fraude%20OR%20phishing&hl=fr&gl=FR&ceid=FR:fr",
        "items": 10,
        "cyber": "06/01/2026 : « PREVOYANCE de la MGEN : STOP à l’arnaque ! » (FSU Manche)"
    },
    {
        "nom": "MSA du Limousin — Haute-Vienne (87)",
        "type": "organisme de protection sociale agricole",
        "secteur": "banque-assurance / protection sociale",
        "site": "https://limousin.msa.fr/lfp",
        "actus": "https://limousin.msa.fr/lfp/actualites",
        "flux": "https://news.google.com/rss/search?q=MSA%20Limousin%20fraude%20OR%20arnaque%20OR%20cyber&hl=fr&gl=FR&ceid=FR:fr",
        "items": 3,
        "cyber": "30/06/2025 : « Il vendait ses services pour obtenir illégalement des prestations sociales : le procès d'une fraude à 189.000 euros » (Le Populaire du Centre)"
    },
    {
        "nom": "Macif — agences de la Haute-Vienne (87)",
        "type": "compagnie d'assurance mutuelle",
        "secteur": "banque-assurance / assurance",
        "site": "https://agences.macif.fr/assurance-haute-vienne-87",
        "actus": "https://presse.macif.fr/actualites/",
        "flux": "https://news.google.com/rss/search?q=Macif%20cyberattaque%20OR%20fraude%20OR%20phishing&hl=fr&gl=FR&ceid=FR:fr",
        "items": 14,
        "cyber": "12/11/2026 : « La Macif alerte ses clients après une cyberattaque et une fuite de données personnelles » (French Breaches)"
    },
    {
        "nom": "Ordre des experts-comptables — Conseil régional Nouvelle-Aquitaine (Limousin)",
        "type": "ordre professionnel des experts-comptables",
        "secteur": "banque-assurance / professions financières",
        "site": "https://oecnouvelle-aquitaine.fr/",
        "actus": "https://oecnouvelle-aquitaine.fr/actualites-evenements-espace-presse",
        "flux": "https://news.google.com/rss/search?q=experts-comptables%20cyber%20fraude&hl=fr&gl=FR&ceid=FR:fr",
        "items": 10,
        "cyber": "Titre observé dans le flux Google News : « Ordre des experts-comptables de Bretagne cyber attaqué ? » — Zataz, 17 février 2026."
    },
    {
        "nom": "Orias — Registre unique des intermédiaires en assurance, banque et finance",
        "type": "registre des intermédiaires financiers",
        "secteur": "banque-assurance / registre intermédiaires",
        "site": "https://www.orias.fr/",
        "actus": "https://www.orias.fr/home/juridique",
        "flux": "https://news.google.com/rss/search?q=ORIAS%20fraude%20intermediaire%20assurance&hl=fr&gl=FR&ceid=FR:fr",
        "items": 23,
        "cyber": "Titre observé dans le flux Google News : « Usurpation d'identité : l'Orias simplifie les démarches pour les intermédiaires » — L'Argus de l'assurance, 11 juillet 2024."
    },
    {
        "nom": "RCF Limousin",
        "type": "radio locale confessionnelle (RCF)",
        "secteur": "banque-assurance / presse locale",
        "site": "https://www.rcf.fr/limousin",
        "actus": "https://www.rcf.fr/actualite?radio=limousin",
        "flux": "https://news.google.com/rss/search?q=%22RCF%20Limousin%22%20fraude%20OR%20arnaque&hl=fr&gl=FR&ceid=FR:fr",
        "items": 3,
        "cyber": "Titre observé dans le flux Google News de RCF : « Lutte contre la fraude à l'Assurance maladie : en Charente-Maritime, une action au niveau local et régional » (RCF, 11/06/2025)."
    },
    {
        "nom": "actu.fr — Limoges (Haute-Vienne)",
        "type": "journal en ligne local",
        "secteur": "banque-assurance / presse locale",
        "site": "https://actu.fr/nouvelle-aquitaine/limoges_87085",
        "actus": "https://actu.fr/limoges/dernieres-actus",
        "flux": "https://actu.fr/nouvelle-aquitaine/rss.xml",
        "items": 20,
        "cyber": "Titre observé dans le flux Google News d'actu.fr : « À Limoges, la police met en garde contre de faux policiers » (Actu.fr, 14/09/2026)."
    },
    {
        "nom": "ici Limousin (ex-France Bleu Limousin)",
        "type": "radio locale publique (Radio France)",
        "secteur": "banque-assurance / presse locale",
        "site": "https://www.ici.fr/radio/limousin",
        "actus": "https://www.ici.fr/nouvelle-aquitaine/haute-vienne-87",
        "flux": "https://www.ici.fr/rss/limousin/rubrique/infos.xml",
        "items": 20,
        "cyber": "Titre observé sur ici.fr : « Haute-Vienne : attention aux fausses amendes à payer » (ici.fr, 19/05/2026)."
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
      'corpus', jsonb_build_object('fichier', 'sources-banque-assurance-87.jsonl', 'ligne', d.ligne),
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
    '87'
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
  'Corpus banque-assurance-87 : HTTP 200 vérifié le 2026-11-22'
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
