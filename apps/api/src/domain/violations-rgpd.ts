/**
 * Suivi opérationnel des violations RGPD (SEC-06).
 *
 * Le registre public reste en lecture seule ; ce service ajoute le workflow
 * qualification → notification → clôture, avec une trace datée dans le journal
 * de vérité. Toutes les écritures sont transactionnelles et refusent les
 * transitions hors ordre. Aucune donnée de victime ne sort de ces fonctions.
 */
import { query, withTransaction } from "../db.js";
import { consignerAvec } from "../journal/index.js";
import { notFound, unprocessable } from "../errors.js";

export type StatutViolation = "suspectee" | "qualifiee" | "notifiee" | "close";

export type Violation = {
  id: number;
  reference: string;
  origine: string;
  origine_id: string;
  org_id: number | null;
  org_kind: string;
  dept: string | null;
  famille: string;
  source_id: string | null;
  source_url: string | null;
  date_prise_connaissance: string;
  echeance_72h: string;
  statut: StatutViolation;
  date_notification: string | null;
  notifie_a: string | null;
  date_qualification: string | null;
  qualifiee_par: string | null;
  reference_notification: string | null;
  date_cloture: string | null;
};

export type ViolationVue = Violation & { enRetard: boolean };

const COLONNES = `id, reference, origine, origine_id, org_id, org_kind, dept, famille,
  source_id, source_url, date_prise_connaissance, echeance_72h, statut,
  date_notification, notifie_a, date_qualification, qualifiee_par,
  reference_notification, date_cloture`;

/** Une violation est en retard tant qu'elle n'a pas été notifiée. */
export function estEnRetard(violation: Pick<Violation, "echeance_72h" | "statut">, maintenant = Date.now()): boolean {
  return violation.statut !== "notifiee" && violation.statut !== "close"
    && Date.parse(violation.echeance_72h) < maintenant;
}

function vue(ligne: Violation): ViolationVue {
  return { ...ligne, enRetard: estEnRetard(ligne) };
}

export async function lireViolation(id: number): Promise<ViolationVue> {
  const r = await query<Violation>(`SELECT ${COLONNES} FROM violation_rgpd WHERE id=$1`, [id]);
  if (!r.rows[0]) throw notFound("violation introuvable");
  return vue(r.rows[0]);
}

export async function listerViolations(options: {
  statut?: StatutViolation;
  enRetard?: boolean;
  limite?: number;
  offset?: number;
} = {}): Promise<{ items: ViolationVue[]; total: number; limite: number; offset: number }> {
  const limite = Math.min(Math.max(options.limite ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options.statut) { params.push(options.statut); conditions.push(`statut=$${params.length}`); }
  if (options.enRetard === true) conditions.push(`echeance_72h < now() AND statut NOT IN ('notifiee','close')`);
  if (options.enRetard === false) conditions.push(`(echeance_72h >= now() OR statut IN ('notifiee','close'))`);
  const ou = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const total = await query<{ n: string }>(`SELECT count(*)::text AS n FROM violation_rgpd ${ou}`, params);
  params.push(limite, offset);
  const r = await query<Violation>(
    `SELECT ${COLONNES} FROM violation_rgpd ${ou} ORDER BY echeance_72h ASC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    items: r.rows.map(vue),
    total: Number(total.rows[0]?.n ?? 0),
    limite,
    offset,
  };
}

export async function statistiquesViolations(): Promise<{
  total: number;
  parStatut: Record<StatutViolation, number>;
  enRetard: number;
  aNotifier: number;
}> {
  const r = await query<{ statut: StatutViolation; n: string; retard: string }>(
    `SELECT statut, count(*)::text AS n,
            count(*) FILTER (WHERE echeance_72h < now() AND statut NOT IN ('notifiee','close'))::text AS retard
       FROM violation_rgpd GROUP BY statut`,
  );
  const parStatut: Record<StatutViolation, number> = { suspectee: 0, qualifiee: 0, notifiee: 0, close: 0 };
  let enRetard = 0;
  for (const ligne of r.rows) {
    parStatut[ligne.statut] = Number(ligne.n);
    enRetard += Number(ligne.retard);
  }
  return {
    total: Object.values(parStatut).reduce((a, b) => a + b, 0),
    parStatut,
    enRetard,
    aNotifier: parStatut.suspectee + parStatut.qualifiee,
  };
}

async function transition(
  id: number,
  attendus: StatutViolation[],
  statut: StatutViolation,
  champs: Record<string, unknown>,
  evenement: string,
  acteur: string,
  motif: string | null,
): Promise<ViolationVue> {
  const result = await withTransaction(async (client) => {
    const courant = await client.query<{ statut: StatutViolation }>(
      "SELECT statut FROM violation_rgpd WHERE id=$1 FOR UPDATE", [id],
    );
    if (!courant.rows[0]) throw notFound("violation introuvable");
    if (!attendus.includes(courant.rows[0].statut)) {
      throw unprocessable(`transition impossible depuis ${courant.rows[0].statut}`);
    }
    const noms = Object.keys(champs);
    const affectations = noms.map((nom, i) => `${nom}=$${i + 3}`).join(", ");
    const valeurs = noms.map((nom) => champs[nom]);
    await client.query(
      `UPDATE violation_rgpd SET statut=$2${affectations ? `, ${affectations}` : ""} WHERE id=$1`,
      [id, statut, ...valeurs],
    );
    const trace = await consignerAvec(
      (sql, params) => client.query(sql, params as unknown[]),
      {
        kind: "violation.rgpd",
        subject: `violation:${id}`,
        summary: evenement,
        actor: acteur,
        payload: { violationId: id, statut, motif },
      },
    );
    if (!trace.ok) throw new Error(`journal indisponible : ${trace.error}`);
    const apres = await client.query<Violation>(`SELECT ${COLONNES} FROM violation_rgpd WHERE id=$1`, [id]);
    return apres.rows[0]!;
  });
  return vue(result);
}

export function qualifierViolation(id: number, acteur: string, motif: string | null): Promise<ViolationVue> {
  return transition(id, ["suspectee"], "qualifiee", { qualifiee_par: acteur }, "violation qualifiée", acteur, motif);
}

export function notifierViolation(
  id: number,
  acteur: string,
  destinataire: string,
  referenceNotification: string | null,
): Promise<ViolationVue> {
  return transition(
    id, ["suspectee", "qualifiee"], "notifiee",
    { notifie_a: destinataire, reference_notification: referenceNotification },
    "violation notifiée à l'autorité", acteur, null,
  );
}

export function cloturerViolation(id: number, acteur: string, motif: string | null): Promise<ViolationVue> {
  return transition(id, ["qualifiee", "notifiee"], "close", {}, "violation clôturée", acteur, motif);
}
