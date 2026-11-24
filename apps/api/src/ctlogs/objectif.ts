/**
 * Objectif chiffré du chantier « wildcards, émetteurs hors liste, certificats
 * étendus ». La ligne publiée est produite depuis la mesure, jamais écrite à
 * la main dans deux endroits différents.
 */

export const OBJECTIF_ANOMALIES_MIN = 15;
export const OBJECTIF_CERTIFICATS_SYNTHETIQUES = 4;

export type MesureObjectifCt = {
	anomalies: number;
	versionWhitelist: string;
	emetteurs: number;
	certificatsClasses: number;
};

export function ligneObjectifCt(mesure: MesureObjectifCt): string {
	const livree =
		`${mesure.anomalies} lignes ct_anomalie, liste blanche ${mesure.versionWhitelist} ` +
		`(${mesure.emetteurs} émetteurs), ${mesure.certificatsClasses} certificats synthétiques classés`;
	const cible =
		`≥ ${OBJECTIF_ANOMALIES_MIN} lignes, liste blanche versionnée, ` +
		`${OBJECTIF_CERTIFICATS_SYNTHETIQUES} certificats synthétiques`;
	const atteint =
		mesure.anomalies >= OBJECTIF_ANOMALIES_MIN &&
		mesure.certificatsClasses >= OBJECTIF_CERTIFICATS_SYNTHETIQUES;
	if (atteint) return `OBJECTIF : atteint — ${livree} / ${cible}`;
	return (
		`OBJECTIF : partiel — ${livree} / ${cible}, manque ` +
		`${Math.max(0, OBJECTIF_ANOMALIES_MIN - mesure.anomalies)} lignes et ` +
		`${Math.max(0, OBJECTIF_CERTIFICATS_SYNTHETIQUES - mesure.certificatsClasses)} certificats synthétiques`
	);
}

/** La déclaration publiée doit être exacte et unique, jamais une variante périmée. */
export function verifierDeclarationObjectifCt(rapport: string, ligne: string): boolean {
	return rapport.split(/\r?\n/).filter((publiee) => publiee === ligne).length === 1;
}
