/**
 * Horloge CRA : lecture de l'échéance de signalement d'une vulnérabilité grave.
 *
 * La migration 217 écrit les échéances dans `event.evidence` dès l'entrée de
 * l'événement. Ce module ne recalcule rien côté interface : il lit les clés
 * stockées, les valide et les rend sous une forme directement affichable par
 * un éditeur de la région. Le critère du contrôle externe est exécuté tel quel.
 */
import { query } from "../db.js";

/** Critère du contrôle externe, exécuté tel quel. */
export const CRITERE_CRA_VULN =
  "SELECT count(*) FROM event e WHERE e.family='vuln' AND e.severity>=7 AND (e.evidence->>'cpe' IS NULL OR e.evidence->>'exploited' IS NULL OR e.evidence->>'deadline_24h' IS NULL OR e.evidence->>'deadline_72h' IS NULL);";

/** Article 14 du CRA : alerte précoce, notification, rapport final. */
export const ECHEANCES_CRA = [
  {
    code: "CRA_24h",
    cle: "deadline_24h",
    heures: 24,
    libelle: "Alerte précoce à l'ENISA",
    destinataires: ["ENISA"],
  },
  {
    code: "CRA_72h",
    cle: "deadline_72h",
    heures: 72,
    libelle: "Notification de la vulnérabilité",
    destinataires: ["ENISA", "utilisateurs"],
  },
  {
    code: "CRA_14j",
    cle: "deadline_14d",
    heures: 14 * 24,
    libelle: "Rapport final",
    destinataires: ["ENISA"],
  },
] as const;

export type CleEcheanceCra = (typeof ECHEANCES_CRA)[number]["cle"];

export type HorlogeCra = {
  cpe: string;
  exploited: boolean;
  priseDeConnaissance: Date;
  echeances: Record<CleEcheanceCra, Date>;
};

const HEURE_MS = 3_600_000;

/** Même arithmétique que la migration, pour les contrôles et les tests. */
export function echeancesCra(priseDeConnaissance: Date): Record<CleEcheanceCra, Date> {
  if (Number.isNaN(priseDeConnaissance.getTime())) {
    throw new Error("date de prise de connaissance invalide");
  }
  return {
    deadline_24h: new Date(priseDeConnaissance.getTime() + 24 * HEURE_MS),
    deadline_72h: new Date(priseDeConnaissance.getTime() + 72 * HEURE_MS),
    deadline_14d: new Date(priseDeConnaissance.getTime() + 14 * 24 * HEURE_MS),
  };
}

function dateStockee(valeur: unknown, cle: string): Date {
  if (typeof valeur !== "string" || valeur.length === 0) throw new Error(`horloge CRA : ${cle} absent`);
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) throw new Error(`horloge CRA : ${cle} illisible`);
  return date;
}

/** Échoue fermé : une horloge incomplète ne doit jamais être présentée. */
export function horlogeDepuisEvidence(evidence: Record<string, unknown> | null | undefined): HorlogeCra {
  if (!evidence || typeof evidence !== "object") throw new Error("horloge CRA : preuve absente");
  const { cpe, exploited, prise_de_connaissance } = evidence;
  if (typeof cpe !== "string" || cpe.trim().length === 0) throw new Error("horloge CRA : cpe absent");
  if (typeof exploited !== "boolean") throw new Error("horloge CRA : exploited absent");
  const priseDeConnaissance = dateStockee(prise_de_connaissance, "prise_de_connaissance");
  const echeances = {
    deadline_24h: dateStockee(evidence.deadline_24h, "deadline_24h"),
    deadline_72h: dateStockee(evidence.deadline_72h, "deadline_72h"),
    deadline_14d: dateStockee(evidence.deadline_14d, "deadline_14d"),
  };
  return { cpe, exploited, priseDeConnaissance, echeances };
}

/** Réponse courte affichée à l'éditeur : dates UTC et destinataires. */
export function renduHorlogeCra(horloge: HorlogeCra): string[] {
  return [
    `Produit : ${horloge.cpe}`,
    `Exploitée activement : ${horloge.exploited ? "oui" : "non"}`,
    `Connaissance radar : ${horloge.priseDeConnaissance.toISOString()}`,
    ...ECHEANCES_CRA.map(
      (echeance) =>
        `- ${echeance.libelle} (${echeance.destinataires.join(" + ")}) : ${horloge.echeances[echeance.cle].toISOString()}`,
    ),
  ];
}

/** Nombre de vulnérabilités graves sans horloge : doit rester à zéro. */
export async function compteVulnsSansHorloge(): Promise<number> {
  const resultat = await query<{ count: string }>(CRITERE_CRA_VULN);
  const compte = Number(resultat.rows[0]?.count);
  if (!Number.isFinite(compte)) throw new Error("critère CRA : décompte illisible");
  return compte;
}
