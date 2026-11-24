/**
 * Ordonnanceur de collecte.
 *
 * Une source n'est pas « à collecter » parce que son tour est venu dans une
 * liste fixe : elle l'est parce que la fréquence qu'elle attend est écoulée,
 * qu'elle est encore en état de répondre, et que son historique le permet.
 * Ce module ne parle pas réseau : il produit un plan à partir de `source` et
 * de l'historique réel des runs (`collector_run`). Le cycle (générique et
 * collecteurs dédiés) consulte ce plan ; la route `GET /api/collecte/plan`
 * l'expose tel quel, y compris les sources écartées et leur motif.
 *
 * Règles, dans l'ordre :
 *   0. `pret_a_collecter = false` est écartée, y compris d'un forçage explicite
 *      (aucun override admin) ; NULL garde le comportement historique ;
 *   1. jamais collectée (aucun run ok, aucun `last_ok_at`) → toujours en tête ;
 *   2. santé : morte/désactivée écartée, dégradée après une source saine ;
 *   3. priorité de la famille, puis temps écoulé, puis id (ordre déterministe) ;
 *   4. fréquence attendue : 80 % de `interval_sec` (marge historique de 20 %),
 *      plancher d'une minute pour éviter une boucle sur une valeur aberrante.
 */
import { query, type QueryResult } from "../db.js";

export type SanteSource = "jamais" | "saine" | "degradee" | "morte" | "desactivee";
export type EtatPlan = "due" | "attente" | "exclue";

export type HistoriqueSource = {
  dernierRunAt: string | Date | null;
  dernierOkRunAt: string | Date | null;
  dernierErreurRunAt: string | Date | null;
  dernierStatut: string | null;
  runsOk: number;
  runsErreur: number;
};

export type SourcePourPlan = {
  id: string;
  name?: string | null;
  family?: string | null;
  kind?: string | null;
  intervalSec?: number | null;
  lastOkAt?: string | Date | null;
  lastErrorAt?: string | Date | null;
  lastError?: string | null;
  statut?: string | null;
  enabled?: boolean | null;
  /** false = collecteur non branché : exclu du plan, y compris sur forçage. NULL = historique. */
  pretACollecter?: boolean | null;
  createdAt?: string | Date | null;
  historique?: HistoriqueSource | null;
};

export type EntreePlan = {
  id: string;
  name: string;
  family: string;
  priorite: number;
  frequenceSec: number;
  ageSec: number | null;
  jamaisCollectee: boolean;
  sante: SanteSource;
  pretACollecter: boolean | null;
  etat: EtatPlan;
  raison: string;
  /** Position dans le cycle, 1-based ; null pour une source non retenue. */
  rang: number | null;
  historique: HistoriqueSource;
};

export type PlanCollecte = {
  genereA: string;
  entrees: EntreePlan[];
  totaux: {
    sources: number;
    actives: number;
    exclues: number;
    dues: number;
    jamaisCollectees: number;
    jamaisCollecteesDues: number;
    enAttenteBranchement: number;
  };
};

/** Familles critiques d'abord ; une famille inconnue reste en priorité normale. */
const PRIORITE_FAMILLE: Readonly<Record<string, number>> = {
  cert: 0,
  cert_fr: 0,
  vuln: 0,
  ransomware: 1,
  cti: 1,
  phishing: 1,
  presse: 2,
  presse_cyber: 2,
  // Veille large : elle ne doit pas retarder les familles d'incident.
  presse_locale: 3,
  reputation: 2,
  leaks: 2,
  paste: 3,
  warninglist: 3,
};

const FREQUENCE_DEFAUT_SEC = 3600;
const FREQUENCE_MIN_SEC = 60;
/** Le cycle garde la même marge de 20 % que les anciens comparateurs. */
const MARGE_FREQUENCE = 0.8;

export function historiqueVide(): HistoriqueSource {
  return {
    dernierRunAt: null,
    dernierOkRunAt: null,
    dernierErreurRunAt: null,
    dernierStatut: null,
    runsOk: 0,
    runsErreur: 0,
  };
}

function millisecondes(valeur: string | Date | null | undefined): number | null {
  if (valeur === null || valeur === undefined) return null;
  const t = valeur instanceof Date ? valeur.getTime() : Date.parse(valeur);
  return Number.isFinite(t) ? t : null;
}

function maxTemps(...valeurs: Array<string | Date | null | undefined>): number | null {
  let max: number | null = null;
  for (const valeur of valeurs) {
    const t = millisecondes(valeur);
    if (t !== null && (max === null || t > max)) max = t;
  }
  return max;
}

function prioriteDe(family: string | null | undefined): number {
  return family ? (PRIORITE_FAMILLE[family] ?? 2) : 2;
}

