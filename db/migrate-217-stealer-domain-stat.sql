-- 217 — exposition des domaines régionaux par métadonnées de stealer logs.
--
-- Une ligne = un domaine observé pour une source, jamais une victime. Les
-- colonnes sont volontairement pauvres : domaine, source, occurrences et
-- bornes temporelles. Aucun courriel, mot de passe, identifiant de compte,
-- IP ou contenu de log n'a sa place ici.
--
-- Le jeu semé est un fixture HIBP domain search **enregistré** : cinq réponses
-- fictives, cinquante domaines `*.example`, source explicitement marquée
-- `hibp-domain-search-fixture`. Aucune source nationale réelle n'est
-- présentée comme une donnée locale : ces lignes mesurent le contrat
-- d'ingestion, pas une fuite observée en Nouvelle-Aquitaine.
--
-- Les contraintes refusent à l'écriture toute chaîne contenant '@', toute
-- valeur qui n'est pas un domaine DNS valide et tout marqueur de secret
-- (`password`, `mdp`, `mot de passe`, ...). Le refus vaut aussi pour un
-- INSERT SQL direct : la protection ne dépend pas du connecteur.
BEGIN;

CREATE TABLE IF NOT EXISTS stealer_domain_stat (
  domaine      text    NOT NULL,
  source       text    NOT NULL,
  occurrences  integer NOT NULL,
  premiere_vue date    NOT NULL,
  derniere_vue date    NOT NULL,

  CONSTRAINT stealer_domain_stat_pk PRIMARY KEY (domaine, source),

  CONSTRAINT stealer_domain_stat_domaine_dns CHECK (
    length(domaine) <= 253
    AND domaine !~ '@'
    AND domaine ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  ),

  CONSTRAINT stealer_domain_stat_source_permise CHECK (
    length(source) BETWEEN 3 AND 64
    AND source !~ '@'
    AND source ~ '^[a-z0-9][a-z0-9._-]{2,63}$'
  ),

  CONSTRAINT stealer_domain_stat_sans_secret CHECK (
    domaine !~* '(password|passwd|mdp|secret|mot[-_ ]?de[-_ ]?passe|hunter2|qwerty|azerty|123456)'
    AND source !~* '(password|passwd|mdp|secret|mot[-_ ]?de[-_ ]?passe|hunter2|qwerty|azerty|123456)'
  ),

  CONSTRAINT stealer_domain_stat_occurrences_positives CHECK (occurrences > 0),
  CONSTRAINT stealer_domain_stat_dates_ordonnees CHECK (premiere_vue <= derniere_vue)
);

CREATE INDEX IF NOT EXISTS stealer_domain_stat_source_idx ON stealer_domain_stat (source);
CREATE INDEX IF NOT EXISTS stealer_domain_stat_derniere_vue_idx ON stealer_domain_stat (derniere_vue);

