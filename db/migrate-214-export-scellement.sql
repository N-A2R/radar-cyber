-- 214 : horodatage qualifié de chaque export public par un jeton RFC 3161.
--
-- Une date de fichier (mtime, `export_run.created_at`) est réglable par
-- quiconque écrit le fichier : elle ne prouve pas que le contenu existait à
-- cette date. Le scellement RFC 3161 porte sur l'empreinte SHA-256 des octets
-- exacts livrés, et le jeton est émis par une TSA avant publication.
--
-- Le messageImprint du jeton couvre `sha256(sha256_fichier en ASCII)` : c'est
-- la même convention que l'ancrage du journal (`empreinteRacine`), ce qui
-- permet de revérifier le jeton avec l'outillage déjà publié.
--
-- La ligne est immuable : modifier un hash ou un `verify_ok` après coup ne doit
-- pas être possible. En cas d'échec de vérification, aucune ligne n'est écrite
-- (`verify_ok` est contraint à true), et l'export n'est pas publié.
--
-- Aucune donnée personnelle : ni titre, ni résumé, ni identifiant de victime.
-- Seuls des identifiants opaques d'export, des empreintes et des métadonnées
-- de TSA sont conservés.

BEGIN;

CREATE TABLE IF NOT EXISTS public.export_scellement (
  id                bigserial PRIMARY KEY,
  reference         text NOT NULL CHECK (length(reference) > 0),
  format            text NOT NULL CHECK (length(format) > 0),
  taille_octets     bigint NOT NULL CHECK (taille_octets >= 0),
  sha256_fichier    text NOT NULL CHECK (sha256_fichier ~ '^[0-9a-f]{64}$'),
  token_rfc3161     text NOT NULL CHECK (length(token_rfc3161) > 0),
  certificat_tsa    text NOT NULL CHECK (length(certificat_tsa) > 0),
  -- Identité du prestataire au regard de la liste nationale de confiance ;
  -- l'absence de qualification est écrite explicitement, jamais tue.
  prestataire_anssi text NOT NULL CHECK (length(prestataire_anssi) > 0),
  tsa_url           text NOT NULL CHECK (length(tsa_url) > 0),
  tsa_gen_time      text NOT NULL CHECK (length(tsa_gen_time) > 0),
  tsa_serial        text NOT NULL CHECK (length(tsa_serial) > 0),
  verify_ok         boolean NOT NULL DEFAULT true CHECK (verify_ok IS TRUE),
  fichier           text,
  exporte_le        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.export_scellement IS
  'Scellement RFC 3161 des exports publics : empreinte des octets livrés et jeton TSA vérifié. Immuable.';
COMMENT ON COLUMN public.export_scellement.sha256_fichier IS
  'SHA-256 des octets exacts du dossier téléchargé (hexadécimal minuscule).';
COMMENT ON COLUMN public.export_scellement.token_rfc3161 IS
  'TimeStampToken CMS (base64) dont le messageImprint couvre sha256(sha256_fichier ascii).';
COMMENT ON COLUMN public.export_scellement.prestataire_anssi IS
  'Prestataire déclaré et statut de sa qualification au regard de la liste nationale de confiance ANSSI.';
COMMENT ON COLUMN public.export_scellement.verify_ok IS
  'Vrai seulement après vérification locale du jeton ; la revérification hors système utilise OpenSSL.';
COMMENT ON COLUMN public.export_scellement.exporte_le IS
  'Instant de publication de l''export : heure du jeton TSA, jamais une date de fichier modifiable.';

CREATE INDEX IF NOT EXISTS export_scellement_exporte_le_idx
  ON public.export_scellement (exporte_le DESC);

-- Un même dossier ne doit pas produire deux preuves concurrentes.
CREATE UNIQUE INDEX IF NOT EXISTS export_scellement_reference_sha256_idx
  ON public.export_scellement (reference, sha256_fichier);

CREATE OR REPLACE FUNCTION public.export_scellement_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'scellement immuable : % interdit (export %)',
    TG_OP, OLD.reference
    USING HINT = 'Un scellement ne se corrige pas : publiez un nouvel export.';
END;
$$;

DROP TRIGGER IF EXISTS export_scellement_no_update ON public.export_scellement;
CREATE TRIGGER export_scellement_no_update
  BEFORE UPDATE OR DELETE ON public.export_scellement
  FOR EACH ROW EXECUTE FUNCTION public.export_scellement_append_only();

DROP TRIGGER IF EXISTS export_scellement_no_truncate ON public.export_scellement;
CREATE TRIGGER export_scellement_no_truncate
  BEFORE TRUNCATE ON public.export_scellement
  FOR EACH STATEMENT EXECUTE FUNCTION public.export_scellement_append_only();

COMMIT;
