/**
 * Chiffre de couverture servi par GET /api/couverture.
 *
 * La source est le rapport publié par `scripts/mesure-couverture-systeme.mts`,
 * pas un recalcul à chaque appel : deux requêtes HTTP donneront toujours la
 * même chose. Au démarrage, l'empreinte SHA-256 du corpus est recalculée et
 * comparée à celle du rapport ; un corpus modifié sans nouvelle mesure fait
 * échouer le service plutôt que de servir un chiffre qui ne le décrit plus.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { RapportCouverture } from "./couverture-base.js";
import { hashCorpus } from "./corpus-couverture.js";

const RAPPORT = fileURLToPath(
	new URL("../../../../bench/results/couverture-mesuree.json", import.meta.url),
);

export type CouverturePublique = RapportCouverture;

export function lireCouverturePublique(): CouverturePublique {
	const rapport = JSON.parse(readFileSync(RAPPORT, "utf8")) as CouverturePublique;
	const empreinte = hashCorpus();
	if (rapport.hashCorpus !== empreinte) {
		throw new Error(
			`couverture-mesuree.json décrit l'empreinte ${rapport.hashCorpus} mais le corpus vaut ${empreinte} ; rejouer scripts/mesure-couverture-systeme.mts`,
		);
	}
	return rapport;
}

/** Mesure figée : ni le corpus ni la publication ne changent pendant le service. */
export const COUVERTURE_PUBLIQUE = lireCouverturePublique();
