/**
 * Mesure de couverture du rapport `docs/corpus-progression.md`.
 *
 * Module pur : ni base, ni réseau, ni système de fichiers. Il relit le Markdown
 * publié et vérifie que les douze départements de Nouvelle-Aquitaine sont
 * renseignés pour les cinq indicateurs, sans compter la ligne « Hors NA ».
 */
import {
	INDICATEURS,
	LIBELLES_INDICATEURS,
	OBJECTIF_CORPUS_PROGRESSION,
} from "./rapport-corpus.js";

export type MesureProgression = {
	date: string | null;
	departementsNA: string[];
	indicateurs: string[];
	cellules: number;
	objectifAtteint: boolean;
};

const TITRE = /^# Progression du corpus — (\d{4}-\d{2}-\d{2})$/;
const LIGNE_DEPARTEMENT = /^(\d{2})\s+—\s+/;
const CELLULE_RENSEIGNEE = /^\d+(?:\s+\([+-]?\d+\))?$/;
const LIBELLES = new Set<string>(Object.values(LIBELLES_INDICATEURS));

/** Une cellule est `valeur` ou `valeur (écart)` ; une case vide n'est pas un zéro. */
export function mesurerRapportProgression(
	markdown: string,
	codesNA: readonly string[],
): MesureProgression {
	const lignes = markdown.split("\n");
	const date =
		lignes.map((ligne) => TITRE.exec(ligne.trim())?.[1]).find((trouve) => trouve !== undefined) ?? null;
	const debut = lignes.findIndex((ligne) => ligne.trim() === "## Par département");
	const parDepartement = debut < 0 ? [] : lignes.slice(debut + 1);
	const mesures = new Map<string, number>();
	const indicateurs = new Set<string>();

	let tableCommencee = false;
	for (const ligne of parDepartement) {
		if (ligne.trim() === "") {
			if (tableCommencee) break;
			continue;
		}
		if (!ligne.trimStart().startsWith("|")) continue;
		tableCommencee = true;
		const cellules = ligne.split("|").slice(1, -1).map((cellule) => cellule.trim());
		if (cellules.length < INDICATEURS.length + 1) continue;
		if (cellules[1] === LIBELLES_INDICATEURS.declarees) {
			for (const libelle of cellules.slice(1, INDICATEURS.length + 1)) {
				if (LIBELLES.has(libelle)) indicateurs.add(libelle);
			}
			continue;
		}
		const code = LIGNE_DEPARTEMENT.exec(cellules[0] ?? "")?.[1];
		if (code === undefined || !codesNA.includes(code) || mesures.has(code)) continue;
		mesures.set(
			code,
			cellules.slice(1, INDICATEURS.length + 1).filter((cellule) => CELLULE_RENSEIGNEE.test(cellule)).length,
		);
	}

	const departementsNA = codesNA.filter((code) => mesures.has(code));
	const cellules = [...mesures.values()].reduce((total, compte) => total + compte, 0);
	const objectifAtteint =
		departementsNA.length === OBJECTIF_CORPUS_PROGRESSION.departements &&
		indicateurs.size === OBJECTIF_CORPUS_PROGRESSION.indicateurs &&
		cellules === OBJECTIF_CORPUS_PROGRESSION.cellules;
	return { date, departementsNA, indicateurs: [...indicateurs], cellules, objectifAtteint };
}
