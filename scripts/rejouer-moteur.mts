/**
 * Rejeu avec un autre moteur — chantier 3.
 *
 * Le journal fait autorité ; la projection (`event.org_id`) n'est qu'une vue.
 * Ce script rejoue une période avec le moteur demandé et compare : qu'aurait
 * décidé gazetteer@1 là où le moteur courant a tranché ? C'est la mesure de la
 * correction apportée par un changement de moteur — pas une phrase marketing,
 * un tableau.
 *
 *   tsx scripts/rejouer-moteur.mts --moteur=gazetteer@1 --depuis=2025-10-01 --jusqua=2025-11-01
 *   tsx scripts/rejouer-moteur.mts --comparer   # compare les deux moteurs sur 30 derniers jours d'événements
 */

import { closePools, query } from "../apps/api/src/db.js";
import { buildGazetteer } from "../apps/api/src/match/gazetteer.js";
import { resoudreAvecVersion, MOTEUR_RATTACHEMENT, DEPLOIEMENTS, moteurActifA, type MoteurId } from "../apps/api/src/match/versions.js";

const argv = process.argv.slice(2);
const MOTEUR = (argv.find((a) => a.startsWith("--moteur="))?.split("=")[1] as MoteurId | undefined) ?? "gazetteer@1";
const DEPUIS = argv.find((a) => a.startsWith("--depuis="))?.split("=")[1] ?? null;
const JUSQUA = argv.find((a) => a.startsWith("--jusqua="))?.split("=")[1] ?? null;
const COMPARER = argv.includes("--comparer");

async function chargerGazetteer() {
	const rows = await query<{ org_id: number; name: string; kind: string; dept: string | null; city: string | null; sector: string | null; alias: string }>(
		`SELECT a.org_id, o.name, o.kind, o.dept, o.city, o.sector, a.alias
		 FROM org_alias a JOIN org o ON o.id=a.org_id
		 WHERE a.status='active' AND o.valid_to IS NULL`,
	);
	return buildGazetteer(rows.rows);
}

async function main() {
	console.log(`Moteur demandé : ${MOTEUR} (${DEPLOIEMENTS[MOTEUR] ?? "date inconnue"})`);
	console.log(`Actif le 2025-10-14 : ${moteurActifA("2025-10-14", "gazetteer")} — le 2025-11-01 : ${moteurActifA("2025-11-01", "gazetteer")}`);

	const gaz = await chargerGazetteer();
	console.log(`Gazetteer : ${gaz.byAliasKey.size} alias indexés, ${gaz.orgsById.size} organisations`);

	// Événements de la période demandée
	const conditions: string[] = [];
	const vals: unknown[] = [];
	if (DEPUIS) { vals.push(DEPUIS); conditions.push(`e.observed_at >= $${vals.length}::timestamptz`); }
	if (JUSQUA) { vals.push(JUSQUA); conditions.push(`e.observed_at < $${vals.length}::timestamptz`); }
	if (!DEPUIS && !JUSQUA && COMPARER) {
		vals.push(new Date(Date.now() - 30 * 86400000).toISOString());
		conditions.push(`e.created_at >= $${vals.length}::timestamptz`);
	}
	const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
	const r = await query<{ id: string; title: string; org_id: number | null }>(
		`SELECT e.id::text AS id, e.title, e.org_id FROM event e ${where} ORDER BY e.observed_at DESC NULLS LAST LIMIT 500`,
		vals,
	);
	console.log(`${r.rows.length} événements dans la période`);

	let divergences = 0;
	let pareils = 0;
	let nouveauTrouve = 0;
	let ancienPerdu = 0;

	for (const ev of r.rows) {
		const actuel = gaz ? resoudreAvecVersion(gaz, ev.title, MOTEUR_RATTACHEMENT) : null;
		const ancien = gaz ? resoudreAvecVersion(gaz, ev.title, MOTEUR) : null;
		const actuelId = actuel?.org?.id ?? null;
		const ancienId = ancien?.org?.id ?? null;
		if (actuelId !== ancienId) {
			divergences++;
			if (actuelId !== null && ancienId === null) nouveauTrouve++;
			if (actuelId === null && ancienId !== null) ancienPerdu++;
			if (COMPARER && divergences <= 20) {
				console.log(`  ${ev.id} "${ev.title.slice(0, 60)}" : ${MOTEUR}=${ancienId ?? "null"}(${ancien?.reason ?? "?"}) → ${MOTEUR_RATTACHEMENT}=${actuelId ?? "null"}(${actuel?.reason ?? "?"}) | projection=${ev.org_id ?? "null"}`);
			}
		} else pareils++;
	}

	console.log(`\nComparaison ${MOTEUR} vs ${MOTEUR_RATTACHEMENT} : ${pareils} identiques, ${divergences} divergents (dont ${nouveauTrouve} nouveaux rattachements, ${ancienPerdu} perdus) sur ${r.rows.length} événements`);

	if (!COMPARER) {
		console.log(`\nRelancer avec --comparer pour voir les 20 premiers écarts, ou --depuis/--jusqua pour cadrer la période.`);
	}
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { await closePools().catch(() => {}); });
