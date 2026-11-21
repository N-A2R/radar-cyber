/**
 * Mesure d'un cycle complet de collecte : mémoire du processus avant/après et
 * nombre de sources réellement collectées.
 *
 * Le script crée sa propre base de test (jamais la base de production), y
 * déclare des sources locales et exécute LE moteur réel `runGenericSources`
 * avec un `fetchTexte` injecté : aucun réseau, mais le gazetteer, le contrat,
 * le journal, la santé des sources et le point de reprise sont les vrais.
 *
 *   apps/api/node_modules/.bin/tsx scripts/mesure-cycle-collecte.mts --sources=12
 */
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";

const args = process.argv.slice(2);
const argTexte = (nom: string): string | undefined => args.find((a) => a.startsWith(`--${nom}=`))?.split("=")[1];
const NOMBRE = Number(argTexte("sources") ?? 12);
const JSON_PATH = argTexte("json");

const db = await createTestDatabase();
// Les modules de l'API lisent DATABASE_URL à l'import : on positionne l'env
// AVANT le premier import dynamique, sinon la mesure écrirait dans la prod.
process.env.DATABASE_URL = db.url;

const { query, closePools } = await import("../apps/api/src/db.js");
const { runGenericSources } = await import("../apps/api/src/collectors/generic.js");
const { cycleCourant, formatRapportCycle, mesurerCycle } = await import("../apps/api/src/collectors/cycle.js");

const ids = Array.from({ length: NOMBRE }, (_, i) => `mesure-cycle-${String(i).padStart(3, "0")}`);
const sains = ids.filter((_, i) => i % 6 !== 4 && i % 6 !== 5);
const vides = ids.filter((_, i) => i % 6 === 4);
const enEchec = ids.filter((_, i) => i % 6 === 5);

function flux(sourceId: string): string {
	return `<?xml version="1.0"?><rss version="2.0"><channel><title>Flux ${sourceId}</title>` +
		`<item><title>Cyberattaque ransomware chez un établissement de Gironde</title>` +
		`<link>https://exemple.test/${sourceId}</link>` +
		`<description>Rançongiciel : système compromis, données exfiltrées.</description>` +
		`<pubDate>Thu, 20 Nov 2026 08:00:00 GMT</pubDate></item></channel></rss>`;
}

async function fetchTexte(_url: string, sourceId: string): Promise<string> {
	if (enEchec.includes(sourceId)) throw new Error("HTTP 500 — panne simulée");
	if (vides.includes(sourceId)) return "";
	return flux(sourceId);
}

async function main(): Promise<void> {
	for (const [i, id] of ids.entries()) {
		await query(
			`INSERT INTO source (id, name, family, url, kind, format, parser, interval_sec)
			 VALUES ($1, $2, 'cti', $3, 'narrative', 'rss', '{}'::jsonb, 0)`,
			[id, `Source mesure ${i}`, `http://cycle.local/${id}`],
		);
	}
	console.log(`${ids.length} source(s) : ${sains.length} saine(s), ${vides.length} vide(s), ${enEchec.length} en erreur`);

	const avant = process.memoryUsage();
	const journal: string[] = [];
	await runGenericSources((m) => journal.push(m), { sourceIds: ids, fetchTexte });
	const apres = process.memoryUsage();
	const cycle = await cycleCourant();
	const mesure = mesurerCycle(avant, apres, cycle);
	console.log(formatRapportCycle(mesure));
	for (const ligne of journal.filter((m) => /cycle|santé|ingestion générique|cycle vide/.test(m))) {
		console.log(`  journal : ${ligne}`);
	}

	// Un second cycle prouve que le backoff est persistant : les sources en
	// erreur ne sont pas retentées immédiatement.
	await runGenericSources(() => undefined, { sourceIds: ids, fetchTexte });
	const apresSecond = await cycleCourant();
	console.log(`second cycle : ${apresSecond?.sources_collectees ?? 0} collectée(s), ${apresSecond?.sources_en_echec ?? 0} en échec, ` +
		`${apresSecond?.en_attente.length ?? 0} source(s) en attente`);

	const sante = await query<{ id: string; sante: string; echecs_consecutifs: number }>(
		"SELECT id, sante, echecs_consecutifs FROM source WHERE id = ANY($1) ORDER BY id", [ids],
	);
	const rouges = sante.rows.filter((s) => s.sante === "rouge").length;
	const ok = sante.rows.filter((s) => s.sante === "ok").length;
	console.log(`santé finale : ${ok} ok, ${rouges} rouge(s), ${sante.rows.filter((s) => s.sante === "morte").length} morte(s)`);

	if (JSON_PATH) {
		const { writeFile } = await import("node:fs/promises");
		await writeFile(JSON_PATH, `${JSON.stringify({ ...mesure, santeOk: ok, santeRouge: rouges }, null, 2)}\n`);
		console.log(`mesure écrite : ${JSON_PATH}`);
	}
}

try {
	await main();
} finally {
	await closePools().catch(() => undefined);
	await dropTestDatabase(db).catch(() => undefined);
}
