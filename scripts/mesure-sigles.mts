/**
 * S2.3/S2.2 — mesure de la règle `sigle-confirme`.
 *
 * A. File réelle des 220 : la source est le relevé gelé
 *    `bench/results/precision-branchement.json` (volume 220, 204 sans match,
 *    16 rattachements refusés). La file vivante a changé depuis la mesure ;
 *    rejouer le flux live ne donnerait plus le dénominateur 220.
 * B. Jeu d'or : les 50 pièges du corpus gelé, rejoués avec la décision que
 *    la production prendrait (registre réel). Aucun piège ne doit passer.
 * C. Contrôle : quelques sigles réels du registre, chemin moteur complet.
 *
 * Rejouer :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-sigles.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { closePools } from "../apps/api/src/db.js";
import {
	ecarteeParRegles,
	REGLE_SIGLE,
	type TraceRegle,
} from "../apps/api/src/match/regles-precision.js";
import {
	deciderSigleDepuisRegistre,
	sigleDeIndice,
	SQL_ALIAS_SIGLE,
	SQL_CANDIDATS_SIGLE,
	type DecisionSigle,
} from "../apps/api/src/match/sigles.js";
import {
	loadCandidateIndex,
	matchOrgInIndex,
	refusParRegles,
	resoudreSigle,
} from "../apps/api/src/quarantine/promote.js";

const SORTIE = "bench/results/sigles-avant-apres.json";
process.env.PRECISION_RULES = "on";

type RefusFile = {
	id: number;
	regle: string;
	indice: string;
	orgId: number;
	orgName: string;
	via: "domain" | "name";
	confidence: number;
};
type EntreeCorpus = {
	ordre: number;
	indice: string;
	confiance: number;
	via: string;
	org: { id: number; name: string };
};
type CasOr = {
	ordreCorpus: number;
	comportementAttendu: "conserve" | "ecartee";
	regleResponsable: string | null;
};

/** Évalue un candidat avec ou sans décision du registre. */
function evaluer(
	indice: string,
	via: "domain" | "name",
	confidence: number,
	orgName: string,
	orgId: number,
	decision?: DecisionSigle,
): { regle: string | null; trace: TraceRegle } {
	const trace: TraceRegle = { regle: "", accepte: false };
	const regle = ecarteeParRegles(
		{ indice, via, confidence, orgName, orgId, sigle: decision },
		trace,
	);
	return { regle, trace };
}

const branchement = JSON.parse(readFileSync("bench/results/precision-branchement.json", "utf8")) as {
	fluxReel: {
		volume: number;
		sansRattachement: number;
		regimeOn: { rattaches: number; refus: RefusFile[] };
	};
};
const file = branchement.fluxReel.regimeOn.refus;
console.log(`File gelée : ${branchement.fluxReel.volume} indices, ${file.length} rattachements du moteur.`);

let acceptesAvant = 0;
let acceptesApres = 0;
let candidatsMultiples = 0;
const parMotif: Record<string, number> = {};
const detail: Record<string, unknown>[] = [];
for (const r of file) {
	const avant = evaluer(r.indice, r.via, r.confidence, r.orgName, r.orgId);
	if (avant.regle === null) acceptesAvant++;
	const sigle = r.via === "name" && r.confidence === 0.7 ? sigleDeIndice(r.indice, r.orgName) : null;
	const decision = sigle ? await deciderSigleDepuisRegistre(sigle) : undefined;
	const apres = evaluer(r.indice, r.via, r.confidence, r.orgName, r.orgId, decision);
	if (apres.regle === null) acceptesApres++;
	if (decision && decision.candidats >= 2) candidatsMultiples++;
	const motif = decision?.motif ?? "hors-perimetre-sigle";
	parMotif[motif] = (parMotif[motif] ?? 0) + 1;
	detail.push({
		id: r.id,
		indice: r.indice,
		orgId: r.orgId,
		orgName: r.orgName,
		via: r.via,
		confidence: r.confidence,
		sigle,
		candidats: decision?.candidats ?? null,
		motif,
		avant: avant.regle ?? "accepte",
		apres: apres.regle ?? "accepte",
		traceApres: apres.trace,
	});
}
console.log(
	`Acceptés : avant ${acceptesAvant}/${file.length}, après ${acceptesApres}/${file.length} ; ` +
		`candidats multiples ${candidatsMultiples}.`,
);

