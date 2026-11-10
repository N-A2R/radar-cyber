import type { PoolClient } from "pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";

/**
 * Deux pools séparés, volontairement.
 *
 * La collecte (296 flux, concurrence 8) peut tenir des connexions longtemps.
 * Avec un pool unique, elle affamait les routes HTTP : /api/health tombait en
 * timeout alors que la base répondait. Un pool par usage garantit qu'une
 * collecte lente ne bloque jamais une requête utilisateur.
 */
export const pool = new Pool({
	connectionString,
	max: Number(process.env.RADAR_PG_API_MAX ?? 8),
	statement_timeout: Number(process.env.RADAR_PG_API_TIMEOUT_MS ?? 15000),
	idleTimeoutMillis: 30000,
	application_name: "radar-api",
});

export const ingestPool = new Pool({
	connectionString,
	max: Number(process.env.RADAR_PG_INGEST_MAX ?? 6),
	// Insertions par lots (indicator : 5,6 M de lignes) : marge plus large.
	statement_timeout: Number(process.env.RADAR_PG_INGEST_TIMEOUT_MS ?? 180000),
	idleTimeoutMillis: 30000,
	application_name: "radar-ingest",
});

export type QueryResult<T> = { rows: T[]; rowCount: number | null };

async function run<T>(target: Pool, text: string, params?: unknown[]): Promise<QueryResult<T>> {
	const res = await target.query(text, params);
	return { rows: res.rows as T[], rowCount: res.rowCount };
}

/** Requêtes des routes HTTP : pool réactif, timeout court. */
export async function query<T = any>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
	return run<T>(pool, text, params);
}

/** Requêtes de collecte et de maintenance : pool dédié, timeout large. */
export async function ingestQuery<T = any>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
	return run<T>(ingestPool, text, params);
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
	const client = await pool.connect();
	try {
		return await fn(client);
	} finally {
		client.release();
	}
}

/** Ferme proprement les deux pools (arrêt du process). */
export async function closePools(): Promise<void> {
	await Promise.allSettled([pool.end(), ingestPool.end()]);
}
