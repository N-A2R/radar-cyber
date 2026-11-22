/**
 * Supervision de la collecte : métriques par cycle, historique et alertes.
 *
 * Un cycle est un passage complet des collecteurs dédiés et génériques. Ses
 * compteurs sont lus dans `collector_run` — la même table que les collecteurs
 * écrivent — et non déduits d'un log ou d'un compteur en mémoire. L'alerte
 * « source muette » réutilise le détecteur déterministe déjà testé pour les
 * agents CPU, mais sur les runs de collecte : une source qui produisait
 * quotidiennement et n'a plus rien rendu depuis trois jours. L'alerte
 * « cycle échoué » porte sur le statut du cycle (tâche interrompue ou source
 * en erreur). Les deux sont des alertes de revue, jamais diffusées.
 */
import { query, withTransaction, type QueryResult } from "../db.js";
import { ALERT_SCOPE_SUPERVISION } from "../alert-scope.js";
import { detecterSourcesMuettes } from "../analyse/agent-source-muette.js";

/** Fenêtre lue pour juger une source muette : 7 j de cadence + 3 j de silence. */
export const FENETRE_OBSERVATION_JOURS = 14;
const JOUR_MS = 86_400_000;

export type StatutCycle = "ok" | "degraded" | "error";

export type MemoireProcessus = { rss: number; heapUsed: number };

export type TacheCycle = { nom: string; erreur: string | null };

export type CycleCollecte = {
  id: number;
  startedAt: string;
  finishedAt: string;
  dureeMs: number;
  statut: StatutCycle;
  sourcesOk: number;
  sourcesError: number;
  itemsIn: number;
  itemsNew: number;
  memoireRssOctets: number;
  memoireHeapOctets: number;
  memoireDeltaOctets: number;
  erreur: string | null;
};

export type AlerteSupervision = {
  id: number;
  ruleId: string;
  titre: string;
  severite: number;
  statut: string;
  sourceId: string | null;
  cycleId: number | null;
  createdAt: string;
};

export type ResultatCycle = { cycle: CycleCollecte; alertes: AlerteSupervision[] };

type LigneCycle = {
  id: string | number;
  started_at: string;
  finished_at: string;
  duree_ms: string | number;
  statut: StatutCycle;
  sources_ok: string | number;
  sources_error: string | number;
  items_in: string | number;
  items_new: string | number;
  memoire_rss_octets: string | number;
  memoire_heap_octets: string | number;
  memoire_delta_octets: string | number;
  erreur: string | null;
};

type SaisieCycle = {
  startedAt: Date;
  finishedAt: Date;
  memoireAvant: MemoireProcessus;
  memoireApres: MemoireProcessus;
  taches: readonly TacheCycle[];
  /** Instant de référence pour la détection ; injectable pour le rejeu. */
  maintenant?: Date;
};

type Client = {
  query<T = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
};

/**
 * Une tâche interrompue fait échouer le cycle ; une source en erreur le dégrade.
 * La fonction est pure pour que le seuil soit vérifiable sans base ni horloge.
 */
export function statutDuCycle(taches: readonly TacheCycle[], sourcesError: number): StatutCycle {
  if (taches.some((t) => t.erreur !== null)) return "error";
  if (sourcesError > 0) return "degraded";
  return "ok";
}

function cycleDepuisLigne(ligne: LigneCycle): CycleCollecte {
  return {
    id: Number(ligne.id),
    startedAt: new Date(ligne.started_at).toISOString(),
    finishedAt: new Date(ligne.finished_at).toISOString(),
    dureeMs: Number(ligne.duree_ms),
    statut: ligne.statut,
    sourcesOk: Number(ligne.sources_ok),
    sourcesError: Number(ligne.sources_error),
    itemsIn: Number(ligne.items_in),
    itemsNew: Number(ligne.items_new),
    memoireRssOctets: Number(ligne.memoire_rss_octets),
    memoireHeapOctets: Number(ligne.memoire_heap_octets),
    memoireDeltaOctets: Number(ligne.memoire_delta_octets),
    erreur: ligne.erreur,
  };
}

