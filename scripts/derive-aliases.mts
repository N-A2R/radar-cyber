/**
 * Dérive des alias depuis les noms d'organisation et les écrit en base.
 *
 * Phase 1 du roadmap : sans alias, un article qui parle de « CHU de Poitiers »
 * ne rencontre jamais « Centre hospitalier universitaire de Poitiers ». Les
 * alias dérivés (nom sans forme juridique, nom sans parenthèses, sigle)
 * élargissent la couverture sans jamais deviner : un alias qui désignerait
 * deux organisations différentes est écarté des deux côtés.
 *
 * Usage :
 *   pnpm -F @radar/api exec tsx ../../scripts/derive-aliases.mts --dry-run
 *   pnpm -F @radar/api exec tsx ../../scripts/derive-aliases.mts --apply
 */
import { pool, closePools } from "../apps/api/src/db.js";
import {
	deriveAliases,
	normalize,
	resetAliasCache,
	selectUnambiguousAliases,
} from "../apps/api/src/match/orgs.js";

const apply = process.argv.includes("--apply");

type Candidate = { orgId: number; alias: string };

async function main(): Promise<void> {
	const orgs = await pool.query<{ id: number; name: string }>(
		"SELECT id, name FROM org WHERE status = 'confirme' ORDER BY id",
	);
	const existing = await pool.query<{ org_id: number; alias: string }>(
		"SELECT org_id, alias FROM org_alias WHERE status = 'active'",
	);

	const known = new Set(existing.rows.map((row) => `${row.org_id}\u0000${normalize(row.alias)}`));

	const candidates: Candidate[] = [];
	for (const org of orgs.rows) {
		for (const alias of deriveAliases(org.name)) {
			const key = `${org.id}\u0000${normalize(alias)}`;
			if (known.has(key)) continue;
			known.add(key);
			candidates.push({ orgId: org.id, alias });
		}
	}

	const kept = selectUnambiguousAliases(
		candidates,
		existing.rows.map((row) => ({ orgId: row.org_id, alias: row.alias })),
	);
	const dropped = candidates.length - kept.length;

	console.log(`organisations        : ${orgs.rows.length}`);
	console.log(`alias existants      : ${existing.rows.length}`);
	console.log(`candidats dérivés    : ${candidates.length}`);
	console.log(`écartés (ambigus)    : ${dropped}`);
	console.log(`retenus              : ${kept.length}`);

	if (!apply) {
		console.log("\n--dry-run : rien n'a été écrit. Relancer avec --apply.");
		for (const row of kept.slice(0, 10)) console.log(`  ${row.orgId}  ${row.alias}`);
		return;
	}

	if (kept.length === 0) {
		console.log("aucun alias à insérer.");
		return;
	}

	const orgIds = kept.map((row) => row.orgId);
	const aliases = kept.map((row) => row.alias);
	const inserted = await pool.query(
		`INSERT INTO org_alias (org_id, alias, source, status)
		 SELECT org_id, alias, 'derived', 'active'
		   FROM unnest($1::int[], $2::text[]) AS t(org_id, alias)
		 ON CONFLICT (org_id, alias) DO NOTHING`,
		[orgIds, aliases],
	);

	resetAliasCache();
	console.log(`insérés              : ${inserted.rowCount}`);

	const collisions = await pool.query<{ n: string }>(
		`SELECT count(*)::text AS n FROM (
		   SELECT lower(alias) AS a FROM org_alias WHERE status = 'active'
		   GROUP BY 1 HAVING count(DISTINCT org_id) > 1
		 ) t`,
	);
	console.log(`alias partagés (doit être 0) : ${collisions.rows[0]?.n}`);
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
