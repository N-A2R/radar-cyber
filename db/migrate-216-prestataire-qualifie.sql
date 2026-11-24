-- 216 : fiches des prestataires qualifiés rattachés au dossier Nouvelle-Aquitaine.
--
-- Une fiche ne peut afficher « qualifié » que si le catalogue officiel ANSSI
-- fournit trois preuves : la référence de la décision, la date d'octroi et la
-- date d'échéance. Aucune qualification n'est déduite d'un nom, d'un domaine
-- ou d'une mention de presse.
--
-- Source : catalogue ANSSI « Produits • Services • Profils de protection •
-- Sites certifiés • Qualifiés • Agréés », édition du 19/11/2026, téléchargé
-- le 23/11/2026 depuis messervices.cyber.gouv.fr. Il s'agit d'une source
-- NATIONALE : le champ `region` décrit le dossier de veille dans lequel la
-- fiche est produite, jamais le lieu du siège ni une prétendue liste régionale.
-- L'ancrage réellement vérifié est consigné dans `ancrage_regional`.

BEGIN;

CREATE TABLE IF NOT EXISTS anssi_extrait (
  id              text PRIMARY KEY,
  titre           text NOT NULL,
  url             text NOT NULL,
  edite_le        date NOT NULL,
  extrait_le      date NOT NULL,
  sha256_fichier  text NOT NULL CHECK (sha256_fichier ~ '^[0-9a-f]{64}$'),
  pages           text NOT NULL,
  note            text NOT NULL
);
COMMENT ON COLUMN anssi_extrait.edite_le IS
  'Edition date printed in the national catalogue; not the date of a regional collection.';
COMMENT ON TABLE anssi_extrait IS
  'Dated extract of the national ANSSI catalogue used as proof by provider qualification fiches.';


CREATE TABLE IF NOT EXISTS prestataire_qualifie (
  id                text PRIMARY KEY,
  nom               text NOT NULL CHECK (length(btrim(nom)) > 1),
  region            text NOT NULL DEFAULT 'Nouvelle-Aquitaine'
                    CHECK (region = 'Nouvelle-Aquitaine'),
  referentiel       text NOT NULL
                    CHECK (referentiel IN ('PACS', 'PASSI', 'PRIS', 'PDIS', 'SecNumCloud')),
  service           text NOT NULL CHECK (length(btrim(service)) > 1),
  reference_anssi   text NOT NULL CHECK (length(btrim(reference_anssi)) > 1),
  qualifie_le       date NOT NULL,
  validite_fin      date NOT NULL,
  active            boolean NOT NULL DEFAULT true,
  source_portee     text NOT NULL DEFAULT 'nationale' CHECK (source_portee = 'nationale'),
  ancrage_regional  text NOT NULL
                    CHECK (ancrage_regional IN ('siege_sirene', 'observation_dns_na', 'dossier_na')),
  extrait_id        text NOT NULL REFERENCES anssi_extrait(id),
  CONSTRAINT prestataire_qualifie_date_ordre CHECK (validite_fin > qualifie_le)
);

COMMENT ON TABLE prestataire_qualifie IS
  'Qualified providers documented for the Nouvelle-Aquitaine dossier, each row backed by a dated national ANSSI catalogue extract.';
COMMENT ON COLUMN prestataire_qualifie.reference_anssi IS
  'Decision identifier printed in the ANSSI catalogue column "Lien vers la decision de qualification".';
COMMENT ON COLUMN prestataire_qualifie.region IS
  'Scope of the regional dossier, not the provider headquarters. The ANSSI source remains national.';
COMMENT ON COLUMN prestataire_qualifie.ancrage_regional IS
  'siege_sirene = head office verified in SIRENE; observation_dns_na = observed on NA domains; dossier_na = national provider documented in the NA dossier.';

