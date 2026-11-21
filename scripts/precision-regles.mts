/**
 * S2 — règles candidates sur les modes d'échec dominants (vague précision).
 *
 * Deux règles, écrites ici une fois pour toutes, mesurées sur le corpus gelé
 * et sur échantillon frais (S2.2/S2.3), retirées si elles ne tiennent pas
 * sur le frais (règle 4 de la vague).
 *
 * Règle n°1 — « un seul jeton ne fonde pas un rattachement » (mode sigle,
 *   123 hors_sujet du corpus, strate qui pèse 70 % de la population) :
 *   élimine les rattachements fondés par le chemin jeton-unique du moteur
 *   (via=name, confiance 0,7 — orgTokens.length === 1). Mesuré sur le corpus :
 *   cette strate sort 0 exacte et 0 partielle pour 125 hors_sujet.
 *   Ce qu'elle casse : les rattachements à une seule jeton distinctif que le
 *   moteur visait (« Kenall/Legrand », « Legrand CRM ») — aucun n'a été
 *   vérifié exact dans l'échantillon ; les victimes désignées par un nom
 *   d'un seul mot disparaissent du rattachement automatique et repassent en
 *   revue humaine.
 *
 * Règle n°2 — « le nom de l'organisation doit couvrir l'indice » (mode
 *   homonyme, 95 hors_sujet) : sur le chemin tous-jetons (via=name,
 *   confiance 0,75), exige que chaque jeton discriminant de l'indice figure
 *   dans le nom de l'organisation — l'indice ne doit pas être plus précis
 *   que le nom (« Detroit Stoker » ne peut plus rattacher DETROIT :
 *   « stoker » ne fait pas partie du nom).
 *   Ce qu'elle casse : les indices porteurs de mots descriptifs hors du nom
 *   (« Business Services » dans « Atos (Business Services · France) ») — une
 *   partielle du corpus disparaît ; les indices à city ajoutée survivent
 *   quand la commune fait partie du nom.
 *
 * Mesure :
 *
 *   tsx scripts/precision-regles.mts --corpus=bench/precision/corpus-v1.json \
 *     --regles=1 --json=bench/results/precision-regles-s2.json
 *   --regles=1,2 pour la règle 2 cumulée ; --frais=<fichier> pour mesurer sur
 *   un tirage frais vérifié.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { closePools } from "../apps/api/src/db.js";
import { normalizeName, GENERIC_TOKENS } from "../apps/api/src/quarantine/promote.js";

const argv = process.argv.slice(2);
const option = (nom: string): string | undefined =>
	argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");

const CORPUS = option("corpus") ?? "bench/precision/corpus-v1.json";
const REGLES = (option("regles") ?? "1").split(",").map((s) => Number(s.trim()));
const SORTIE = option("json") ?? "bench/results/precision-regles-s2.json";
const ETIQUETTE = option("label") ?? "regles-s2";

type Entree = {
	ordre: number;
	indice: string;
	strate: string;
	confiance: number;
	via: string;
	type: string;
	org: { name: string };
	verdict: null | { verdict: string };
};

/** Jetons discriminants d'un texte — même prédicat que le moteur. */
function jetons(texte: string): Set<string> {
	return new Set(normalizeName(texte).split(" ").filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t)));
}

/** Règle n°1 : le chemin jeton-unique ne fonde plus de rattachement. */
function elimineSigle(e: Entree): boolean {
	return e.via === "name" && e.confiance === 0.7;
}

/** Règle n°2 : sur le chemin tous-jetons, l'indice doit être couvert par le
 * nom de l'organisation (chaque jeton discriminant de l'indice est dans le
 * nom) — l'indice ne peut pas être plus précis que le nom. */
function elimineHomonyme(e: Entree): boolean {
	if (e.via !== "name" || e.confiance !== 0.75) return false;
	const jetonsIndice = jetons(e.indice);
	const jetonsOrg = jetons(e.org.name);
	for (const t of jetonsIndice) {
		if (!jetonsOrg.has(t)) return true;
	}
	return false;
}

const REGLES_DISPONIBLES: Record<number, { elimine: (e: Entree) => boolean; description: string }> = {
	1: { elimine: elimineSigle, description: "sigle : via=name à 0,7 (jeton unique) éliminé" },
	2: { elimine: elimineHomonyme, description: "homonyme : à 0,75, l'indice doit être couvert par le nom de l'org" },
};

const AUJOURDHUI = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());

function precision(v: Array<string | null>): number | null {
	const compte = { exacte: 0, partielle: 0, hors_sujet: 0 };
	for (const x of v) {
		if (x && x in compte) compte[x as keyof typeof compte]++;
	}
	const den = compte.exacte + compte.partielle + compte.hors_sujet;
	return den > 0 ? (compte.exacte + compte.partielle / 2) / den : null;
}

