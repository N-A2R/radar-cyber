/**
 * Mesure des manques résiduels du référentiel entreprises.
 */
import { readFile } from "node:fs/promises";
import { closePools, query } from "../apps/api/src/db.js";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const INPUT = `${ROOT}bench/results/exa-2026-11-13/exa-manques-final.json`;
const SOURCE = "exa-manques";

type Entite = {
	nomLisible: string;
	est_francaise: string;
	raison: string;
	domaine_canonique?: string | null;
	denomination_legale?: string | null;
	siren?: string | null;
	ville?: string | null;
	departement?: string | null;
	region?: string | null;
	type_organisation?: string | null;
	confiance?: string | null;
	desaccord?: boolean;
};

function cleanDomain(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const value = raw.trim().toLowerCase();
	if (!value) return null;
	const stripped = value
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.split(/[/?#]/)[0];
	return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(stripped) ? stripped : null;
}

function voie(e: Entite): string {
	if (e.desaccord) return "arbitrage humain (désaccord Exa)";
	if (e.est_francaise !== "present") return "hors zone / non française";
	if (!/^\d{9}$/.test(e.siren ?? "")) return "SIREN à demander";
	const domain = cleanDomain(e.domaine_canonique);
	return domain ? "site à rattacher (domaine connu)" : "SIREN présent, domaine inconnu";
}

async function main(): Promise<void> {
	const raw = JSON.parse(await readFile(INPUT, "utf8")) as { entites: Entite[] };
	const entites = raw.entites;

	const loaded = await query<{ entity_code: string }>(
		"SELECT entity_code FROM org WHERE entity_source = $1 AND entity_code IS NOT NULL",
		[SOURCE],
	);
	const loadedSet = new Set(loaded.rows.map((r) => r.entity_code));

	const absents = entites.filter((e) => !e.siren || !loadedSet.has(e.siren));

	const groups = new Map<string, Entite[]>();
	for (const e of absents) {
		const key = e.departement?.trim() || "(département inconnu)";
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)!.push(e);
	}
	const keys = [...groups.keys()].sort((a, b) => {
		if (a.startsWith("(") && !b.startsWith("(")) return 1;
		if (!a.startsWith("(") && b.startsWith("(")) return -1;
		return a.localeCompare(b, "fr");
	});

	console.log(`Liste de courses — entités encore absentes : ${absents.length} / ${entites.length}`);
	console.log(`Chargées (présentes dans org) : ${entites.length - absents.length}`);
	console.log("");

	console.log("Répartition par département :");
	for (const k of keys) {
		console.log(`  ${k} : ${groups.get(k)!.length}`);
	}
	console.log("");

	for (const k of keys) {
		console.log(`=== ${k} (${groups.get(k)!.length}) ===`);
		for (const e of groups.get(k)!.sort((a, b) => a.nomLisible.localeCompare(b.nomLisible, "fr"))) {
			const label = (e.denomination_legale ?? e.nomLisible).trim();
			const siren = e.siren && /^\d{9}$/.test(e.siren) ? e.siren : "—";
			const dom = cleanDomain(e.domaine_canonique) ?? "—";
			console.log(`  - ${label} | SIREN ${siren} | domaine ${dom} | ${voie(e)}`);
		}
	}
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => closePools());