-- Une fiche active dont l'échéance est passée ne doit pas pouvoir être écrite.
-- Le juge externe vérifie la même règle avec une requête sur la table.
CREATE OR REPLACE FUNCTION verifier_prestataire_qualifie_actif()
RETURNS trigger AS $$
BEGIN
  IF NEW.active AND NEW.validite_fin < current_date THEN
    RAISE EXCEPTION
      'prestataire actif avec qualification echue: % (%) - echeance %',
      NEW.nom, NEW.reference_anssi, NEW.validite_fin;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prestataire_qualifie_actif ON prestataire_qualifie;
CREATE TRIGGER prestataire_qualifie_actif
  BEFORE INSERT OR UPDATE OF active, validite_fin ON prestataire_qualifie
  FOR EACH ROW EXECUTE FUNCTION verifier_prestataire_qualifie_actif();

INSERT INTO anssi_extrait (id, titre, url, edite_le, extrait_le, sha256_fichier, pages, note) VALUES (
  'catalogue-anssi-2026-11-19',
  'Catalogue ANSSI des produits, services, profils de protection et sites certifiés, qualifiés ou agréés — édition novembre 2026',
  'https://messervices.cyber.gouv.fr/visas/catalogue-produits-services-profils-de-protection-sites-certifies-qualifies-agrees-anssi.pdf',
  DATE '2026-11-19',
  DATE '2026-11-23',
  'bacf0616b839b6d25fc5c0d29d055370f8d22ef1c0f66f5ddcac61518bd8b87c',
  'PACS p.47 ; PASSI p.49-50 ; PRIS p.52 ; SecNumCloud p.78',
  'Source nationale ANSSI, téléchargée le 23/11/2026. Extrait daté et vérifiable : docs/qualification-anssi/extrait-catalogue-2026-11-19.md'
) ON CONFLICT (id) DO NOTHING;

