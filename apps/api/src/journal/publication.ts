/**
 * Écriture des décisions de publication dans le journal de vérité.
 *
 * La décision calculée est un fait daté : elle entre dans la table append-only
 * (migration 027) avec son auteur, sa preuve et son pourquoi. Rejouer la même
 * mesure au même instant ne duplique rien — une décision par incident et par
 * instant, jamais une réécriture de l'histoire.
 */
import { query } from "../db.js";
import type { PublicationJournal } from "../analyse/publication-decisions.js";
import { consignerLot, type JournalEntry } from "./index.js";

export type EnregistrementPublication = {
  incidents: number;
  dejaJournalises: number;
  ecrits: number;
  lacunes: number;
  erreurs: string[];
};

export async function enregistrerDecisionsPublication(
  journal: PublicationJournal,
): Promise<EnregistrementPublication> {
  const existants = await query<{ subject: string }>(
    `SELECT subject FROM journal
      WHERE kind = 'publication.decided' AND payload->>'generatedAt' = $1`,
    [journal.generatedAt],
  );
  const deja = new Set(existants.rows.map((row) => row.subject));
  const entrees: JournalEntry[] = journal.decisions
    .filter((decision) => !deja.has(`publication:${decision.identifiant}`))
    .map((decision) => ({
      kind: "publication.decided",
      subject: `publication:${decision.identifiant}`,
      summary: `publication ${decision.nommer ? "autorisée" : "refusée"} pour ${decision.victimHash} — ${decision.raison}`,
      actor: decision.acteur,
      validAt: decision.decisionAt,
      payload: {
        generatedAt: journal.generatedAt,
        identifiant: decision.identifiant,
        sequence: decision.sequence,
        verdict: decision.verdict,
        decisionAt: decision.decisionAt,
        firstClaimAt: decision.firstClaimAt,
        nommer: decision.nommer,
        motifRefus: decision.motifRefus,
        sourcePrimaire: decision.sourcePrimaire ?? null,
        raison: decision.raison,
        preuve: decision.preuve,
        hash: decision.hash,
        previousHash: decision.previousHash,
        chainHead: journal.chainHead,
        rule: journal.rule,
      },
    }));
  const resultat = await consignerLot(entrees);
  return {
    incidents: journal.decisions.length,
    dejaJournalises: deja.size,
    ecrits: entrees.length - resultat.lacunes - resultat.erreurs.length,
    lacunes: resultat.lacunes,
    erreurs: resultat.erreurs,
  };
}