/** Compteurs du cycle lus dans les runs que les collecteurs ont réellement écrits. */
async function compilerRuns(
  client: Client,
  startedAt: string,
  finishedAt: string,
): Promise<{ sourcesOk: number; sourcesError: number; itemsIn: number; itemsNew: number }> {
  const r = await client.query<{
    ok: string | number;
    erreur: string | number;
    items_in: string | number;
    items_new: string | number;
  }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'ok')::int AS ok,
            COUNT(*) FILTER (WHERE status = 'error')::int AS erreur,
            COALESCE(SUM(items_in), 0)::int AS items_in,
            COALESCE(SUM(items_new), 0)::int AS items_new
       FROM collector_run
      WHERE finished_at >= $1::timestamptz AND finished_at <= $2::timestamptz
        AND kind IN ('live', 'scan', 'ingest')`,
    [startedAt, finishedAt],
  );
  const ligne = r.rows[0];
  return {
    sourcesOk: Number(ligne?.ok ?? 0),
    sourcesError: Number(ligne?.erreur ?? 0),
    itemsIn: Number(ligne?.items_in ?? 0),
    itemsNew: Number(ligne?.items_new ?? 0),
  };
}

async function ecrireAlerte(
  client: Client,
  parametres: {
    ruleId: string;
    titre: string;
    severite: number;
    cle: string;
    evidence: Record<string, unknown>;
  },
): Promise<AlerteSupervision> {
  const r = await client.query<{ id: string | number; nouveau: boolean }>(
    `INSERT INTO alert (rule_id, title, severity, evidence, scope)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (rule_id, (evidence->>'cle'))
       WHERE scope = $5 AND evidence ? 'cle' DO UPDATE
       SET evidence = EXCLUDED.evidence,
           severity = EXCLUDED.severity,
           updated_at = now()
     RETURNING id, (xmax = 0) AS nouveau`,
    [
      parametres.ruleId,
      parametres.titre,
      parametres.severite,
      JSON.stringify({ ...parametres.evidence, cle: parametres.cle }),
      ALERT_SCOPE_SUPERVISION,
    ],
  );
  const ligne = r.rows[0];
  if (!ligne) throw new Error("alerte de supervision non écrite");
  return {
    id: Number(ligne.id),
    ruleId: parametres.ruleId,
    titre: parametres.titre,
    severite: parametres.severite,
    statut: "open",
    sourceId: typeof parametres.evidence.sourceId === "string" ? parametres.evidence.sourceId : null,
    cycleId: typeof parametres.evidence.cycleId === "number" ? parametres.evidence.cycleId : null,
    createdAt: new Date().toISOString(),
  };
}

/** Alertes déduites du cycle et des runs de collecte, écrites dans la revue. */
async function ecrireAlertes(
  client: Client,
  cycle: CycleCollecte,
  maintenant: Date,
): Promise<AlerteSupervision[]> {
  const alertes: AlerteSupervision[] = [];

  if (cycle.statut !== "ok") {
    const titre = cycle.statut === "error"
      ? `cycle de collecte échoué (${cycle.dureeMs} ms)`
      : `cycle de collecte dégradé — ${cycle.sourcesError} source(s) en erreur`;
    alertes.push(await ecrireAlerte(client, {
      ruleId: "supervision-collecte:cycle-echeque",
      titre,
      severite: cycle.statut === "error" ? 4 : 3,
      cle: `cycle:${cycle.id}`,
      evidence: {
        cycleId: cycle.id,
        statut: cycle.statut,
        dureeMs: cycle.dureeMs,
        sourcesOk: cycle.sourcesOk,
        sourcesError: cycle.sourcesError,
        itemsIn: cycle.itemsIn,
        itemsNew: cycle.itemsNew,
        erreur: cycle.erreur,
      },
    }));
  }

  const depuis = new Date(maintenant.getTime() - FENETRE_OBSERVATION_JOURS * JOUR_MS).toISOString();
  const runs = await client.query<{ sourceId: string; id: string | number; date: string }>(
    `SELECT cr.source_id AS "sourceId", cr.id::text AS id, cr.finished_at::text AS date
       FROM collector_run cr
       JOIN source s ON s.id = cr.source_id
      WHERE s.enabled
        AND cr.kind IN ('live', 'scan', 'ingest')
        AND cr.status = 'ok'
        AND cr.items_in > 0
        AND cr.finished_at >= $1::timestamptz
        AND cr.finished_at <= $2::timestamptz`,
    [depuis, maintenant.toISOString()],
  );
  const parSource = new Map<string, { id: string; evenements: { date: string; id: number | string }[] }>();
  for (const ligne of runs.rows) {
    const source = parSource.get(ligne.sourceId) ?? { id: ligne.sourceId, evenements: [] };
    source.evenements.push({ date: ligne.date, id: ligne.id });
    parSource.set(ligne.sourceId, source);
  }
  for (const muette of detecterSourcesMuettes([...parSource.values()], maintenant.getTime())) {
    alertes.push(await ecrireAlerte(client, {
      ruleId: "supervision-collecte:source-muette",
      titre: muette.motif,
      severite: Math.min(5, Math.max(2, Math.round(muette.silenceJours / 2) + 1)),
      cle: `source:${muette.sourceId}`,
      evidence: {
        sourceId: muette.sourceId,
        cycleId: cycle.id,
        silenceJours: muette.silenceJours,
        evenementsCadence: muette.evenementsCadence,
        explication: muette.explication,
      },
    }));
  }
  return alertes;
}

/**
 * Écrit un cycle et ses alertes dans une seule transaction : un cycle sans
 * trace ou une alerte sans cycle ne peuvent pas être publiés l'un sans l'autre.
 */
export async function enregistrerCycleCollecte(saisie: SaisieCycle): Promise<ResultatCycle> {
  const maintenant = saisie.maintenant ?? saisie.finishedAt;
  const startedAt = saisie.startedAt.toISOString();
  const finishedAt = saisie.finishedAt.toISOString();
  const dureeMs = Math.max(0, saisie.finishedAt.getTime() - saisie.startedAt.getTime());
  const memoireDelta = saisie.memoireApres.rss - saisie.memoireAvant.rss;
  const erreurs = saisie.taches.filter((t) => t.erreur !== null);
  const erreur = erreurs.length > 0
    ? erreurs.map((t) => `${t.nom}: ${t.erreur}`).join(" ; ")
    : null;

  return withTransaction(async (client) => {
    const comptes = await compilerRuns(client, startedAt, finishedAt);
    const ins = await client.query<LigneCycle>(
      `INSERT INTO collecte_cycle
         (started_at, finished_at, duree_ms, statut, sources_ok, sources_error,
          items_in, items_new, memoire_rss_octets, memoire_heap_octets,
          memoire_delta_octets, erreur)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        startedAt, finishedAt, dureeMs,
        statutDuCycle(saisie.taches, comptes.sourcesError),
        comptes.sourcesOk, comptes.sourcesError, comptes.itemsIn, comptes.itemsNew,
        saisie.memoireApres.rss, saisie.memoireApres.heapUsed, memoireDelta, erreur,
      ],
    );
    const ligne = ins.rows[0];
    if (!ligne) throw new Error("cycle de collecte non écrit");
    const cycle = cycleDepuisLigne(ligne);
    return { cycle, alertes: await ecrireAlertes(client, cycle, maintenant) };
  });
}

