/**
 * Task 4 — entités citées par les revendications qui n'ont aucune organisation
 * correspondante (docs/plans/mission-nuit-na.md).
 *
 * Liste = revendications `pending` avec org_hint, sur TOUTES les périodes,
 * dont l'indice ne rapproche aucune organisation (moteur de production, après
 * correctifs Task 3), restreintes au périmètre français : domaine `.fr`, ou
 * nom citant une commune de NA, ou nom à teneur française vérifiée à la main.
 *
 * Chaque entité de la liste devient un lot de résolution (sources gratuites,
 * preuve citée : requête lancée + texte reçu). Une entité non résolue reste
 * dans le JSON avec sa raison — une source muette se documente.
 *
 *   DATABASE_URL=... tsx scripts/entites-sans-org-na.mts --json=bench/results/na-entites-sans-org.json
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
	loadCandidateIndex,
	matchOrgInIndex,
	normalizeName,
	type OrgIndexEntry,
} from "../apps/api/src/quarantine/promote.js";

const argv = process.argv.slice(2);
const SORTIE_JSON =
	argv.find((a) => a.startsWith("--json="))?.split("=")[1] ?? "bench/results/na-entites-sans-org.json";

const DEPTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];
const DANS_NA = DEPTS.map((d) => `'${d}'`).join(",");

const REQUETES = {
	hints: `SELECT id, source, groupe, org_hint, claimed_at, received_at FROM quarantine_raw WHERE kind='claim' AND status='pending' AND org_hint IS NOT NULL AND org_hint <> '' ORDER BY id`,
	villes: `SELECT DISTINCT city FROM org WHERE dept IN (${DANS_NA}) AND city IS NOT NULL`,
};

/** Commune de NA citée par jeton entier (fenêtre glissante, cf. mesure Task 3). */
function citeVilleNA(hintNorm: string, villes: Set<string>): string | null {
	const tokens = hintNorm.split(" ").filter(Boolean);
	for (let i = 0; i < tokens.length; i++) {
		for (let l = 1; l <= 4 && i + l <= tokens.length; l++) {
			const phrase = tokens.slice(i, i + l).join(" ");
			if (villes.has(phrase)) return phrase;
		}
	}
	return null;
}

async function main(): Promise<void> {
	const dateMesure = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());

	const { rows: villesRows } = await query<{ city: string }>(REQUETES.villes);
	const villes = new Set(
		villesRows.map((v) => normalizeName(v.city)).filter((v) => v.length >= 5 && !v.includes(" ")),
	);

	const { rows: claims } = await query<{
		id: number;
		source: string;
		groupe: string | null;
		org_hint: string;
		claimed_at: string | null;
		received_at: string;
	}>(REQUETES.hints);

	const sansOrg: {
		id: number;
		source: string;
		groupe: string | null;
		orgHint: string;
		claimedAt: string | null;
		signalNa: string;
	}[] = [];
	let matches = 0;

	for (const c of claims) {
		const idx = await loadCandidateIndex(c.org_hint);
		const m = matchOrgInIndex(c.org_hint, idx);
		if (m) {
			matches++;
			continue;
		}
		const hintNorm = normalizeName(c.org_hint);
		const estFr = /\.fr$/i.test(c.org_hint.trim()) || /\.fr\b/i.test(c.org_hint);
		const ville = citeVilleNA(hintNorm, villes);
		if (estFr) {
			sansOrg.push({
				id: c.id,
				source: c.source,
				groupe: c.groupe,
				orgHint: c.org_hint,
				claimedAt: c.claimed_at,
				signalNa: "domaine .fr",
			});
		} else if (ville) {
			sansOrg.push({
				id: c.id,
				source: c.source,
				groupe: c.groupe,
				orgHint: c.org_hint,
				claimedAt: c.claimed_at,
				signalNa: `commune : ${ville}`,
			});
		}
	}

	const resultat = {
		dateMesure,
		plan: "docs/plans/mission-nuit-na.md — Task 4",
		commande: "DATABASE_URL=postgres://radar:radar@localhost:5433/radar tsx scripts/entites-sans-org-na.mts",
		requetes: REQUETES,
		revendications: {
			pendingAvecHint: claims.length,
			rapprochees: matches,
			sansOrgNa: sansOrg.length,
		},
		entites: sansOrg,
	};

	console.log(`Entités citées sans organisation — ${dateMesure}`);
	console.log(`${claims.length} indices en attente · ${matches} rapprochés · ${sansOrg.length} sans organisation (périmètre français)`);
	for (const e of sansOrg) console.log(`  ${e.id} ${e.orgHint.padEnd(40)} ${e.signalNa} (${e.groupe ?? "groupe ?"})`);

	writeFileSync(SORTIE_JSON, `${JSON.stringify(resultat, null, 2)}\n`, "utf8");
	console.log(`\nliste publiée : ${SORTIE_JSON}`);
	await closePools();
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
