import { collector as certfr } from "./certfr.collector.js";
import { collector as kev } from "./kev.collector.js";
import { collector as ransomlook } from "./ransomlook.collector.js";
import { collector as epss } from "./epss.collector.js";
import { collector as nvd } from "./nvd.collector.js";
import { collector as ctlog } from "./ctlog.collector.js";
import { collector as poc } from "./poc.collector.js";
import type { CollectContext, Collector, NormalizedEvent } from "@radar/shared";
import { query, withTransaction } from "../db.js";
import { consignerAvec } from "../journal/index.js";

export const collectors: Collector[] = [certfr, kev, ransomlook, epss, nvd, ctlog, poc];

/** Nombre d'échecs consécutifs au-delà duquel une source est déclarée morte. */
export const SEUIL_ECHECS_MORTE = 5;

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
		await query("UPDATE source SET echecs_consecutifs = 0 WHERE id = $1", [c.id]).catch((e) => {
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
	const message = erreur instanceof Error ? erreur.message : String(erreur);
	try {
		const constat = await withTransaction(async (client) => {
			const compteur = await client.query<{ echecs_consecutifs: number }>(
				`UPDATE source
				    SET echecs_consecutifs = echecs_consecutifs + 1
				  WHERE id = $1 AND statut = 'active'
				  RETURNING echecs_consecutifs`,
				[sourceId],
			);
			const echecs = compteur.rows[0]?.echecs_consecutifs;
			// Source inconnue, ou déjà morte : rien à compter.
			if (echecs === undefined) return null;
			if (echecs < SEUIL_ECHECS_MORTE) return { echecs, morte: false };

			const morte = await client.query(
				`UPDATE source
				    SET statut = 'morte',
				        derniere_erreur = $1,
				        enabled = false,
				        disabled_at = COALESCE(disabled_at, now()),
				        disabled_reason = $1
				  WHERE id = $2 AND statut = 'active'
				  RETURNING id`,
				[message, sourceId],
			);
			if (!morte.rows[0]) return null;

			const trace = await consignerAvec((sql, params) => client.query(sql, params as unknown[]), {
				kind: "source.morte",
				subject: sourceId,
				summary: `source ${sourceId} marquée morte après ${echecs} échecs consécutifs — ${message}`,
				actor: `collecteur:${sourceId}`,
				payload: { seuil: SEUIL_ECHECS_MORTE, echecsConsecutifs: echecs, raison: message.slice(0, 300) },
			});
			if (!trace.ok) throw new Error(`journal indisponible : ${trace.error}`);
			return { echecs, morte: true };
		});
		if (constat?.morte) {
			log(`collecteur ${sourceId} : ${SEUIL_ECHECS_MORTE} échecs consécutifs, source marquée morte`);
		}
	} catch (e) {
		// Un compteur indisponible ne doit pas faire perdre la collecte : on laisse
		// remonter l'erreur d'origine et on signale le trou dans les logs.
		log(`collecteur ${sourceId} : compteur d'échecs non mis à jour — ${String(e)}`);
	}
}
