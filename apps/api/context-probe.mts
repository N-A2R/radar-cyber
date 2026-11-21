/**
 * Banc HTTP local pour GET /api/review/queue (mesure avant/après contexte).
 * Usage : DATABASE_URL=... apps/api/node_modules/.bin/tsx apps/api/context-probe.mts [--seed]
 */
import Fastify from "fastify";
import { hashSessionToken } from "./src/auth.js";
import { closePools, query } from "./src/db.js";
import authRoute from "./src/routes/auth.js";
import reviewRoute from "./src/routes/review.js";
import { classifierIndice } from "./src/match/famille-indice.js";

const EMAIL = "context-probe@bench.test";
const TOKEN = "tok-context-probe";

if (process.argv.includes("--seed")) {
	const { rows } = await query<{ id: number; org_hint: string | null }>(
		"SELECT id, org_hint FROM quarantine_raw WHERE kind='claim' AND status='pending' ORDER BY id",
	);
	let noms = 0;
	for (const row of rows) {
		const hint = (row.org_hint ?? "").trim();
		if (classifierIndice(hint) === "nom") noms++;
		const corps = `Avis de compromission — dossier ${row.id}. `
			+ "Le journal précise que la structure concernée est "
			+ `${hint || "non identifiée"}, avec des éléments de contexte complémentaires. `
			+ "Les équipes ont relevé plusieurs artefacts et l'analyse se poursuit. ".repeat(8);
		await query("UPDATE quarantine_raw SET raw_body=$1 WHERE id=$2", [corps, row.id]);
	}
	console.log(`jeu : ${rows.length} corps bruts, ${noms} indices de famille « nom »`);
}

await query("DELETE FROM app_session WHERE token=$1", [hashSessionToken(TOKEN)]);
await query("DELETE FROM app_user WHERE email=$1", [EMAIL]);
const user = await query<{ id: number }>(
	"INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','lecteur') RETURNING id",
	[EMAIL],
);
await query(
	"INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
	[hashSessionToken(TOKEN), user.rows[0].id],
);

const app = Fastify();
await app.register(authRoute, { prefix: "/api" });
await app.register(reviewRoute, { prefix: "/api" });
await app.ready();

const wall: number[] = [];
const service: number[] = [];
let size = 0;
for (let i = 0; i < 12; i++) {
	const started = performance.now();
	const res = await app.inject({
		method: "GET",
		url: "/api/review/queue?limit=50",
		headers: { authorization: `Bearer ${TOKEN}` },
	});
	const elapsed = performance.now() - started;
	if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}: ${res.body.slice(0, 300)}`);
	const body = res.json<{ tookMs: number; rows: unknown[] }>();
	size = body.rows.length;
	if (i >= 3) {
		wall.push(elapsed);
		service.push(body.tookMs);
	}
}
await app.close();

const sorted = [...wall].sort((a, b) => a - b);
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
console.log(JSON.stringify({
	lignes: size,
	echantillons: wall.length,
	wallMoyenneMs: Number(mean(wall).toFixed(1)),
	wallP50Ms: Number(sorted[Math.floor(sorted.length * 0.5)].toFixed(1)),
	wallP95Ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(1)),
	serviceMoyenMs: Number(mean(service).toFixed(1)),
}, null, 2));
await closePools();
