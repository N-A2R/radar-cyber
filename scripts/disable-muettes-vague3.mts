/**
 * Vague 3 — Task 2 : désactivation journalisée des sources muettes mortes
 * depuis plus de 30 jours. Chaque désactivation pose une entrée
 * `source.changed` avec la preuve (date du dernier item) dans le payload.
 * Aucune désactivation silencieuse.
 *
 *   DATABASE_URL=... tsx scripts/disable-muettes-vague3.mts
 */
import { query, closePools, withTransaction } from "../apps/api/src/db.js";

const CIBLES: { id: string; motif: string }[] = [
	{ id: "feodo-ip", motif: "dernier item 2026-03-04 : le flux en ligne est figé depuis 8 mois (5 items reçus, HTTP 200, contenu inchangé)" },
	{ id: "presse-lmi-feedburner", motif: "dernier item 2009-03-15 : flux feedburner figé, doublon de presse-lmi-rss (vivant, dernier item 2026-11-20)" },
	{ id: "cat-cert-si-news", motif: "dernier item 2026-05-29 : flux du CERT figé depuis 6 mois" },
	{ id: "univ-larochelle", motif: "dernier item 2026-10-16 : 36 jours sans nouvelle publication" },
	{ id: "eco-aquitaine-robotics", motif: "dernier item 2026-10-08 : 44 jours sans nouvelle publication" },
];

async function main(): Promise<void> {
	for (const c of CIBLES) {
		const avant = await query(
			`SELECT id, enabled, disabled_at FROM source WHERE id = $1`, [c.id],
		);
		if (avant.rows.length === 0) { console.error(`inconnue : ${c.id}`); process.exitCode = 1; continue; }
		const row = avant.rows[0] as { id: string; enabled: boolean; disabled_at: string | null };
		if (!row.enabled) { console.log(`déjà désactivée : ${c.id}`); continue; }
		await withTransaction(async (client) => {
			await client.query(
				`UPDATE source SET enabled = false, disabled_at = now(), disabled_reason = $2 WHERE id = $1`,
				[c.id, `morte > 30 j — ${c.motif}`],
			);
			await client.query(
				`INSERT INTO journal (kind, subject, summary, payload, actor)
				 VALUES ('source.changed', $1, $2, $3::jsonb, 'humain:mission-vague3')`,
				[
					c.id,
					`désactivée : ${c.motif}`,
					JSON.stringify({ transition: "désactivation", cause: "morte-plus-30j", preuve: c.motif, plan: "docs/plans/mission-vague3-longue.md — Task 2" }),
				],
			);
		});
		console.log(`désactivée + journalisée : ${c.id}`);
	}
	// Vérification : les 5 entrées de journal existent.
	const verif = await query(
		`SELECT j.subject, j.kind FROM journal j WHERE j.kind = 'source.changed' AND j.actor = 'humain:mission-vague3' ORDER BY j.subject`,
	);
	console.log(`journal source.changed (mission vague 3) : ${(verif.rows as { subject: string }[]).map((r) => r.subject).join(", ")}`);
	await closePools();
}

main().catch((e) => { console.error(e); process.exit(1); });
