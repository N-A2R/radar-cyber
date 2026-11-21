/**
 * Idempotent loading of the role-level public office referential.
 *
 * Only office, jurisdiction and provenance columns are written. The loader
 * resolves organisations by their stable slug and never joins person-level
 * tables, so no name, contact detail or victim data can reach the table.
 */
import { query, withTransaction } from "../db.js";
import type { PublicMandatePlan } from "./plan.js";

export type MandateLoadReport = {
	dryRun: boolean;
	planned: number;
	inserted: number;
	alreadyPresent: number;
	skipped: number;
	byRole: Record<string, number>;
	warnings: string[];
};

export async function loadPublicMandates(
	plan: PublicMandatePlan,
	options: { dryRun?: boolean } = {},
): Promise<MandateLoadReport> {
	const dryRun = options.dryRun ?? true;
	const report: MandateLoadReport = {
		dryRun,
		planned: plan.mandates.length,
		inserted: 0,
		alreadyPresent: 0,
		skipped: 0,
		byRole: {},
		warnings: [],
	};
	const slugs = [...new Set(plan.mandates.map((m) => m.orgSlug))];
	const { rows } = slugs.length
		? await query<{ id: number; slug: string }>(
			"SELECT id, slug FROM org WHERE slug = ANY($1::text[])",
			[slugs],
		)
		: { rows: [] };
	const orgIdBySlug = new Map(rows.map((row) => [row.slug, Number(row.id)]));

	const eligible: Array<{ mandate: (typeof plan.mandates)[number]; orgId: number }> = [];
	for (const mandate of plan.mandates) {
		report.byRole[mandate.mandateRole] = (report.byRole[mandate.mandateRole] ?? 0) + 1;
		const orgId = orgIdBySlug.get(mandate.orgSlug);
		if (orgId === undefined) {
			report.skipped += 1;
			report.warnings.push(`${mandate.orgSlug}: no org row, skipped`);
			continue;
		}
		eligible.push({ mandate, orgId });
	}

	if (dryRun) {
		report.inserted = eligible.length;
		return report;
	}

	await withTransaction(async (client) => {
		for (const { mandate, orgId } of eligible) {
			const result = await client.query(
				`INSERT INTO public_mandate
				    (org_id, siren, mandate_role, jurisdiction_kind, jurisdiction_code, dept, source, proof_url)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
				 ON CONFLICT (org_id, mandate_role) DO NOTHING`,
				[orgId, mandate.siren, mandate.mandateRole, mandate.jurisdictionKind,
					mandate.jurisdictionCode, mandate.dept, mandate.source, mandate.proofUrl],
			);
			if (result.rowCount === 1) report.inserted += 1;
			else report.alreadyPresent += 1;
		}
	});
	return report;
}
