/**
 * Sonde temporaire de mesure de GET /api/review/queue sur la base 5433.
 * Log SQL activé : toute requête passant par pg.Pool est tracée (texte + ms),
 * avec un numéro d'appel, dans bench-review-queue-<phase>.sql.log.
 * Usage : DATABASE_URL=... tsx bench-review-queue.mts baseline|after
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import Fastify from "fastify";
import { Pool } from "pg";
import reviewRoute from "./src/routes/review.js";
import { closePools, query } from "./src/db.js";

const phase = process.argv[2] ?? "mesure";
if (!["baseline", "after"].includes(phase)) throw new Error("phase: baseline|after");

type SqlEvent = { sql: string; ms: number };
let capture: SqlEvent[] | null = null;
const originalQuery = Pool.prototype.query;
// @ts-expect-error instrument volontaire du pool pg
Pool.prototype.query = function (...args: unknown[]) {
	const started = performance.now();
	const sql = String(args[0] ?? "").replace(/\s+/g, " ").slice(0, 240);
	// @ts-expect-error appel d'origine avec le bon this
	const result = originalQuery.apply(this, args);
	if (capture) {
		Promise.resolve(result).then(
			() => capture?.push({ sql, ms: Number((performance.now() - started).toFixed(1)) }),
			() => capture?.push({ sql, ms: Number((performance.now() - started).toFixed(1)) }),
		);
	}
	return result;
};

const tag = `perf-${phase}-${Date.now().toString(36)}`;
const token = `tok-${tag}`;
const email = `${tag}@perf.test`;
const log: string[] = [];

const user = await query<{ id: number }>(
	"INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','lecteur') RETURNING id",
	[email],
);
await query(
	"INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
	[createHash("sha256").update(token).digest("hex"), user.rows[0].id],
);
const app = Fastify({ logger: false });
await app.register(reviewRoute, { prefix: "/api" });
await app.listen({ host: "127.0.0.1", port: 0 });
const address = app.server.address();
if (!address || typeof address === "string") throw new Error("pas de port");
const url = `http://127.0.0.1:${address.port}/api/review/queue`;

function percentile(values: number[], p: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
}

try {
	const latencies: number[] = [];
	const sqlCounts: number[] = [];
	const perSql = new Map<string, number[]>();
	const headers = { authorization: `Bearer ${token}` };
	for (let i = 0; i < 2; i += 1) {
		const warm = await fetch(url, { headers });
		if (!warm.ok) throw new Error(`warmup HTTP ${warm.status}: ${await warm.text()}`);
		await warm.arrayBuffer();
	}

	for (let i = 1; i <= 10; i += 1) {
		capture = [];
		const started = performance.now();
		const res = await fetch(url, { headers });
		const text = await res.text();
		const ms = Number((performance.now() - started).toFixed(1));
		const events = capture;
		capture = null;
		if (!res.ok) {
			writeFileSync(`apps/api/bench-review-queue-${phase}.sql.log`, log.join("\n") + "\n");
			throw new Error(`appel ${i}: HTTP ${res.status}: ${text.slice(0, 500)}`);
		}
		const body = JSON.parse(text) as { rows: unknown[]; total: number };
		if (body.rows.length === 0) throw new Error(`appel ${i}: file vide`);
		latencies.push(ms);
		sqlCounts.push(events.length);
		log.push(`--- appel ${i}: ${ms} ms, ${events.length} SQL, ${body.rows.length} lignes affichées / ${body.total} ---`);
		for (const event of events) {
			log.push(`  ${String(event.ms).padStart(8)} ms  ${event.sql}`);
			const key = event.sql.replace(/'[^']*'/g, "'?'");
			const list = perSql.get(key) ?? [];
			list.push(event.ms);
			perSql.set(key, list);
		}
		writeFileSync(`apps/api/bench-review-queue-${phase}.sql.log`, log.join("\n") + "\n");
	}

	log.push("");
	log.push(`phase=${phase} p50=${percentile(latencies, 0.5)} p95=${percentile(latencies, 0.95)} max=${Math.max(...latencies)}`);
	log.push(`SQL par appel: ${sqlCounts.join(", ")}`);
	log.push("");
	log.push("Temps cumulé par requête (sur 10 appels) :");
	for (const [sql, times] of [...perSql.entries()].sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0))) {
		log.push(`  ${times.reduce((x, y) => x + y, 0).toFixed(1).padStart(10)} ms  x${String(times.length).padStart(3)}  ${sql}`);
	}
	writeFileSync(`apps/api/bench-review-queue-${phase}.sql.log`, log.join("\n") + "\n");
	console.log(log.slice(-15).join("\n"));
} finally {
	await app.close();
	await query("DELETE FROM app_session WHERE token=$1", [createHash("sha256").update(token).digest("hex")]);
	await query("DELETE FROM app_user WHERE email=$1", [email]);
	await closePools();
}