const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as {
	populationComptes?: { unitesDistinctes: number; repartitionStrates?: Record<string, number> };
	entrees: Entree[];
};

const reglesActives = REGLES.map((n) => ({ n, ...(REGLES_DISPONIBLES[n] as { elimine: (e: Entree) => boolean; description: string }) })).filter((r) => r.elimine);
if (reglesActives.length !== REGLES.length) {
	console.error(`règle inconnue dans --regles=${REGLES.join(",")}`);
	process.exitCode = 1;
	await closePools();
} else {
	const elimine = (e: Entree): boolean => reglesActives.some((r) => r.elimine(e));
	const conservees = corpus.entrees.filter((e) => !elimine(e));
	const ecartees = corpus.entrees.filter((e) => elimine(e));

	// Ce que les règles cassent : le verdict des entrées écartées.
	const verdictsEcartes = new Map<string, number>();
	for (const e of ecartees) {
		const v = e.verdict?.verdict ?? "non vérifié";
		verdictsEcartes.set(v, (verdictsEcartes.get(v) ?? 0) + 1);
	}

	// Précision brute avant/après, sur les verdicts posés.
	const avant = precision(corpus.entrees.filter((e) => e.verdict).map((e) => (e.verdict?.verdict as string) ?? null));
	const apres = precision(conservees.filter((e) => e.verdict).map((e) => (e.verdict?.verdict as string) ?? null));

	// Précision stratifiée (population) avant/après. Après application d'une
	// règle, les strates entièrement écartées ne produisent plus de
	// rattachement : elles sortent du dénominateur, et la précision « après »
	// est renormalisée sur la population que le moteur rattache encore.
	const tailles = corpus.populationComptes?.repartitionStrates ?? {};
	const total = corpus.populationComptes?.unitesDistinctes ?? 0;
	function stratifie(entrees: Entree[]): { valeur: number | null; poidsActif: number } {
		if (total === 0) return { valeur: null, poidsActif: 0 };
		const parStrate = new Map<string, Entree[]>();
		for (const e of entrees) {
			if (!e.verdict) continue;
			const l = parStrate.get(e.strate) ?? [];
			l.push(e);
			parStrate.set(e.strate, l);
		}
		let somme = 0;
		let poidsActif = 0;
		for (const [strate, tailleN] of Object.entries(tailles)) {
			const ech = parStrate.get(strate) ?? [];
			if (ech.length === 0) continue; // plus de rattachement dans cette strate
			const m = precision(ech.map((x) => x.verdict?.verdict ?? null));
			const poids = tailleN / total;
			poidsActif += poids;
			if (m !== null) somme += poids * m;
		}
		return { valeur: poidsActif > 0 ? somme / poidsActif : null, poidsActif };
	}
	const avantS = stratifie(corpus.entrees);
	const apresS = stratifie(conservees);

	const resultat = {
		vague: "precision",
		etape: "S2",
		date: AUJOURDHUI,
		corpus: CORPUS,
		label: ETIQUETTE,
		regles: reglesActives.map((r) => ({ numero: r.n, description: r.description })),
		population: { unitesDistinctes: total, taillesStrates: tailles },
		effect: {
			entrees: corpus.entrees.length,
			conservees: conservees.length,
			ecartees: ecartees.length,
			verdictsDesEcartees: Object.fromEntries(verdictsEcartes),
		},
		precisionBrute: { avant, apres },
		precisionStratifiee: {
			avant: avantS.valeur,
			apres: apresS.valeur,
			note: "la précision « après » est renormalisée sur la population que le moteur rattache encore (les strates entièrement écartées sortent du dénominateur)",
		},
		entreesEcartees: ecartees.map((e) => ({ ordre: e.ordre, strate: e.strate, indice: e.indice, verdict: e.verdict?.verdict ?? null })),
	};
	writeFileSync(SORTIE, JSON.stringify(resultat, null, "\t") + "\n");
	console.log(`Règles écrites : ${SORTIE}`);
	console.log(
		`écartées : ${ecartees.length}/${corpus.entrees.length} (verdicts : ${JSON.stringify(Object.fromEntries(verdictsEcartes))})`,
	);
	console.log(
		`précision brute avant/après : ${avant === null ? "—" : (avant * 100).toFixed(1)}% → ${apres === null ? "—" : (apres * 100).toFixed(1)}%`,
	);
	console.log(
		`précision population avant/après : ${avantS.valeur === null ? "—" : (avantS.valeur * 100).toFixed(1)}% → ${apresS.valeur === null ? "—" : (apresS.valeur * 100).toFixed(1)}% (rattachements encore produits : ${(apresS.poidsActif * 100).toFixed(1)}% de la population)`,
	);
	await closePools();
}
