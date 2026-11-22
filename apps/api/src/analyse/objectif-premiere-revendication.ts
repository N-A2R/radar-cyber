/**
 * Objectif chiffré du chantier d4 : une médiane de latence strictement inférieure
 * à une heure entre la publication d'une revendication et sa première trace radar.
 * Module pur : ni base, ni réseau, ni fichier, ni horloge.
 */
export const OBJECTIF_PREMIERE_REVENDICATION = {
	targetHours: 1,
} as const;

export type MesureObjectifPremiereRevendication = {
	measuredHours: number;
};

export type ObjectifPremiereRevendication = {
	value: number;
	target: number;
	reached: boolean;
	line: string;
};

const comma = (value: number): string => value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

/** L'unique ligne OBJECTIF, identique dans le rapport et dans la vérification. */
export function ligneObjectifPremiereRevendication(measuredHours: number): string {
	const etat = measuredHours < OBJECTIF_PREMIERE_REVENDICATION.targetHours ? "atteint" : "partiel";
	return `OBJECTIF : ${etat} — ${comma(measuredHours)} / ${comma(OBJECTIF_PREMIERE_REVENDICATION.targetHours)} h (p50 de première revendication en collecte directe)`;
}

/** Mesure publiée → déclaration chiffrée, sans rejouer la collecte. */
export function verifierObjectifPremiereRevendication(
	mesure: MesureObjectifPremiereRevendication,
): ObjectifPremiereRevendication {
	const target = OBJECTIF_PREMIERE_REVENDICATION.targetHours;
	return {
		value: mesure.measuredHours,
		target,
		reached: mesure.measuredHours < target,
		line: ligneObjectifPremiereRevendication(mesure.measuredHours),
	};
}

/** Un rapport publié doit contenir exactement la ligne attendue, pas un chiffre ancien. */
export function verifierDeclarationObjectif(markdown: string, ligne: string): boolean {
	return markdown.split("\n").some((lignePubliee) => lignePubliee.trim() === ligne);
}