function frequenceDe(source: SourcePourPlan, intervalles?: Readonly<Record<string, number>>): number {
  const brut = intervalles?.[source.id] ?? source.intervalSec ?? FREQUENCE_DEFAUT_SEC;
  const n = typeof brut === "number" ? brut : Number(brut);
  return Number.isFinite(n) ? Math.max(FREQUENCE_MIN_SEC, Math.floor(n)) : FREQUENCE_DEFAUT_SEC;
}

function santeDe(source: SourcePourPlan, historique: HistoriqueSource, jamais: boolean): SanteSource {
  if (source.statut === "morte") return "morte";
  if (source.enabled === false) return "desactivee";
  if (jamais) return "jamais";
  const dernierOk = maxTemps(source.lastOkAt, historique.dernierOkRunAt);
  const derniereErreur = maxTemps(source.lastErrorAt, historique.dernierErreurRunAt);
  const degradee =
    (derniereErreur !== null && (dernierOk === null || derniereErreur > dernierOk)) ||
    historique.dernierStatut === "error";
  return degradee ? "degradee" : "saine";
}

function poidsSante(sante: SanteSource): number {
  return sante === "saine" || sante === "jamais" ? 0 : sante === "degradee" ? 1 : 2;
}

function poidsEtat(etat: EtatPlan): number {
  return etat === "due" ? 0 : etat === "attente" ? 1 : 2;
}

/** Compare deux entrées : jamais collectées, priorité, santé, ancienneté, id. */
export function comparerPlan(a: EntreePlan, b: EntreePlan): number {
  const etat = poidsEtat(a.etat) - poidsEtat(b.etat);
  if (etat !== 0) return etat;
  if (a.jamaisCollectee !== b.jamaisCollectee) return a.jamaisCollectee ? -1 : 1;
  if (a.priorite !== b.priorite) return a.priorite - b.priorite;
  const sante = poidsSante(a.sante) - poidsSante(b.sante);
  if (sante !== 0) return sante;
  const ageA = a.ageSec ?? -1;
  const ageB = b.ageSec ?? -1;
  if (ageA !== ageB) return ageB - ageA;
  return a.id.localeCompare(b.id);
}

/**
 * Construit le plan à partir d'un instant donné. Fonction pure : les tests
 * utilisent dix sources synthétiques, sans base ni réseau.
 */
export function construirePlan(
  sources: readonly SourcePourPlan[],
  maintenant: Date | number = new Date(),
  options?: { intervalles?: Readonly<Record<string, number>> },
): PlanCollecte {
  const brutMs = maintenant instanceof Date ? maintenant.getTime() : maintenant;
  const maintenantMs = Number.isFinite(brutMs) ? brutMs : Date.now();
  const entrees: EntreePlan[] = sources.map((source) => {
    const historique = source.historique ?? historiqueVide();
    const dernierOk = maxTemps(source.lastOkAt, historique.dernierOkRunAt);
    const dernierRun = maxTemps(source.lastErrorAt, historique.dernierRunAt);
    const jamaisCollectee = dernierOk === null;
    const reference = jamaisCollectee ? dernierRun : dernierOk;
    const sante = santeDe(source, historique, jamaisCollectee);
    const frequenceSec = frequenceDe(source, options?.intervalles);
    const ageSec = reference === null ? null : Math.max(0, Math.floor((maintenantMs - reference) / 1000));
    const enAttenteBranchement = source.pretACollecter === false;
    const exclue = enAttenteBranchement || sante === "morte" || sante === "desactivee";
    const due = !exclue && (jamaisCollectee || (ageSec !== null && ageSec >= frequenceSec * MARGE_FREQUENCE));
    const raison = enAttenteBranchement
      ? "en attente de branchement — collecteur non branché"
      : sante === "morte"
        ? "source déclarée morte"
        : sante === "desactivee"
          ? "source désactivée"
          : jamaisCollectee
            ? "jamais collectée — première tentative prioritaire"
            : due
              ? `${ageSec}s écoulées pour une fréquence attendue de ${frequenceSec}s`
              : `${ageSec}s écoulées, attend ${Math.floor(frequenceSec * MARGE_FREQUENCE)}s`;
    return {
      id: source.id,
      name: source.name ?? source.id,
      family: source.family ?? "inconnue",
      priorite: prioriteDe(source.family),
      frequenceSec,
      ageSec,
      jamaisCollectee,
      sante,
      pretACollecter: source.pretACollecter ?? null,
      etat: exclue ? "exclue" : due ? "due" : "attente",
      raison,
      rang: null,
      historique,
    };
  });

  entrees.sort(comparerPlan);
  let rang = 0;
  for (const entree of entrees) {
    if (entree.etat === "due") entree.rang = ++rang;
  }

  return {
    genereA: new Date(maintenantMs).toISOString(),
    entrees,
    totaux: {
      sources: entrees.length,
      actives: entrees.filter((e) => e.etat !== "exclue").length,
      exclues: entrees.filter((e) => e.etat === "exclue").length,
      dues: rang,
      jamaisCollectees: entrees.filter((e) => e.jamaisCollectee && e.etat !== "exclue").length,
      jamaisCollecteesDues: entrees.filter((e) => e.jamaisCollectee && e.etat === "due").length,
      enAttenteBranchement: entrees.filter((e) => e.pretACollecter === false).length,
    },
  };
}

