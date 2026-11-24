/**
 * File d'attente des enrichissements en échec.
 *
 * Un enrichisseur externe (WHOIS, DNS, certificats, réputation) peut échouer
 * sans faire échouer la requête : l'échec est désormais une ligne `enrich_job`
 * avec un état, un compteur de tentatives et une prochaine échéance. Le rejeu
 * est explicite (`replayEnrichJob`) ou planifié (`processDueEnrichJobs`).
 *
 * Bornes : `MAX_ATTEMPTS` tentatives par cible, un lot fini par passage, et
 * une transition `running` conditionnelle avec bail. `done` et `abandoned`
 * sont terminaux : une lecture ou un enqueue ne peut pas les réarmer. Les
 * `running` dont le bail est expiré sont rapatriés avant chaque passage, pour
 * qu'un crash entre la réservation et l'exécution ne perde pas la cible.
 *
 * Le délai de reprise est calculé une seule fois par `backoffDelayMs` ; la
 * valeur est passée en paramètre aux UPSERT, il n'y a pas de seconde formule
 * côté SQL.
 */
import { ingestQuery } from "../db.js";
import { enrichIndicator } from "./index.js";

export const MAX_ATTEMPTS = 5;
export const BATCH_LIMIT = 20;
const BASE_DELAY_MS = 60_000;
const MAX_DELAY_MS = 24 * 60 * 60_000;
/** Un `running` non renouvelé pendant 5 minutes est considéré abandonné par son exécutant. */
const BAIL_SECONDES = 300;
/** DELAI_SECONDES[step] = backoffDelayMs(step) en secondes (step = tentative suivante). */
const DELAI_SECONDES = Array.from(
	{ length: MAX_ATTEMPTS + 2 },
	(_, step) => Math.round(backoffDelayMs(step) / 1000),
);

export type EnrichJobState = "pending" | "running" | "failed" | "partial" | "done" | "abandoned";

export interface EnrichTarget {
  type: string;
  value: string;
}

export interface EnrichJob {
  id: number;
  target_kind: string;
  target_value: string;
  state: EnrichJobState;
  attempts: number;
  next_try_at: Date | string | null;
  last_error: string | null;
  last_result: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

export type Enricher = (target: EnrichTarget) => Promise<{ errors?: string[] }>;

export interface JobAttempt {
  job: EnrichJob;
  ok: boolean;
}

/** Délai de reprise exponentiel : 1, 2, 4, 8… minutes, plafonné à 24 h. */
export function backoffDelayMs(attempts: number): number {
  if (!Number.isFinite(attempts)) return MAX_DELAY_MS;
  const step = Math.max(1, Math.floor(attempts));
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.min(step - 1, 30));
}

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1000);
}

/** Seuls les indicateurs techniques entrent dans la file : jamais de donnée personnelle. */
function normalizeTarget(target: EnrichTarget): { kind: string; value: string } | null {
  const kind = (target.type ?? "").toLowerCase();
  if (!["domain", "url", "ip", "hash"].includes(kind)) return null;
  const value = typeof target.value === "string" ? target.value.trim() : "";
  if (!value || value.length > 512) return null;
  return { kind, value };
}

const COMPOSANTES = ["domain", "dns", "certs", "reverse", "reputation"] as const;

/** Un résultat partiel garde au moins une composante exploitable malgré les erreurs. */
function aDonneesPartielles(resultat: { errors?: string[] } | null): boolean {
  if (!resultat || typeof resultat !== "object") return false;
  const valeurs: Record<string, unknown> = resultat;
  return COMPOSANTES.some((cle) => {
    const valeur = valeurs[cle];
    if (Array.isArray(valeur)) return valeur.length > 0;
    return valeur !== null && valeur !== undefined && valeur !== "";
  });
}

export async function findEnrichJob(target: EnrichTarget): Promise<EnrichJob | null> {
  const normalized = normalizeTarget(target);
  if (!normalized) return null;
  const r = await ingestQuery<EnrichJob>(
    "SELECT * FROM enrich_job WHERE target_kind=$1 AND target_value=$2",
    [normalized.kind, normalized.value],
  );
  return r.rows[0] ?? null;
}

