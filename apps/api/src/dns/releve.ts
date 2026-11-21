/**
 * Orchestration d'un relevé DNS complet du référentiel.
 *
 * Un relevé = une observation par domaine actif, comparée à la dernière
 * observation enregistrée. La cadence est externe (cron, invocation manuelle)
 * : ce module est idempotent sur l'horloge mais pas sur les données — deux
 * appels produisent deux snapshots, ce qui est précisément le but d'un
 * historique.
 *
 * Aucune exception de domaine ne fait échouer le relevé : une panne DoH est
 * consignée et le domaine est marqué, pour ne jamais transformer une panne
 * en bascule d'IP.
 */

import {
	collectDomain,
	diffSnapshots,
	type DnsChange,
	type DnsFetcher,
	measurementState,
} from "./historique.js";
import {
	chargerCatalogue,
	dernierSnapshot,
	enregistrerChangements,
	enregistrerSnapshot,
	listerDomaines,
	marquerEchec,
	synchroniserDomaines,
} from "./store.js";

export interface ChangementRelve {
	domain: string;
	kind: string;
	severity: number;
	summary: string;
}

export interface RapportReleve {
	startedAt: string;
	finishedAt: string;
	domaines: number;
	snapshots: number;
	changements: number;
	erreurs: string[];
	changementsDetail: ChangementRelve[];
}

export interface OptionsReleve {
	/** Source des observations : injectable pour les tests, DoH/RDAP en production. */
	fetcher: DnsFetcher;
	/** Horodatage unique appliqué à toutes les observations du relevé. */
	maintenant?: Date;
	/** Nombre maximal de domaines traités (0 = tous). */
	limite?: number;
	/** Nombre de domaines interrogés en parallèle (défaut 5). */
	concurrence?: number;
	/** Ne pas reconstruire le périmètre depuis le référentiel (tests ciblés). */
	sansSynchronisation?: boolean;
}

/** Petit pool de workers : borne la pression sur les résolveurs publics. */
async function pourChaque<T>(items: readonly T[], concurrence: number, fn: (item: T) => Promise<void>): Promise<void> {
	if (items.length === 0) return;
	let cursor = 0;
	const workers = Array.from({ length: Math.max(1, Math.min(concurrence, items.length)) }, async () => {
		for (;;) {
			const index = cursor++;
			if (index >= items.length) return;
			await fn(items[index]!);
		}
	});
	await Promise.all(workers);
}

export async function effectuerReleve(options: OptionsReleve): Promise<RapportReleve> {
	const startedAt = (options.maintenant ?? new Date()).toISOString();
	const concurrence = Math.max(1, Math.min(options.concurrence ?? 5, 20));
	const rapport: RapportReleve = {
		startedAt,
		finishedAt: startedAt,
		domaines: 0,
		snapshots: 0,
		changements: 0,
		erreurs: [],
		changementsDetail: [],
	};

	if (!options.sansSynchronisation) await synchroniserDomaines();
	const catalogue = await chargerCatalogue();
	let domaines = await listerDomaines(true);
	if (options.limite && options.limite > 0) domaines = domaines.slice(0, options.limite);
	rapport.domaines = domaines.length;

	await pourChaque(domaines, concurrence, async ({ domain }) => {
		try {
			const avant = await dernierSnapshot(domain);
			const snapshot = await collectDomain(domain, options.fetcher, { now: options.maintenant ?? new Date() });
			// Résolveur totalement en panne : aucune observation exploitable.
			// Ne pas l'enregistrer, sinon elle effacerait la dernière mesure
			// saine et le retour du DNS fabriquerait une fausse bascule.
			if (measurementState(snapshot) === "erreur") {
				const message = snapshot.errors.join(" | ");
				rapport.erreurs.push(`${domain}: ${message}`);
				await marquerEchec(domain, message);
				return;
			}
			const changements: DnsChange[] = diffSnapshots(avant, snapshot, catalogue);
			const snapshotId = await enregistrerSnapshot(snapshot);
			const enregistres = await enregistrerChangements(
				domain,
				avant?.id ?? null,
				snapshotId,
				changements,
				snapshot.observedAt,
			);
			rapport.snapshots += 1;
			rapport.changements += enregistres;
			rapport.changementsDetail.push(
				...changements.map((c) => ({
					domain,
					kind: c.kind,
					severity: c.severity,
					summary: c.summary,
				})),
			);
			if (snapshot.errors.length > 0) rapport.erreurs.push(`${domain}: ${snapshot.errors.join(" | ")}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			rapport.erreurs.push(`${domain}: ${message}`);
			await marquerEchec(domain, message).catch(() => {});
		}
	});

	rapport.finishedAt = new Date().toISOString();
	rapport.changementsDetail.sort((a, b) => b.severity - a.severity);
	return rapport;
}
