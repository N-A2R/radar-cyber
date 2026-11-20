#!/usr/bin/env -S npx tsx
/**
 * Vague 2 de la liste de courses — lots de 10 entités de la cohorte `france`
 * du fichier `bench/results/manques-referentiel-2026-11-15.json`, suite directe
 * de scripts/manques-glm.mts (vague 1, entités 1-10). Entités 11-60 ici
 * (lots A à E du plan `docs/plans/mission-vague2.md`).
 *
 * Même méthode que la vague 1 (voir l'en-tête de scripts/manques-glm.mts) :
 * registre SIRENE public sans clé + lecture du site de l'entité quand la
 * revendication porte un domaine ; SIREN jamais inventé, recoupé avec le
 * registre ; entités cessées cherchées aussi. Le verdict suit le vocabulaire
 * du plan de la vague 2 :
 *   present       — identité légale française résolue, preuve SIREN recoupée ;
 *   absent        — aucune identité légale française au registre (actifs ET
 *                   cessés) sous cette identité : la cible de la revendication
 *                   n'est pas une entité française. Jamais prononcé sans cette
 *                   preuve de registre ;
 *   cannot_verify — des candidates existent mais la preuve manque (homonymes
 *                   exacts, dénominations trop éloignées, site inaccessible)
 *                   : arbitrage humain requis avant chargement.
 *
 * Chaque lot est ajouté (append) à `bench/results/manques-glm-vague2.json`,
 * schéma du fichier vague 1, plus : `verdict` par entité, `parLot` et
 * `tauxGlobal` au bilan (taux global = vague 1 + vague 2 cumulées, entités
 * 1-60). Les annotations de titres de fuite — « (old) », « <Updated> » — sont
 * ôtées du nom lisible avant requête : elles n'appartiennent pas à
 * l'identité.
 *
 * Le script n'écrit que le fichier JSON demandé ; jamais la base.
 *
 * Usage (un lot par invocation, un commit par lot) :
 *   tsx scripts/manques-glm-vague2.mts --lot=A --debut=11 --fin=20
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { estDomaine, traiter, type Manque, type Traite } from "./manques-glm.mts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const INPUT = `${ROOT}bench/results/manques-referentiel-2026-11-15.json`;
const VAGUE1 = `${ROOT}bench/results/manques-glm-2026-11-20.json`;
const SORTIE = `${ROOT}bench/results/manques-glm-vague2.json`;

/** Verdict du plan vague 2, dérivé de la raison et des preuves de la vague 1.
 *
 * `absent` exige une preuve que l'identité n'est pas une entité légale
 * française : le registre (actifs ET cessés) ne connaît aucune identité
 * correspondante ET l'identité n'est pas un domaine — en France le domaine
 * n'est pas la dénomination légale, un registre vide sous un nom de domaine
 * ne prouve donc rien de plus que « dénomination inconnue ». */
export function verdictPour(t: Traite, identiteDomaine: boolean): "present" | "absent" | "cannot_verify" {
	if (t.resolu) return "present";
	const registre = t.preuves.find((p) => p.voie === "registre-sirene");
	const registreVide = registre?.extrait.startsWith("aucun résultat pertinent") ?? false;
	if (registreVide && !identiteDomaine) return "absent";
	return "cannot_verify";
}

