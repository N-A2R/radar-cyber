/**
 * Loads the public office referential from the versioned Nouvelle-Aquitaine
 * dataset. No network access, no paid service, no person-level data.
 *
 *   tsx scripts/load-public-mandates.mts --plan-only   # validate without a database
 *   tsx scripts/load-public-mandates.mts              # dry-run against DATABASE_URL
 *   tsx scripts/load-public-mandates.mts --apply      # idempotent write
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import { loadPublicMandates } from "../apps/api/src/public-mandates/load.js";
import { personalDataFindings, planPublicMandates } from "../apps/api/src/public-mandates/plan.js";
import { planReferentiel } from "../apps/api/src/referentiel/plan.js";
import type { ReferentielNA } from "../apps/api/src/referentiel/model.js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const PLAN_ONLY = argv.includes("--plan-only");
const DATA_PATH = argv.find((a) => a.startsWith("--data="))?.split("=")[1]
	?? fileURLToPath(new URL("../db/data/referentiel-na.json", import.meta.url));

async function main(): Promise<void> {
	const data = JSON.parse(readFileSync(DATA_PATH, "utf8")) as ReferentielNA;
	const plan = planPublicMandates(planReferentiel(data));
	const findings = personalDataFindings(plan.mandates);
	if (findings.length > 0) throw new Error(`personal data detected: ${findings.slice(0, 5).join("; ")}`);

	console.log(`public offices planned: ${plan.counts.total}`);
	for (const [role, total] of Object.entries(plan.counts.byRole)) {
		console.log(`  ${role}: ${total}`);
	}
	console.log(`personal-data findings: ${findings.length}`);
	if (PLAN_ONLY) {
		console.log("--plan-only: no database connection");
		return;
	}

	const report = await loadPublicMandates(plan, { dryRun: !APPLY });
	console.log(
		`load${report.dryRun ? " (dry-run)" : ""}: ${report.inserted} inserted, ` +
		`${report.alreadyPresent} already present, ${report.skipped} skipped`,
	);
	if (report.dryRun) console.log("rerun with --apply to write");
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		if (!PLAN_ONLY) await closePools();
	});
