/**
 * Charge le référentiel territorial Nouvelle-Aquitaine en base.
 *
 * Le jeu est versionné (`db/data/referentiel-na.json`) : ni réseau ni Python ne
 * sont nécessaires. Régénération du jeu, si le découpage change :
 * `python3 bench/referentiel/build_na.py --fetch`.
 *
 *   DATABASE_URL=... tsx scripts/load-referentiel-na.mts             # dry-run
 *   DATABASE_URL=... tsx scripts/load-referentiel-na.mts --apply
 *   tsx scripts/load-referentiel-na.mts --plan-only                  # sans base
 *
 * `--plan-only` ne touche pas Postgres : il valide le jeu et affiche ce qui
 * serait chargé. C'est le contrôle à lancer en intégration continue.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import { planReferentiel } from "../apps/api/src/referentiel/plan.js";
import { loadReferentiel } from "../apps/api/src/referentiel/load.js";
import type { ReferentielNA } from "../apps/api/src/referentiel/model.js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const PLAN_ONLY = argv.includes("--plan-only");
const DATA_PATH = argv.find((a) => a.startsWith("--data="))?.split("=")[1]
	?? fileURLToPath(new URL("../db/data/referentiel-na.json", import.meta.url));

async function main(): Promise<void> {
	const data = JSON.parse(readFileSync(DATA_PATH, "utf8")) as ReferentielNA;
	console.log(`jeu : ${data.meta.titre} (généré le ${data.meta.genereLe})`);
	for (const source of data.meta.sources) {
		console.log(`  source : ${source.nom}${source.version ? `@${source.version}` : ""} — ${source.licence}`);
	}

	const plan = planReferentiel(data);
	const c = plan.counts;
	console.log(
		`\nplan : ${c.orgs} organisations (${c.communes} communes, ${c.epci} EPCI, ` +
		`${c.departements} départements, ${c.regions} région)`,
	);
	console.log(`  alias : ${c.aliases}`);
	console.log(`  communes déléguées/associées rattachées en alias : ${c.enfantsRattaches}`);
	console.log(`  sans coordonnées : ${c.sansCoordonnees} | sans SIREN : ${c.sansSiren}`);
	for (const warning of plan.warnings.slice(0, 20)) console.log(`  AVERTISSEMENT ${warning}`);
	if (plan.warnings.length > 20) console.log(`  … ${plan.warnings.length - 20} autre(s) avertissement(s)`);

	if (PLAN_ONLY) {
		console.log("\n--plan-only : aucune connexion à la base");
		return;
	}

	const report = await loadReferentiel(plan, {
		dryRun: !APPLY,
		onProgress: (message) => console.log(message),
	});
	console.log(
		`\nbilan${report.dryRun ? " (dry-run)" : ""} : ${report.created} création(s), ` +
		`${report.updated} mise(s) à jour, ${report.attachedBySiren} rattachement(s) par SIREN, ` +
		`${report.aliasesInserted}/${report.aliasesPlanned} alias insérés`,
	);
	console.log(`homonymes internes au jeu : ${report.internalHomonyms} nom(s) — attendus, le moteur s'abstient`);
	if (report.collisions.length > 0) {
		console.log(`\n${report.collisions.length} collision(s) de nom avec l'existant — à arbitrer, non fusionnées :`);
		for (const collision of report.collisions.slice(0, 10)) {
			console.log(`  « ${collision.name} » existe déjà (org #${collision.existingId}, slug ${collision.slug})`);
		}
	}
	if (report.dryRun) console.log("\nrelancer avec --apply pour écrire");
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		if (!PLAN_ONLY) await closePools();
	});
