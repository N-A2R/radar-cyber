/**
 * S2 — mesure du compromis précision/couverture, règles branchées (vague
 * branchement, docs/plans/wave-regles.md).
 *
 * Les deux régimes (PRECISION_RULES=off / on) tournent **dans le même
 * binaire** : le drapeau est lu à chaque appel (`reglesPrecisionActives`,
 * src/quarantine/promote.ts) et le script le bascule entre les passes.
 * Les refus sont évalués par la fonction de production (`refusParRegles` →
 * `ecarteeParRegles`, src/match/regles-precision.ts) — pas par une copie.
 *
 * Trois instruments :
 *   A. corpus gelé (bench/precision/corpus-v1.json, 500 verdicts avec
 *      preuve) — précision et couverture avant (off) / après (on) ;
 *   B. échantillon frais proportionnel (bench/precision/frais-500.json,
 *      graine 20261225, 500 verdicts) — idem, son estimateur brut EST
 *      l'estimateur de population ;
 *   C. flux réel — la file `quarantine_raw` pending à indice (le volume que
 *      le prochain passage de promotion examine), rejouée avec le chemin
 *      livré (loadCandidateIndex SQL + matchOrgInIndex) et les règles.
 *
 * Couverture, deux estimateurs publiés ensemble (relecture de vague) :
 *   - `couvertureParUnite` : part des rattachements du moteur qui
 *     survivent aux règles — l'estimateur brut sur tirage proportionnel ;
 *   - `poidsStratesActives` : part de la population d'unités vivant dans
 *     des strates qui produisent encore des rattachements (poidsActif de
 *     l'estimateur stratifié, identique à precision-regles.mts) — borne
 *     haute, c'est le « 29 % » publié par la vague précédente.
 *
 * Rejouer :
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     tsx scripts/precision-branchement.mts
 *   # --json=<fichier> pour changer la sortie
 */
import { readFileSync, writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
	loadCandidateIndex,
	matchOrgInIndex,
	reglesPrecisionActives,
	refusParRegles,
	type OrgIndexEntry,
	type OrgMatch,
} from "../apps/api/src/quarantine/promote.js";

const argv = process.argv.slice(2);
const option = (nom: string): string | undefined =>
	argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");

const GELE = option("gele") ?? "bench/precision/corpus-v1.json";
const FRAIS = option("frais") ?? "bench/precision/frais-500.json";
const SORTIE = option("json") ?? "bench/results/precision-branchement.json";

const AUJOURDHUI = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());

/** Entrée d'un corpus de la vague précision (verdicts posés avec preuve). */
type Entree = {
	ordre: number;
	indice: string;
	strate: string;
	confiance: number;
	via: string;
	type: string;
	org: { id: number; name: string };
	verdict: null | { verdict: string };
};

type Corpus = {
	populationComptes?: { unitesDistinctes: number; repartitionStrates?: Record<string, number> };
	entrees: Entree[];
};

/** Verdicts comptés dans le dénominateur de la précision. */
const COMPTES = { exacte: 0, partielle: 0, hors_sujet: 0 };

function precision(verdicts: Array<string | null>): number | null {
	const compte = { ...COMPTES };
	for (const x of verdicts) {
		if (x && x in compte) compte[x as keyof typeof compte]++;
	}
	const den = compte.exacte + compte.partielle + compte.hors_sujet;
	return den > 0 ? (compte.exacte + compte.partielle / 2) / den : null;
}

/**
 * Estimateur stratifié pondéré — le même que scripts/precision-regles.mts :
 * les strates sans rattachement survivant sortent du dénominateur, et
 * `poidsActif` (renommé ici `poidsStratesActives`) est la part de la
 * population vivant dans les strates encore actives.
 */
