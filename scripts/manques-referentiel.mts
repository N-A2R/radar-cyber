/**
 * Les manques du référentiel, en liste de courses — chantier 13.
 *
 * La mesure de couverture a nommé le goulot : sur 15 incidents réels de la
 * fenêtre, 9 organisations sont absentes d'un référentiel de 34 330 lignes. On
 * connaît même leur nom. Ce qui manquait, c'est la liste : quelles entités,
 * combien de fois, par quelle source, et par quelle voie les charger.
 *
 * Ce script la produit. Il **ne charge rien** : il lit ce que les faits déjà
 * reçus disent, retire ce qui existe déjà (au sens du moteur de mesure, pas
 * d'une heuristique approximative), et classe le reste.
 *
 *   tsx scripts/manques-referentiel.mts
 *   tsx scripts/manques-referentiel.mts --json=bench/results/manques-referentiel.json
 *   tsx scripts/manques-referentiel.mts --voie=sirene
 *
 * Lecture seule.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import { listerManques, parVoie, type Manque } from "../apps/api/src/referentiel/manques.js";

/** Jetons trop génériques pour identifier une organisation. */
const GENERIQUES = new Set(["societe", "groupe", "service", "commune", "ville", "mairie", "de", "du", "des", "la", "le", "les"]);

function jetons(nom: string): string[] {
	return nom
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.split(" ")
		.filter((j) => j.length > 3 && !GENERIQUES.has(j));
}

async function main(): Promise<void> {
	const voieFiltre = process.argv.find((a) => a.startsWith("--voie="))?.split("=")[1] ?? null;

	// Le référentiel, indexé une fois : on ne requête pas par entité.
	const { rows } = await query<{ name: string }>("SELECT name FROM org");
	const referentiel = rows.map((r) => new Set(jetons(r.name)));
	// Villes du référentiel : c'est le signal le plus fiable pour rattacher une
	// entité inconnue au périmètre régional sans pays déclaré.
	const { rows: villesRows } = await query<{ city: string }>(
		"SELECT DISTINCT city FROM org WHERE city IS NOT NULL",
	);
	const villes = new Set(
		villesRows.map((r) => r.city.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()),
	);

	/**
	 * Même règle que la mesure de couverture : le nom principal (avant
	 * parenthèse ou tiret) doit être entièrement présent chez une même
	 * organisation. Une règle plus permissive ferait disparaître des manques
	 * réels — c'est exactement l'erreur qui avait compté « Ymed » absent.
	 */
	const existe = (nom: string): boolean => {
		const principal = nom.split(/[(—–-]/)[0] ?? nom;
		const mots = jetons(principal);
		if (mots.length === 0) return false;
		return referentiel.some((org) => mots.every((m) => org.has(m)));
	};

	const tous = await listerManques({ existe, villes, limite: 500 });
	// Trois tas, et non deux : ce qui est en France (un manque), ce qui est
	// ailleurs (pas un manque), et ce dont on ne sait rien. Fondre l'inconnu
	// dans le hors-zone reviendrait à décider sans preuve.
	const manques = tous.filter((m) => m.zone !== "hors-zone");
	const horsZone = tous.filter((m) => m.zone === "hors-zone");
	const inconnues = tous.filter((m) => m.zone === "inconnue");
	const filtres = voieFiltre === null ? manques : manques.filter((m) => m.voie === voieFiltre);

	console.log(`Manques du référentiel — ${new Date().toISOString().slice(0, 10)}`);
	console.log(`${tous.length} entité(s) nommée(s) mais absente(s) du référentiel`);
	console.log(`  ${manques.length - inconnues.length} en France — vrais manques, mesurables`);
	console.log(`  ${inconnues.length} sans indice de zone — ni manque prouvé, ni hors-sujet prouvé`);
	console.log(`  ${horsZone.length} hors zone (pays déclaré par la source) — pas des manques\n`);

	const parProvenance = manques.reduce<Record<string, number>>((acc, m) => {
		acc[m.provenance] = (acc[m.provenance] ?? 0) + 1;
		return acc;
	}, {});
	console.log("Par provenance :");
	for (const [provenance, n] of Object.entries(parProvenance).sort((a, b) => b[1] - a[1])) {
		console.log(`  ${provenance.padEnd(24)} ${String(n).padStart(4)}`);
	}

	if (manques.length === 0) {
		console.log("Aucun manque déduit des faits en base.");
		console.log("C'est un résultat honnête mais faible : la base de développement contient peu de revendications.");
		console.log("Le corpus de référence (bench/fixtures/corpus-reference-na.json) en donne 9, publiés dans docs/mesure-couverture.md.");
	} else {
		const repartition = parVoie(manques);
		console.log("Par voie de chargement :");
		console.log(`  sirene (entités légales)            ${String(repartition.sirene).padStart(4)}`);
		console.log(`  annuaire-administratif (collectivités) ${String(repartition["annuaire-administratif"]).padStart(4)}`);
		console.log(`  manuel (associations, fédérations)  ${String(repartition.manuel).padStart(4)}`);

		console.log("\nPar corroboration :");
		for (const seuil of [3, 2, 1]) {
			const n = manques.filter((m) => m.sources === seuil).length;
			console.log(`  citées par ${seuil} source(s) distincte(s) : ${n}`);
		}

		console.log(`\nListe (${filtres.length} affichée(s)) :`);
		for (const manque of filtres.slice(0, 40)) {
			const corrob = `${manque.sources} src`;
			console.log(
				`  ${manque.voie.padEnd(22)} ${manque.zone.padEnd(9)} ${String(manque.occurrences).padStart(3)}× ${corrob.padEnd(6)} ${manque.nomLisible.slice(0, 44)}`,
			);
		}
	}

	const fichier = process.argv.find((a) => a.startsWith("--json="))?.split("=")[1];
	if (fichier) {
		const payload = {
			date: new Date().toISOString().slice(0, 10),
			regle: "nom principal entièrement présent chez une même organisation ; mêmes jetons que scripts/mesure-couverture.mts",
			total: tous.length,
			enFrance: manques.length - inconnues.length,
			inconnues: inconnues.length,
			horsZone: horsZone.length,
			parVoie: parVoie(manques),
			manques: filtres satisfies Manque[],
		};
		writeFileSync(fichier, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
		console.log(`\nliste publiée : ${fichier}`);
	}
	await closePools();
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