/** Crée ou réarme un job ; un état terminal reste terminal. */
export async function enqueueEnrichment(target: EnrichTarget): Promise<EnrichJob | null> {
  const normalized = normalizeTarget(target);
  if (!normalized) return null;
  const r = await ingestQuery<EnrichJob>(
    `INSERT INTO enrich_job (target_kind, target_value, state)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (target_kind, target_value) DO UPDATE SET
       state = CASE WHEN enrich_job.state IN ('done', 'abandoned') THEN enrich_job.state ELSE 'pending' END,
       next_try_at = CASE WHEN enrich_job.state IN ('done', 'abandoned') THEN enrich_job.next_try_at ELSE now() END,
       updated_at = now()
     RETURNING *`,
    [normalized.kind, normalized.value],
  );
  return r.rows[0] ?? null;
}

/**
 * Enregistre un échec venant d'une requête de lecture. Un job terminal n'est
 * pas rouvert : la lecture affiche le job, elle ne compte pas une tentative.
 */
export async function recordEnrichmentFailure(
  target: EnrichTarget,
  error: unknown,
): Promise<EnrichJob | null> {
  const normalized = normalizeTarget(target);
  if (!normalized) return null;
  const r = await ingestQuery<EnrichJob>(
    `INSERT INTO enrich_job (target_kind, target_value, state, attempts, next_try_at, last_error)
     VALUES ($1, $2, 'failed', 1, $3, $4)
     ON CONFLICT (target_kind, target_value) DO UPDATE SET
       attempts = enrich_job.attempts + 1,
       state = CASE WHEN enrich_job.attempts + 1 >= $5 THEN 'abandoned' ELSE 'failed' END,
       next_try_at = CASE WHEN enrich_job.attempts + 1 >= $5 THEN NULL
                          ELSE now() + (($6::int[])[LEAST(enrich_job.attempts + 1, $7)] || ' seconds')::interval END,
       last_error = EXCLUDED.last_error,
       updated_at = now()
     WHERE enrich_job.state IN ('pending', 'failed', 'running', 'partial')
     RETURNING *`,
    [
      normalized.kind, normalized.value,
      new Date(Date.now() + backoffDelayMs(1)).toISOString(),
      truncateError(error), MAX_ATTEMPTS, DELAI_SECONDES, DELAI_SECONDES.length - 1,
    ],
  );
  return r.rows[0] ?? null;
}

/** Ferme un job réussi : plus de nouvelle tentative, résultat conservé en jsonb. */
export async function markEnrichJobDone(id: number, result: unknown): Promise<EnrichJob | null> {
  const r = await ingestQuery<EnrichJob>(
    `UPDATE enrich_job
        SET state='done', next_try_at=NULL, last_error=NULL,
            last_result=$2::jsonb, updated_at=now()
      WHERE id=$1 RETURNING *`,
    [id, JSON.stringify(result ?? {})],
  );
  return r.rows[0] ?? null;
}

async function markEnrichJobRunning(id: number): Promise<EnrichJob | null> {
  const r = await ingestQuery<EnrichJob>(
    `UPDATE enrich_job
        SET state='running',
            next_try_at=now() + ($2 || ' seconds')::interval,
            updated_at=now()
      WHERE id=$1
        AND (state IN ('pending', 'failed', 'partial')
             OR (state='running' AND next_try_at IS NOT NULL AND next_try_at <= now()))
      RETURNING *`,
    [id, String(BAIL_SECONDES)],
  );
  return r.rows[0] ?? null;
}

/**
 * Rapatrie les `running` dont le bail est expiré. Le délai utilisé est le même
 * que celui d'un échec normal, calculé par `backoffDelayMs`.
 */
export async function rapatrierBauxEnrichissement(now: number = Date.now()): Promise<number> {
  const r = await ingestQuery<{ id: number }>(
    `UPDATE enrich_job
        SET attempts=attempts+1,
            state=CASE WHEN attempts+1 >= $1 THEN 'abandoned' ELSE 'failed' END,
            next_try_at=CASE WHEN attempts+1 >= $1 THEN NULL
                             ELSE now() + (($3::int[])[LEAST(attempts+1, $4)] || ' seconds')::interval END,
            last_error='bail expiré : exécution interrompue avant la fin',
            updated_at=now()
      WHERE state='running' AND next_try_at IS NOT NULL AND next_try_at <= $2::timestamptz
      RETURNING id`,
    [MAX_ATTEMPTS, new Date(now).toISOString(), DELAI_SECONDES, DELAI_SECONDES.length - 1],
  );
  return r.rows.length;
}

