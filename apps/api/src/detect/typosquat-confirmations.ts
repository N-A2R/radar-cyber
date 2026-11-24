/**
 * Evidence-backed adjudication of the raw typosquat alarms.
 *
 * A raw alarm is a DNS-active lookalike with similarity >= 0.8. This module
 * records an explicit, sealed decision for every alarm: either a typosquat
 * with independent evidence, or a rejected alert with the reason why. It
 * never invents a page or a certificate when the passive probe found none.
 */
import { createHash } from "node:crypto";
import { deaccent } from "./typosquat.js";

export type AlerteKind = "omission" | "transposition" | "substitution" | "tiret" | "homoglyphe" | "tld";

export interface AlerteConfirmation {
  domain: string;
  base: string;
  orgName: string;
  kind: AlerteKind;
  similarity: number;
  certificate?: unknown | null;
  pageTitle?: string | null;
}

export interface Confirmation {
  domain: string;
  base: string;
  orgName: string;
  kind: AlerteKind;
  similarity: number;
  statut: "usurpation" | "benigne";
  motifs: string[];
  preuves: string[];
  empreinte: string;
}

export interface ResultatConfirmations {
  candidats: number;
  confirmes: number;
  usurpations: number;
  benignes: number;
  confirmations: Confirmation[];
}

const PARKING = [
  "domain for sale", "domain name for sale", "en vente", "parked", "namecheap",
  "coming soon", "website temporarily unavailable", "acheter ce domaine",
];
const CREDENTIAL_TITLE = /password|login|connexion|mot de passe|credential|verify your/i;
const GENERIC: Record<string, true> = {
  commune: true, ville: true, mairie: true, societe: true, etablissement: true,
  centre: true, hopital: true, universite: true, association: true, groupe: true,
  france: true, de: true, du: true, la: true, le: true, des: true,
};

function lisible(value: string | null | undefined): string {
  return deaccent((value ?? "").replace(/&(?:nbsp|amp|quot|#39);/g, " ")).replace(/\s+/g, " ").trim();
}

function tokensOrganisation(name: string): string[] {
  return lisible(name)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 5 && GENERIC[t] !== true);
}

/** Decision without the seal: pure, deterministic, and offline-testable. */
export function classerAlerte(
  alerte: AlerteConfirmation,
  fluxPhishing: ReadonlySet<string>,
): Omit<Confirmation, "empreinte"> {
  const titre = lisible(alerte.pageTitle);
  const preuves = ["dns-actif", "page-sonde"];
  if (alerte.certificate) preuves.push("certificat");
  if (titre) preuves.push("titre-page");
  if (fluxPhishing.has(alerte.domain)) preuves.push("openphish-present");
  else if (fluxPhishing.size > 0) preuves.push("openphish-absent");

  if (fluxPhishing.has(alerte.domain)) {
    return { ...alerte, statut: "usurpation", motifs: ["flux-openphish"], preuves };
  }
  if (alerte.kind === "tld") {
    return { ...alerte, statut: "benigne", motifs: ["changement-de-tld-hors-perimetre"], preuves };
  }
  const tokens = tokensOrganisation(alerte.orgName);
  const copies = tokens.filter((t) => titre.includes(t));
  if (CREDENTIAL_TITLE.test(titre) && tokens.length > 0 && copies.length / tokens.length >= 0.6) {
    return { ...alerte, statut: "usurpation", motifs: ["titre-formulaire", "nom-reproduit"], preuves };
  }
  const motif = PARKING.some((m) => titre.includes(m))
    ? "page-de-vente-ou-stationnement"
    : titre
      ? "aucun-formulaire-d-identifiants"
      : alerte.certificate
        ? "certificat-sans-page-lisible"
        : "page-non-lisible";
  return { ...alerte, statut: "benigne", motifs: [motif], preuves };
}

/** SHA-256 of the canonical decision: any later edit breaks the seal. */
export function scellerConfirmation(confirmation: Omit<Confirmation, "empreinte">): string {
  const canonique = JSON.stringify([
    confirmation.domain, confirmation.base, confirmation.orgName, confirmation.kind,
    confirmation.similarity, confirmation.statut, confirmation.motifs, confirmation.preuves,
  ]);
  return createHash("sha256").update(canonique).digest("hex");
}

/** One sealed decision per distinct alarm row; two targeted organisations stay distinct. */
export function confirmerAlertes(
  alertes: AlerteConfirmation[],
  fluxPhishing: ReadonlySet<string> = new Set(),
): ResultatConfirmations {
  const uniques = new Map<string, AlerteConfirmation>();
  for (const alerte of alertes) {
    const cle = JSON.stringify([
      alerte.domain, alerte.base, alerte.orgName, alerte.kind, alerte.similarity,
    ]);
    if (!uniques.has(cle)) uniques.set(cle, alerte);
  }
  const confirmations = [...uniques.values()]
    .sort((a, b) => a.domain.localeCompare(b.domain) || a.base.localeCompare(b.base))
    .map((alerte) => {
      const decision = classerAlerte(alerte, fluxPhishing);
      return { ...decision, empreinte: scellerConfirmation(decision) };
    });
  const usurpations = confirmations.filter((c) => c.statut === "usurpation").length;
  return {
    candidats: confirmations.length,
    confirmes: confirmations.length,
    usurpations,
    benignes: confirmations.length - usurpations,
    confirmations,
  };
}
