/**
 * Vérification du journal de vérité.
 *
 * Lance à la main, ou par `pnpm verify:journal`. Sort en code 1 si la doctrine
 * n'est pas tenue — c'est ce qui transforme « on n'écrase rien » d'intention en
 * propriété du dépôt.
 *
 * Quatre contrôles :
 *  1. **append-only** — une mise à jour, une suppression et un TRUNCATE doivent
 *     échouer. On essaie réellement, dans une transaction annulée.
 *  2. **couverture** — chaque événement de la base a un fait de rattachement ou
 *     d'abandon dans le journal. Un événement sans trace est un angle mort.
 *  3. **cohérence des projections** — l'organisation citée dans le dernier fait
 *     de rattachement est celle que porte `event.org_id`. Une divergence signale
 *     une écriture passée à côté du journal.
 *  4. **bi-temporalité** — chaque fait a une date de connaissance ; l'absence de
 *     `recorded_at` rendrait l'audit impossible.
 */
import { closePools, query } from "../apps/api/src/db.js";

type Controle = { nom: string; ok: boolean; detail: string };

const controles: Controle[] = [];

async function appendOnly(): Promise<void> {
	const essais: Array<{ nom: string; sql: string }> = [
		{ nom: "UPDATE", sql: "UPDATE journal SET summary = summary WHERE id = (SELECT max(id) FROM journal)" },
		{ nom: "DELETE", sql: "DELETE FROM journal WHERE id = (SELECT max(id) FROM journal)" },
		{ nom: "TRUNCATE", sql: "TRUNCATE journal" },
	];
	const acceptes: string[] = [];
	for (const essai of essais) {
		try {
			await query("BEGIN");
			await query(essai.sql);
			acceptes.push(essai.nom);
		} catch {
			// attendu
		} finally {
			await query("ROLLBACK").catch(() => {});
		}
	}
	controles.push({
		nom: "append-only",
		ok: acceptes.length === 0,
		detail:
			acceptes.length === 0
				? "UPDATE, DELETE et TRUNCATE refusés par la base"
				: `acceptés : ${acceptes.join(", ")}`,
	});
}

async function couverture(): Promise<void> {
	const { rows } = await query<{ manquants: string; total: string }>(`
		SELECT
		  (SELECT count(*) FROM event e
		    WHERE NOT EXISTS (SELECT 1 FROM journal j WHERE j.subject = e.dedup_key))::text AS manquants,
		  (SELECT count(*) FROM event)::text AS total
	`);
	const manquants = Number(rows[0]?.manquants ?? 0);
	const total = Number(rows[0]?.total ?? 0);
	controles.push({
		nom: "couverture",
		ok: manquants === 0,
		detail:
			total === 0
				? "aucun événement en base (rien à couvrir)"
				: `${total - manquants}/${total} événement(s) tracé(s), ${manquants} sans trace`,
	});
}

async function coherence(): Promise<void> {
	// Dernier fait de rattachement par sujet, comparé à la projection.
	const { rows } = await query<{ dedup_key: string; org_id: number | null; journal_org: string | null }>(`
		WITH dernier AS (
		  SELECT DISTINCT ON (subject) subject, payload
		    FROM journal
		   WHERE kind IN ('event.rattachement', 'match.decided')
		   ORDER BY subject, recorded_at DESC, id DESC
		)
		SELECT e.dedup_key,
		       e.org_id,
		       d.payload->>'orgId' AS journal_org
		  FROM event e
		  JOIN dernier d ON d.subject = e.dedup_key
		 WHERE (e.org_id IS NULL) <> (d.payload->>'orgId' IS NULL)
		    OR (e.org_id IS NOT NULL AND e.org_id <> (d.payload->>'orgId')::int)
	`);
	const divergences = rows.length;
	controles.push({
		nom: "cohérence projection/journal",
		ok: divergences === 0,
		detail:
			divergences === 0
				? "la projection `event.org_id` s'accorde avec le dernier fait de journal"
				: `${divergences} divergence(s) — première : ${rows[0]?.dedup_key}`,
	});
}

async function biTemporalite(): Promise<void> {
	const { rows } = await query<{ sans_horloge: string; total: string }>(`
		SELECT count(*) FILTER (WHERE recorded_at IS NULL)::text AS sans_horloge,
		       count(*)::text AS total
		  FROM journal
	`);
	const sans = Number(rows[0]?.sans_horloge ?? 0);
	controles.push({
		nom: "bi-temporalité",
		ok: sans === 0,
		detail: `${rows[0]?.total ?? 0} fait(s), ${sans} sans horloge de connaissance`,
	});
}

async function main(): Promise<void> {
	console.log("Vérification du journal de vérité\n");
	await appendOnly();
	await couverture();
	await coherence();
	await biTemporalite();

	for (const controle of controles) {
		console.log(`  ${controle.ok ? "OK  " : "ÉCHEC"} ${controle.nom.padEnd(28)} ${controle.detail}`);
	}

	const { rows } = await query<{ kind: string; n: string }>(
		"SELECT kind, count(*)::text AS n FROM journal GROUP BY kind ORDER BY n DESC",
	);
	if (rows.length > 0) {
		console.log("\nFaits consignés :");
		for (const row of rows) console.log(`  ${String(row.n).padStart(6)}  ${row.kind}`);
	}

	const echecs = controles.filter((c) => !c.ok).length;
	console.log(
		`\n${echecs === 0 ? "Journal conforme." : `${echecs} contrôle(s) en échec.`}`,
	);
	if (echecs > 0) process.exitCode = 1;
	await closePools();
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
