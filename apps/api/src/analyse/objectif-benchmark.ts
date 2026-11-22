/**
 * Objectif déclaré du benchmark régional : cent incidents de Nouvelle-Aquitaine
 * portant au moins une date vérifiée. Module pur : ni base, ni réseau, ni fichier.
 *
 * Les 8 outils et les 5 critères décrivent le cadre de la mesure ; ils sont déjà
 * vérifiés par benchmark-outils.ts. L'objectif chiffré porte sur les incidents.
 */
export const OBJECTIF_BENCHMARK = {
	incidents: 100,
	outils: 8,
	criteres: 5,
} as const;

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

export type MesureObjectifBenchmark = {
	incidents: readonly { dates: object }[];
};

export type ObjectifBenchmark = {
	value: number;
	target: number;
	reached: boolean;
	line: string;
};

/** Une date calendaire valide, jamais une valeur inventée ni approximative. */
export function estDateIso(valeur: unknown): boolean {
	if (typeof valeur !== "string" || !DATE_ISO.test(valeur)) return false;
	const temps = Date.parse(`${valeur}T00:00:00Z`);
	return Number.isFinite(temps) && new Date(temps).toISOString().slice(0, 10) === valeur;
}

/** Nombre d'incidents portant au moins une date exploitable, tous canaux confondus. */
export function compterIncidentsDates(incidents: readonly { dates: object }[]): number {
	return incidents.filter(({ dates }) => Object.values(dates).some(estDateIso)).length;
}

/** L'unique ligne OBJECTIF, identique dans le rapport et dans la vérification. */
export function ligneObjectif(valeur: number): string {
	const cible = OBJECTIF_BENCHMARK.incidents;
	const etat = valeur >= cible ? "atteint" : "partiel";
	return `OBJECTIF : ${etat} — ${valeur} / ${cible} incidents de Nouvelle-Aquitaine datés`;
}

/** Mesure publiée → déclaration chiffrée, sans rejouer la collecte. */
export function verifierObjectifBenchmark(mesure: MesureObjectifBenchmark): ObjectifBenchmark {
	const value = compterIncidentsDates(mesure.incidents);
	const target = OBJECTIF_BENCHMARK.incidents;
	const reached = value >= target;
	return { value, target, reached, line: ligneObjectif(value) };
}

/** Un rapport publié doit contenir exactement la ligne attendue, pas un chiffre ancien. */
export function verifierDeclarationObjectif(markdown: string, ligne: string): boolean {
	return markdown.split("\n").some((lignePubliee) => lignePubliee.trim() === ligne);
}
