/**
 * Charge le référentiel complet de Nouvelle-Aquitaine : territorial, santé,
 * enseignement et entreprises.
 *
 * Le référentiel territorial seul (`load-referentiel-na.mts`) décrit le maillage
 * administratif ; celui-ci y ajoute les 30 000 organisations que la région
 * compte réellement — celles qu'un incident peut frapper.
 *
 *   pnpm -F @radar/api exec tsx ../../scripts/load-organisations-na.mts            # dry-run
 *   pnpm -F @radar/api exec tsx ../../scripts/load-organisations-na.mts --apply
 *   pnpm -F @radar/api exec tsx ../../scripts/load-organisations-na.mts --plan-only
 *
 * `--plan-only` ne touche pas Postgres : il valide les quatre jeux et affiche
 * ce qui serait chargé. Un fichier absent est simplement ignoré, avec sa raison.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import { planReferentiel } from "../apps/api/src/referentiel/plan.js";
import { planReferentielEtendu } from "../apps/api/src/referentiel/plan-etendu.js";
import { loadReferentiel } from "../apps/api/src/referentiel/load.js";
import type {
	EtablissementsNA,
	EntreprisesNA,
	ReferentielNA,
} from "../apps/api/src/referentiel/model.js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const PLAN_ONLY = argv.includes("--plan-only");

const chemin = (relatif: string) => fileURLToPath(new URL(`../${relatif}`, import.meta.url));
const DATA = {
	referentiel: chemin("db/data/referentiel-na.json"),
	sante: chemin("db/data/sante-na.json"),
	enseignement: chemin("db/data/enseignement-na.json"),
	entreprises: chemin("db/data/entreprises-na.json"),
};

function lire<T>(cheminFichier: string, etiquette: string): T | undefined {
	if (!existsSync(cheminFichier)) {
		console.log(`  absent   ${etiquette} (${cheminFichier}) — ignoré`);
		return undefined;
	}
	const contenu = JSON.parse(readFileSync(cheminFichier, "utf8")) as T & {
		meta?: { genereLe?: string; sources?: Array<{ nom: string; licence: string }> };
	};
	const meta = contenu.meta;
	console.log(
		`  chargé   ${etiquette}` +
			(meta?.genereLe ? ` (généré le ${meta.genereLe})` : ""),
	);
	for (const source of meta?.sources ?? []) {
		console.log(`             source : ${source.nom} — ${source.licence}`);
	}
	return contenu;
}

function nombre(valeur: number): string {
	return valeur.toLocaleString("fr-FR");
}

async function main(): Promise<void> {
	console.log("Jeux de données :");
	const referentiel = lire<ReferentielNA>(DATA.referentiel, "référentiel territorial");
	if (!referentiel) {
		throw new Error("le référentiel territorial est indispensable (db/data/referentiel-na.json)");
	}
	const sante = lire<EtablissementsNA>(DATA.sante, "établissements de santé");
	const enseignement = lire<EtablissementsNA>(DATA.enseignement, "établissements d'enseignement");
	const entreprises = lire<EntreprisesNA>(DATA.entreprises, "entreprises");

	const territorial = planReferentiel(referentiel);
	const plan = planReferentielEtendu({
		referentiel,
		territorial: territorial.orgs,
		sante,
		enseignement,
		entreprises,
	});
	const c = plan.counts;

	console.log(`\nplan : ${nombre(c.orgs)} organisations`);
	console.log(`  territorial   : ${nombre(territorial.counts.orgs)} (${territorial.counts.communes} communes, ` +
		`${territorial.counts.epci} EPCI, ${territorial.counts.departements} départements, ${territorial.counts.regions} région)`);
	if (sante) console.log(`  santé         : ${nombre(c.sante)} établissements (FINESS)`);
	if (enseignement) console.log(`  enseignement  : ${nombre(c.enseignement)} établissements (UAI)`);
	if (entreprises) console.log(`  entreprises   : ${nombre(c.entreprise)} (SIREN)`);
	console.log(`\n  alias produit : ${nombre(c.aliases)}`);
	console.log(`  noms écartés du moteur car génériques : ${nombre(c.nomsGeneriques)}`);
	console.log(`  coordonnées reconstruites depuis la commune : ${nombre(c.coordonneesHeriteesCommune)}`);
	console.log(`  sans coordonnées : ${nombre(c.sansCoordonnees)}`);
	console.log(`  homonymes : ${nombre(c.homonymes)} nom(s) — le moteur s'abstiendra dessus`);

	for (const warning of plan.warnings.slice(0, 25)) console.log(`  AVERTISSEMENT ${warning}`);
	if (plan.warnings.length > 25) {
		console.log(`  … ${plan.warnings.length - 25} autre(s) avertissement(s)`);
	}

	if (PLAN_ONLY) {
		console.log("\n--plan-only : aucune connexion à la base");
		return;
	}

	const rapport = await loadReferentiel(plan, {
		dryRun: !APPLY,
		onProgress: (message) => console.log(message),
	});
	console.log(
		`\nbilan${rapport.dryRun ? " (dry-run)" : ""} : ${nombre(rapport.created)} création(s), ` +
			`${nombre(rapport.updated)} mise(s) à jour, ${nombre(rapport.attachedBySiren)} rattachement(s) par SIREN, ` +
			`${nombre(rapport.aliasesInserted)}/${nombre(rapport.aliasesPlanned)} alias insérés`,
	);
	const kinds = Object.entries(rapport.byKind)
		.map(([kind, total]) => `${nombre(total)} ${kind}`)
		.join(", ");
	console.log(`répartition : ${kinds}`);
	if (rapport.collisions.length > 0) {
		console.log(`\n${rapport.collisions.length} collision(s) de nom avec l'existant — non fusionnées :`);
		for (const collision of rapport.collisions.slice(0, 10)) {
			console.log(`  « ${collision.name} » existe déjà (org #${collision.existingId})`);
		}
	}
	if (rapport.dryRun) console.log("\nrelancer avec --apply pour écrire");
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		if (!PLAN_ONLY) await closePools();
	});