/** Ôte les annotations de titre de fuite qui n'appartiennent pas à l'identité. */
export function nettoyerNomLisible(nomLisible: string): string {
	return nomLisible
		.replace(/<[^>]*>/g, " ")
		.replace(/\(old\)/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

type EntreeVague2 = Traite & {
	verdict: "present" | "absent" | "cannot_verify";
};

type Lot = { lot: string; entites: string; resolues: number; total: number };

type SortieVague2 = {
	date: string;
	source: string;
	methode: string;
	confiances: string;
	cohorte: { zone: string; total: number; traitees: number };
	resolution: {
		resolues: number;
		taux: string;
		parConfiance: { haute: number; moyenne: number; faible: number };
		nonResolues: string[];
		parLot: Lot[];
		tauxGlobal: string | null;
	};
	manques: EntreeVague2[];
};

async function main(): Promise<void> {
	const lot = process.argv.find((a) => a.startsWith("--lot="))?.split("=")[1] ?? "?";
	const debut = Number(process.argv.find((a) => a.startsWith("--debut="))?.split("=")[1] ?? NaN);
	const fin = Number(process.argv.find((a) => a.startsWith("--fin="))?.split("=")[1] ?? NaN);
	if (!Number.isInteger(debut) || !Number.isInteger(fin) || debut < 1 || fin < debut) {
		throw new Error("usage : --lot=A --debut=11 --fin=20 (bornes 1-based, inclusives)");
	}
	const aujourdhui = new Date().toISOString().slice(0, 10);

	const brut = JSON.parse(readFileSync(INPUT, "utf8")) as { date: string; manques: Manque[] };
	const france = brut.manques.filter((m) => m.zone === "france");
	const cible = france
		.slice(debut - 1, fin)
		.map((m) => ({ ...m, nomLisible: nettoyerNomLisible(m.nomLisible) }));
	console.log(`lot ${lot} : entités ${debut}-${fin} de la cohorte « france » (${france.length} entités)\n`);

	const traitees: EntreeVague2[] = [];
	for (const [k, m] of cible.entries()) {
		let entree: EntreeVague2;
		try {
			const t = await traiter(m, aujourdhui);
			entree = { ...t, verdict: verdictPour(t, estDomaine(t.nomLisible)) };
		} catch (e) {
			// Une entité qui casse (requête refusée, réseau) ne doit pas perdre le
			// lot : elle est consignée cannot_verify avec l'erreur comme raison.
			entree = {
				...m,
				resolu: false,
				confiance: null,
				siren: null,
				siretSiege: null,
				denominationLegale: null,
				ville: null,
				departement: null,
				natureJuridique: null,
				typeOrganisation: null,
				etatAdministratif: null,
				adresseSiege: null,
				raison: `exception pendant la recherche : ${String(e).slice(0, 200)}`,
				requetes: [],
				preuves: [],
				verdict: "cannot_verify",
			};
		}
		traitees.push(entree);
		console.log(
			`${k + 1}/${cible.length} ${m.nomLisible} → ${entree.verdict.toUpperCase()}${
				entree.resolu ? ` (${entree.confiance}) ${entree.siren} ${entree.denominationLegale}` : ""
			}\n    ${entree.raison}`,
		);
	}

	// Append : le lot remplace une exécution antérieure du même lot, sinon s'ajoute.
	const existant = existsSync(SORTIE)
		? (JSON.parse(readFileSync(SORTIE, "utf8")) as SortieVague2)
		: null;
	const nomsDuLot = new Set(traitees.map((t) => t.nom));
	const manques = (existant?.manques ?? []).filter((e) => !nomsDuLot.has(e.nom)).concat(traitees);
	const parLot = (existant?.resolution.parLot ?? []).filter((l) => l.lot !== lot)
		.concat([{ lot, entites: `${debut}-${fin}`, resolues: traitees.filter((t) => t.resolu).length, total: cible.length }]);

	const resolues = manques.filter((t) => t.resolu);
	const bilan = {
		resolues: resolues.length,
		taux: `${resolues.length}/${manques.length}`,
		parConfiance: {
			haute: resolues.filter((t) => t.confiance === "haute").length,
			moyenne: resolues.filter((t) => t.confiance === "moyenne").length,
			faible: resolues.filter((t) => t.confiance === "faible").length,
		},
		nonResolues: manques.filter((t) => !t.resolu).map((t) => t.nomLisible),
		parLot,
		tauxGlobal: null as string | null,
	};

	// Taux global : vague 1 (entités 1-10) + vague 2 cumulées.
	if (existsSync(VAGUE1)) {
		const v1 = JSON.parse(readFileSync(VAGUE1, "utf8")) as { resolution: { resolues: number }; manques: { nom: string }[] };
		const nomsV2 = new Set(manques.map((t) => t.nom));
		const v1HorsV2 = v1.manques.filter((m) => !nomsV2.has(m.nom)).length;
		const v1Resolues = v1.resolution.resolues;
		bilan.tauxGlobal = `${v1Resolues + resolues.length}/${v1HorsV2 + manques.length}`;
	}

	const sortie: SortieVague2 = {
		date: aujourdhui,
		source: "bench/results/manques-referentiel-2026-11-15.json",
		methode: "registre SIRENE (recherche-entreprises.api.gouv.fr, sans clé) + lecture du site de l'entité quand la revendication porte un domaine ; SIREN jamais inventé, recoupé avec le registre ; entités cessées cherchées aussi. Verdicts du plan vague 2 : present = résolue avec preuve ; absent = aucune identité légale française au registre (actifs et cessés) — jamais sans cette preuve ; cannot_verify = candidates sans preuve tranchante (homonymes, site inaccessible), arbitrage humain requis. Annotations de titre de fuite ((old), <Updated>) ôtées du nom lisible.",
		confiances: "haute = SIREN/RCS ou dénomination publiés par le site de l'entité ; moyenne = dénomination exacte au registre ; faible = à un jeton près, à revoir avant chargement",
		cohorte: { zone: "france", total: france.length, traitees: manques.length },
		resolution: bilan,
		manques,
	};
	writeFileSync(SORTIE, `${JSON.stringify(sortie, null, 2)}\n`);

	const resoluesLot = traitees.filter((t) => t.resolu);
	console.log(`\n== Lot ${lot} : ${resoluesLot.length}/${cible.length} résolues ==`);
	for (const niv of ["haute", "moyenne", "faible"] as const) {
		const n = resoluesLot.filter((t) => t.confiance === niv).length;
		if (n > 0) console.log(`  ${niv} : ${n}`);
	}
	for (const t of traitees.filter((x) => !x.resolu)) {
		console.log(`  ${t.verdict} : ${t.nomLisible} — ${t.raison}`);
	}
	console.log(`  cumul vague 2 : ${bilan.taux} ; global vague 1+2 : ${bilan.tauxGlobal ?? "(fichier vague 1 absent)"}`);
	console.log(`\nécrit : ${SORTIE}`);
}

// Lancée en direct seulement : importable sans effet de bord.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((e) => { console.error(e); process.exitCode = 1; });
}
