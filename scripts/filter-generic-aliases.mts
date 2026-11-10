/**
 * Écarte les alias qui attrapent du texte ordinaire.
 *
 * Constat mesuré : après import de ~10 000 entreprises de Nouvelle-Aquitaine,
 * l'alias « la premiere » (nom d'entreprise) attrapait « la première période »,
 * « la première fois ». Un nom propre ne se reconnaît pas à sa forme mais à ce
 * qu'il désigne : ce script compte, pour chaque alias, **combien d'événements
 * du corpus le contiennent**, et rejette ceux qui dépassent un petit nombre.
 *
 * Le comptage se fait en un seul balayage : on découpe chaque titre en
 * n-grammes et on regarde lesquels sont des alias. Coût linéaire, pas 10 000
 * requêtes.
 *
 *   pnpm -F @radar/api exec tsx ../../scripts/filter-generic-aliases.mts [--apply]
 */
import { pool, closePools } from "../apps/api/src/db.js";
import { normalize, resetAliasCache } from "../apps/api/src/match/orgs.js";

const apply = process.argv.includes("--apply");
/** Au-delà de ce nombre d'événements touchés, l'alias est trop banal. */
const MAX_HITS = Number(process.env.RADAR_ALIAS_MAX_HITS ?? 3);

async function main(): Promise<void> {
	const { rows: aliases } = await pool.query<{ id: number; alias: string }>(
		`SELECT id, alias FROM org_alias WHERE status = 'active' ORDER BY id`,
	);
	if (aliases.length === 0) {
		console.log("aucun alias actif.");
		return;
	}

	const byKey = new Map<string, { id: number; alias: string }[]>();
	let maxTokens = 1;
	for (const row of aliases) {
		const tokens = normalize(row.alias).split(" ").filter((t) => t.length >= 2);
		if (tokens.length === 0) continue;
		const key = tokens.join(" ");
		const bucket = byKey.get(key);
		if (bucket) bucket.push(row);
		else byKey.set(key, [row]);
		maxTokens = Math.max(maxTokens, tokens.length);
	}

	const hits = new Map<number, number>();
	const { rows: events } = await pool.query<{ text: string }>(
		`SELECT coalesce(title, '') || ' ' || coalesce(summary, '') AS text FROM event`,
	);

	for (const event of events) {
		const tokens = normalize(event.text).split(" ").filter(Boolean);
		const seen = new Set<number>();
		for (let size = 1; size <= Math.min(maxTokens, tokens.length); size++) {
			for (let start = 0; start + size <= tokens.length; start++) {
				const bucket = byKey.get(tokens.slice(start, start + size).join(" "));
				if (!bucket) continue;
				for (const row of bucket) {
					if (seen.has(row.id)) continue;
					seen.add(row.id);
					hits.set(row.id, (hits.get(row.id) ?? 0) + 1);
				}
			}
		}
	}

	const doomed = aliases.filter((row) => (hits.get(row.id) ?? 0) > MAX_HITS);
	const worst = [...doomed].sort((a, b) => (hits.get(b.id) ?? 0) - (hits.get(a.id) ?? 0));

	console.log(`événements        : ${events.length}`);
	console.log(`alias actifs      : ${aliases.length}`);
	console.log(`alias trop banals : ${doomed.length} (plus de ${MAX_HITS} événements)`);
	for (const row of worst.slice(0, 12)) console.log(`  ✗ ${row.alias} → ${hits.get(row.id)} événements`);

	if (!apply) {
		console.log("\n--dry-run : rien n'a été écrit.");
		return;
	}
	if (doomed.length === 0) return;

	const res = await pool.query(
		"UPDATE org_alias SET status = 'rejected', rejected_at = now() WHERE id = ANY($1::int[])",
		[doomed.map((row) => row.id)],
	);
	resetAliasCache();
	console.log(`rejetés           : ${res.rowCount}`);
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