-- Vingt fiches, une par prestataire, toutes appuyées par l'extrait ci-dessus.
-- Les montants de référence sont ceux imprimés dans le catalogue, sans
-- reconstruction ni extrapolation.
INSERT INTO prestataire_qualifie
  (id, nom, referentiel, service, reference_anssi, qualifie_le, validite_fin, ancrage_regional, extrait_id) VALUES
  ('adacis-passi-2728', 'Adacis', 'PASSI', 'Audit SSI — toutes activités', 'PASSI-2728', DATE '2026-04-20', DATE '2029-04-20', 'siege_sirene', 'catalogue-anssi-2026-11-19'),
  ('dipole-security-passi-2432', 'Dipole Security', 'PASSI', 'Audit SSI — toutes activités', 'PASSI-2432', DATE '2026-03-03', DATE '2029-03-03', 'siege_sirene', 'catalogue-anssi-2026-11-19'),
  ('heliaq-solutions-passi-3391', 'Heliaq Solutions', 'PASSI', 'Audit SSI — toutes activités', 'PASSI-3391', DATE '2026-07-31', DATE '2029-07-31', 'siege_sirene', 'catalogue-anssi-2026-11-19'),
  ('serma-safety-security-passi-435', 'Serma Safety & Security', 'PASSI', 'Audit SSI — toutes activités', 'PASSI-435', DATE '2025-03-14', DATE '2027-02-07', 'siege_sirene', 'catalogue-anssi-2026-11-19'),
  ('ovh-secnumcloud-3393', 'OVH', 'SecNumCloud', 'SNC Cloud Platform', 'SecNumCloud-3393', DATE '2026-07-31', DATE '2029-07-31', 'observation_dns_na', 'catalogue-anssi-2026-11-19'),
  ('orange-business-services-secnumcloud-1147', 'Orange Business Services', 'SecNumCloud', 'Cloud Avenue SecNum', 'SecNumCloud-1147', DATE '2025-07-11', DATE '2028-07-11', 'observation_dns_na', 'catalogue-anssi-2026-11-19'),
  ('orange-cyberdefense-passi-1473', 'Orange Cyberdefense', 'PASSI', 'Audit SSI — toutes activités', 'PASSI-1473', DATE '2025-09-11', DATE '2028-08-09', 'dossier_na', 'catalogue-anssi-2026-11-19'),
  ('thales-cyber-solutions-pris-1514', 'Thales Cyber Solutions', 'PRIS', 'Réponse aux incidents de sécurité', 'PRIS-1514', DATE '2025-09-18', DATE '2028-09-18', 'dossier_na', 'catalogue-anssi-2026-11-19'),
  ('accenture-sas-passi-4262', 'Accenture SAS', 'PASSI', 'Audit SSI — toutes activités', 'PASSI-4262', DATE '2026-11-10', DATE '2029-11-10', 'dossier_na', 'catalogue-anssi-2026-11-19'),
  ('capgemini-technology-services-passi-2246', 'Capgemini Technology Services', 'PASSI', 'Audit SSI — toutes activités', 'PASSI-2246', DATE '2026-02-04', DATE '2029-02-04', 'dossier_na', 'catalogue-anssi-2026-11-19'),
  ('cgi-france-passi-426', 'CGI France', 'PASSI', 'Audit SSI — toutes activités', 'PASSI-426', DATE '2025-03-14', DATE '2027-09-16', 'dossier_na', 'catalogue-anssi-2026-11-19'),
  ('atos-digital-security-passi-2470', 'Atos Digital Security', 'PASSI', 'Audit SSI — toutes activités', 'PASSI-2470', DATE '2026-03-09', DATE '2029-03-09', 'dossier_na', 'catalogue-anssi-2026-11-19'),
  ('advens-passi-421', 'Advens', 'PASSI', 'Audit SSI — toutes activités', 'PASSI-421', DATE '2025-03-14', DATE '2027-08-04', 'dossier_na', 'catalogue-anssi-2026-11-19'),
  ('airbus-protect-passi-422', 'Airbus Protect', 'PASSI', 'Audit SSI — organisation, architecture, configuration, tests d’intrusion', 'PASSI-422', DATE '2025-03-14', DATE '2027-11-05', 'dossier_na', 'catalogue-anssi-2026-11-19'),
  ('intrinsec-securite-passi-4257', 'Intrinsec Sécurité', 'PASSI', 'Audit SSI — toutes activités', 'PASSI-4257', DATE '2026-11-10', DATE '2029-12-22', 'dossier_na', 'catalogue-anssi-2026-11-19'),
  ('formind-passi-1872', 'Formind', 'PASSI', 'Audit SSI — toutes activités', 'PASSI-1872', DATE '2025-12-02', DATE '2028-05-27', 'dossier_na', 'catalogue-anssi-2026-11-19'),
  ('lexfo-passi-3046', 'Lexfo', 'PASSI', 'Audit SSI — toutes activités', 'PASSI-3046', DATE '2026-06-10', DATE '2028-12-07', 'dossier_na', 'catalogue-anssi-2026-11-19'),
  ('sopra-steria-pris-2064', 'Sopra Steria Infrastructures and Security', 'PRIS', 'Réponse aux incidents de sécurité', 'PRIS-2064', DATE '2025-12-18', DATE '2028-12-18', 'dossier_na', 'catalogue-anssi-2026-11-19'),
  ('cloud-temple-secnumcloud-919', 'Cloud Temple', 'SecNumCloud', 'PaaS Openshift', 'SecNumCloud-919', DATE '2025-05-30', DATE '2028-05-30', 'dossier_na', 'catalogue-anssi-2026-11-19'),
  ('alcyconie-pacs-4246', 'Alcyconie', 'PACS', 'Préparation à la gestion de crise d’origine cyber', 'PACS-4246', DATE '2026-11-10', DATE '2028-05-13', 'dossier_na', 'catalogue-anssi-2026-11-19')
ON CONFLICT (id) DO NOTHING;

COMMIT;
