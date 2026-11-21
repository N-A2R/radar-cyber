import { collector as certfr } from "./certfr.collector.js";
import { collector as kev } from "./kev.collector.js";
import { collector as ransomlook } from "./ransomlook.collector.js";
import { collector as epss } from "./epss.collector.js";
import { collector as nvd } from "./nvd.collector.js";
import { collector as ctlog } from "./ctlog.collector.js";
import { collector as poc } from "./poc.collector.js";
import type { CollectContext, Collector, NormalizedEvent } from "@radar/shared";
import { enregistrerEchecSource, enregistrerSuccesSource, SEUIL_ECHECS_MORTE } from "./sante-source.js";

// L'insertion des événements de flux — et son `ON CONFLICT (fingerprint) DO NOTHING`
// (migration 045) — vit dans generic.ts : ce fichier ne fait que lister les
// collecteurs dédiés, appelés depuis server.ts.
export const collectors: Collector[] = [certfr, kev, ransomlook, epss, nvd, ctlog, poc];

export { SEUIL_ECHECS_MORTE };

type ResultatCollecte = { events: NormalizedEvent[]; cursor?: Record<string, unknown> };

/**
 * Exécute un collecteur du registre et tient à jour son compteur d'échecs.
 *
 * Le marquage n'intervient qu'après cinq échecs *consécutifs* : un run réussi
 * remet le compteur à zéro. La source n'est jamais supprimée — on la désactive
 * seulement, comme pour la décision admin, et le fait est écrit dans le journal
 * dans la même transaction que le changement d'état.
 */
export async function executerCollecteur(c: Collector, ctx: CollectContext): Promise<ResultatCollecte> {
	try {
		const resultat = await c.run(ctx);
		await enregistrerSuccesSource(c.id).catch((e: unknown) => {
			ctx.log(`collecteur ${c.id} : compteur d'échecs non remis à zéro — ${e}`);
		});
		return resultat;
	} catch (e) {
		await constaterEchec(c.id, e, ctx.log);
		// L'erreur remonte : l'orchestrateur journalise le run en échec.
		throw e;
	}
}

async function constaterEchec(sourceId: string, erreur: unknown, log: (msg: string) => void): Promise<void> {
	// Compteur, backoff, état « rouge » / « morte » et journal sont tenus par le
	// module de santé partagé avec l'ingestion générique : une seule politique,
	// que le collecteur soit dédié ou non.
	const constat = await enregistrerEchecSource(sourceId, erreur, log);
	if (constat?.morte) {
		log(`collecteur ${sourceId} : ${SEUIL_ECHECS_MORTE} échecs consécutifs, source marquée morte`);
	}
}
