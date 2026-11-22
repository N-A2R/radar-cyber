/**
 * Signaux de détection tirés de l'historique DNS déjà persisté.
 *
 * Le relevé en direct (`releve.ts`) compare le dernier snapshot à l'observation
 * fraîche. Ce module fait le même travail *a posteriori* sur toutes les paires
 * consécutives de `dns_snapshot` : quatre observations produisent trois
 * comparaisons, donc autant d'occasions de détecter une bascule A, MX ou NS.
 * Il ne refait jamais le même signal : l'écriture est idempotente par paire
 * de snapshots et par kind.
 */

import { diffSnapshots, type DnsProvider } from "./historique.js";
import {
	chargerCatalogue,
	enregistrerChangementsConsecutifs,
	listerDomaines,
	snapshotsDuDomaine,
	type ChangementConsecutif,
	type SnapshotEnregistre,
} from "./store.js";

export interface OptionsDetection {
	/** Limite explicite (tests, périmètre ciblé) ; sinon tous les domaines suivis. */
	domaines?: readonly string[];
	/** Catalogue injectable ; sinon lu dans dns_fournisseur. */
	catalogue?: readonly DnsProvider[];
	/** false = rapport seul, aucune écriture dans dns_change. */
	ecrire?: boolean;
}

export interface RapportDetection {
	domaines: number;
	paires: number;
	changements: number;
	ecrits: number;
}

/** Compare chaque paire consécutive d'une série ordonnée de snapshots. */
export function changementsEntreSnapshots(
	domain: string,
	snapshots: readonly SnapshotEnregistre[],
	catalogue: readonly DnsProvider[],
): ChangementConsecutif[] {
	const signaux: ChangementConsecutif[] = [];
	for (let i = 1; i < snapshots.length; i += 1) {
		const avant = snapshots[i - 1]!;
		const apres = snapshots[i]!;
		for (const change of diffSnapshots(avant, apres, catalogue)) {
			signaux.push({
				domain,
				previousSnapshotId: avant.id,
				currentSnapshotId: apres.id,
				detectedAt: apres.observedAt,
				change,
			});
		}
	}
	return signaux;
}

/** Alimente `dns_change` depuis l'historique ; rejouable sans doublon. */
export async function detecterChangementsConsecutifs(
	options: OptionsDetection = {},
): Promise<RapportDetection> {
	const catalogue = options.catalogue ?? (await chargerCatalogue());
	const domaines = options.domaines ?? (await listerDomaines(false)).map((d) => d.domain);
	const signaux: ChangementConsecutif[] = [];
	let paires = 0;
	for (const domain of domaines) {
		const snapshots = await snapshotsDuDomaine(domain);
		paires += Math.max(0, snapshots.length - 1);
		signaux.push(...changementsEntreSnapshots(domain, snapshots, catalogue));
	}
	const ecrits = options.ecrire === false ? 0 : await enregistrerChangementsConsecutifs(signaux);
	return { domaines: domaines.length, paires, changements: signaux.length, ecrits };
}
