-- 200 : configurations de certificats qui élargissent la surface d'attaque.
--
-- Trois motifs, calculés par apps/api/src/ctlogs/anomalies.ts à partir des
-- certificats observés dans les CT logs (et non à partir d'une présomption
-- d'incident) :
--   wildcard            : une identité SAN commence par '*.' ;
--   emetteur_hors_liste : l'émetteur n'apparaît pas dans la version courante
--                         de la liste blanche versionnée ci-dessous ;
--   certificat_etendu   : le certificat porte plus de cinq identités distinctes.
--
-- Une ligne décrit un élément fautif précis (une identité wildcard, une
-- identité supplémentaire, un émetteur) : un même certificat peut donc
-- produire plusieurs lignes de motifs différents. L'unicité porte sur
-- (certificat_id, motif, cible) pour rendre les rejeux idempotents.
--
-- Doctrine : un émetteur absent de la liste est un SIGNAL DE REVUE, jamais une
-- accusation. La liste ne contient que les chaînes déjà vérifiées sur
-- l'inventaire de Nouvelle-Aquitaine ; une autorité légitime absente s'ajoute
-- par une NOUVELLE version, sans jamais réécrire une version publiée.

CREATE TABLE IF NOT EXISTS ct_emetteur_whitelist (
  version         text NOT NULL,
  emetteur_norm   text NOT NULL,
  libelle         text NOT NULL,
  ajoute_le       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_ct_emetteur_whitelist UNIQUE (version, emetteur_norm)
);

-- Clé `emetteur_norm` produite par normaliserEmetteur() : valeurs O= et CN=
-- du DN, minuscules, triées, séparées par '|'. `libelle` conserve le DN
-- d'origine pour la revue humaine.
--
-- Version 2026-11-22 : autorités publiques rencontrées dans l'inventaire CT de
-- Nouvelle-Aquitaine (415 à 452 noms, 296 à 325 certificats).
INSERT INTO ct_emetteur_whitelist (version, emetteur_norm, libelle) VALUES
  ('2026-11-22', 'let''s encrypt|let''s encrypt authority x3', 'C=US, O=Let''s Encrypt, CN=Let''s Encrypt Authority X3'),
  ('2026-11-22', 'let''s encrypt|r3',  'C=US, O=Let''s Encrypt, CN=R3'),
  ('2026-11-22', 'let''s encrypt|r10', 'C=US, O=Let''s Encrypt, CN=R10'),
  ('2026-11-22', 'let''s encrypt|r11', 'C=US, O=Let''s Encrypt, CN=R11'),
  ('2026-11-22', 'let''s encrypt|r12', 'C=US, O=Let''s Encrypt, CN=R12'),
  ('2026-11-22', 'let''s encrypt|r13', 'C=US, O=Let''s Encrypt, CN=R13'),
  ('2026-11-22', 'let''s encrypt|r14', 'C=US, O=Let''s Encrypt, CN=R14'),
  ('2026-11-22', 'gandi|gandi standard ssl ca 2', 'C=FR, ST=Paris, L=Paris, O=Gandi, CN=Gandi Standard SSL CA 2'),
  ('2026-11-22', 'gandi sas|gandicert', 'C=FR, O=Gandi SAS, CN=GandiCert'),
  ('2026-11-22', 'certigna services ca|dhimyotis', 'C=FR, O=DHIMYOTIS, OU=0002 48146308100036, CN=Certigna Services CA'),
  ('2026-11-22', 'certinomis|certinomis - easy ca', 'C=FR, O=Certinomis, OU=0002 433998903, CN=Certinomis - Easy CA'),
  ('2026-11-22', 'certinomis|certinomis - web ca', 'C=FR, O=Certinomis, organizationIdentifier=NTRFR-433998903, CN=Certinomis - Web CA'),
  ('2026-11-22', 'sectigo limited|sectigo rsa domain validation secure server ca', 'C=GB, O=Sectigo Limited, CN=Sectigo RSA Domain Validation Secure Server CA'),
  ('2026-11-22', 'digicert inc|digicert tls rsa sha256 2020 ca1', 'C=US, O=DigiCert Inc, CN=DigiCert TLS RSA SHA256 2020 CA1'),
  ('2026-11-22', 'terena|terena ssl ca 3', 'C=NL, O=TERENA, CN=TERENA SSL CA 3'),
  ('2026-11-22', 'terena|terena ssl high assurance ca 3', 'C=NL, O=TERENA, CN=TERENA SSL High Assurance CA 3'),
  ('2026-11-22', 'geotrust inc.|geotrust ssl ca - g2', 'C=US, O=GeoTrust Inc., CN=GeoTrust SSL CA - G2')
ON CONFLICT (version, emetteur_norm) DO NOTHING;

CREATE TABLE IF NOT EXISTS ct_anomalie (
  id                bigserial PRIMARY KEY,
  certificat_id     text NOT NULL,
  motif             text NOT NULL CHECK (motif IN ('wildcard', 'emetteur_hors_liste', 'certificat_etendu')),
  cible             text NOT NULL,
  domaine           text,
  sous_domaine      text,
  emetteur          text,
  emetteur_norm     text,
  whitelist_version text NOT NULL,
  source            text,
  premiere_vue      timestamptz,
  detecte_le        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_ct_anomalie UNIQUE (certificat_id, motif, cible)
);

CREATE INDEX IF NOT EXISTS idx_ct_anomalie_motif
  ON ct_anomalie (motif);

CREATE INDEX IF NOT EXISTS idx_ct_anomalie_certificat
  ON ct_anomalie (certificat_id);

CREATE INDEX IF NOT EXISTS idx_ct_anomalie_emetteur
  ON ct_anomalie (emetteur_norm)
  WHERE motif = 'emetteur_hors_liste';
