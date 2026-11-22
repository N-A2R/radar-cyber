/**
 * Runs de collecte : la chaîne de preuve d'un événement.
 *
 * Depuis la migration 206, `event` exige (1) une `source_url` non vide et
 * (2) un `evidence->>'run_id'` qui désigne une ligne de `collector_run`. Un run
 * doit donc être ouvert **avant** d'écrire les événements qu'il produit, puis
 * clôturé avec ses compteurs — l'ordre inverse (écrire les événements, puis
 * créer le run) ne permet plus de citer le run au moment de l'insertion.
 *
 * Les helpers acceptent un exécuteur SQL : les chemins transactionnels
 * (promotion d'une revendication, rejeu) ouvrent et clôturent leur run dans la
 * même transaction que l'événement.
 */
import { ingestQuery } from "../db.js";

/** Nature du run ; la valeur est stockée dans `collector_run.kind`. */
export type RunKind = "live" | "scan" | "ingest" | "analyst" | "import" | "replay" | "backfill";

export type SqlRunner = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;

export type RunOutcome = {
  status?: "ok" | "error";
  itemsIn?: number;
  itemsNew?: number;
  itemsSkipped?: number;
  itemsRejected?: Record<string, unknown> | null;
  error?: string | null;
};

/** Ouvre un run `running` et rend son identifiant à citer dans `evidence`. */
export async function openRunWith(
  run: SqlRunner,
  sourceId: string,
  kind: RunKind,
): Promise<number> {
  const { rows } = await run(
    "INSERT INTO collector_run (source_id, status, kind) VALUES ($1, 'running', $2) RETURNING id",
    [sourceId, kind],
  );
  const id = Number(rows[0]?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`run de collecte non créé pour la source ${sourceId}`);
  }
  return id;
}

/** Clôt un run avec ses compteurs ; `error` est borné comme avant la 206. */
export async function closeRunWith(run: SqlRunner, runId: number, outcome: RunOutcome = {}): Promise<void> {
  await run(
    `UPDATE collector_run
        SET finished_at = now(), status = $2, items_in = $3, items_new = $4,
            items_skipped = $5, items_rejected = $6, error = $7
      WHERE id = $1`,
    [
      runId,
      outcome.status ?? "ok",
      outcome.itemsIn ?? 0,
      outcome.itemsNew ?? 0,
      outcome.itemsSkipped ?? 0,
      outcome.itemsRejected ? JSON.stringify(outcome.itemsRejected) : null,
      outcome.error ? outcome.error.slice(0, 500) : null,
    ],
  );
}

/** Variante sur le pool de collecte (cas courant hors transaction). */
export function openRun(sourceId: string, kind: RunKind = "live"): Promise<number> {
  return openRunWith(ingestQuery, sourceId, kind);
}

export function closeRun(runId: number, outcome: RunOutcome = {}): Promise<void> {
  return closeRunWith(ingestQuery, runId, outcome);
}

/**
 * Ajoute `run_id` à une preuve sans écraser ce que le collecteur y a mis.
 * `run_id` est stocké en texte : `evidence->>'run_id'` est la forme que le
 * CHECK et les audits interrogent, quelle que soit la façon de l'écrire.
 */
export function withRunId<T extends Record<string, unknown>>(
  evidence: T | null | undefined,
  runId: number,
): T & { run_id: string } {
  return { ...(evidence ?? ({} as T)), run_id: String(runId) };
}
