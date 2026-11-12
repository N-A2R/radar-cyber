/**
 * Rejeu de la détection sur le stock — les 3 456 événements et 28 549
 * indicateurs qui n'ont jamais été évalués, plus les 16 235 faits de
 * quarantaine déjà promus.
 *
 * Silencieux par défaut : les alertes créées par le rejeu voient leur
 * diffusion différée (`next_attempt_at` repoussé), pour ne pas déclencher une
 * avalanche de notifications webhook/Telegram. Elles restent visibles dans
 * l'interface. `--release` annule le report ; `--allow-delivery` laisse partir
 * les notifications normalement.
 *
 * Le rejeu est idempotent : le moteur insère les alertes en
 * `ON CONFLICT DO NOTHING`. On peut l'interrompre et le relancer.
 *
 *   DATABASE_URL=... tsx scripts/replay-detection.mts               # dry-run
 *   DATABASE_URL=... tsx scripts/replay-detection.mts --apply
 *   DATABASE_URL=... tsx scripts/replay-detection.mts --apply --limit 500
 *   DATABASE_URL=... tsx scripts/replay-detection.mts --release     # diffuse le stock rejoué
 */
import { closePools, query } from "../apps/api/src/db.js";
import { evaluateEvent, evaluateIndicator } from "../apps/api/src/detect/engine.js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const RELEASE = argv.includes("--release");
const ALLOW_DELIVERY = argv.includes("--allow-delivery");
const WITH_INDICATORS = !argv.includes("--events-only");
const BATCH = Number(argv.find((a) => a.startsWith("--batch="))?.split("=")[1] ?? 250);
const LIMIT = Number(argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0);
/** Report de diffusion appliqué au stock rejoué : un an, soit « pas maintenant ». */
const DEFER = "1 year";

async function corroborationByOrg(): Promise<Map<number, number>> {
	const r = await query<{ org_id: number; n: string }>(
		`SELECT org_id, COUNT(DISTINCT source_id)::text AS n
		   FROM event
		  WHERE org_id IS NOT NULL
		    AND COALESCE(observed_at, collected_at) >= now() - interval '30 days'
		  GROUP BY org_id`,
	);
	return new Map(r.rows.map((row) => [Number(row.org_id), Number(row.n)]));
}

async function main(): Promise<void> {
	if (RELEASE) {
		const r = await query<{ id: number }>(
			`UPDATE alert SET next_attempt_at = NULL, updated_at = now()
			  WHERE next_attempt_at > now() + interval '300 days'
			  RETURNING id`,
		);
		console.log(`diffusion réactivée pour ${r.rowCount ?? 0} alerte(s) previously reportée(s)`);
		return;
	}

	const totalEvents = Number((await query<{ n: string }>("SELECT count(*)::text AS n FROM event")).rows[0]?.n ?? 0);
	const totalInds = WITH_INDICATORS
		? Number((await query<{ n: string }>("SELECT count(*)::text AS n FROM indicator")).rows[0]?.n ?? 0)
		: 0;
	console.log(`stock : ${totalEvents} événement(s), ${totalInds} indicateur(s)`);
	console.log(APPLY ? "mode application" : "mode démonstration (dry-run) — aucune écriture");
	if (APPLY && !ALLOW_DELIVERY) {
		console.log("diffusion du stock rejoué : reportée (--allow-delivery pour la laisser partir)");
	}
	if (!APPLY) {
		console.log("relancer avec --apply pour créer les alertes");
		return;
	}

	const corroboration = await corroborationByOrg();
	const highWater = await query<{ m: string }>("SELECT COALESCE(MAX(id),0)::text AS m FROM alert");
	let alertFloor = Number(highWater.rows[0]?.m ?? 0);
	let created = 0;
	let deferred = 0;

	async function deferNew(): Promise<void> {
		if (ALLOW_DELIVERY) return;
		const r = await query<{ id: number }>(
			`UPDATE alert SET next_attempt_at = now() + $1::interval
			  WHERE id > $2 AND delivered_at IS NULL
			  RETURNING id`,
			[DEFER, alertFloor],
		);
		deferred += r.rowCount ?? 0;
		const m = await query<{ m: string }>("SELECT COALESCE(MAX(id),0)::text AS m FROM alert");
		alertFloor = Number(m.rows[0]?.m ?? alertFloor);
	}

	let lastId = 0;
	let seen = 0;
	for (;;) {
		const batch = await query<{ id: number }>(
			"SELECT id FROM event WHERE id > $1 ORDER BY id LIMIT $2",
			[lastId, BATCH],
		);
		if (batch.rows.length === 0) break;
		for (const row of batch.rows) {
			created += await evaluateEvent(row.id, { corroboration });
			lastId = row.id;
			seen++;
			if (LIMIT > 0 && seen >= LIMIT) break;
		}
		await deferNew();
		console.log(`  événements : ${seen}/${totalEvents} — ${created} alerte(s) créée(s)`);
		if (LIMIT > 0 && seen >= LIMIT) break;
	}

	if (WITH_INDICATORS && !(LIMIT > 0 && seen >= LIMIT)) {
		let lastInd = 0;
		let seenInd = 0;
		for (;;) {
			const batch = await query<{ id: number }>(
				"SELECT id FROM indicator WHERE id > $1 ORDER BY id LIMIT $2",
				[lastInd, BATCH * 4],
			);
			if (batch.rows.length === 0) break;
			for (const row of batch.rows) {
				created += await evaluateIndicator(row.id);
				lastInd = row.id;
				seenInd++;
			}
			await deferNew();
			console.log(`  indicateurs : ${seenInd}/${totalInds} — ${created} alerte(s) créée(s)`);
		}
	}

	console.log(`\nbilan : ${created} alerte(s) créée(s), ${deferred} diffusion(s) reportée(s)`);
	if (deferred > 0) {
		console.log("pour les laisser partir plus tard : tsx scripts/replay-detection.mts --release");
	}
}

main()
	.catch((err: unknown) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(() => closePools());
