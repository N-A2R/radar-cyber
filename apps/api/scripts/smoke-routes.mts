/**
 * Contrôle d'unicité du registre de routes, sans `listen` ni requête base.
 *
 * Monte exactement les mêmes plugins que `apps/api/src/server.ts` (registre
 * `registerApiRoutes` + alias MISP racine) sur une instance Fastify jetable.
 * Chaque couple MÉTHODE + chemin doit apparaître une seule fois : un doublon
 * est signalé, et un doublon que Fastify refuse (`FST_ERR_DUPLICATED_ROUTE`)
 * fait également échouer le contrôle.
 *
 * Sortie 0 : registre unique. Sortie 1 : doublon ou enregistrement refusé.
 * Aucune sortie forcée de test : l'instance est fermée avant la sortie.
 */
import Fastify from "fastify";
import { registerApiRoutes } from "../src/routes/index.js";
import exportMispRoute from "../src/routes/export-misp.js";

const app = Fastify({ logger: false });
const occurrences = new Map<string, number>();

app.addHook("onRoute", (route) => {
	const methods = Array.isArray(route.method) ? route.method : [route.method];
	for (const method of methods) {
		const key = `${String(method).toUpperCase()} ${route.path}`;
		occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
	}
});

let registrationError: unknown = null;
try {
	await registerApiRoutes(app);
	await app.register(exportMispRoute);
	await app.ready();
} catch (err) {
	registrationError = err;
}

const duplicates = [...occurrences].filter(([, count]) => count > 1);

if (registrationError) {
	const detail = registrationError instanceof Error ? registrationError.message : String(registrationError);
	console.error(`FAIL registre de routes : enregistrement refusé — ${detail}`);
} else if (duplicates.length > 0) {
	for (const [key, count] of duplicates) {
		console.error(`FAIL route dupliquée : ${key} (${count} inscriptions)`);
	}
} else {
	console.log(`OK registre de routes : ${occurrences.size} couples MÉTHODE + chemin uniques, 0 doublon`);
}

await app.close().catch(() => {});
if (registrationError || duplicates.length > 0) process.exitCode = 1;
