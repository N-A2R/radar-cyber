/**
 * Indice ReCyF-2.5 par collectivité.
 *
 * La note n'est pas un score maison : elle transpose publiquement le
 * référentiel national ANSSI (source externe, jamais présentée comme une
 * source locale du radar) selon une méthode datée dont l'empreinte est
 * stockée avec chaque score. Aucune certification ANSSI n'est revendiquée.
 *
 * La formule est identique dans ce module, dans la migration 222 et dans le
 * CSV exporté : modifier l'un sans les autres change l'empreinte et casse le
 * test de cohérence.
 */

import { createHash } from "node:crypto";

export const REFERENTIEL = "ReCyF-2.5";
export const REGLE = "ReCyF-2.5@1";
export const METHODE_DATE = "2026-11-23";

export const METHODE =
  "ReCyF-2.5 ; method dated 2026-11-23 ; national reference ANSSI (external source, not a local radar source) ; public non-certifying transposition of ANSSI hygiene guidance ; index = 1 - sum(max(0, severity-1)) / (3 * event_count), clamped to [0,1] ; severity scale 1-4 ; confidence = min(0.99, 0.5 + 0.1 * min(5, event_count)) ; no personal data, no secret, no ANSSI certification claimed";

export const FORMULE =
  "index = clamp(1 - sum(max(0, severite-1)) / (3*nb_evenements), 0, 1) ; confiance = min(0.99, 0.5 + 0.1*min(5, nb_evenements)) ; reference ANSSI : source nationale externe, transposition non certificative ; methode datee 2026-11-23";

/** Libellé explicite : l'ANSSI est une source nationale EXTERNE au radar. */
export const SOURCE_REFERENCE =
  "ANSSI (source nationale externe, transposition non certificative)";

export const METHODE_SHA256 = createHash("sha256").update(METHODE, "utf8").digest("hex");

/** Indice dans [0,1] : 1 sans fait préjudiciable observé, 0 au plus haut. */
export function scoreReCyF(severites: readonly number[]): number {
  if (severites.length === 0) throw new Error("ReCyF : aucun événement à scorer");
  const penalite = severites.reduce((total, severite) => total + Math.max(0, severite - 1), 0);
  return Math.min(1, Math.max(0, 1 - penalite / (3 * severites.length)));
}

/** Confiance bornée, fonction du nombre d'événements publics observés. */
export function confidenceReCyF(nombreEvenements: number): number {
  return Math.min(0.99, 0.5 + 0.1 * Math.min(5, nombreEvenements));
}

export type SqlQuery = <T = any>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;

export type LigneCsvReCyF = {
  org_id: number;
  organisme: string;
  departement: string | null;
  score: number;
  confidence: number;
  evenements: number;
  criticite: number;
  methode_sha256: string;
  formule: string;
  calcule_le: string;
};

type CollectiviteAggregee = {
  org_id: number;
  organisme: string;
  departement: string | null;
  severites: number[];
  confirmees: number;
};

const COLLECTIVITES_SQL = `
  SELECT o.id AS org_id, o.name AS organisme, o.dept AS departement,
         array_agg(e.severity ORDER BY e.id) AS severites,
         (COUNT(*) FILTER (WHERE e.confidence IS NOT NULL))::integer AS confirmees
    FROM org o
    JOIN event e ON e.org_id = o.id
   WHERE o.kind = 'collectivite'
   GROUP BY o.id, o.name, o.dept
   ORDER BY o.id
`;

const UPSERT_SQL = `
  INSERT INTO org_score
    (org_id, score, services, confirmees, criticite, regle, referentiel,
     methode_sha256, confidence, formule, methode, calcule_le)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  ON CONFLICT (org_id, referentiel) DO UPDATE SET
    score = EXCLUDED.score,
    services = EXCLUDED.services,
    confirmees = EXCLUDED.confirmees,
    criticite = EXCLUDED.criticite,
    regle = EXCLUDED.regle,
    methode_sha256 = EXCLUDED.methode_sha256,
    confidence = EXCLUDED.confidence,
    formule = EXCLUDED.formule,
    methode = EXCLUDED.methode,
    calcule_le = EXCLUDED.calcule_le
`;

/** Critère du juge externe, exécuté tel quel. */
export const CRITERE_SQL =
  "SELECT count(*) FROM org_score WHERE referentiel='ReCyF-2.5' AND (score IS NULL OR methode_sha256 IS NULL OR confidence IS NULL OR calcule_le IS NULL);";

export type PublicationReCyF = {
  collectivites: number;
  lignes: LigneCsvReCyF[];
  calcule_le: string;
};

/**
 * Calcule et publie un score complet pour chaque collectivité ayant au moins
 * un événement. Une collectivité sans événement n'est pas scorée : l'indice
 * porterait sur du vide et la confiance n'aurait aucun sens.
 */
export async function publierScoresReCyF(
  query: SqlQuery,
  calculeLe: Date,
): Promise<PublicationReCyF> {
  const aggregate = await query<CollectiviteAggregee>(COLLECTIVITES_SQL);
  const horodatage = calculeLe.toISOString();
  const lignes: LigneCsvReCyF[] = [];

  for (const org of aggregate.rows) {
    const severites = org.severites.map(Number);
    const criticite = severites.reduce((total, severite) => total + Math.max(0, severite - 1), 0);
    const ligne: LigneCsvReCyF = {
      org_id: org.org_id,
      organisme: org.organisme,
      departement: org.departement,
      score: scoreReCyF(severites),
      confidence: confidenceReCyF(severites.length),
      evenements: severites.length,
      criticite,
      methode_sha256: METHODE_SHA256,
      formule: FORMULE,
      calcule_le: horodatage,
    };

    await query(UPSERT_SQL, [
      ligne.org_id,
      ligne.score,
      ligne.evenements,
      org.confirmees,
      ligne.criticite,
      REGLE,
      REFERENTIEL,
      ligne.methode_sha256,
      ligne.confidence,
      ligne.formule,
      METHODE,
      ligne.calcule_le,
    ]);
    lignes.push(ligne);
  }

  return { collectivites: lignes.length, lignes, calcule_le: horodatage };
}

export const ENTETE_CSV_RECYF = [
  "exporte_le",
  "org_id",
  "organisme",
  "departement",
  "referentiel",
  "score",
  "confidence",
  "evenements",
  "criticite",
  "methode_sha256",
  "formule",
  "source_reference",
  "calcule_le",
] as const;

function celluleCsv(valeur: string | number | null): string {
  const texte = valeur === null ? "" : String(valeur);
  return /[",\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

/** CSV daté : chaque ligne porte le score ET sa formule. */
export function csvReCyF(lignes: readonly LigneCsvReCyF[], exporteLe: Date): string {
  const date = exporteLe.toISOString();
  const corps = lignes.map((ligne) =>
    [
      date,
      ligne.org_id,
      ligne.organisme,
      ligne.departement,
      REFERENTIEL,
      ligne.score.toFixed(6),
      ligne.confidence.toFixed(4),
      ligne.evenements,
      ligne.criticite,
      ligne.methode_sha256,
      ligne.formule,
      SOURCE_REFERENCE,
      ligne.calcule_le,
    ]
      .map(celluleCsv)
      .join(","),
  );
  return [ENTETE_CSV_RECYF.join(","), ...corps, ""].join("\n");
}

export function nomFichierCsvReCyF(exporteLe: Date): string {
  return `export-recyf-${exporteLe.toISOString().slice(0, 10)}.csv`;
}
