/**
 * Mesure de l'index sigle → organisations sur les sigles présents dans la file.
 *
 * Deux files :
 *  - la file gelée des 220 (bench/results/precision-branchement.json), où le
 *    relevé S2.3 avait trouvé un seul sigle exploitable ;
 *  - la file vivante (quarantine_raw pending), classée par `classifierIndice`.
 *
 * Pour chaque sigle trouvé, on compare l'ancien régime (index des usuelles
 * seules) au registre complet (toutes sources actives + dénominations), avec
 * et sans contexte de la source. Aucune écriture en base.
 *
 * Rejouer :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-index-sigles.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import { classifierIndice } from "../apps/api/src/match/famille-indice.js";
import {
	candidatsSigleDepuisIndex,
	candidatsSigleDepuisRegistre,
	contexteSigleDepuisSource,
	decideSigle,
	deciderSigleDepuisRegistre,
	normaliseSigle,
	sigleDeIndice,
	statistiquesIndexSigles,
	type CandidatSigle,
	type ContexteSigle,
} from "../apps/api/src/match/sigles.js";

const SORTIE = "bench/results/index-sigles.json";
process.env.PRECISION_RULES = "on";

type Refus = {
	id: number;
	indice: string;
	orgId: number;
	orgName: string;
	via: "domain" | "name";
	confidence: number;
};

/** Candidats de l'ancien régime : l'index des usuelles seules. */
async function candidatsAvant(sigle: string): Promise<CandidatSigle[]> {
	return candidatsSigleDepuisIndex(normaliseSigle(sigle));
}

const branchement = JSON.parse(readFileSync("bench/results/precision-branchement.json", "utf8")) as {
	fluxReel: { volume: number; regimeOn: { refus: Refus[] } };
};
const file = branchement.fluxReel.regimeOn.refus;
const index = await statistiquesIndexSigles();

const detail: Record<string, unknown>[] = [];
for (const r of file) {
	if (r.via !== "name" || r.confidence !== 0.7) continue;
	const sigle = sigleDeIndice(r.indice, r.orgName);
	if (!sigle) continue;
	const avant = await candidatsAvant(sigle);
	const sansContexte = await deciderSigleDepuisRegistre(sigle);
	const contexte = await contexteSigleDepuisSource(r.orgId, r.indice);
	const apres = await deciderSigleDepuisRegistre(sigle, contexte);
	const candidats = await candidatsSigleDepuisRegistre(sigle, contexte);
	detail.push({
		id: r.id,
		indice: r.indice,
		sigle,
		contexte: (contexte ?? {}) as ContexteSigle,
		candidatsAvant: avant.length,
		decisionAvant: decideSigle(sigle, avant).motif,
		candidatsApres: candidats.length,
		sansContexte: sansContexte.motif,
		avecContexte: apres.motif,
		orgIdAvant: r.orgId,
		orgIdApres: apres.orgId ?? null,
	});
}

const vivants = await query<{ id: number; org_hint: string }>(
	`SELECT id, org_hint FROM quarantine_raw
	 WHERE status='pending' AND promoted=false AND kind='claim'
	   AND org_hint IS NOT NULL AND org_hint <> ''`,
);
const fileVivante = vivants.rows.filter((r) => classifierIndice(r.org_hint) === "sigle");
const extraitsVivants: Record<string, unknown>[] = [];
for (const r of fileVivante) {
	const decision = await deciderSigleDepuisRegistre(sigleDeIndice(r.org_hint, "") ?? r.org_hint);
	extraitsVivants.push({ id: r.id, indice: r.org_hint, motif: decision.motif, orgId: decision.orgId ?? null });
}

const sortie = {
	date: new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date()),
	protocole:
		"lecture seule. File gelée 220 : chaque sigle tiré d'un rattachement à 0,7 est résolu par l'index des usuelles seules puis par le registre complet (toutes sources actives), sans puis avec contexte. File vivante : indices pending classés sigles par classifierIndice().",
	index,
	fileGelee: {
		volume: branchement.fluxReel.volume,
		rattachementsMoteur: file.length,
		sigles: detail.length,
		detail,
	},
	fileVivante: {
		volume: vivants.rows.length,
		siglesStrict: fileVivante.length,
		detail: extraitsVivants,
	},
};
writeFileSync(SORTIE, JSON.stringify(sortie, null, "\t") + "\n");
console.log(`Index : ${index.alias} alias, ${index.sigles} sigles distincts, ${index.ambigus} ambigus.`);
console.log(
	`File gelée : ${detail.length}/${file.length} rattachements portés par un sigle ; ` +
		`${detail.filter((d) => d.avecContexte === "confirme").length} confirmé(s) avec contexte.`,
);
console.log(`File vivante : ${fileVivante.length}/${vivants.rows.length} indices classés sigles.`);
console.log(`Résultat écrit : ${SORTIE}`);
await closePools();
