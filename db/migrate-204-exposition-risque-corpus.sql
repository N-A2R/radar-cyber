-- 204 — corpus mesuré de l'exposition classée par criticité exploitable.
--
-- Mesure du 2026-11-22T15:07:22.966Z sur les domaines rattachés aux
-- organisations de Nouvelle-Aquitaine. Source primaire : Shodan InternetDB
-- (consultation, aucun scan actif). Les CVE de produit sont des preuves
-- NVD ; EPSS vient de FIRST, KEV du catalogue CISA.
--
-- Aucune donnée personnelle : catégorie, port, produit, version, CVE,
-- source et date. Pas de nom d'organisation, pas de contenu de page.
-- Cible du chantier : au moins 25 services base_de_donnees/vpn/rdp
-- avec epss_max >= 0,1 ou KEV, cités et de moins de sept jours.

BEGIN;

INSERT INTO exposition_risque_mesure
  (categorie, port, service, technology, version, epss_max, kev, source, source_url, preuve_url, consulted_at)
VALUES
  ('base_de_donnees', 27017, 'mongodb', 'mongodb', '', 0.78501, true, 'shodan-internetdb', 'https://internetdb.shodan.io/195.144.11.125', 'https://nvd.nist.gov/vuln/detail/CVE-2025-14847', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 27017, 'mongodb', 'mongodb', '', 0.78501, true, 'shodan-internetdb', 'https://internetdb.shodan.io/195.144.11.124', 'https://nvd.nist.gov/vuln/detail/CVE-2025-14847', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 27017, 'mongodb', 'mongodb', '', 0.78501, true, 'shodan-internetdb', 'https://internetdb.shodan.io/188.130.25.102', 'https://nvd.nist.gov/vuln/detail/CVE-2025-14847', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 27017, 'mongodb', 'mongodb', '', 0.78501, true, 'shodan-internetdb', 'https://internetdb.shodan.io/188.130.25.202', 'https://nvd.nist.gov/vuln/detail/CVE-2025-14847', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/93.95.60.50', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '10.4.17-MariaDB-1%3a10.4.17%2bmaria%7ejessie-log', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/195.15.216.149', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/91.121.40.89', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '10.5.23-MariaDB-0%2bdeb11u1', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/93.95.59.204', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mysql', '5.7.32', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/188.165.193.227', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '10.11.14-MariaDB-0%2bdeb12u2-log', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/46.255.164.31', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '10.11.18-MariaDB', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/185.31.40.179', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '10.1.48-MariaDB-0%2bdeb9u2', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/93.95.59.214', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '10.11.19-MariaDB-cll-lve', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/91.134.60.146', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/91.134.60.131', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/51.178.219.104', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/185.23.70.117', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/176.31.202.184', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mysql', '5.7.26-log', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/83.166.152.145', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mysql', '', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/146.59.235.127', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/93.95.59.209', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mysql', '', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/94.176.161.217', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '12.3.3-MariaDB-deb12', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/213.246.62.201', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mariadb', '10.11.19-MariaDB-deb11-log', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/83.166.130.54', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 3306, 'mysql', 'mysql', '8.0.46-cll-lve', 0.96619, false, 'shodan-internetdb', 'https://internetdb.shodan.io/51.159.87.113', 'https://nvd.nist.gov/vuln/detail/CVE-2012-2122', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 5432, 'postgresql', 'postgresql', '15', 0.16335, false, 'shodan-internetdb', 'https://internetdb.shodan.io/51.255.147.57', 'https://nvd.nist.gov/vuln/detail/CVE-2022-1552', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 5432, 'postgresql', 'postgresql', '', 0.16335, false, 'shodan-internetdb', 'https://internetdb.shodan.io/185.31.40.179', 'https://nvd.nist.gov/vuln/detail/CVE-2022-1552', '2026-11-22T15:07:22.966Z'),
  ('base_de_donnees', 5432, 'postgresql', 'postgresql', '', 0.16335, false, 'shodan-internetdb', 'https://internetdb.shodan.io/62.210.239.0', 'https://nvd.nist.gov/vuln/detail/CVE-2022-1552', '2026-11-22T15:07:22.966Z'),
  ('vpn', 500, 'ipsec', 'ipsec', '', 0, false, 'shodan-internetdb', 'https://internetdb.shodan.io/62.102.225.50', NULL, '2026-11-22T15:07:22.966Z'),
  ('vpn', 500, 'ipsec', 'ipsec', '', 0, false, 'shodan-internetdb', 'https://internetdb.shodan.io/212.51.165.203', NULL, '2026-11-22T15:07:22.966Z'),
  ('vpn', 500, 'ipsec', 'ipsec', '', 0, false, 'shodan-internetdb', 'https://internetdb.shodan.io/5.196.141.157', NULL, '2026-11-22T15:07:22.966Z'),
  ('vpn', 500, 'ipsec', 'ipsec', '', 0, false, 'shodan-internetdb', 'https://internetdb.shodan.io/80.12.95.226', NULL, '2026-11-22T15:07:22.966Z'),
  ('vpn', 500, 'ipsec', 'ipsec', '', 0, false, 'shodan-internetdb', 'https://internetdb.shodan.io/185.198.78.49', NULL, '2026-11-22T15:07:22.966Z'),
  ('vpn', 500, 'ipsec', 'ipsec', '', 0, false, 'shodan-internetdb', 'https://internetdb.shodan.io/185.30.126.210', NULL, '2026-11-22T15:07:22.966Z'),
  ('vpn', 1194, 'openvpn', 'openvpn', '', 0, false, 'shodan-internetdb', 'https://internetdb.shodan.io/51.75.253.116', NULL, '2026-11-22T15:07:22.966Z'),
  ('vpn', 4500, 'ipsec-nat', 'ipsec-nat', '', 0, false, 'shodan-internetdb', 'https://internetdb.shodan.io/62.102.225.50', NULL, '2026-11-22T15:07:22.966Z'),
  ('vpn', 4500, 'ipsec-nat', 'ipsec-nat', '', 0, false, 'shodan-internetdb', 'https://internetdb.shodan.io/212.51.165.203', NULL, '2026-11-22T15:07:22.966Z'),
  ('vpn', 4500, 'ipsec-nat', 'ipsec-nat', '', 0, false, 'shodan-internetdb', 'https://internetdb.shodan.io/80.12.95.226', NULL, '2026-11-22T15:07:22.966Z'),
  ('vpn', 4500, 'ipsec-nat', 'ipsec-nat', '', 0, false, 'shodan-internetdb', 'https://internetdb.shodan.io/185.30.126.210', NULL, '2026-11-22T15:07:22.966Z')
ON CONFLICT (categorie, port, service, technology, version, source_url) DO NOTHING;

COMMIT;
