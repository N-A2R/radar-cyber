/**
 * Recover SIRET establishments absorbed by organisation deduplication.
 *
 * The dedup pass merged 18 legal entities with their establishments and
 * deleted the latter. The retired slug survives as an org_alias row whose
 * source is `merge:<retired org id>` and whose trailing 14 digits are the
 * public SIRET of the lost establishment. Rebuilding those rows lets the
 * standard siren-prefix rule re-establish the parent link with the same
 * public proof: no new source, no paid service, no personal data.
 */
import { query, withIngestTransaction } from "../db.js";
import { NA_DEPARTMENTS } from "./siret.js";

const SIRET_CODE = /^\d{14}$/;
const SIREN_CODE = /^\d{9}$/;

export type MergeAliasRow = {
	survivorId: number;
	slug: string;
	siret: string | null;
};

export type LegalEntityRow = {
	id: number;
	entityCode: string | null;
	entitySource: string | null;
	dept: string | null;
	name: string;
	city: string | null;
	validTo?: string | null;
};

export type RecoveredEstablishment = {
	survivorId: number;
	slug: string;
	siret: string;
	parentId: number;
	name: string;
	dept: string;
	city: string | null;
};

type ValidParent = LegalEntityRow & { entityCode: string; dept: string };

/**
 * Pure planner: only public SIRENE identifiers and the twelve NA departments
 * decide which establishments are rebuilt. Input order does not matter.
 */
export function planRecovery(
	aliases: readonly MergeAliasRow[],
	parents: readonly LegalEntityRow[],
	existingCodes: readonly string[],
): RecoveredEstablishment[] {
	const byCode = new Map<string, ValidParent>();
	for (const parent of parents) {
		if (parent.entitySource !== "sirene" || parent.validTo != null) continue;
		if (parent.entityCode == null || !SIREN_CODE.test(parent.entityCode)) continue;
		if (parent.dept == null || NA_DEPARTMENTS[parent.dept] !== true) continue;
		byCode.set(parent.entityCode, parent as ValidParent);
	}

	const taken = new Set(existingCodes);
	const planned = new Map<string, RecoveredEstablishment>();
	for (const alias of aliases) {
		const siret = alias.siret;
		if (siret == null || !SIRET_CODE.test(siret)) continue;
		if (taken.has(siret) || planned.has(siret)) continue;
		const parent = byCode.get(siret.slice(0, 9));
		if (parent == null) continue;
		planned.set(siret, {
			survivorId: alias.survivorId,
			slug: alias.slug,
			siret,
			parentId: parent.id,
			name: `${parent.name} (SIRET ${siret})`,
			dept: parent.dept,
			city: parent.city,
		});
	}
	return [...planned.values()].sort((a, b) => a.siret.localeCompare(b.siret));
}

async function findMergeAliases(): Promise<MergeAliasRow[]> {
	const result = await query<MergeAliasRow>(
		`SELECT a.org_id AS "survivorId", a.alias AS slug,
		        substring(a.alias from '([0-9]{14})$') AS siret
		   FROM org_alias a
		  WHERE a.source LIKE 'merge:%' AND a.alias ~ '-[0-9]{14}$'
		  ORDER BY a.org_id`,
	);
	return result.rows;
}

async function findLegalEntities(sirens: readonly string[]): Promise<LegalEntityRow[]> {
	if (sirens.length === 0) return [];
	const result = await query<LegalEntityRow>(
		`SELECT id, entity_code AS "entityCode", entity_source AS "entitySource",
		        dept, name, city, valid_to AS "validTo"
		   FROM org WHERE entity_source = 'sirene' AND entity_code = ANY($1::text[])`,
		[[...sirens]],
	);
	return result.rows;
}

async function findExistingSites(sirets: readonly string[]): Promise<string[]> {
	if (sirets.length === 0) return [];
	const result = await query<{ entityCode: string }>(
		`SELECT entity_code AS "entityCode" FROM org
		  WHERE entity_source = 'sirene-site' AND entity_code = ANY($1::text[])`,
		[[...sirets]],
	);
	return result.rows.map((row) => row.entityCode);
}

/**
 * Rebuild the missing establishment rows. Idempotent: an existing slug or
 * SIRET is never inserted twice. Links and proof remain the sole write of
 * `applyFiliationLinks`, which runs after this step in the measure script.
 */
export async function recoverMergedEstablishments(): Promise<number> {
	const aliases = await findMergeAliases();
	if (aliases.length === 0) return 0;

	const sirens = [...new Set(aliases.map((alias) => alias.siret?.slice(0, 9)).filter((v): v is string => v != null))];
	const sirets = aliases.map((alias) => alias.siret).filter((v): v is string => v != null);
	const [parents, existing] = await Promise.all([
		findLegalEntities(sirens),
		findExistingSites(sirets),
	]);
	const planned = planRecovery(aliases, parents, existing);
	if (planned.length === 0) return 0;

	let inserted = 0;
	await withIngestTransaction(async (client) => {
		for (const item of planned) {
			const result = await client.query(
				`INSERT INTO org (name, slug, kind, status, dept, city, entity_code, entity_source)
				 SELECT $1, $2, 'entreprise', 'confirme', $3, $4, $5, 'sirene-site'
				  WHERE NOT EXISTS (
				    SELECT 1 FROM org
				     WHERE slug = $2 OR (entity_source = 'sirene-site' AND entity_code = $5)
				  )`,
				[item.name, item.slug, item.dept, item.city, item.siret],
			);
			inserted += result.rowCount ?? 0;
		}
	});
	return inserted;
}