/** Identifiants retenus pour un cycle, dans l'ordre du plan. */
export function sourcesDuCycle(
  plan: PlanCollecte,
  options?: { forcer?: readonly string[]; limite?: number },
): string[] {
  const forcees = new Set(options?.forcer ?? []);
  const retenues = plan.entrees.filter(
    (e) => e.etat === "due" || (forcees.has(e.id) && e.etat !== "exclue"),
  );
  retenues.sort((a, b) => {
    if (a.etat !== b.etat) return a.etat === "due" ? -1 : 1;
    return (a.rang ?? Number.MAX_SAFE_INTEGER) - (b.rang ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id);
  });
  const limite = options?.limite;
  return (limite && limite > 0 ? retenues.slice(0, limite) : retenues).map((e) => e.id);
}

type LignePlan = {
  id: string;
  name: string;
  family: string;
  kind: string | null;
  interval_sec: number | null;
  last_ok_at: Date | null;
  last_error_at: Date | null;
  last_error: string | null;
  statut: string | null;
  enabled: boolean;
  pret_a_collecter: boolean | null;
  created_at: Date | null;
  dernier_run_at: Date | null;
  dernier_ok_run_at: Date | null;
  dernier_erreur_run_at: Date | null;
  dernier_statut: string | null;
  runs_ok: string | number | null;
  runs_erreur: string | number | null;
};

const SQL_PLAN = `
  WITH runs AS (
    SELECT source_id,
           max(finished_at) AS dernier_run_at,
           max(finished_at) FILTER (WHERE status = 'ok') AS dernier_ok_run_at,
           max(finished_at) FILTER (WHERE status = 'error') AS dernier_erreur_run_at,
           (array_agg(status ORDER BY finished_at DESC, id DESC))[1] AS dernier_statut,
           count(*) FILTER (WHERE status = 'ok') AS runs_ok,
           count(*) FILTER (WHERE status = 'error') AS runs_erreur
      FROM collector_run
     WHERE kind IN ('live', 'scan', 'ingest')
     GROUP BY source_id
  )
  SELECT s.id, s.name, s.family, s.kind, s.interval_sec, s.last_ok_at, s.last_error_at,
         s.last_error, s.statut, s.enabled, s.pret_a_collecter, s.created_at,
         r.dernier_run_at, r.dernier_ok_run_at, r.dernier_erreur_run_at, r.dernier_statut,
         r.runs_ok, r.runs_erreur
    FROM source s
    LEFT JOIN runs r ON r.source_id = s.id
   ORDER BY s.id
`;

/** Charge l'historique réel et construit le plan ; `exec` permet le pool d'ingestion. */
export async function chargerPlanCycle(
  exec: typeof query = query,
  intervalles?: Readonly<Record<string, number>>,
  maintenant: Date | number = new Date(),
): Promise<PlanCollecte> {
  const resultat: QueryResult<LignePlan> = await exec<LignePlan>(SQL_PLAN);
  return construirePlan(
    resultat.rows.map((ligne) => ({
      id: ligne.id,
      name: ligne.name,
      family: ligne.family,
      kind: ligne.kind,
      intervalSec: ligne.interval_sec,
      lastOkAt: ligne.last_ok_at,
      lastErrorAt: ligne.last_error_at,
      lastError: ligne.last_error,
      statut: ligne.statut,
      enabled: ligne.enabled,
      pretACollecter: ligne.pret_a_collecter,
      createdAt: ligne.created_at,
      historique: {
        dernierRunAt: ligne.dernier_run_at,
        dernierOkRunAt: ligne.dernier_ok_run_at,
        dernierErreurRunAt: ligne.dernier_erreur_run_at,
        dernierStatut: ligne.dernier_statut,
        runsOk: Number(ligne.runs_ok ?? 0),
        runsErreur: Number(ligne.runs_erreur ?? 0),
      },
    })),
    maintenant,
    { intervalles },
  );
}
