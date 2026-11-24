import type { PoolClient } from "pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	// Aucune cible implicite : une URL par défaut masquerait une configuration
	// manquante et pourrait écrire dans une base locale non prévue (SEC-03).
	throw new Error("DATABASE_URL is required (no implicit local fallback)");
}

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

/**
 * Transaction explicite : `BEGIN` / `COMMIT`, et `ROLLBACK` sur toute exception.
 *
 * Sans ce helper, les chemins qui écrivent deux fois (promotion d'une
 * revendication puis création de l'événement, archivage puis projection)
 * laissaient la base dans un état intermédiaire quand le client rendu au pool
 * gardait une transaction ouverte.
 */
async function transactionOn<T>(target: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
	const client = await target.connect();
	try {
		await client.query("BEGIN");
		const result = await fn(client);
		await client.query("COMMIT");
		return result;
	} catch (error) {
		await client.query("ROLLBACK").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

export function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
	return transactionOn(pool, fn);
}

/** Bulk maintenance writes: same transaction contract, wider statement timeout. */
export function withIngestTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
	return transactionOn(ingestPool, fn);
}

/** Ferme proprement les deux pools (arrêt du process). */
export async function closePools(): Promise<void> {
	await Promise.allSettled([pool.end(), ingestPool.end()]);
}