export async function lireCycles(limit = 20): Promise<CycleCollecte[]> {
  const r = await query<LigneCycle>(
    `SELECT * FROM collecte_cycle ORDER BY finished_at DESC, id DESC LIMIT $1`,
    [limit],
  );
  return r.rows.map(cycleDepuisLigne);
}

export async function lireAlertes(limit = 20): Promise<AlerteSupervision[]> {
  const r = await query<{
    id: string | number;
    ruleId: string;
    titre: string;
    severite: string | number;
    statut: string;
    sourceId: string | null;
    cycleId: string | number | null;
    createdAt: string;
  }>(
    `SELECT a.id, a.rule_id AS "ruleId", a.title AS titre, a.severity AS severite,
            a.status AS statut, a.evidence->>'sourceId' AS "sourceId",
            (a.evidence->>'cycleId')::int AS "cycleId", a.created_at AS "createdAt"
       FROM alert a
      WHERE a.scope = $1
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $2`,
    [ALERT_SCOPE_SUPERVISION, limit],
  );
  return r.rows.map((ligne) => ({
    id: Number(ligne.id),
    ruleId: ligne.ruleId,
    titre: ligne.titre,
    severite: Number(ligne.severite),
    statut: ligne.statut,
    sourceId: ligne.sourceId,
    cycleId: ligne.cycleId === null ? null : Number(ligne.cycleId),
    createdAt: new Date(ligne.createdAt).toISOString(),
  }));
}

/** Résumé sur 24 h, calculé en SQL pour rester identique à la base interrogée. */
export type ResumeCollecte = {
  cycles: number;
  cyclesEchoues: number;
  dureeMoyenneMs: number;
  dureeMaxMs: number;
  sourcesOk: number;
  sourcesError: number;
  itemsIn: number;
  itemsNew: number;
  memoireMaxOctets: number;
};

export async function lireResume(): Promise<ResumeCollecte> {
  const r = await query<Record<string, string | number>>(
    `SELECT COUNT(*)::int AS cycles,
            COUNT(*) FILTER (WHERE statut <> 'ok')::int AS "cyclesEchoues",
            COALESCE(ROUND(AVG(duree_ms)), 0)::int AS "dureeMoyenneMs",
            COALESCE(MAX(duree_ms), 0)::int AS "dureeMaxMs",
            COALESCE(SUM(sources_ok), 0)::int AS "sourcesOk",
            COALESCE(SUM(sources_error), 0)::int AS "sourcesError",
            COALESCE(SUM(items_in), 0)::int AS "itemsIn",
            COALESCE(SUM(items_new), 0)::int AS "itemsNew",
            COALESCE(MAX(memoire_rss_octets), 0)::bigint AS "memoireMaxOctets"
       FROM collecte_cycle
      WHERE finished_at >= now() - interval '24 hours'`,
  );
  const l = r.rows[0] ?? {};
  return {
    cycles: Number(l.cycles ?? 0),
    cyclesEchoues: Number(l.cyclesEchoues ?? 0),
    dureeMoyenneMs: Number(l.dureeMoyenneMs ?? 0),
    dureeMaxMs: Number(l.dureeMaxMs ?? 0),
    sourcesOk: Number(l.sourcesOk ?? 0),
    sourcesError: Number(l.sourcesError ?? 0),
    itemsIn: Number(l.itemsIn ?? 0),
    itemsNew: Number(l.itemsNew ?? 0),
    memoireMaxOctets: Number(l.memoireMaxOctets ?? 0),
  };
}