const corpus = JSON.parse(readFileSync("bench/precision/corpus-v1.json", "utf8")) as {
	entrees: EntreeCorpus[];
};
const gold = JSON.parse(readFileSync("bench/precision/gold-v1.json", "utf8")) as { cas: CasOr[] };
const parOrdre = new Map(corpus.entrees.map((e) => [e.ordre, e]));
let piegesPasses = 0;
let piegesIntacts = 0;
let conservesIntacts = 0;
const ecarts: Record<string, unknown>[] = [];
for (const cas of gold.cas) {
	const e = parOrdre.get(cas.ordreCorpus);
	if (!e) continue;
	const via = e.via === "domain" ? "domain" : "name";
	const sigle = via === "name" && e.confiance === 0.7 ? sigleDeIndice(e.indice, e.org.name) : null;
	const decision = sigle ? await deciderSigleDepuisRegistre(sigle) : undefined;
	const { regle } = evaluer(e.indice, via, e.confiance, e.org.name, e.org.id, decision);
	const conserve = regle === null;
	if (cas.comportementAttendu === "ecartee") {
		if (conserve) {
			piegesPasses++;
			ecarts.push({ ordre: cas.ordreCorpus, indice: e.indice, sigle, motif: decision?.motif, attendu: "ecartee" });
		} else piegesIntacts++;
	} else {
		if (conserve) conservesIntacts++;
		else ecarts.push({ ordre: cas.ordreCorpus, indice: e.indice, regle, attendu: "conserve" });
	}
}
console.log(
	`Jeu d'or : ${piegesIntacts}/${piegesIntacts + piegesPasses} pièges écartés, ` +
		`${conservesIntacts} conserves intacts, ${piegesPasses} piège(s) passé(s).`,
);

// Contrôle : le chemin moteur complet sur des sigles réels du registre.
const siglesTemoins = ["ERNAT", "AMF", "FNC", "OFB", "UNSS", "A.M.F.", "ANSSI"];
const temoins: Record<string, unknown>[] = [];
for (const indice of siglesTemoins) {
	const candidatsIndex = await loadCandidateIndex(indice);
	const m = matchOrgInIndex(indice, candidatsIndex);
	const resolu = await resoudreSigle(indice, m, m ? (candidatsIndex.find((e) => e.id === m.orgId)?.name ?? "") : "");
	const trace: TraceRegle = { regle: "", accepte: false };
	const regle = resolu.match
		? refusParRegles(indice, resolu.match, resolu.orgName, { sigle: resolu.decision, trace })
		: "sans-match";
	temoins.push({
		indice,
		matchMoteur: m,
		matchResolu: resolu.match,
		decision: resolu.decision ?? null,
		regle: regle ?? "accepte",
		trace,
	});
}
const acceptesTemoins = temoins.filter((t) => t.regle === "accepte").length;
console.log(`Témoins registre : ${acceptesTemoins}/${temoins.length} sigles acceptés de bout en bout.`);

const sortie = {
	vague: "couverture",
	etape: "S2.3",
	date: new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date()),
	regle: REGLE_SIGLE,
	protocole:
		"file des 220 relevée gelée dans bench/results/precision-branchement.json (16 rattachements du moteur) : avant = règles S2/S3 sans décision du registre, après = même appel avec la décision sigle-confirme calculée sur la base réelle (5433), sans écriture. Jeu d'or : 50 pièges rejoués avec la même décision de production.",
	requetesSQL: {
		candidats: SQL_CANDIDATS_SIGLE,
		aliasSigle: SQL_ALIAS_SIGLE,
	},
	file220: {
		volume: branchement.fluxReel.volume,
		sansRattachement: branchement.fluxReel.sansRattachement,
		rattachementsMoteur: file.length,
		acceptesAvant: acceptesAvant,
		acceptesApres: acceptesApres,
		refusesAvant: file.length - acceptesAvant,
		refusesApres: file.length - acceptesApres,
		candidatsMultiples,
		parMotif,
		detail,
	},
	jeuDor: {
		cas: gold.cas.length,
		piegesEcartes: piegesIntacts,
		piegesPasses,
		conservesIntacts,
		ecarts,
	},
	temoinsRegistre: { acceptes: acceptesTemoins, total: temoins.length, detail: temoins },
};
writeFileSync(SORTIE, JSON.stringify(sortie, null, "\t") + "\n");
console.log(`Résultat écrit : ${SORTIE}`);
if (piegesPasses > 0) process.exitCode = 1;
await closePools();
