/**
 * Mesure bornée d'un cycle de collecte complet côté mémoire.
 *
 * Le cycle exécute les sept collecteurs dédiés du registre (planification,
 * santé, backoff, isolement des erreurs) puis charge une fois le gazetteer,
 * exactement comme le fait le moteur générique pendant un cycle réel. Aucun
 * appel réseau n'est fait : on mesure la borne mémoire du processus, pas la
 * disponibilité des flux distants.
 *
 * Lancer avec `NODE_OPTIONS="--max-old-space-size=4096 --expose-gc"` pour que
 * les deux relevés soient faits après GC. Quatre cibles sont affichées : tas
 * < 500 Mo, plan < 10 s, backoff 1 min → 6 h et zéro source jamais collectée
 * après le cycle sur les 312 sources de la base 5433.
 */
import { DELAIS_BACKOFF_MS, executerPlan, mesurerMemoireMo, planifierCycle, sourcesJamaisCollectees } from "../apps/api/src/collectors/index.js";
import { closePools, query } from "../apps/api/src/db.js";
import { getGazetteer, resetGazetteer } from "../apps/api/src/collectors/org-gazetteer.js";

const memoire = () => {
	// `gc` n'existe qu'avec --expose-gc ; le typage Node ne le déclare pas.
	const globalAvecGc: { gc?: () => void } = globalThis;
	globalAvecGc.gc?.();
	const m = process.memoryUsage();
	return {
		rssMo: Math.round(m.rss / 1048576),
		tasMo: Math.round(m.heapUsed / 1048576),
	};
};
const heuresOuMinutes = (ms: number) => ms >= 3_600_000 ? `${ms / 3_600_000} h` : `${ms / 60_000} min`;

const avant = memoire();
const { rows: totaux } = await query<{ sources: string; actives: string }>(
	"SELECT count(*)::text AS sources, count(*) FILTER (WHERE enabled AND statut <> 'morte')::text AS actives FROM source",
);
const jamaisAvant = (await sourcesJamaisCollectees(1000)).length;
console.log(`base 5433       : ${totaux[0]?.sources} sources, ${totaux[0]?.actives} actives, ${jamaisAvant} jamais collectée(s)`);
console.log(`avant cycle      : RSS ${avant.rssMo} Mo · tas ${avant.tasMo} Mo`);
console.log(`backoff          : ${DELAIS_BACKOFF_MS.slice(1).map(heuresOuMinutes).join(" → ")}`);

const t0 = performance.now();
const plan = await planifierCycle({ force: true });
const planMs = Math.round(performance.now() - t0);
console.log(`plan             : ${planMs} ms pour ${plan.aExecuter.length} collecteur(s), ${plan.sautees.length} sauté(s) — cible < 10 000 ms`);
const resultat = await executerPlan(plan, async () => {
	// Le gazetteer est chargé une seule fois par cycle par l'ingestion générique.
	await getGazetteer();
});
console.log(`cycle            : ${resultat.tentatives} collecteur(s), ${resultat.reussis} succès, ${resultat.echecs} échec(s)`);
const apres = memoire();
const jamaisApres = (await sourcesJamaisCollectees(1000)).length;
console.log(`apres cycle      : RSS ${apres.rssMo} Mo · tas ${apres.tasMo} Mo`);
console.log(`delta            : RSS ${apres.rssMo - avant.rssMo} Mo · tas ${apres.tasMo - avant.tasMo} Mo`);
console.log(`mesure interne   : RSS ${resultat.memoire.avantMo} → ${resultat.memoire.apresMo} Mo`);
console.log(`jamais collectée : ${jamaisAvant} → ${jamaisApres} — cible 0`);
console.log(`budget tas 500 Mo: ${apres.tasMo < 500 ? "respecté" : "dépassé"}`);
resetGazetteer();
await closePools();
