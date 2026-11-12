/**
 * Chargement du référentiel territorial en base — idempotent et non destructif.
 *
 * Trois principes, tous vérifiés par les tests :
 *  1. **Le SIREN d'abord.** Si une organisation existe déjà avec le même SIREN
 *     (saisie à la main, import antérieur), on s'y rattache au lieu de créer un
 *     doublon sous un autre slug.
 *  2. **On n'écrase pas le travail humain.** Le nom et le slug existants sont
 *     conservés ; seuls les champs vides sont complétés, et la géométrie est
 *     rafraîchie puisque c'est notre apport.
 *  3. **Rejouable.** Slugs dérivés des codes officiels, alias en
 *     `ON CONFLICT DO NOTHING`. Interrompre puis relancer ne coûte que du temps.
 *
 * Aucune migration : seules les colonnes déjà présentes sont utilisées
 * (`siren` et `geo_source` viennent des migrations 008 et 013).
 */
import { query, withClient } from "../db.js";
import type { PlannedOrg, ReferentielPlan } from "./plan.js";

export type LoadOptions = {
	/** Sans effet en base : compte ce qui serait fait. */
	dryRun?: boolean;
	/** Taille des lots d'alias. */
	batchSize?: number;
	onProgress?: (message: string) => void;
};

export type LoadReport = {
	dryRun: boolean;
	planned: number;
	created: number;
	updated: number;
	attachedBySiren: number;
	aliasesInserted: number;
	aliasesPlanned: number;
	collisions: Array<{ name: string; slug: string; existingId: number }>;
	/** Noms portés par plusieurs organisations du jeu lui-même (homonymes). */
	internalHomonyms: number;
};

const ALIAS_BATCH = 400;

/** Organisations déjà présentes, indexées par SIREN puis par slug. */
async function existingIndex(orgs: readonly PlannedOrg[]): Promise<{
	bySiren: Map<string, { id: number; slug: string; name: string }>;
	bySlug: Map<string, { id: number; slug: string; name: string }>;
}> {
	const sirens = orgs.map((o) => o.siren).filter((s): s is string => Boolean(s));
	const slugs = orgs.map((o) => o.slug);
	const [sirenRows, slugRows] = await Promise.all([
		sirens.length
			? query<{ id: number; slug: string; name: string; siren: string }>(
				"SELECT id, slug, name, siren FROM org WHERE siren = ANY($1::text[])",
				[sirens],
			)
			: Promise.resolve({ rows: [], rowCount: 0 }),
		query<{ id: number; slug: string; name: string }>(
			"SELECT id, slug, name FROM org WHERE slug = ANY($1::text[])",
			[slugs],
		),
	]);
	return {
		bySiren: new Map(sirenRows.rows.map((r) => [r.siren, { id: Number(r.id), slug: r.slug, name: r.name }])),
		bySlug: new Map(slugRows.rows.map((r) => [r.slug, { id: Number(r.id), slug: r.slug, name: r.name }])),
	};
}