function stratifie(
	entrees: Entree[],
	tailles: Record<string, number>,
	total: number,
): { valeur: number | null; poidsActif: number } {
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

/** Le drapeau de production, basculé pour la passe. */
function poserDrapeau(v: "off" | "on"): void {
	process.env.PRECISION_RULES = v;
	if (reglesPrecisionActives() !== (v === "on")) {
		console.error(`drapeau incohérent : demandé ${v}, lu ${String(reglesPrecisionActives())}`);
		process.exit(1);
	}
}

/** Mesure un corpus sous les deux régimes, avec la fonction de production. */
function mesurerCorpus(corpus: Corpus, nom: string) {
	const entrees = corpus.entrees;
	const tailles = corpus.populationComptes?.repartitionStrates ?? {};
	const total = corpus.populationComptes?.unitesDistinctes ?? 0;
	const regimes: Record<string, unknown> = {};
	for (const regime of ["off", "on"] as const) {
		poserDrapeau(regime);
		const rattaches: Entree[] = [];
		const parRegle = new Map<string, { n: number; verdicts: Record<string, number> }>();
		for (const e of entrees) {
			const via = e.via === "domain" ? "domain" : "name";
			const regle = refusParRegles(e.indice, { via, confidence: e.confiance }, e.org.name);
			if (regle === null) {
				rattaches.push(e);
				continue;
			}
			const slot = parRegle.get(regle) ?? { n: 0, verdicts: {} };
			slot.n++;
			const v = e.verdict?.verdict ?? "non_verifie";
			slot.verdicts[v] = (slot.verdicts[v] ?? 0) + 1;
			parRegle.set(regle, slot);
		}
		const verifiees = rattaches.filter((e) => e.verdict);
		const avant = precision(entrees.filter((e) => e.verdict).map((e) => e.verdict?.verdict ?? null));
		const brute = precision(verifiees.map((e) => e.verdict?.verdict ?? null));
		const s = stratifie(rattaches, tailles, total);
		regimes[regime] = {
			rattachements: rattaches.length,
			couvertureParUnite: Number((rattaches.length / entrees.length).toFixed(4)),
			precisionBrute: brute,
			precisionPopulationStratifiee: s.valeur,
			poidsStratesActives: Number(s.poidsActif.toFixed(4)),
			precisionBruteAvantRegles: avant,
			refusParRegle: Object.fromEntries(
				[...parRegle.entries()].map(([r, d]) => [r, { n: d.n, verdicts: d.verdicts }]),
			),
		};
	}
	return {
		instrument: nom,
		n: entrees.length,
		population: { unitesDistinctes: total, taillesStrates: tailles },
		regimeOff: regimes.off,
		regimeOn: regimes.on,
		entreesRefusees: (() => {
			poserDrapeau("on");
			return entrees
				.map((e) => ({
					ordre: e.ordre,
					strate: e.strate,
					indice: e.indice,
					via: e.via,
					confiance: e.confiance,
					org: e.org.name,
					verdict: e.verdict?.verdict ?? null,
					regle: refusParRegles(e.indice, { via: e.via === "domain" ? "domain" : "name", confidence: e.confiance }, e.org.name),
				}))
				.filter((x) => x.regle !== null);
		})(),
	};
}

// ── C. flux réel : la file pending, chemin livré ──────────────────────────

type MatchReel = {
	id: number;
	indice: string;
	source: string;
	match: OrgMatch | null;
	orgName: string;
};

async function rejouerFluxReel(): Promise<{
	volume: number;
	sansRattachement: number;
	regimeOff: Record<string, unknown>;
	regimeOn: Record<string, unknown>;
}> {
	const rows = await query<{ id: string; org_hint: string; source: string }>(
		`SELECT id, org_hint, source FROM quarantine_raw
		  WHERE status='pending' AND promoted=false AND kind='claim'
		    AND org_hint IS NOT NULL AND org_hint <> ''
		  ORDER BY id`,
	);
	// Le chemin livré : préfiltre SQL par indice (loadCandidateIndex), puis
	// matchOrgInIndex. Une fois par indice distinct : le drapeau ne change
	// pas le rapprochement, seulement les règles qui tranchent après.
	const candidats = new Map<string, OrgIndexEntry[]>();
	const matches: MatchReel[] = [];
	let sansRattachement = 0;
	for (const row of rows.rows) {
		const hint = String(row.org_hint);
		let c = candidats.get(hint);
		if (!c) {
			c = await loadCandidateIndex(hint);
			candidats.set(hint, c);
		}
		const m = matchOrgInIndex(hint, c);
		if (!m) sansRattachement++;
		matches.push({
			id: Number(row.id),
			indice: hint,
			source: row.source,
			match: m,
			orgName: m ? (c.find((e) => e.id === m.orgId)?.name ?? "") : "",
		});
	}
	const auto = (m: OrgMatch | null): boolean => m !== null && m.confidence >= 0.85;
	const regimes: Record<string, unknown> = {};
	for (const regime of ["off", "on"] as const) {
		poserDrapeau(regime);
		const refus: Array<{ id: number; regle: string; indice: string; orgId: number; orgName: string; via: string; confidence: number }> = [];
		const parRegle = new Map<string, number>();
		let rattaches = 0;
		let dontAuto = 0;
		for (const r of matches) {
			if (!r.match) continue;
			const regle = refusParRegles(r.indice, r.match, r.orgName);
			if (regle !== null) {
				parRegle.set(regle, (parRegle.get(regle) ?? 0) + 1);
				refus.push({
					id: r.id,
					regle,
					indice: r.indice,
					orgId: r.match.orgId,
					orgName: r.orgName,
					via: r.match.via,
					confidence: r.match.confidence,
				});
				continue;
			}
			rattaches++;
			if (auto(r.match)) dontAuto++;
		}
		regimes[regime] = {
			rattaches: rattaches,
			dontSeuilAuto: dontAuto,
			refusParRegle: Object.fromEntries(parRegle),
			refus,
		};
	}
	return { volume: rows.rows.length, sansRattachement, regimeOff: regimes.off, regimeOn: regimes.on };
}

// ── exécution ─────────────────────────────────────────────────────────────

const gele = JSON.parse(readFileSync(GELE, "utf8")) as Corpus;
const frais = JSON.parse(readFileSync(FRAIS, "utf8")) as Corpus;

console.log(`A. corpus gelé : ${gele.entrees.length} entrées (${GELE})`);
const mesureGele = mesurerCorpus(gele, "corpus gelé (allocation égale, verdicts avec preuve)");
console.log(
	`   off : ${JSON.stringify((mesureGele.regimeOff as { rattachements: number }).rattachements)} rattachements — on : ${
		JSON.stringify((mesureGele.regimeOn as { rattachements: number }).rattachements)
	}`,
);

console.log(`B. échantillon frais : ${frais.entrees.length} entrées (${FRAIS})`);
const mesureFrais = mesurerCorpus(frais, "échantillon frais proportionnel (graine 20261225)");

console.log("C. flux réel : file pending à indice (chemin livré, préfiltre SQL)");
const flux = await rejouerFluxReel();
console.log(
	`   volume ${flux.volume}, sans rattachement ${flux.sansRattachement} — off : ${
		JSON.stringify((flux.regimeOff as { rattaches: number }).rattaches)
	} rattachés — on : ${JSON.stringify((flux.regimeOn as { rattaches: number }).rattaches)} rattachés, refus ${
		JSON.stringify((flux.regimeOn as { refusParRegle: Record<string, number> }).refusParRegle)
	}`,
);

poserDrapeau("off"); // laisser le processus dans le régime livré

const sortie = {
	vague: "regles",
	etape: "S2",
	date: AUJOURDHUI,
	protocole:
		"les deux régimes tournent dans le même binaire (PRECISION_RULES lu à l'appel, basculé entre les passes) ; les refus sont évalués par la fonction de production refusParRegles → ecarteeParRegles (src/match/regles-precision.ts) ; le flux réel rejoue le chemin livré (loadCandidateIndex + matchOrgInIndex) sur la file pending, sans écrire",
	binaire: {
		drapeau: "PRECISION_RULES=on|off (défaut off)",
		regles: "apps/api/src/match/regles-precision.ts (les six règles retenues)",
		pointDeDecision: "apps/api/src/quarantine/promote.ts : promoteMatches (auto) et promoteOneTx (manuel)",
	},
	corpusGele: { ...mesureGele, fichier: GELE },
	corpusFrais: { ...mesureFrais, fichier: FRAIS },
	fluxReel: {
		...flux,
		perimetre:
			"quarantine_raw : status='pending', promoted=false, kind='claim', org_hint non vide — le volume que le prochain passage de promotion examine (le moteur plafonne chaque passage à 50 faits) ; le modèle de décision (confirmOrganization) n'est pas consulté ici : il arbitre entre match et écriture, hors périmètre des règles",
	},
	noteCouverture:
		"couvertureParUnite = part des rattachements du moteur qui survivent aux règles (estimateur brut sur tirage proportionnel) ; poidsStratesActives = part de la population vivant dans des strates encore actives (borne haute, l'estimateur du « 29 % » publié par la vague précision) — les deux sont publiés ensemble",
};
writeFileSync(SORTIE, JSON.stringify(sortie, null, "\t") + "\n");
console.log(`Résultat écrit : ${SORTIE}`);
await closePools();
