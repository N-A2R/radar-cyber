/**
 * Journal de la décision de publier — Nouvelle-Aquitaine.
 *
 * Roadmap 3 ans, contrainte juridique n°4 : « Qui a décidé, quand, sur quelle
 * preuve, et pourquoi nommer plutôt qu'anonymiser. C'est le même journal
 * append-only que le reste : la décision de publier est un fait daté. »
 * Contrainte n°1 : sans lien public vers la source qui affirme l'incident, le
 * nommage est refusé (`source-primaire-manquante`) — même après 48 h.
 *
 * Le verdict 48 h (`incident-corroboration-48h.ts`) dit *quand* un incident
 * devient publiable. Ce module en tire *la décision*. Quand un audit des sources
 * est fourni, chaque décision porte son URL publique, nettoyée de tout jeton,
 * et s'enchaîne par empreinte SHA-256 : retirer ou modifier une ligne casse la
 * chaîne. Sans audit, le comportement historique reste identique.
 *
 * Pur, sans écriture ni réseau. Seules circulent des empreintes tronquées de
 * victime, des horodatages, des URL publiques, des compteurs et des motifs —
 * jamais un titre ni un nom de victime.
 */
import { createHash } from "node:crypto";
import {
  PUBLICATION_DELAY_MS,
  type VerdictKind,
  type Verdicts,
} from "./incident-corroboration-48h.js";

/** Motif de refus de la file de revue quand le délai de publication court encore. */
export const REFUS_PUBLICATION = "publication-risquee";
/** Motif de refus quand aucun lien public ne prouve l'incident (contrainte n°1). */
export const REFUS_SOURCE_MANCANTE = "source-primaire-manquante";
/** Raison journalisée quand le nommage est refusé faute de source primaire. */
export const RAISON_SANS_SOURCE =
  "Aucun lien public vers la source qui affirme l'incident : nommage refusé, source primaire obligatoire.";

/** Auteur de la décision : une règle versionnée, pas un humain implicite. */
export const ACTEUR_DECISION = "moteur:publication-regles@1";

export const REGLE_DECISION =
  "second independent source, or documented 48 h delay; pending stays anonymous (publication-risquee)";

/** Empreinte du début de chaîne : une chaîne vide a une tête explicite. */
export const CHAIN_GENESIS = "0";

export type PublicationDecision = {
  /** Ordre d'ajout au journal, 1-based, sans trou. */
  sequence: number;
  victimHash: string;
  /** Une grappe d'incident peut partager son empreinte de victime avec une
   * autre grappe du même incident : l'identité journalisable ajoute la première
   * revendication. Jamais un titre ni un nom. */
  identifiant: string;
  verdict: VerdictKind;
  decisionAt: string;
  firstClaimAt: string;
  /** Lien public vers l'éditeur qui affirme l'incident, présent si un audit des sources est fourni. */
  sourcePrimaire?: string | null;
  nommer: boolean;
  motifRefus: typeof REFUS_PUBLICATION | typeof REFUS_SOURCE_MANCANTE | null;
  raison: string;
  preuve: {
    independentPublishers: number;
    firstClaimAt: string;
    decisionAt: string;
    delayHours: number;
  };
  acteur: string;
  previousHash: string;
  hash: string;
};

export type PublicationSummary = {
  incidents: number;
  nommes: number;
  publicationRisquee: number;
  secondSource: number;
  afterDelay: number;
  pending: number;
  /** Incidents sans lien public vérifié, et incidents nommés malgré cette absence (toujours 0). */
  sansSource: number;
  nommesSansSource: number;
};

export type PublicationJournal = {
  rule: string;
  generatedAt: string;
  decisions: PublicationDecision[];
  chainHead: string;
  summary: PublicationSummary;
};

export type JournalVerification = {
  ok: boolean;
  checked: number;
  firstInvalidSequence: number | null;
};

function raison(verdict: VerdictKind): string {
  switch (verdict) {
    case "second_source":
      return "Deux éditeurs indépendants confirment le même incident : nommage autorisé dès la première revendication.";
    case "after_delay":
      return "Un seul éditeur, délai de 48 h écoulé depuis la première revendication : nommage autorisé, délai documenté.";
    case "pending":
      return "Délai de 48 h non écoulé : refus de nommer (publication-risquee), incident anonymisé.";
  }
}

/** Couvre tous les champs de la décision, sauf l'empreinte elle-même. */
function canonical(decision: Omit<PublicationDecision, "hash">): string {
  return JSON.stringify([
    decision.previousHash,
    decision.sequence,
    decision.victimHash,
    decision.identifiant,
    decision.decisionAt,
    decision.firstClaimAt,
    decision.nommer,
    decision.motifRefus,
    decision.raison,
    decision.preuve,
    decision.acteur,
    ...("sourcePrimaire" in decision ? [decision.sourcePrimaire] : []),
  ]);
}

