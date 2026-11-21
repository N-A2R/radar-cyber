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
 * les deux relevés soient faits après GC. La cible est un tas < 500 Mo pour
 * 1,7 M d'alias ; les deux chiffres RSS et les deux chiffres de tas sont
 * affichés, aucune mesure n'est arrondie à la hausse.
 */
import { executerPlan, mesurerMemoireMo, planifierCycle } from "../apps/api/src/collectors/index.js";
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

const avant = memoire();
console.log(`avant cycle      : RSS ${avant.rssMo} Mo · tas ${avant.tasMo} Mo`);

const plan = await planifierCycle({ force: true });
const resultat = await executerPlan(plan, async () => {
	// Le gazetteer est chargé une seule fois par cycle par l'ingestion générique.
	await getGazetteer();
});
const apres = memoire();

console.log(`cycle            : ${resultat.tentatives} collecteur(s), ${resultat.reussis} succès, ${resultat.echecs} échec(s)`);
console.log(`apres cycle      : RSS ${apres.rssMo} Mo · tas ${apres.tasMo} Mo`);
console.log(`delta            : RSS ${apres.rssMo - avant.rssMo} Mo · tas ${apres.tasMo - avant.tasMo} Mo`);
console.log(`mesure interne   : RSS ${resultat.memoire.avantMo} → ${resultat.memoire.apresMo} Mo`);
console.log(`budget tas 500 Mo: ${apres.tasMo < 500 ? "respecté" : "dépassé"}`);
resetGazetteer();
