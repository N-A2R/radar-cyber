/**
 * Écriture d'une décision de revue : une seule porte pour l'API et les outils
 * de mesure. La décision est append-only, la projection est mise à jour dans
 * la même transaction, et le journal reçoit le pourquoi — jamais en best-effort.
 */
import { conflict, notFound } from "../errors.js";
import { withTransaction } from "../db.js";
import { consignerAvec } from "../journal/index.js";

export type LigneFile = {
  cle: string;
  titre: string;
  extrait: string;
  url: string;
  date_publication: string | null;
  source: string | null;
  commune: string | null;
  departement: string | null;
  org_proposee: string | null;
  score_confiance: number;
  signaux: unknown;
  etat: string;
  org_retenue: string | null;
  cree_le: string;
  traite_le: string | null;
};

export function enLigne(row: LigneFile) {
  return {
    cle: row.cle,
    titre: row.titre,
    extrait: row.extrait,
    url: row.url,
    date: row.date_publication,
    source: row.source,
    commune: row.commune,
    departement: row.departement,
    orgProposee: row.org_proposee,
    scoreConfiance: row.score_confiance,
    signaux: row.signaux,
    etat: row.etat,
    orgRetenue: row.org_retenue,
    traiteLe: row.traite_le,
  };
}

export type DecisionPresse = {
  cle: string;
  decision: "confirmer" | "refuser" | "reclasser";
  raison: string;
  auteur: string;
  passe: string;
  orgRetenue?: string;
};

export async function enregistrerDecisionPresse(input: DecisionPresse) {
  const { cle, decision, raison, auteur, passe } = input;
  return withTransaction(async (client) => {
    const courant = await client.query<LigneFile>(
      `SELECT * FROM presse_candidat WHERE cle = $1 FOR UPDATE`, [cle],
    );
    const ligne = courant.rows[0];
    if (!ligne) throw notFound("candidat introuvable");
    if (ligne.etat !== "en_attente") throw conflict("candidat déjà traité");

    const etat = decision === "confirmer" ? "confirme" : decision === "refuser" ? "refuse" : "reclasse";
    const orgRetenue = decision === "refuser"
      ? null
      : decision === "reclasser"
        ? input.orgRetenue!
        : (input.orgRetenue ?? ligne.org_proposee);

    const avant = {
      etat: ligne.etat, orgProposee: ligne.org_proposee,
      scoreConfiance: ligne.score_confiance, url: ligne.url, date: ligne.date_publication,
    };
    const apres = { etat, orgRetenue, decision, raison, passe, auteur };

    await client.query(
      `INSERT INTO presse_candidat_decision
         (cle, passe, decision, auteur, raison, org_retenue, avant, apres)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
      [cle, passe, decision, auteur, raison, orgRetenue, JSON.stringify(avant), JSON.stringify(apres)],
    );
    await client.query(
      `UPDATE presse_candidat SET etat = $1, org_retenue = $2, traite_le = now()
        WHERE cle = $3`,
      [etat, orgRetenue, cle],
    );
    const trace = await consignerAvec(
      (sql, params) => client.query(sql, params as unknown[]),
      {
        kind: "review.decided",
        subject: `presse-candidat:${cle}`,
        summary: `${decision} par ${auteur} — ${raison}`,
        actor: auteur,
        validAt: ligne.date_publication,
        payload: {
          decision, raison, passe, orgRetenue,
          orgProposee: ligne.org_proposee,
          scoreConfiance: ligne.score_confiance,
          url: ligne.url,
          source: ligne.source,
        },
      },
    );
    if (!trace.ok) throw new Error(`journal indisponible : ${trace.error}`);
    return enLigne({ ...ligne, etat, org_retenue: orgRetenue, traite_le: new Date().toISOString() });
  });
}