function empreinte(decision: Omit<PublicationDecision, "hash">): string {
  return createHash("sha256").update(canonical(decision)).digest("hex").slice(0, 16);
}

/**
 * Construit le journal dans un ordre reproductible : l'heure de décision, puis
 * l'empreinte de victime. À mesure identique, le journal est identique.
 *
 * `sources` associe l'identifiant de la décision à son URL publique (ou null).
 * Sans cette carte, aucun champ de source n'est ajouté : les journaux déjà
 * publiés restent rejouables et la règle historique s'applique.
 */
export function buildPublicationJournal(
  verdicts: Verdicts,
  generatedAt: string,
  sources?: ReadonlyMap<string, string | null>,
): PublicationJournal {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("Invalid measurement instant");

  const ordered = [...verdicts.incidents].sort(
    (a, b) => a.decisionAt.localeCompare(b.decisionAt) || a.victimHash.localeCompare(b.victimHash)
      || a.firstClaimAt.localeCompare(b.firstClaimAt),
  );
  const decisions: PublicationDecision[] = [];
  for (const [index, incident] of ordered.entries()) {
    const identifiant = `${incident.victimHash}@${incident.firstClaimAt}`;
    const sourcePrimaire = sources ? (sources.get(identifiant) ?? null) : undefined;
    const sansSource = sourcePrimaire === null;
    const nommer = incident.verdict !== "pending" && !sansSource;
    const base: Omit<PublicationDecision, "hash"> = {
      sequence: index + 1,
      victimHash: incident.victimHash,
      identifiant,
      verdict: incident.verdict,
      decisionAt: incident.decisionAt,
      firstClaimAt: incident.firstClaimAt,
      ...(sources !== undefined ? { sourcePrimaire } : {}),
      nommer,
      motifRefus: nommer ? null : sansSource && incident.verdict !== "pending"
        ? REFUS_SOURCE_MANCANTE : REFUS_PUBLICATION,
      raison: sansSource && incident.verdict !== "pending" ? RAISON_SANS_SOURCE : raison(incident.verdict),
      preuve: {
        independentPublishers: incident.publishers,
        firstClaimAt: incident.firstClaimAt,
        decisionAt: incident.decisionAt,
        delayHours: PUBLICATION_DELAY_MS / 3_600_000,
      },
      acteur: ACTEUR_DECISION,
      previousHash: decisions.at(-1)?.hash ?? CHAIN_GENESIS,
    };
    decisions.push({ ...base, hash: empreinte(base) });
  }

  const count = (verdict: VerdictKind): number => ordered.filter((item) => item.verdict === verdict).length;
  return {
    rule: REGLE_DECISION,
    generatedAt,
    decisions,
    chainHead: decisions.at(-1)?.hash ?? CHAIN_GENESIS,
    summary: {
      incidents: ordered.length,
      nommes: decisions.filter((item) => item.nommer).length,
      publicationRisquee: decisions.filter((item) => item.motifRefus === REFUS_PUBLICATION).length,
      secondSource: count("second_source"),
      afterDelay: count("after_delay"),
      pending: count("pending"),
      sansSource: decisions.filter((item) => item.sourcePrimaire === null).length,
      nommesSansSource: decisions.filter((item) => item.nommer && item.sourcePrimaire === null).length,
    },
  };
}

/** Rejoue la chaîne : toute ligne modifiée, retirée ou réordonnée est détectée. */
export function verifyPublicationJournal(journal: PublicationJournal): JournalVerification {
  const seen = new Set<string>();
  let previousHash = CHAIN_GENESIS;
  for (const [index, decision] of journal.decisions.entries()) {
    const expected = index + 1;
    const { hash, ...body } = decision;
    const audited = "sourcePrimaire" in decision;
    const nommable = audited
      ? decision.verdict !== "pending" && decision.sourcePrimaire !== null
      : decision.verdict !== "pending";
    const motifAttendu = !nommable
      ? audited && decision.verdict !== "pending" ? REFUS_SOURCE_MANCANTE : REFUS_PUBLICATION
      : null;
    const coherent =
      decision.sequence === expected &&
      decision.previousHash === previousHash &&
      hash === empreinte(body) &&
      !seen.has(decision.identifiant) &&
      decision.nommer === nommable &&
      decision.motifRefus === motifAttendu;
    if (!coherent) return { ok: false, checked: index, firstInvalidSequence: expected };
    seen.add(decision.identifiant);
    previousHash = hash;
  }
  const ok =
    previousHash === journal.chainHead && journal.decisions.length === journal.summary.incidents;
  return { ok, checked: journal.decisions.length, firstInvalidSequence: ok ? null : journal.decisions.length + 1 };
}
