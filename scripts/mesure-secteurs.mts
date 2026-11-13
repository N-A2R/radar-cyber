import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import { admitEvent } from "../apps/api/src/contract/admit.js";
import { getGazetteer } from "../apps/api/src/collectors/org-gazetteer.js";
import { resoudre } from "../apps/api/src/match/gazetteer.js";
import { mesurerSecteurs } from "../apps/api/src/analyse/secteur.js";

const CORPUS = fileURLToPath(new URL("../bench/fixtures/corpus-reference-na.json", import.meta.url));
const FENETRE = { debut: "2025-11-01", fin: "2026-10-31" };

type Incident = { id: string; entite: string; entiteType: string; datePublique: string; resume: string; type: string; preuve?: { url?: string } };

function familleDe(type: string): string {
	switch (type) {
		case "ransomware": return "ransomware";
		case "fuite": return "leaks";
		case "phishing": return "phishing";
		case "ddos": return "cti";
		case "compromission":
		case "defacement": return "cti";
		default: return "presse_cyber";
	}
}

function hashKey(value: string): string {
	let h = 0;
	for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
	return h.toString(36);
}

async function main(): Promise<void> {
	const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as { incidents: Incident[] };
	const gaz = await getGazetteer();
	let total = corpus.incidents.length;
	let horsFenetre = 0;
	let horsSecteur = 0;
	const facts: { secteur: string; vu: boolean; correct: boolean }[] = [];
	for (const incident of corpus.incidents) {
		if (incident.datePublique < FENETRE.debut || incident.datePublique > FENETRE.fin) { horsFenetre++; continue; }
		const evt = {
			dedupKey: `feed:mesure-secteurs:${hashKey(incident.preuve?.url ?? incident.id)}`,
			family: familleDe(incident.type),
			assertionType: "third_party_claim",
			title: `${incident.entite} — ${incident.type}`,
			summary: incident.resume,
			severity: 3,
			confidence: "C3",
			sourceId: "mesure-corpus",
			sourceUrl: incident.preuve?.url ?? null,
			observedAt: incident.datePublique,
		};
		const admission = admitEvent(evt as unknown as Record<string, unknown>);
		const texte = `${incident.entite} ${incident.resume}`;
		const match = resoudre(gaz, texte);
		const secteur = ["collectivite", "sante", "enseignement", "entreprise"].includes(incident.entiteType)
			? incident.entiteType
			: null;
		if (!secteur) { horsSecteur++; continue; }
		if (!admission.ok) continue;
		const vu = !!match.org;
		const correct = vu && match.org!.kind === secteur;
		facts.push({ secteur, vu, correct });
	}
	const stats = mesurerSecteurs(facts as never);
	console.log("| Secteur | Faits | Vus | Rappel | Précision |");
	console.log("|---|---|---|---|---|");
	for (const s of stats) {
		const rappel = s.reserve ? `réserve (${s.faits})` : `${Math.round((s.rappel ?? 0) * 100)} %`;
		const prec = s.reserve ? `réserve (${s.faits})` : (s.precision === null ? "—" : `${Math.round(s.precision * 100)} %`);
		console.log(`| ${s.secteur} | ${s.faits} | ${s.vus} | ${rappel} | ${prec} |`);
	}
	console.log("");
	console.log(`Corpus total : ${total} incidents`);
	console.log(`Hors fenêtre : ${horsFenetre}`);
	console.log(`Hors secteur (entiteType: "autre") : ${horsSecteur}`);
	console.log(`Mesurés : ${total - horsFenetre} ; répartis en secteurs : ${facts.length}`);
	console.log(`Note : "autre" n'a pas de taux — pas de rattachement par secteur d'activité pour ces incidents.`);
	await closePools();
}

main().catch((e) => { console.error(e); process.exit(1); });
