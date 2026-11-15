/**
 * Mesure du taux de fausses alertes des agents de rupture — chantier 10.
 *
 * La question : quand les trois agents tirent une alerte, combien de fois
 * n'y a-t-il rien derrière ? Les seuils des détecteurs sont marqués « non
 * mesuré, à calibrer » depuis leur écriture ; ce script est l'instrument de
 * ce calibrage, et la publication exige qu'il soit honnête même quand le
 * taux est mauvais.
 *
 * Méthode — rejeu historique :
 *   1. Vérité terrain : le corpus de référence (60 incidents publics vérifiés,
 *      `bench/fixtures/corpus-reference-na.json`). Chaque incident y porte une
 *      entité désignable et une date publique. Le moteur de rattachement réel
 *      (`designateOrganization`) résout l'entité en organisation : ce sont les
 *      seules alertes qu'on peut déclarer vraies.
 *   2. Rejeu : les agents tournent sur la base à des instants répartis tous les
 *      14 jours sur la fenêtre mesurée. `detecterRupturesDepuisBase(instant)`
 *      regarde vraiment la semaine de cet instant (le paramètre atteint le
 *      SQL depuis le chantier 10) — c'est un rejeu, pas une simulation du
 *      moteur : mêmes requêtes, mêmes seuils.
 *   3. Classement d'une alerte : vraie si son organisation est un incident du
 *      corpus dont la date publique tombe dans sa fenêtre de veille (35 j,
 *      couvre les 30 j de nouveauté comme les 7 j de rafale) ; fausse sinon,
 *      avec un motif : `bruit_bulletins` quand tous ses faits sont des
 *      bulletins de vulnérabilité (un CVE n'est pas un incident), sinon
 *      `aucun_incident_corpus` (rien de réel derrière).
 *   4. Déduplication : une situation qui dure est vue par plusieurs rejeux ;
 *      elle compte une fois (même agent, même organisation, faits qui se
 *      recoupent).
 *
 *   tsx scripts/mesure-fausses-alertes.mts
 *   tsx scripts/mesure-fausses-alertes.mts --json=bench/results/fausses-alertes.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { detecterRupturesDepuisBase } from "../apps/api/src/analyse/rupture.js";
import { getGazetteer } from "../apps/api/src/collectors/org-gazetteer.js";
import { preparerGazetteer, designateOrganization } from "../apps/api/src/collectors/relevance.js";

const argv = process.argv.slice(2);
const SORTIE_JSON = argv.find((a) => a.startsWith("--json="))?.split("=")[1] ?? null;
const CORPUS = fileURLToPath(new URL("../bench/fixtures/corpus-reference-na.json", import.meta.url));
const FENETRE = { debut: "2025-11-01", fin: "2026-10-31" };

/** Fenêtre de veille déclarée vraie : couvre les 30 j du détecteur de
 * nouveauté comme les 7 j de la rafale. */
const TOLERANCE_JOURS = 35;
/** Pas du rejeu : deux semaines, la granularité d'une revue élargie. */
const PAS_REJEU_JOURS = 14;

const JOUR_MS = 86_400_000;

