/**
 * Lance le cycle de veille quotidien complet et imprime son résumé daté.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
 *     apps/api/node_modules/.bin/tsx scripts/veille-quotidienne.mts
 *
 * Le fichier `out/veille-quotidienne-AAAA-MM-JJ.json` est la preuve du passage :
 * il contient les compteurs lus en base et la durée mesurée du cycle.
 */
process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5432/radar";

const { executerVeilleQuotidienne } = await import("../apps/api/src/veille/quotidienne.js");
const { closePools } = await import("../apps/api/src/db.js");

try {
	const resume = await executerVeilleQuotidienne({ log: (message) => console.log(message) });
	console.log(`résumé : ${resume.rapport ?? "(non écrit)"}`);
} catch (erreur: unknown) {
	console.error(erreur);
	process.exitCode = 1;
} finally {
	await closePools();
}
