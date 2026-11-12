/**
 * Banc de la file de revue — préfiltre de candidats et passage à l'échelle.
 *
 * Deux mesures :
 *  1. le préfiltre de candidats face au balayage complet du moteur de
 *     quarantaine, sur les 500 revendications réelles du jeu versionné
 *     (le résultat doit être identique, cf. test différentiel) ;
 *  2. le coût d'ouverture de la file, sur le jeu réel puis sur un palier
 *     synthétique, inséré puis **supprimé**.
 *
 *   DATABASE_URL=... tsx bench/quarantine/probe.mts --scale 5000
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { closePools, query } from "../../apps/api/src/db.js";
import { loadOrgIndex, matchOrgInIndex } from "../../apps/api/src/quarantine/promote.js";
import { buildCandidateIndex, candidatesFor } from "../../apps/api/src/quarantine/candidates.js";
import { reviewQueue } from "../../apps/api/src/quarantine/review.js";

const argv = process.argv.slice(2);
const SCALE = Number(argv.includes("--scale") ? argv[argv.indexOf("--scale") + 1] : 0);
const JSON_OUT = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : null;
const SYNTH_SOURCE = "bench-synth-claims";

const fixture = JSON.parse(
	readFileSync(new URL("../fixtures/claims-sample.json", import.meta.url), "utf8"),
) as { claims: Array<{ title: string; group: string; discovered: string }> };

function percentile(values: number[], p: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	return Number(sorted[Math.floor(sorted.length * p)].toFixed(1));
}

async function main(): Promise<void> {
	const orgIndex = await loadOrgIndex();
	const candidateIndex = buildCandidateIndex(orgIndex);
	const hints = fixture.claims.map((claim) => claim.title);

	let slowMatches = 0;
	const slowStart = performance.now();
	for (const hint of hints) if (matchOrgInIndex(hint, orgIndex)) slowMatches++;
	const slowMs = performance.now() - slowStart;

	let examined = 0;
	let fastMatches = 0;
	const fastStart = performance.now();
	for (const hint of hints) {
		const subset = candidatesFor(hint, candidateIndex);
		examined += subset.length;
		if (matchOrgInIndex(hint, subset)) fastMatches++;
	}
	const fastMs = performance.now() - fastStart;

	const matching = {
		organisations: orgIndex.length,
		indices: hints.length,
		balayageCompletMs: Number(slowMs.toFixed(1)),
		prefiltreMs: Number(fastMs.toFixed(1)),
		gain: Number((slowMs / fastMs).toFixed(1)),
		candidatsExaminesEnMoyenne: Number((examined / hints.length).toFixed(1)),
		rattachementsComplets: slowMatches,
		rattachementsPrefiltres: fastMatches,
		resultatIdentique: slowMatches === fastMatches,
	};
	console.log(`\nmoteur de quarantaine, ${matching.organisations} organisations, ${matching.indices} indices`);
	console.log(`  balayage complet : ${matching.balayageCompletMs} ms (${(slowMs / hints.length).toFixed(2)} ms/indice)`);
	console.log(`  préfiltré        : ${matching.prefiltreMs} ms (${(fastMs / hints.length).toFixed(2)} ms/indice) — gain ×${matching.gain}`);
	console.log(`  candidats examinés en moyenne : ${matching.candidatsExaminesEnMoyenne} / ${matching.organisations}`);
	console.log(`  rattachements identiques : ${matching.resultatIdentique} (${slowMatches})`);

	async function measureQueue(label: string) {
		const durations: number[] = [];
		let snapshot: Awaited<ReturnType<typeof reviewQueue>> | null = null;
		for (let i = 0; i < 5; i++) {
			const started = performance.now();
			snapshot = await reviewQueue({ limit: 50 });
			durations.push(performance.now() - started);
		}
		const total = Number((await query<{ n: string }>(
			"SELECT count(*)::text AS n FROM quarantine_raw WHERE promoted = false",
		)).rows[0].n);
		const row = {
			label,
			stock: total,
			fenetre: snapshot?.window ?? 0,
			tronque: snapshot?.truncated ?? false,
			p50Ms: percentile(durations, 0.5),
			p95Ms: percentile(durations, 0.95),
			seaux: snapshot?.facets.bucket ?? [],
			compteurs: snapshot?.counts,
		};
		console.log(`\n${label} : stock ${total}, fenêtre ${row.fenetre}, tronqué ${row.tronque}`);
		console.log(`  ouverture p50 ${row.p50Ms} ms | p95 ${row.p95Ms} ms`);
		console.log(`  seaux : ${row.seaux.map((f) => `${f.value}:${f.count}`).join(" ")}`);
		return row;
	}

	const queues = [await measureQueue("jeu réel")];

	if (SCALE > 0) {
		console.log(`\ninsertion de ${SCALE} faits synthétiques…`);
		const rows: unknown[][] = [];
		for (let i = 0; i < SCALE; i++) {
			const claim = fixture.claims[i % fixture.claims.length];
			const hash = createHash("sha256").update(`${SYNTH_SOURCE}-${i}`).digest("hex");
			rows.push([
				SYNTH_SOURCE, `https://exemple.test/${hash.slice(0, 8)}`, claim.group,
				`${claim.title} [${i}]`, `${claim.discovered}T00:00:00Z`, hash,
			]);
		}
		const CHUNK = 500;
		for (let start = 0; start < rows.length; start += CHUNK) {
			const slice = rows.slice(start, start + CHUNK);
			const tuples = slice.map((_, index) => {
				const b = index * 6;
				return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::timestamptz,'{}'::jsonb,'RED',$${b + 6},'pending')`;
			});
			await query(
				`INSERT INTO quarantine_raw (source, source_url, groupe, org_hint, claimed_at, extracted, tlp, content_hash, status)
				 VALUES ${tuples.join(",")} ON CONFLICT (source, content_hash) DO NOTHING`,
				slice.flat(),
			);
		}
		try {
			queues.push(await measureQueue(`palier synthétique +${SCALE}`));
		} finally {
			const removed = await query("DELETE FROM quarantine_raw WHERE source = $1", [SYNTH_SOURCE]);
			console.log(`\nnettoyage : ${removed.rowCount} faits synthétiques supprimés`);
		}
	}

	if (JSON_OUT) {
		mkdirSync(dirname(JSON_OUT), { recursive: true });
		writeFileSync(JSON_OUT, `${JSON.stringify({ moteur: matching, files: queues }, null, 2)}\n`);
		console.log(`écrit ${JSON_OUT}`);
	}
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await query("DELETE FROM quarantine_raw WHERE source = $1", [SYNTH_SOURCE]).catch(() => {});
		await closePools();
	});