-- Cinquante domaines fictifs, identiques à la sortie normalisée des fixtures
-- `bench/fixtures/hibp-domain-search/*.json` (snapshot inclus).
INSERT INTO stealer_domain_stat (domaine, source, occurrences, premiere_vue, derniere_vue)
VALUES
  ('etab-01.bordeaux.example', 'hibp-domain-search-fixture', 2, '2023-01-18'::date, '2023-02-16'::date),
  ('etab-02.limoges.example', 'hibp-domain-search-fixture', 3, '2023-02-04'::date, '2023-04-03'::date),
  ('etab-03.poitiers.example', 'hibp-domain-search-fixture', 1, '2023-02-21'::date, '2023-02-21'::date),
  ('etab-04.angouleme.example', 'hibp-domain-search-fixture', 2, '2023-03-10'::date, '2023-04-08'::date),
  ('etab-05.perigueux.example', 'hibp-domain-search-fixture', 3, '2023-03-27'::date, '2023-05-24'::date),
  ('etab-06.la-rochelle.example', 'hibp-domain-search-fixture', 1, '2023-04-13'::date, '2023-04-13'::date),
  ('etab-07.niort.example', 'hibp-domain-search-fixture', 2, '2023-04-30'::date, '2023-05-29'::date),
  ('etab-08.brive.example', 'hibp-domain-search-fixture', 3, '2023-05-17'::date, '2023-07-14'::date),
  ('etab-09.pau.example', 'hibp-domain-search-fixture', 1, '2023-06-03'::date, '2023-06-03'::date),
  ('etab-10.agen.example', 'hibp-domain-search-fixture', 2, '2023-06-20'::date, '2023-07-19'::date),
  ('etab-11.bordeaux.example', 'hibp-domain-search-fixture', 3, '2023-07-07'::date, '2023-09-03'::date),
  ('etab-12.limoges.example', 'hibp-domain-search-fixture', 1, '2023-07-24'::date, '2023-07-24'::date),
  ('etab-13.poitiers.example', 'hibp-domain-search-fixture', 2, '2023-08-10'::date, '2023-09-08'::date),
  ('etab-14.angouleme.example', 'hibp-domain-search-fixture', 3, '2023-08-27'::date, '2023-10-24'::date),
  ('etab-15.perigueux.example', 'hibp-domain-search-fixture', 1, '2023-09-13'::date, '2023-09-13'::date),
  ('etab-16.la-rochelle.example', 'hibp-domain-search-fixture', 2, '2023-09-30'::date, '2023-10-29'::date),
  ('etab-17.niort.example', 'hibp-domain-search-fixture', 3, '2023-10-17'::date, '2023-12-14'::date),
  ('etab-18.brive.example', 'hibp-domain-search-fixture', 1, '2023-11-03'::date, '2023-11-03'::date),
  ('etab-19.pau.example', 'hibp-domain-search-fixture', 2, '2023-11-20'::date, '2023-12-19'::date),
  ('etab-20.agen.example', 'hibp-domain-search-fixture', 3, '2023-12-07'::date, '2024-02-03'::date),
  ('etab-21.bordeaux.example', 'hibp-domain-search-fixture', 1, '2023-12-24'::date, '2023-12-24'::date),
  ('etab-22.limoges.example', 'hibp-domain-search-fixture', 2, '2024-01-10'::date, '2024-02-08'::date),
  ('etab-23.poitiers.example', 'hibp-domain-search-fixture', 3, '2024-01-27'::date, '2024-03-25'::date),
  ('etab-24.angouleme.example', 'hibp-domain-search-fixture', 1, '2024-02-13'::date, '2024-02-13'::date),
  ('etab-25.perigueux.example', 'hibp-domain-search-fixture', 2, '2024-03-01'::date, '2024-03-30'::date),
  ('etab-26.la-rochelle.example', 'hibp-domain-search-fixture', 3, '2024-03-18'::date, '2024-05-15'::date),
  ('etab-27.niort.example', 'hibp-domain-search-fixture', 1, '2024-04-04'::date, '2024-04-04'::date),
  ('etab-28.brive.example', 'hibp-domain-search-fixture', 2, '2024-04-21'::date, '2024-05-20'::date),
  ('etab-29.pau.example', 'hibp-domain-search-fixture', 3, '2024-05-08'::date, '2024-07-05'::date),
  ('etab-30.agen.example', 'hibp-domain-search-fixture', 1, '2024-05-25'::date, '2024-05-25'::date),
  ('etab-31.bordeaux.example', 'hibp-domain-search-fixture', 2, '2024-06-11'::date, '2024-07-10'::date),
  ('etab-32.limoges.example', 'hibp-domain-search-fixture', 3, '2024-06-28'::date, '2024-08-25'::date),
  ('etab-33.poitiers.example', 'hibp-domain-search-fixture', 1, '2024-07-15'::date, '2024-07-15'::date),
  ('etab-34.angouleme.example', 'hibp-domain-search-fixture', 2, '2024-08-01'::date, '2024-08-30'::date),
  ('etab-35.perigueux.example', 'hibp-domain-search-fixture', 3, '2024-08-18'::date, '2024-10-15'::date),
  ('etab-36.la-rochelle.example', 'hibp-domain-search-fixture', 1, '2024-09-04'::date, '2024-09-04'::date),
  ('etab-37.niort.example', 'hibp-domain-search-fixture', 2, '2024-09-21'::date, '2024-10-20'::date),
  ('etab-38.brive.example', 'hibp-domain-search-fixture', 3, '2024-10-08'::date, '2024-12-05'::date),
  ('etab-39.pau.example', 'hibp-domain-search-fixture', 1, '2024-10-25'::date, '2024-10-25'::date),
  ('etab-40.agen.example', 'hibp-domain-search-fixture', 2, '2024-11-11'::date, '2024-12-10'::date),
  ('etab-41.bordeaux.example', 'hibp-domain-search-fixture', 3, '2024-11-28'::date, '2025-01-25'::date),
  ('etab-42.limoges.example', 'hibp-domain-search-fixture', 1, '2024-12-15'::date, '2024-12-15'::date),
  ('etab-43.poitiers.example', 'hibp-domain-search-fixture', 2, '2025-01-01'::date, '2025-01-30'::date),
  ('etab-44.angouleme.example', 'hibp-domain-search-fixture', 3, '2025-01-18'::date, '2025-03-17'::date),
  ('etab-45.perigueux.example', 'hibp-domain-search-fixture', 1, '2025-02-04'::date, '2025-02-04'::date),
  ('etab-46.la-rochelle.example', 'hibp-domain-search-fixture', 2, '2025-02-21'::date, '2025-03-22'::date),
  ('etab-47.niort.example', 'hibp-domain-search-fixture', 3, '2025-03-10'::date, '2025-05-07'::date),
  ('etab-48.brive.example', 'hibp-domain-search-fixture', 1, '2025-03-27'::date, '2025-03-27'::date),
  ('etab-49.pau.example', 'hibp-domain-search-fixture', 2, '2025-04-13'::date, '2025-05-12'::date),
  ('etab-50.agen.example', 'hibp-domain-search-fixture', 3, '2023-01-09'::date, '2025-05-29'::date)
ON CONFLICT (domaine, source) DO UPDATE SET
  occurrences = EXCLUDED.occurrences,
  premiere_vue = EXCLUDED.premiere_vue,
  derniere_vue = EXCLUDED.derniere_vue;

COMMIT;
