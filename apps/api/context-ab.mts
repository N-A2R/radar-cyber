/** Mesure A/B : ancienne file vs file + contexte, en temps mural et temps CPU. */
import { closePools, query } from "./src/db.js";
import { reviewQueue } from "./src/quarantine/review.js";

const params = {
	status: "pending", onlyPendingWithHint: true, enriched: true, limit: 50, page: 0,
} as const;

async function contexteRoute(ids: number[]) {
	if (ids.length === 0) return;
	await query<{ id: number; raw_body: string | null; titre_source: string | null }>(
		`SELECT id, left(raw_body, 500) AS raw_body,
		        COALESCE(NULLIF(btrim(extracted->>'title'), ''),
		                 NULLIF(btrim(extracted->>'titre_brut'), '')) AS titre_source
		   FROM quarantine_raw WHERE id = ANY($1::bigint[])`,
		[ids],
	);
}

async function mesure(f: () => Promise<void>): Promise<{ wall: number; cpu: number }> {
	const cpuStart = process.cpuUsage();
	const t = performance.now();
	await f();
	const cpu = process.cpuUsage(cpuStart);
	return { wall: performance.now() - t, cpu: (cpu.user + cpu.system) / 1000 };
}

async function avant() {
	const r = await reviewQueue(params);
	await contexteRoute(r.rows.map((row) => row.id));
}

async function apres() {
	await reviewQueue({ ...params, avecContexte: true });
}

for (let i = 0; i < 3; i++) { await mesure(avant); await mesure(apres); }
const a: Array<{ wall: number; cpu: number }> = [];
const b: Array<{ wall: number; cpu: number }> = [];
for (let i = 0; i < 12; i++) {
	a.push(await mesure(avant));
	b.push(await mesure(apres));
}
const stats = (x: number[]) => {
	const s = [...x].sort((p, q) => p - q);
	return {
		moyenne: Number((x.reduce((p, q) => p + q, 0) / x.length).toFixed(1)),
		p50: Number(s[Math.floor(s.length * 0.5)].toFixed(1)),
		p95: Number(s[Math.floor(s.length * 0.95)].toFixed(1)),
	};
};
const aggregate = (x: Array<{ wall: number; cpu: number }>) => ({
	wall: stats(x.map((v) => v.wall)),
	cpu: stats(x.map((v) => v.cpu)),
});
console.log(JSON.stringify({ avant: aggregate(a), apres: aggregate(b) }, null, 2));
await closePools();
