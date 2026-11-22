/**
 * Génération déterministe des deux documents du benchmark : le rapport court
 * (comparaison d'outils, < 150 mots) et le tableau nominatif des incidents.
 *
 * Aucune date n'est fabriquée : un canal sans date est exclu du classement et
 * signalé comme tel.
 */
import type { BilanBenchmark } from "./benchmark-premier-regard.js";
import {
	compterMots,
	positionRadar,
	tableauOutils,
	verifierJeuOutils,
	type JeuOutils,
} from "./benchmark-outils.js";
import { compterIncidentsDates, ligneObjectif } from "./objectif-benchmark.js";

export const LIMITE_MOTS_RAPPORT = 150;

export class ErreurRapportBenchmark extends Error {}

export type RapportBenchmark = {
	markdown: string;
	mots: number;
	tableauIncidents: string;
	resume: {
		total: number;
		radarPremier: number;
		radarDernier: number;
		radarPremierFaceMedia: number;
		delaiMedianeHeures: number | null;
		outils: number;
		criteres: number;
		rangRadarNA: number | null;
	};
};

const formatNombre = new Intl.NumberFormat("fr-FR");

function libelleCanal(canal: string): string {
	switch (canal) {
		case "radar":
			return "radar";
		case "presseLocale":
			return "presse locale";
		case "presseNationale":
			return "presse nationale";
		case "certFr":
			return "CERT-FR";
		default:
			return canal;
	}
}

/** Rapport court : huit outils, cinq critères, position chiffrée de Radar Cyber. */
export function genererRapport(bilan: BilanBenchmark, jeu: JeuOutils): RapportBenchmark {
	verifierJeuOutils(jeu);
	const position = positionRadar(jeu);
	const nonClasses = Object.values(position.rangs).filter((rang) => rang === null).length;
	const mediane = bilan.delaiHeures.mediane;
	const delai = mediane === null ? "non mesurable" : `${formatNombre.format(mediane)} h (${formatNombre.format(Math.round(mediane / 24))} j)`;
	const markdown = [
		"# Benchmark — incidents de Nouvelle-Aquitaine",
		"",
		`Mesure ${jeu.dateMesure}. 8 outils, 5 critères. Sources : API GitHub ; corpus de ${bilan.total} incidents pour Radar Cyber (privé). Trace NA = mentions GitHub (7 outils) ou incidents du corpus (Radar).`,
		"",
		tableauOutils(jeu),
		"",
		`Radar Cyber : ${position.rangs.mentionsNA}/${position.outils} sur la trace NA (${position.mentionsNA} vs ${position.maxAutres} mentions), hors classement sur ${nonClasses} métriques privées. Sur ${bilan.total} : dernier ${bilan.radarDernier}/${bilan.total}, premier ${bilan.radarPremier}/${bilan.total} dont ${bilan.radarPremierFaceMedia}/${bilan.delaiHeures.n} face à un média daté ; médiane ${delai}. CERT-FR : 0 date, exclu. Radar = trace datée, pas détection. Détail : docs/benchmark-incidents.md.`,
		"",
	].join("\n");
	const mots = compterMots(markdown);
	if (mots >= LIMITE_MOTS_RAPPORT) {
		throw new ErreurRapportBenchmark(`rapport de ${mots} mots, limite ${LIMITE_MOTS_RAPPORT}`);
	}
	return {
		markdown,
		mots,
		tableauIncidents: genererTableauIncidents(bilan, jeu.dateMesure),
		resume: {
			total: bilan.total,
			radarPremier: bilan.radarPremier,
			radarDernier: bilan.radarDernier,
			radarPremierFaceMedia: bilan.radarPremierFaceMedia,
			delaiMedianeHeures: mediane,
			outils: position.outils,
			criteres: position.criteres,
			rangRadarNA: position.rangs.mentionsNA,
		},
	};
}

/** Tableau nominatif : un incident par ligne, avec les dates datées seulement. */
export function genererTableauIncidents(bilan: BilanBenchmark, dateMesure: string): string {
	const lignes = [
		"# Benchmark — tableau nominatif des incidents",
		"",
		`${bilan.total} incidents réels de Nouvelle-Aquitaine, dans l'ordre du corpus. Comparaison du ${dateMesure}.`,
		"",
		"Une date « radar » est la première trace datée du corpus (consultation ou vérification), pas une détection automatique. Le CERT-FR n'a aucune date dans ce corpus : il est exclu du classement, jamais compté comme premier ni comme dernier.",
		"",
		ligneObjectif(compterIncidentsDates(bilan.lignes)),
		"",
		"| ID | Entité | Dpt | 1ᵉʳ canal daté | Radar | 1ᵉʳ média (date) | Délai (h) | Dernier canal |",
		"| --- | --- | :---: | --- | --- | --- | ---: | --- |",
	];
	for (const ligne of bilan.lignes) {
		const premier = ligne.premier.map(libelleCanal).join(" + ") || "aucun";
		const dernier = ligne.dernier.map(libelleCanal).join(" + ") || "aucun";
		lignes.push(
			`| \`${ligne.id}\` | ${ligne.entite.replace(/\|/g, "\\|")} | ${ligne.codeDepartement} | ${premier} | ${ligne.dates.radar ?? "—"} | ${ligne.datePremierMedia ?? "—"} | ${ligne.delaiHeures === null ? "—" : formatNombre.format(ligne.delaiHeures)} | ${dernier} |`,
		);
	}
	return `${lignes.join("\n")}\n`;
}
