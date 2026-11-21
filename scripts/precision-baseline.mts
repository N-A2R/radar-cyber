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

/**
 * Estimateur stratifié pondéré (design-based) : la précision de POPULATION,
 * en repondérant chaque strate par sa taille réelle dans la population
 * (tailles issues du fichier de population, écrites au S1.1).
 *
 * Nécessaire parce que le round-robin du tirage S1.1 a produit une
 * allocation **égale** entre strates au lieu de l'allocation proportionnelle
 * documentée : l'estimateur brut du corpus surestime la population (les
 * strates domaine, rares et précises, y pèsent 16 % contre 4 % réels).
 * Chaque strate garde son estimateur brut ; le poids N_s/N redonne la
 * population. Les strates jamais tirées comptent 0. La strate dont le
 * dénominateur est nul (tout indécidable) contribue 0 — Majoration honnête
 * : la vraie valeur de ces strates est inconnue mais bornée.
 */
function estimerStratifie(
	entrees: EntreeVerdict[],
	taillesPopulation: Record<string, number>,
	totalPopulation: number,
): { precision: number | null; detail: Record<string, unknown> } {
	const parStrate = new Map<string, EntreeVerdict[]>();
	for (const e of entrees) {
		const liste = parStrate.get(e.strate);
		if (liste) liste.push(e);
		else parStrate.set(e.strate, [e]);
	}
	const detail: Record<string, unknown> = {};
	let somme = 0;
	let couvert = 0;
	for (const [strate, tailleN] of Object.entries(taillesPopulation)) {
		const ech = parStrate.get(strate) ?? [];
		const m = mesurer(ech);
		const poids = totalPopulation > 0 ? tailleN / totalPopulation : 0;
		const contribution = m.precision !== null ? poids * m.precision : 0;
		somme += contribution;
		couvert += poids;
		detail[strate] = {
			taillePopulation: tailleN,
			poids: Math.round(poids * 10000) / 10000,
			verifiees: ech.length,
			...m,
			contribution: Math.round(contribution * 10000) / 10000,
		};
	}
	return { precision: couvert > 0 ? somme : null, detail };
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

const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as CorpusOuBruit & {
	populationComptes?: { unitesDistinctes: number; repartitionStrates?: Record<string, number> };
};
const mesurePrincipale = mesurer(corpus.entrees);

// Tailles de strate dans la population (écrites au S1.1) : la clé de la
// repondération. Lues depuis le corpus gelé ; si absentes, l'estimateur
// stratifié n'est pas calculable et le JSON le dit.
const taillesPopulation = corpus.populationComptes?.repartitionStrates ?? {};
const totalPopulation = corpus.populationComptes?.unitesDistinctes ?? 0;
const estimationStratifiee =
	totalPopulation > 0 && Object.keys(taillesPopulation).length > 0
		? estimerStratifie(corpus.entrees, taillesPopulation, totalPopulation)
		: null;

const bruit1 = JSON.parse(readFileSync(BRUIT1, "utf8")) as CorpusOuBruit;
const bruit2 = JSON.parse(readFileSync(BRUIT2, "utf8")) as CorpusOuBruit;
const mesureBruit1 = mesurer(bruit1.entrees);
const mesureBruit2 = mesurer(bruit2.entrees);
const estime1 = estimerStratifie(bruit1.entrees, taillesPopulation, totalPopulation);
const estime2 = estimerStratifie(bruit2.entrees, taillesPopulation, totalPopulation);

const ecart =
	mesureBruit1.precision !== null && mesureBruit2.precision !== null
		? Math.abs(mesureBruit1.precision - mesureBruit2.precision)
		: null;
const ecartStratifie =
	estime1.precision !== null && estime2.precision !== null
		? Math.abs(estime1.precision - estime2.precision)
		: null;

const resultat = {
	vague: "precision",
	etape: "S1.5",
	date: AUJOURDHUI,
	definitions:
		"exacte + partielle/2 sur exacte+partielle+hors_sujet ; indécidables comptés à part, hors du dénominateur (définitions figées de docs/plans/wave-precision.md)",
	correctionTirage: {
		constat:
			"le round-robin du tirage S1.1 a produit une allocation ÉGALE entre strates au lieu de l'allocation proportionnelle documentée (sigle tiré à 137/500 contre un quota de 352/500) : l'estimateur brut du corpus n'est pas celui de la population — les strates domaine (rares, P≈95 %) y pèsent 16 % contre 4 % réels, la strate sigle (70 % de la population, P≈0 %) y pèse 27 %",
		corpusGelé: "les verdicts du corpus gelé restent valables (tirage probabiliste valide, design différent de celui documenté) ; le fichier gelé n'est pas modifié (SHA-256 inchangée)",
		estimateur:
			"la précision de population est donnée par l'estimateur stratifié pondéré : somme sur les strates de (N_s/N) × P_s, tailles N_s issues du fichier de population écrit au S1.1",
		tiragesFuturs:
			"scripts/precision-echantillon.mts corrigé en S1.5 : les tirages suivants (échantillon frais S4, bruit) sélectionnent selon les quotas",
	},
	corpus: {
		graine: corpus.graine,
		entrees: corpus.entrees.length,
		...mesurePrincipale,
		repartitionParStrate: parStrate(corpus.entrees),
		precisionStratifiee: estimationStratifiee?.precision ?? null,
		detailStratifie: estimationStratifiee?.detail ?? null,
	},
	bruitDeMesure: {
		protocole:
			"deux tirages neufs de 100 sur la même population (graines différentes), vérifiés par le même protocole S1.2 ; chaque verdict est jugé sur preuve, même pour les unités déjà présentes dans le corpus",
		tirage1: {
			graine: bruit1.graine,
			entrees: bruit1.entrees.length,
			...mesureBruit1,
			precisionStratifiee: estime1.precision,
			detailStratifie: estime1.detail,
		},
		tirage2: {
			graine: bruit2.graine,
			entrees: bruit2.entrees.length,
			...mesureBruit2,
			precisionStratifiee: estime2.precision,
			detailStratifie: estime2.detail,
		},
		ecartObserve: ecart,
		ecartObserveStratifie: ecartStratifie,
	},
};
writeFileSync(SORTIE, JSON.stringify(resultat, null, "\t") + "\n");
console.log(`Baseline écrite : ${SORTIE}`);
console.log(
	`précision corpus (brute) : ${(mesurePrincipale.precision * 100).toFixed(1)}% (${mesurePrincipale.exacte} exacte, ${mesurePrincipale.partielle} partielle, ${mesurePrincipale.hors_sujet} hors_sujet, ${mesurePrincipale.indecidable} indécidable)`,
);
console.log(
	`précision population (stratifiée) : ${estimationStratifiee?.precision === null ? "—" : (estimationStratifiee.precision * 100).toFixed(1)}%`,
);
console.log(
	`bruit à n=100 (stratifié) : P1=${estime1.precision === null ? "—" : (estime1.precision * 100).toFixed(1)}% P2=${estime2.precision === null ? "—" : (estime2.precision * 100).toFixed(1)}% écart=${ecartStratifie === null ? "—" : (ecartStratifie * 100).toFixed(1)} pts (brut : P1=${mesureBruit1.precision === null ? "—" : (mesureBruit1.precision * 100).toFixed(1)}% P2=${mesureBruit2.precision === null ? "—" : (mesureBruit2.precision * 100).toFixed(1)}% écart=${ecart === null ? "—" : (ecart * 100).toFixed(1)} pts)`,
);
await closePools();
