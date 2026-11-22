#!/usr/bin/env -S npx tsx
/**
 * Détection rétrospective des changements DNS depuis l'historique persisté.
 *
 * Usage :
 *   tsx scripts/dns-detection.mts                 # rapport seul, aucune écriture
 *   tsx scripts/dns-detection.mts --appliquer     # écrit les signaux dans dns_change
 *   tsx scripts/dns-detection.mts --appliquer --domaine=exemple.fr
 *
 * Chaque paire consécutive de `dns_snapshot` est comparée : quatre relevés
 * donnent trois comparaisons. C'est le complément du relevé en direct
 * (`scripts/dns-historique.mts --appliquer`), utile pour exploiter un
 * historique déjà collecté sans réinterroger le réseau. L'écriture est
 * idempotente : rejouer ne duplique aucun signal.
 */

import { closePools } from "../apps/api/src/db.js";
import { detecterChangementsConsecutifs } from "../apps/api/src/dns/changements.js";

const args = process.argv.slice(2);
const appliquer = args.includes("--appliquer");
const domaine = args.find((a) => a.startsWith("--domaine="))?.slice("--domaine=".length);

async function main(): Promise<void> {
	const rapport = await detecterChangementsConsecutifs({
		domaines: domaine ? [domaine] : undefined,
		ecrire: appliquer,
	});
	console.log(`Détection DNS — ${appliquer ? "appliquée" : "rapport seul"} :`);
	console.log(`  domaines comparés    : ${rapport.domaines}`);
	console.log(`  paires de snapshots  : ${rapport.paires}`);
	console.log(`  changements détectés : ${rapport.changements}`);
	console.log(`  signaux écrits       : ${rapport.ecrits}`);
	if (!appliquer && rapport.changements > 0) {
		console.log("  (relancer avec --appliquer pour enregistrer ces signaux)");
	}
}

try {
	await main();
} finally {
	await closePools();
}
