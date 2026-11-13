/**
 * Rejoue le journal sur une projection.
 *
 * C'est la raison d'être du dispositif : si une projection diverge — bug, écriture
 * passée à côté, mauvaise manipulation — le journal dit ce qui devrait être vrai,
 * et on répare sans rien deviner.
 *
 *   tsx scripts/replay-journal.mts                    # dry-run : montre les écarts
 *   tsx scripts/replay-journal.mts --apply            # répare la projection
 *   tsx scripts/replay-journal.mts --as-of=2026-11-01 # état cru à cette date
 *
 * `--as-of` répond à « qu'est-ce qu'on croyait le 1er novembre ? » : il ne
 * rejoue que les faits connus à cette date. C'est ce qui rend la mesure d'un
 * changement de moteur possible — on peut comparer ce qu'on pensait avant.
 */
import { closePools, query } from "../apps/api/src/db.js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const AS_OF = argv.find((a) => a.startsWith("--as-of="))?.split("=")[1] ?? null;

async function main(): Promise<void> {
	if (AS_OF && Number.isNaN(Date.parse(AS_OF))) {
		throw new Error(`--as-of invalide : ${AS_OF}`);
	}

	// Le dernier fait de décision connu par sujet, éventuellement à une date.
	const asOfClause = AS_OF ? "AND recorded_at <= $1::timestamptz" : "";
	const params: unknown[] = AS_OF ? [AS_OF] : [];

	const ecarts = await query<{ dedup_key: string; actuel: number | null; attendu: number | null }>(
		`WITH dernier AS (
		   SELECT DISTINCT ON (subject) subject, payload
		     FROM journal
		    WHERE kind IN ('event.rattachement', 'match.decided') ${asOfClause}
		    ORDER BY subject, recorded_at DESC, id DESC
		 )
		 SELECT e.dedup_key,
		        e.org_id AS actuel,
		        (d.payload->>'orgId')::int AS attendu
		   FROM event e
		   JOIN dernier d ON d.subject = e.dedup_key
		  WHERE e.org_id IS DISTINCT FROM (d.payload->>'orgId')::int
		  ORDER BY e.dedup_key`,
		params,
	);

	const divergences = ecarts.rows;
	console.log(
		`${AS_OF ? `état au ${AS_OF}` : "état actuel"} : ${divergences.length} divergence(s) entre projection et journal`,
	);

	if (divergences.length === 0) {
		console.log("rien à rejouer.");
		return;
	}

	for (const row of divergences.slice(0, 20)) {
		console.log(
			`  ${row.dedup_key} : org_id=${row.actuel ?? "null"} → ${row.attendu ?? "null"}`,
		);
	}
	if (divergences.length > 20) console.log(`  … ${divergences.length - 20} autre(s)`);

	if (!APPLY) {
		console.log("\nrelancer avec --apply pour reconstruire la projection.");
		return;
	}

	// Rejeu : on réécrit la projection à partir du journal, jamais l'inverse.
	const rejoue = await query(
		`WITH dernier AS (
		   SELECT DISTINCT ON (subject) subject, payload
		     FROM journal
		    WHERE kind IN ('event.rattachement', 'match.decided') ${asOfClause}
		    ORDER BY subject, recorded_at DESC, id DESC
		 )
		 UPDATE event e
		    SET org_id = (d.payload->>'orgId')::int
		   FROM dernier d
		  WHERE d.subject = e.dedup_key
		    AND e.org_id IS DISTINCT FROM (d.payload->>'orgId')::int`,
		params,
	);
	console.log(`\nprojection reconstruite : ${rejoue.rowCount} ligne(s).`);
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools().catch(() => {});
	});