async function recordFailureById(
  id: number,
  error: unknown,
  resultat: { errors?: string[] } | null = null,
): Promise<EnrichJob | null> {
  const partiel = aDonneesPartielles(resultat);
  const r = await ingestQuery<EnrichJob>(
    `UPDATE enrich_job
        SET attempts=attempts+1,
            state=CASE WHEN attempts+1 >= $2 THEN 'abandoned'
                       WHEN $5 THEN 'partial' ELSE 'failed' END,
            next_try_at=CASE WHEN attempts+1 >= $2 THEN NULL
                             ELSE now() + (($6::int[])[LEAST(attempts+1, $7)] || ' seconds')::interval END,
            last_error=$3, last_result=$4::jsonb, updated_at=now()
      WHERE id=$1 RETURNING *`,
    [
      id, MAX_ATTEMPTS, truncateError(error), JSON.stringify(resultat ?? {}),
      partiel, DELAI_SECONDES, DELAI_SECONDES.length - 1,
    ],
  );
  return r.rows[0] ?? null;
}

async function runJob(job: EnrichJob, enricher: Enricher): Promise<JobAttempt | null> {
  // Transition conditionnelle : deux passages concurrents ne traitent jamais
  // deux fois la même ligne, et le bail est repris s'il a expiré.
  const claimed = await markEnrichJobRunning(job.id);
  if (!claimed) return null;
  const target = { type: claimed.target_kind, value: claimed.target_value };
  try {
    const resultat = await enricher(target);
    const errors = Array.isArray(resultat?.errors) ? resultat.errors.filter(Boolean) : [];
    if (errors.length > 0) {
      const failed = await recordFailureById(claimed.id, errors.join("; "), resultat);
      return failed ? { job: failed, ok: false } : null;
    }
    const done = await markEnrichJobDone(claimed.id, resultat);
    return done ? { job: done, ok: true } : null;
  } catch (error) {
    const failed = await recordFailureById(claimed.id, error);
    return failed ? { job: failed, ok: false } : null;
  }
}

/**
 * Rejoue un job non terminal après correction de sa cible (fixture, fournisseur,
 * règle). Les états `done` et `abandoned` sont terminaux : un rejeu manuel ne
 * peut pas relancer indéfiniment une tâche épuisée.
 */
export async function replayEnrichJob(
  id: number | string,
  enricher: Enricher = enrichIndicator,
): Promise<JobAttempt | null> {
  // bigserial : `pg` restitue l'identifiant sous forme de chaîne.
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || jobId <= 0) return null;
  await rapatrierBauxEnrichissement();
  const r = await ingestQuery<EnrichJob>("SELECT * FROM enrich_job WHERE id=$1", [jobId]);
  const job = r.rows[0];
  if (!job || !["failed", "pending", "partial"].includes(job.state)) return null;
  return runJob(job, enricher);
}

export async function listEnrichJobs(options: { state?: string; limit?: number } = {}): Promise<EnrichJob[]> {
  const limit = Math.min(200, Math.max(1, Math.floor(options.limit ?? 100)));
  const r = await ingestQuery<EnrichJob>(
    `SELECT * FROM enrich_job
      WHERE ($1::text IS NULL OR state = $1)
      ORDER BY created_at DESC, id DESC LIMIT $2`,
    [options.state ?? null, limit],
  );
  return r.rows;
}

export interface ProcessResult {
  scanned: number;
  succeeded: number;
  failed: number;
}

/**
 * Traite au plus `limit` jobs échus, une seule fois chacun. `now` est
 * injectable pour tester les échéances sans attendre le backoff réel. Les baux
 * expirés sont rapatriés avant la sélection.
 */
export async function processDueEnrichJobs(options: {
  enricher?: Enricher;
  limit?: number;
  now?: number;
  target?: EnrichTarget;
} = {}): Promise<ProcessResult> {
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? BATCH_LIMIT)));
  const enricher = options.enricher ?? enrichIndicator;
  const now = options.now ?? Date.now();
  await rapatrierBauxEnrichissement(now);
  const targetValue = options.target ? normalizeTarget(options.target)?.value ?? null : null;
  const due = await ingestQuery<EnrichJob>(
    `SELECT * FROM enrich_job
      WHERE state IN ('pending', 'failed', 'partial')
        AND attempts < $1
        AND (next_try_at IS NULL OR next_try_at <= $2::timestamptz)
        AND ($4::text IS NULL OR target_value = $4)
      ORDER BY created_at ASC, id ASC LIMIT $3`,
    [MAX_ATTEMPTS, new Date(now).toISOString(), limit, targetValue],
  );
  const result: ProcessResult = { scanned: due.rows.length, succeeded: 0, failed: 0 };
  for (const job of due.rows) {
    const attempt = await runJob(job, enricher);
    if (!attempt) continue;
    if (attempt.ok) result.succeeded++;
    else result.failed++;
  }
  return result;
}
