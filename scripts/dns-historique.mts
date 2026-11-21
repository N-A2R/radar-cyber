#!/usr/bin/env -S npx tsx
/**
 * Relevé de l'historique DNS des domaines du référentiel de Nouvelle-Aquitaine.
 *
 * Usage :
 *   tsx scripts/dns-historique.mts                       # rapport, aucune écriture
 *   tsx scripts/dns-historique.mts --appliquer           # relevé réel et écritures
 *   tsx scripts/dns-historique.mts --appliquer --limite=60 --concurrence=5
 *
 * Sources : DNS over HTTPS (Cloudflare, sans clé) et RDAP public (rdap.org).
 * Aucun service payant, aucune donnée personnelle : seulement des suffixes
 * d'hôtes publics et des noms d'organisations déjà dans le référentiel.
 *
 * Le mode rapport est le défaut, comme pour les autres scripts du dépôt :
 * `--appliquer` est la seule porte d'écriture. La cadence (quotidienne) est
 * laissée à l'ordonnanceur ; ce script ne planifie rien lui-même.
 */

import { closePools } from "../apps/api/src/db.js";
import { createDefaultFetcher } from "../apps/api/src/dns/historique.js";
import { effectuerReleve } from "../apps/api/src/dns/releve.js";
import { changementsRecents, listerDomaines, statistiques } from "../apps/api/src/dns/store.js";

const args = process.argv.slice(2);
const appliquer = args.includes("--appliquer");
const valeur = (nom: string): number | undefined => {
	const trouvé = args.find((a) => a.startsWith(`--${nom}=`));
	if (!trouvé) return undefined;
	const n = Number(trouvé.slice(nom.length + 3));
	return Number.isInteger(n) && n > 0 ? n : undefined;
};

async function main(): Promise<void> {
	if (!appliquer) {
		const stats = await statistiques();
		const domaines = await listerDomaines(true);
		console.log("Historique DNS — rapport:");
		console.log(`  domaines suivis      : ${stats.domaines}`);
		console.log(`  domaines mesurés     : ${stats.domainesMesures}`);
		console.log(`  observations         : ${stats.snapshots}`);
		console.log(`  changements          : ${stats.changements}`);
		console.log(`  périmètre (actifs)   : ${domaines.length}`);
		const changes = await changementsRecents(5);
		if (changes.length === 0) {
			console.log("  aucun changement enregistré (lancer avec --appliquer pour un relevé).");
		} else {
			console.log("  5 changements les plus significatifs :");
			for (const c of changes) {
				console.log(`    [${c.severity}] ${c.domain} — ${c.summary}`);
			}
		}
		return;
	}

	const rapport = await effectuerReleve({
		fetcher: createDefaultFetcher(),
		limite: valeur("limite"),
		concurrence: valeur("concurrence") ?? 5,
	});
	const stats = await statistiques();
	console.log("Historique DNS — relevé appliqué:");
	console.log(`  domaines interrogés  : ${rapport.domaines}`);
	console.log(`  observations écrites : ${rapport.snapshots}`);
	console.log(`  changements détectés : ${rapport.changements}`);
	console.log(`  erreurs partielles   : ${rapport.erreurs.length}`);
	console.log(`  domaines suivis      : ${stats.domaines}`);
	console.log(`  observations au total: ${stats.snapshots}`);
	const changes = await changementsRecents(5);
	for (const c of changes) console.log(`    [${c.severity}] ${c.domain} — ${c.summary}`);
	if (rapport.erreurs.length > 0) {
		for (const e of rapport.erreurs.slice(0, 10)) console.log(`  ! ${e}`);
	}
}

try {
	await main();
} finally {
	await closePools();
}
