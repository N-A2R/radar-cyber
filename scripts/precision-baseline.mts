/**
 * S1.5 — Précision de départ et bruit de mesure (vague précision).
 *
 * Agrège le corpus vérifié (corpus-v1.json) en :
 *   - la précision (définitions figées de la vague) :
 *       P = (exacte + partielle/2) / (exacte + partielle + hors_sujet)
 *     les indécidables sortent du dénominateur et se comptent à part ;
 *   - la répartition des verdicts, globale et par strate ;
 *   - le bruit de mesure : deux tirages de 100 sur la MÊME population
 *     (graines différentes, jamais vus), vérifiés chacun selon le même
 *     protocole — l'écart observé entre leurs deux précisions est la
 *     sensibilité du chiffre à n=100. Ce ne sont pas des sous-échantillons
 *     du corpus : ce sont des tirages neufs, sinon le bruit serait un
 *     ré-échantillonnage de la même information.
 *
 * Rejouer :
 *
 *   tsx scripts/precision-baseline.mts --corpus=bench/precision/corpus-v1.json \
 *     --bruit1=bench/precision/tirage-bruit-1.json \
 *     --bruit2=bench/precision/tirage-bruit-2.json \
 *     --json=bench/results/precision-baseline.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { closePools } from "../apps/api/src/db.js";

const argv = process.argv.slice(2);
const option = (nom: string): string | undefined =>
	argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");

const CORPUS = option("corpus") ?? "bench/precision/corpus-v1.json";
const BRUIT1 = option("bruit1") ?? "bench/precision/tirage-bruit-1.json";
const BRUIT2 = option("bruit2") ?? "bench/precision/tirage-bruit-2.json";
const SORTIE = option("json") ?? "bench/results/precision-baseline.json";

type Verdict = {
	verdict: string;
	motif: string;
	registre: unknown;
	siteIndice: unknown;
	siteOrg: unknown;
	le: string;
};

type EntreeVerdict = {
	ordre: number;
	strate: string;
	confiance: number;
	type: string;
	source: string;
	verdict: Verdict | null;
};

type CorpusOuBruit = {
	graine: number;
	populationComptes?: { unitesDistinctes: number };
	entrees: EntreeVerdict[];
};

const AUJOURDHUI = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());

/** Précision et répartition d'un jeu de verdicts posés. */
function mesurer(entrees: EntreeVerdict[]): {
	poses: number;
	exacte: number;
	partielle: number;
	hors_sujet: number;
	indecidable: number;
	precision: number | null;
	denominateur: number;
} {
	const compte = { exacte: 0, partielle: 0, hors_sujet: 0, indecidable: 0 };
	for (const e of entrees) {
		const v = e.verdict?.verdict;
		if (v && v in compte) compte[v as keyof typeof compte]++;
	}
	const denominateur = compte.exacte + compte.partielle + compte.hors_sujet;
	return {
		poses: compte.exacte + compte.partielle + compte.hors_sujet + compte.indecidable,
		...compte,
		precision: denominateur > 0 ? (compte.exacte + compte.partielle / 2) / denominateur : null,
		denominateur,
	};
}

/** Répartition par strate : effectifs et verdicts. */
function parStrate(entrees: EntreeVerdict[]): Record<string, unknown> {
	const strates = new Map<string, EntreeVerdict[]>();
	for (const e of entrees) {
		const liste = strates.get(e.strate);
		if (liste) liste.push(e);
		else strates.set(e.strate, [e]);
	}
	const out: Record<string, unknown> = {};
	for (const [cle, liste] of [...strates.entries()].sort()) {
		out[cle] = { effectif: liste.length, ...mesurer(liste) };
	}
	return out;
}

const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as CorpusOuBruit;
const mesurePrincipale = mesurer(corpus.entrees);

const bruit1 = JSON.parse(readFileSync(BRUIT1, "utf8")) as CorpusOuBruit;
const bruit2 = JSON.parse(readFileSync(BRUIT2, "utf8")) as CorpusOuBruit;
const mesureBruit1 = mesurer(bruit1.entrees);
const mesureBruit2 = mesurer(bruit2.entrees);

const ecart =
	mesureBruit1.precision !== null && mesureBruit2.precision !== null
		? Math.abs(mesureBruit1.precision - mesureBruit2.precision)
		: null;

const resultat = {
	vague: "precision",
	etape: "S1.5",
	date: AUJOURDHUI,
	definitions:
		"exacte + partielle/2 sur exacte+partielle+hors_sujet ; indécidables comptés à part, hors du dénominateur (définitions figées de docs/plans/wave-precision.md)",
	corpus: {
		graine: corpus.graine,
		entrees: corpus.entrees.length,
		...mesurePrincipale,
		repartitionParStrate: parStrate(corpus.entrees),
	},
	bruitDeMesure: {
		protocole: "deux tirages neufs de 100 sur la même population (graines différentes), vérifiés par le même protocole S1.2",
		tirage1: { graine: bruit1.graine, entrees: bruit1.entrees.length, ...mesureBruit1 },
		tirage2: { graine: bruit2.graine, entrees: bruit2.entrees.length, ...mesureBruit2 },
		ecartObserve: ecart,
	},
};
writeFileSync(SORTIE, JSON.stringify(resultat, null, "\t") + "\n");
console.log(`Baseline écrite : ${SORTIE}`);
console.log(
	`précision corpus : ${(mesurePrincipale.precision * 100).toFixed(1)}% (${mesurePrincipale.exacte} exacte, ${mesurePrincipale.partielle} partielle, ${mesurePrincipale.hors_sujet} hors_sujet, ${mesurePrincipale.indecidable} indécidable)`,
);
console.log(
	`bruit à n=100 : P1=${mesureBruit1.precision === null ? "—" : (mesureBruit1.precision * 100).toFixed(1)}% P2=${mesureBruit2.precision === null ? "—" : (mesureBruit2.precision * 100).toFixed(1)}% écart=${ecart === null ? "—" : (ecart * 100).toFixed(1)} pts`,
);
await closePools();