async function main(): Promise<void> {
	const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as {
		incidents: Array<{
			id: string;
			entite: string;
			resume: string;
			datePublique: string;
			entiteType: string;
		}>;
	};

	await getGazetteer();
	await preparerGazetteer();


	// Vérité terrain : organisation → dates publiques des incidents du corpus.
	const veriteTerrain = new Map<number, number[]>();
	let resolutionRatee = 0;
	for (const incident of corpus.incidents) {
		const date = Date.parse(`${incident.datePublique}T00:00:00Z`);
		if (
			date < Date.parse(`${FENETRE.debut}T00:00:00Z`) ||
			date > Date.parse(`${FENETRE.fin}T23:59:59Z`)
		) {
			continue;
		}
		const match = designateOrganization(`${incident.entite} ${incident.resume}`);
		if (!match || match.orgId === null) {
			resolutionRatee++;
			continue;
		}
		const dates = veriteTerrain.get(match.orgId) ?? [];
		dates.push(date);
		veriteTerrain.set(match.orgId, dates);
	}

	// Familles des faits cités par les alertes : pour séparer le bruit de
	// bulletins (CVE) d'un événement sans incident derrière.
	const familleDesFaits = async (ids: number[]): Promise<string[]> => {
		if (ids.length === 0) return [];
		const { rows } = await query<{ family: string }>(
			"SELECT family FROM event WHERE id = ANY($1)",
			[ids],
		);
		return rows.map((r) => r.family);
	};

	const dejavu = new Set<string>();
	const faitsDejaVus = new Map<string, Set<number>>();
	type AlerteClassee = {
		agent: string;
		orgId: number;
		instant: string;
		motif: string;
		classement: "vraie" | "fausse";
		raison: string | null;
		faits: number[];
	};
	const classees: AlerteClassee[] = [];

	const debut = Date.parse(`${FENETRE.debut}T00:00:00Z`);
	const fin = Date.parse(`${FENETRE.fin}T23:59:59Z`);
	const instants: number[] = [];
	for (let t = debut; t <= fin; t += PAS_REJEU_JOURS * JOUR_MS) instants.push(t);

	let rejeux = 0;
	for (const t of instants) {
		const alertes = await detecterRupturesDepuisBase(t);
		rejeux++;
		for (const a of alertes) {
			const ids = a.faits.map(Number);
			// Déduplication : une situation qui dure recoupe ses faits d'un
			// rejeu à l'autre — elle ne compte qu'une fois.
			const cle = `${a.agent}:${a.orgId}:${[...ids].sort((x, y) => x - y).join(",")}`;
			const vus = faitsDejaVus.get(`${a.agent}:${a.orgId}`);
			if (dejavu.has(cle) || (vus && ids.some((id) => vus.has(id)))) continue;
			dejavu.add(cle);
			faitsDejaVus.set(`${a.agent}:${a.orgId}`, new Set([...(vus ?? []), ...ids]));

			const dates = veriteTerrain.get(a.orgId) ?? [];
			const proches = dates.filter((d) => Math.abs(t - d) <= TOLERANCE_JOURS * JOUR_MS);
			const familles = await familleDesFaits(ids);
			const vraie = proches.length > 0;
			classees.push({
				agent: a.agent,
				orgId: a.orgId,
				instant: new Date(t).toISOString().slice(0, 10),
				motif: a.motif,
				classement: vraie ? "vraie" : "fausse",
				raison: vraie
					? null
					: familles.length > 0 && familles.every((f) => f === "vuln")
						? "bruit_bulletins"
						: "aucun_incident_corpus",
				faits: ids,
			});
		}
	}

	const parAgent = new Map<string, { emises: number; vraies: number; fausses: number; raisons: Record<string, number> }>();
	for (const c of classees) {
		const s = parAgent.get(c.agent) ?? { emises: 0, vraies: 0, fausses: 0, raisons: {} };
		s.emises++;
		if (c.classement === "vraie") s.vraies++;
		else {
			s.fausses++;
			s.raisons[c.raison ?? "?"] = (s.raisons[c.raison ?? "?"] ?? 0) + 1;
		}
		parAgent.set(c.agent, s);
	}

	const total = classees.length;
	const vraies = classees.filter((c) => c.classement === "vraie").length;
	const taux = total === 0 ? null : Math.round(((total - vraies) / total) * 1000) / 10;

	console.log(`Mesure du taux de fausses alertes — agents de rupture (chantier 10)`);
	console.log(`Fenêtre ${FENETRE.debut} → ${FENETRE.fin} · rejeu tous les ${PAS_REJEU_JOURS} j (${rejeux} instants)`);
	console.log(`Vérité terrain : ${veriteTerrain.size} organisation(s) du corpus résolues, ${resolutionRatee} incident(s) non résolus\n`);

	for (const [agent, s] of parAgent) {
		const tauxAgent = s.emises === 0 ? "—" : `${Math.round((s.fausses / s.emises) * 1000) / 10} %`;
		console.log(`  ${agent.padEnd(22)} émises ${String(s.emises).padStart(4)} · vraies ${String(s.vraies).padStart(3)} · fausses ${String(s.fausses).padStart(3)} · taux de fausses alertes ${tauxAgent}`);
		for (const [raison, n] of Object.entries(s.raisons)) {
			console.log(`    ${raison.padEnd(24)} ${n}`);
		}
	}
	if (total === 0) {
		console.log("\nAucune alerte émise sur la fenêtre : rien à mesurer, et c'est une information (les seuils en place ne tirent pas sur cette base).");
	} else {
		console.log(`\nTotal : ${total} alerte(s) dédupliquée(s), ${vraies} vraie(s), taux de fausses alertes ${taux} %`);
		const exemples = classees.filter((c) => c.classement === "fausse").slice(0, 12);
		for (const e of exemples) {
			console.log(`  FAUSSE [${e.agent}] ${e.instant} org ${e.orgId} (${e.raison}) — ${e.motif}`);
		}
	}

	if (SORTIE_JSON) {
		writeFileSync(
			SORTIE_JSON,
			`${JSON.stringify({
				dateMesure: new Date().toISOString().slice(0, 10),
				fenetre: FENETRE,
				rejeux,
				pasJours: PAS_REJEU_JOURS,
				toleranceJours: TOLERANCE_JOURS,
				veriteTerrain: { organisations: veriteTerrain.size, incidentsNonResolus: resolutionRatee },
				total: { emises: total, vraies, fausses: total - vraies, tauxFaussesAlertes: taux },
				parAgent: Object.fromEntries(parAgent),
				alertes: classees,
			}, null, 2)}\n`,
			"utf8",
		);
		console.log(`\nmesure publiée : ${SORTIE_JSON}`);
	}

	await closePools();
}

await main();
