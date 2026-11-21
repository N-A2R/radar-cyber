/**
 * Couverture des neuf groupes sectoriels du référentiel.
 *
 * Rejoue la mesure à partir des colonnes écrites par le backfill, sans
 * refaire la classification : un chiffre publié doit être reproductible.
 * Affiche aussi la référence « type seul » (4 groupes seulement) pour dire
 * ce que la règle a apporté, et les groupes restés à zéro.
 *
 * Usage :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar tsx scripts/mesure-secteurs-groupe.mts
 */
import { closePools, ingestQuery } from "../apps/api/src/db.js";
import {
	mesurerCouvertureComptes,
	SECTEURS_GROUPE,
	type ComptesSecteurs,
	type SecteurGroupe,
} from "../apps/api/src/analyse/secteur-groupe.js";

type Comptage = { groupe: string | null; n: string };
type SourceComptage = { source: string | null; n: string; confiance: string | null };

async function main(): Promise<void> {
	const { rows: comptages } = await ingestQuery<Comptage>(
		`SELECT secteur_groupe AS groupe, count(*)::text AS n
		   FROM org GROUP BY 1`,
	);
	const { rows: sources } = await ingestQuery<SourceComptage>(
		`SELECT secteur_source AS source, count(*)::text AS n,
		        round(avg(secteur_confiance)::numeric, 3)::text AS confiance
		   FROM org GROUP BY 1 ORDER BY count(*) DESC`,
	);
	const { rows: totaux } = await ingestQuery<{ total: string }>(
		"SELECT count(*)::text AS total FROM org",
	);
	const { rows: reference } = await ingestQuery<Comptage>(
		`SELECT CASE kind
		          WHEN 'collectivite' THEN 'public'
		          WHEN 'sante' THEN 'sante'
		          WHEN 'enseignement' THEN 'enseignement'
		          ELSE 'autre'
		        END AS groupe, count(*)::text AS n
		   FROM org GROUP BY 1`,
	);

	const total = Number(totaux[0]?.total ?? 0);
	const comptes: ComptesSecteurs = {};
	const inattendus: string[] = [];
	for (const ligne of comptages) {
		if (!ligne.groupe) continue;
		if (!(SECTEURS_GROUPE as readonly string[]).includes(ligne.groupe)) {
			inattendus.push(ligne.groupe);
			continue;
		}
		comptes[ligne.groupe as SecteurGroupe] = Number(ligne.n);
	}
	const rapport = mesurerCouvertureComptes(comptes, total);
	const pct = (n: number): string => `${(n * 100).toFixed(2)} %`;

	console.log(`Organisations de NA : ${total.toLocaleString("fr-FR")}`);
	console.log(`Classées en 9 groupes : ${rapport.classes.toLocaleString("fr-FR")} (${pct(rapport.couverture)})`);
	console.log("");
	console.log("| Secteur | Organisations | Part |");
	console.log("|---|---:|---:|");
	for (const s of rapport.parSecteur) {
		console.log(`| ${s.secteur} | ${s.n.toLocaleString("fr-FR")} | ${pct(s.part)} |`);
	}
	console.log("");
	console.log(`Secteurs à zéro : ${rapport.vides.length === 0 ? "aucun" : rapport.vides.join(", ")}`);
	console.log(`Référence « type seul » : ${reference.length} groupe(s) renseigné(s), ${9 - reference.length} à zéro`);
	console.log("Sources :");
	for (const s of sources) {
		console.log(`  ${(s.source ?? "null").padEnd(9)} ${Number(s.n).toLocaleString("fr-FR").padStart(12)}  confiance moy. ${s.confiance ?? "—"}`);
	}
	if (inattendus.length > 0) console.log(`Valeurs hors vocabulaire : ${inattendus.join(", ")}`);
	if (rapport.couverture < 0.8) {
		console.error(`Couverture sous le seuil de 80 % : ${pct(rapport.couverture)}`);
		process.exitCode = 1;
	}
	await closePools();
}

main().catch((erreur: unknown) => {
	console.error(erreur);
	process.exit(1);
});
