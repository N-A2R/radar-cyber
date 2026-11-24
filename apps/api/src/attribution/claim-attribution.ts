/**
 * Règles d'attribution des revendications — pures, sans I/O ni base.
 *
 * Le libellé `leak_claim.group_name` est une donnée de collecte : on ne le
 * recopie jamais comme attribution. Une revendication n'est attribuée que si
 * elle cite une preuve ET si son groupe est reconnu dans le catalogue public
 * (`leak_site`). Sinon elle reste « non attribué » avec le code Admiralty F6.
 *
 * Le code est hiérarchique : lettre = fiabilité de la source (A-F), chiffre =
 * crédibilité de l'information (1-6). Les deux échelles et la valeur F6 sont
 * celles déjà utilisées par les exports (voir `export/trust-tags.ts`).
 */
import { ADMIRALTY, CONFIDENCE_INCONNUE } from "../export/trust-tags.js";

export const NON_ATTRIBUE = "non attribué";
export const CODE_NON_ATTRIBUE = CONFIDENCE_INCONNUE;
export const AUTEUR_SYSTEME = "systeme:regle-admiralty@1";
export const AUTEUR_SANS_PREUVE = "systeme:preuve-manquante@1";

export type GroupeConnu = { slug: string; nom: string };

export type RevendicationCandidate = {
  groupeLibre: string | null | undefined;
  evidenceUrl: string | null | undefined;
  source: string | null | undefined;
  corroboration: number | null | undefined;
  datePublication?: string | Date | null;
  groupesConnus: readonly GroupeConnu[];
};

export type AttributionCalculee = {
  groupe: string;
  codeAdmiralty: string;
  motif: string;
  auteur: string;
};

const SOURCES_OFFICIELLES: Record<string, true> = {
  anssi: true,
  certfr: true,
  cnil: true,
  gendarmerie: true,
  police: true,
  interieur: true,
};

const SOURCES_OSINT: Record<string, true> = {
  ransomlook: true,
  ransomwatch: true,
  "technical-sites": true,
  "bench-leak-site": true,
};

/** Clé de comparaison stable : casse, accents et ponctuation ignorés. */
export function cleGroupe(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function aUnePreuve(raw: string | null | undefined): boolean {
  if (typeof raw !== "string") return false;
  return /^https?:\/\/\S+$/i.test(raw.trim());
}

export function estCodeAdmiralty(raw: unknown): raw is string {
  return typeof raw === "string" && ADMIRALTY.test(raw.toUpperCase());
}

function fiabiliteSource(source: string | null | undefined): string {
  const cle = (source ?? "").trim().toLowerCase();
  if (SOURCES_OFFICIELLES[cle] === true) return "A";
  if (SOURCES_OSINT[cle] === true) return "C";
  return "D";
}

function dateValide(raw: string | Date | null | undefined): boolean {
  if (raw instanceof Date) return !Number.isNaN(raw.getTime());
  if (typeof raw !== "string" || raw.trim() === "") return false;
  return !Number.isNaN(new Date(raw).getTime());
}

/**
 * Calcule l'attribution d'une revendication. Les motifs sont des codes stables
 * (journalisables), pas des phrases libres.
 */
export function attribuerRevendication(input: RevendicationCandidate): AttributionCalculee {
  if (!aUnePreuve(input.evidenceUrl)) {
    return {
      groupe: NON_ATTRIBUE,
      codeAdmiralty: CODE_NON_ATTRIBUE,
      motif: "preuve-absente",
      auteur: AUTEUR_SANS_PREUVE,
    };
  }

  const nonAttribue: AttributionCalculee = {
    groupe: NON_ATTRIBUE,
    codeAdmiralty: CODE_NON_ATTRIBUE,
    motif: "groupe-inconnu",
    auteur: AUTEUR_SYSTEME,
  };

  const cle = cleGroupe(input.groupeLibre);
  if (cle === "") return nonAttribue;

  const groupe = input.groupesConnus.find(
    (candidat) => cleGroupe(candidat.slug) === cle || cleGroupe(candidat.nom) === cle,
  );
  if (!groupe) return nonAttribue;

  const corroboration = input.corroboration ?? 0;
  const credibilite = corroboration >= 2
    ? 1
    : corroboration >= 1
      ? 2
      : dateValide(input.datePublication)
        ? 3
        : 4;
  const motif = corroboration >= 2
    ? "corroboration-2"
    : corroboration >= 1
      ? "corroboration-1"
      : "source-groupe-connu";

  return {
    groupe: groupe.nom,
    codeAdmiralty: `${fiabiliteSource(input.source)}${credibilite}`,
    motif,
    auteur: AUTEUR_SYSTEME,
  };
}