export async function loadReferentiel(
	plan: ReferentielPlan,
	options: LoadOptions = {},
): Promise<LoadReport> {
	const dryRun = options.dryRun ?? true;
	const batchSize = options.batchSize ?? ALIAS_BATCH;
	const log = options.onProgress ?? (() => {});
	const { bySiren, bySlug } = await existingIndex(plan.orgs);

	const report: LoadReport = {
		dryRun,
		planned: plan.orgs.length,
		created: 0,
		updated: 0,
		attachedBySiren: 0,
		aliasesInserted: 0,
		aliasesPlanned: plan.counts.aliases,
		collisions: [],
		internalHomonyms: 0,
	};

	// Collisions de nom : une organisation existante porte le même nom mais un
	// autre SIREN. On ne fusionne pas automatiquement — on le signale pour la
	// revue. Fusionner sur le seul nom est exactement l'erreur que le bench A
	// a montrée coûteuse (homonymes).
	const names = plan.orgs.map((o) => o.name);
	const nameRows = await query<{ id: number; name: string; slug: string }>(
		"SELECT id, name, slug FROM org WHERE lower(name) = ANY($1::text[])",
		[names.map((n) => n.toLowerCase())],
	);
	const nameIndex = new Map(nameRows.rows.map((r) => [r.name.toLowerCase(), r]));
	// Les homonymes internes au jeu (deux communes « Mazerolles ») ne sont pas
	// des conflits avec des données humaines : ils sont attendus et documentés.
	const planSlugs = new Set(plan.orgs.map((o) => o.slug));
	const planNameCounts = new Map<string, number>();
	for (const org of plan.orgs) {
		const key = org.name.toLowerCase();
		planNameCounts.set(key, (planNameCounts.get(key) ?? 0) + 1);
	}
	report.internalHomonyms = [...planNameCounts.values()].filter((n) => n > 1).length;

	for (const org of plan.orgs) {
		const viaSiren = org.siren ? bySiren.get(org.siren) : undefined;
		const viaSlug = bySlug.get(org.slug);
		const target = viaSiren ?? viaSlug;
		if (viaSiren && viaSiren.slug !== org.slug) report.attachedBySiren++;
		else if (viaSlug) report.updated++;
		else report.created++;

		const homonym = nameIndex.get(org.name.toLowerCase());
		if (homonym && !planSlugs.has(homonym.slug)
			&& (!target || homonym.id !== target.id) && report.collisions.length < 50) {
			report.collisions.push({ name: org.name, slug: homonym.slug, existingId: Number(homonym.id) });
		}
	}

	if (dryRun) {
		log(`dry-run : ${report.created} création(s), ${report.updated} mise(s) à jour, ${report.attachedBySiren} rattachement(s) par SIREN`);
		return report;
	}

	let done = 0;
	await withClient(async (client) => {
		await client.query("BEGIN");
		try {
			for (const org of plan.orgs) {
				const viaSiren = org.siren ? bySiren.get(org.siren) : undefined;
				let orgId: number;
				if (viaSiren) {
					// On complète sans écraser : le nom saisi par un analyste reste.
					const r = await client.query<{ id: number }>(
						`UPDATE org SET
						    city = COALESCE(city, $2),
						    dept = COALESCE(dept, $3),
						    sector = COALESCE(sector, $4),
						    lat = COALESCE($5, lat),
						    lon = COALESCE($6, lon),
						    geo_source = COALESCE($7, geo_source)
						  WHERE id = $1 RETURNING id`,
						[viaSiren.id, org.city, org.dept, org.sector, org.lat, org.lon, org.geoSource],
					);
					orgId = Number(r.rows[0].id);
				} else {
					const r = await client.query<{ id: number }>(
						`INSERT INTO org (name, slug, kind, sector, city, dept, siren, lat, lon, geo_source, status)
						 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
						 ON CONFLICT (slug) DO UPDATE SET
						    lat = COALESCE(EXCLUDED.lat, org.lat),
						    lon = COALESCE(EXCLUDED.lon, org.lon),
						    geo_source = COALESCE(EXCLUDED.geo_source, org.geo_source),
						    siren = COALESCE(org.siren, EXCLUDED.siren),
						    dept = COALESCE(org.dept, EXCLUDED.dept),
						    city = COALESCE(org.city, EXCLUDED.city),
						    sector = COALESCE(org.sector, EXCLUDED.sector)
						 RETURNING id`,
						[org.name, org.slug, org.kind, org.sector, org.city, org.dept, org.siren,
						 org.lat, org.lon, org.geoSource, org.status],
					);
					orgId = Number(r.rows[0].id);
				}

				for (let start = 0; start < org.aliases.length; start += batchSize) {
					const slice = org.aliases.slice(start, start + batchSize);
					const values: unknown[] = [];
					const tuples = slice.map((alias, index) => {
						values.push(orgId, alias.alias, alias.source);
						const base = index * 3;
						return `($${base + 1}, $${base + 2}, $${base + 3})`;
					});
					const inserted = await client.query(
						`INSERT INTO org_alias (org_id, alias, source) VALUES ${tuples.join(",")}
						 ON CONFLICT (org_id, alias) DO NOTHING`,
						values,
					);
					report.aliasesInserted += inserted.rowCount ?? 0;
				}

				done++;
				if (done % 500 === 0) log(`  ${done}/${plan.orgs.length} organisations`);
			}
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		}
	});

	log(`chargé : ${done} organisations, ${report.aliasesInserted} alias`);
	return report;
}
