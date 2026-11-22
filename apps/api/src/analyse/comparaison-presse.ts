/**
 * Comparaison presse / radar sur les dix incidents publics vérifiés du corpus
 * témoin Nouvelle-Aquitaine (docs/comparaison-presse.md).
 *
 * Module pur : ni base, ni réseau, ni lecture de fichier. La sélection suit
 * l'ordre du corpus et ne garde que les incidents dont la preuve principale
 * est un article de presse, exactement comme le document le décrit.
 */

import { classerSourcePresse } from "./benchmark-premier-regard.js";

const JOUR_MS = 86_400_000;

export const OBJECTIF_COMPARAISON_PRESE = {
	incidents: 10,
	pressePremier: 10,
	radarPremier: 0,
	ecartMedianeJours: 134,
	ecartMinJours: 30,
	ecartMaxJours: 636,
} as const;

export type IncidentPresse = {
	id: string;
	datePublique: string;
	preuve: { editeur: string; consulteLe: string };
};

export type CorpusPresse = { incidents: IncidentPresse[] };

export type LigneComparaison = {
	id: string;
	editeur: string;
	datePresse: string;
	dateRadar: string;
	ecartJours: number;
	premier: "presse" | "radar";
};

export type BilanComparaison = {
	selection: string[];
	total: number;
	pressePremier: number;
	radarPremier: number;
	ecartJours: { n: number; mediane: number | null; min: number | null; max: number | null };
	objectifAtteint: boolean;
	lignes: LigneComparaison[];
};

function jours(date: string | undefined): number | null {
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const ms = Date.parse(`${date}T00:00:00Z`);
	return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date ? ms / JOUR_MS : null;
}

/** Les N premiers incidents du corpus dont la preuve principale est un article de presse. */
export function selectionnerIncidentsPresse(
	corpus: CorpusPresse,
	limite = OBJECTIF_COMPARAISON_PRESE.incidents,
): IncidentPresse[] {
	return corpus.incidents
		.filter((incident) =>
			incident.preuve &&
			classerSourcePresse(incident.preuve.editeur) !== null &&
			jours(incident.datePublique) !== null &&
			jours(incident.preuve.consulteLe) !== null)
		.slice(0, limite);
}

export function comparerPresseRadar(corpus: CorpusPresse): BilanComparaison {
	const lignes: LigneComparaison[] = selectionnerIncidentsPresse(corpus).map((incident) => {
		const datePresse = jours(incident.datePublique) ?? 0;
		const dateRadar = jours(incident.preuve.consulteLe) ?? 0;
		return {
			id: incident.id,
			editeur: incident.preuve.editeur,
			datePresse: incident.datePublique,
			dateRadar: incident.preuve.consulteLe,
			ecartJours: dateRadar - datePresse,
			premier: dateRadar < datePresse ? "radar" : "presse",
		};
	});

	const ecarts = lignes.map((ligne) => ligne.ecartJours).sort((a, b) => a - b);
	const mediane = ecarts.length === 0 ? null
		: ecarts.length % 2 === 1 ? (ecarts[(ecarts.length - 1) / 2] ?? 0)
		: ((ecarts[ecarts.length / 2 - 1] ?? 0) + (ecarts[ecarts.length / 2] ?? 0)) / 2;
	const cible = OBJECTIF_COMPARAISON_PRESE;
	const objectifAtteint = lignes.length === cible.incidents
		&& lignes.filter((ligne) => ligne.premier === "presse").length === cible.pressePremier
		&& lignes.filter((ligne) => ligne.premier === "radar").length === cible.radarPremier
		&& mediane === cible.ecartMedianeJours
		&& ecarts[0] === cible.ecartMinJours
		&& ecarts.at(-1) === cible.ecartMaxJours;

	return {
		selection: lignes.map((ligne) => ligne.id),
		total: lignes.length,
		pressePremier: lignes.filter((ligne) => ligne.premier === "presse").length,
		radarPremier: lignes.filter((ligne) => ligne.premier === "radar").length,
		ecartJours: { n: ecarts.length, mediane, min: ecarts[0] ?? null, max: ecarts.at(-1) ?? null },
		objectifAtteint,
		lignes,
	};
}
