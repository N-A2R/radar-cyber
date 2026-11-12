/**
 * Banc « annuaire à l'échelle » — ancien chemin contre nouveau.
 *
 * Compare `GET /orgs` (toute la table, filtrage en mémoire côté navigateur) au
 * nouveau `queryDirectory` (pagination, facettes et classement côté serveur),
 * sur le vrai référentiel NA puis sur un palier synthétique plus gros.
 *
 * Le palier synthétique est inséré puis **supprimé** dans un `finally` : le
 * référentiel n'est pas pollué. Ne pas lancer sur une base de production.
 *
 *   DATABASE_URL=... tsx bench/directory/probe.mts
 *   DATABASE_URL=... tsx bench/directory/probe.mts --scale 100000 --json bench/results/NA-directory.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { closePools, query } from "../../apps/api/src/db.js";
import { queryDirectory, type DirectoryParams } from "../../apps/api/src/directory/query.js";

const argv = process.argv.slice(2);
const SCALE = Number(argv.includes("--scale") ? argv[argv.indexOf("--scale") + 1] : 0);
const JSON_OUT = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : null;
const REPEATS = 25;
const SYNTH_PREFIX = "bench-synth-";

function percentile(values: number[], p: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	return Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(1));
}

async function timeIt(fn: () => Promise<{ payload: unknown; total?: number }>): Promise<{
	p50: number; p95: number; bytes: number; total: number | null;
}> {
	const durations: number[] = [];
	let bytes = 0;
	let total: number | null = null;
	for (let i = 0; i < REPEATS; i++) {
		const started = performance.now();
		const result = await fn();
		durations.push(performance.now() - started);
		bytes = Buffer.byteLength(JSON.stringify(result.payload));
		total = result.total ?? null;
	}
	return { p50: percentile(durations, 0.5), p95: percentile(durations, 0.95), bytes, total };
}

const SCENARIOS: Array<{ id: string; params: DirectoryParams }> = [
	{ id: "première page", params: { limit: 50, page: 0, sort: "name" } },
	{ id: "page 10", params: { limit: 50, page: 10, sort: "name" } },
	{ id: "page 80", params: { limit: 50, page: 80, sort: "name" } },
	{ id: "filtre département", params: { dept: "33", limit: 50 } },
	{ id: "filtre secteur", params: { sector: "epci", limit: 50 } },
	{ id: "tri par activité", params: { sort: "eventCount", dir: "desc", limit: 50 } },
	{ id: "recherche exacte", params: { q: "Pessac", limit: 50 } },
	{ id: "recherche par alias", params: { q: "mairie de pessac", limit: 50 } },
	{ id: "recherche fautive", params: { q: "Pesssac", limit: 50 } },
	{ id: "recherche large", params: { q: "saint", limit: 50 } },
	{ id: "recherche EPCI", params: { q: "communauté de communes", limit: 50 } },
];

async function measure(label: string) {
	const orgCount = Number((await query<{ n: string }>("SELECT count(*)::text AS n FROM org")).rows[0].n);
	const aliasCount = Number((await query<{ n: string }>("SELECT count(*)::text AS n FROM org_alias")).rows[0].n);
	console.log(`\n=== ${label} : ${orgCount.toLocaleString("fr-FR")} organisations, ${aliasCount.toLocaleString("fr-FR")} alias ===`);

	const legacy = await timeIt(async () => {
		const r = await query(
			`SELECT o.id, o.name, o.slug, o.kind, o.sector, o.city, o.dept, o.website, o.domain, o.lat, o.lon,
			        COUNT(e.id)::int AS event_count
			   FROM org o LEFT JOIN event e ON e.org_id=o.id
			  GROUP BY o.id ORDER BY o.name`,
		);
		return { payload: r.rows, total: r.rows.length };
	});
	console.log(
		`ancien GET /orgs (tout)      p50 ${String(legacy.p50).padStart(7)} ms | p95 ${String(legacy.p95).padStart(7)} ms | ` +
		`${(legacy.bytes / 1024).toFixed(0).padStart(7)} Ko | ${legacy.total} lignes`,
	);

	const rows: Array<Record<string, unknown>> = [];
	for (const scenario of SCENARIOS) {
		const measured = await timeIt(async () => {
			const result = await queryDirectory(scenario.params);
			return { payload: result, total: result.total };
		});
		rows.push({ scenario: scenario.id, ...measured, params: scenario.params });
		console.log(
			`${scenario.id.padEnd(26)} p50 ${String(measured.p50).padStart(7)} ms | p95 ${String(measured.p95).padStart(7)} ms | ` +
			`${(measured.bytes / 1024).toFixed(1).padStart(7)} Ko | ${String(measured.total).padStart(6)} résultats`,
		);
	}
	return { label, organisations: orgCount, alias: aliasCount, ancien: legacy, scenarios: rows };
}

async function main(): Promise<void> {
	const reports = [await measure("référentiel réel")];

	if (SCALE > 0) {
		console.log(`\ninsertion de ${SCALE.toLocaleString("fr-FR")} organisations synthétiques…`);
		const started = performance.now();
		await query(
			`INSERT INTO org (name, slug, kind, sector, city, dept, status, lat, lon)
			 SELECT 'Entreprise synthétique ' || g,
			        $1 || g,
			        'entreprise', 'production', 'Ville ' || (g % 500),
			        LPAD((16 + (g % 12))::text, 2, '0'), 'confirme',
			        44.0 + (g % 100) / 100.0, -0.5 + (g % 100) / 100.0
			   FROM generate_series(1, $2::int) g`,
			[SYNTH_PREFIX, SCALE],
		);
		await query(
			`INSERT INTO org_alias (org_id, alias, source)
			 SELECT id, 'Société synthétique ' || split_part(slug, '-', 3), 'bench'
			   FROM org WHERE slug LIKE $1 || '%'
			 ON CONFLICT DO NOTHING`,
			[SYNTH_PREFIX],
		);
		console.log(`insérées en ${((performance.now() - started) / 1000).toFixed(1)} s`);
		try {
			reports.push(await measure(`palier synthétique ${SCALE.toLocaleString("fr-FR")}`));
		} finally {
			const removed = await query("DELETE FROM org WHERE slug LIKE $1 || '%'", [SYNTH_PREFIX]);
			console.log(`\nnettoyage : ${removed.rowCount} organisations synthétiques supprimées`);
		}
	}

	if (JSON_OUT) {
		mkdirSync(dirname(JSON_OUT), { recursive: true });
		writeFileSync(JSON_OUT, `${JSON.stringify({ repetitions: REPEATS, paliers: reports }, null, 2)}\n`);
		console.log(`écrit ${JSON_OUT}`);
	}
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		// Filet de sécurité : si le nettoyage n'a pas eu lieu, on ne laisse pas
		// le palier synthétique derrière nous.
		await query("DELETE FROM org WHERE slug LIKE $1 || '%'", [SYNTH_PREFIX]).catch(() => {});
		await closePools();
	});
