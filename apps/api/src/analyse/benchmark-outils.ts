/**
 * Comparaison d'outils sur cinq critères mesurables.
 *
 * Module pur : les mesures viennent du fichier versionné
 * `bench/results/benchmark-outils.json`. Radar Cyber étant privé, ses métriques
 * GitHub sont `null` et ne sont pas classées : on n'invente pas de chiffre.
 */

export type OutilMesure = {
	nom: string;
	slug: string | null;
	visibilite: "public" | "prive";
	etoiles: number | null;
	forks: number | null;
	issuesOuvertes: number | null;
	joursDepuisPush: number | null;
	mentionsNA: number;
	licence: string | null;
};

export type CritereMesure = {
	cle: "etoiles" | "forks" | "issuesOuvertes" | "joursDepuisPush" | "mentionsNA";
	libelle: string;
	sens: "decroissant" | "croissant";
};

/** Les cinq critères du benchmark, dans l'ordre des colonnes du rapport. */
export const CRITERES: readonly CritereMesure[] = [
	{ cle: "etoiles", libelle: "★", sens: "decroissant" },
	{ cle: "forks", libelle: "Forks", sens: "decroissant" },
	{ cle: "issuesOuvertes", libelle: "Issues", sens: "croissant" },
	{ cle: "joursDepuisPush", libelle: "J−push", sens: "croissant" },
	{ cle: "mentionsNA", libelle: "Trace NA", sens: "decroissant" },
];

export type JeuOutils = {
	dateMesure: string;
	methode: string;
	outils: OutilMesure[];
};

export class ErreurBenchmarkOutils extends Error {}

/** Refuse un jeu incomplet ou invalide avant toute publication. */
export function verifierJeuOutils(jeu: JeuOutils): void {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(jeu.dateMesure)) {
		throw new ErreurBenchmarkOutils("dateMesure doit être une date ISO");
	}
	if (!jeu.methode.trim()) {
		throw new ErreurBenchmarkOutils("méthode absente");
	}
	if (jeu.outils.length < 8) {
		throw new ErreurBenchmarkOutils("au moins huit outils sont requis");
	}
	const noms = new Set<string>();
	for (const outil of jeu.outils) {
		if (!outil.nom.trim() || noms.has(outil.nom)) {
			throw new ErreurBenchmarkOutils(`nom d'outil absent ou dupliqué : ${outil.nom}`);
		}
		noms.add(outil.nom);
		if (!Number.isInteger(outil.mentionsNA) || outil.mentionsNA < 0) {
			throw new ErreurBenchmarkOutils(`mentionsNA invalide pour ${outil.nom}`);
		}
		for (const critere of CRITERES) {
			const valeur = outil[critere.cle];
			if (valeur === null) {
				if (outil.visibilite !== "prive") {
					throw new ErreurBenchmarkOutils(`${critere.cle} absent pour ${outil.nom}`);
				}
				continue;
			}
			if (!Number.isFinite(valeur) || valeur < 0) {
				throw new ErreurBenchmarkOutils(`${critere.cle} invalide pour ${outil.nom}`);
			}
		}
	}
}

/** Classement d'un critère, valeurs nulles exclues (non mesurables). */
export function classement(jeu: JeuOutils, critere: CritereMesure): string[] {
	return jeu.outils
		.filter((outil) => outil[critere.cle] !== null)
		.slice()
		.sort((a, b) => {
			const ea = a[critere.cle] as number;
			const eb = b[critere.cle] as number;
			return critere.sens === "croissant" ? ea - eb : eb - ea;
		})
		.map((outil) => outil.nom);
}

export type PositionRadar = {
	outils: number;
	criteres: number;
	rangs: Record<string, number | null>;
	mentionsNA: number;
	maxAutres: number;
	premiers: string[];
};

/** Position de Radar Cyber, chiffrée critère par critère. */
export function positionRadar(jeu: JeuOutils, nomRadar = "Radar Cyber"): PositionRadar {
	const radar = jeu.outils.find((outil) => outil.nom === nomRadar);
	if (!radar) throw new ErreurBenchmarkOutils(`${nomRadar} absent du jeu`);
	const rangs: Record<string, number | null> = {};
	for (const critere of CRITERES) {
		const rang = classement(jeu, critere).indexOf(nomRadar);
		rangs[critere.cle] = rang < 0 ? null : rang + 1;
	}
	const autres = jeu.outils.filter((outil) => outil.nom !== nomRadar);
	return {
		outils: jeu.outils.length,
		criteres: CRITERES.length,
		rangs,
		mentionsNA: radar.mentionsNA,
		maxAutres: Math.max(...autres.map((outil) => outil.mentionsNA)),
		premiers: CRITERES.filter((critere) => rangs[critere.cle] === 1).map((critere) => critere.libelle),
	};
}

function format(valeur: number | null, outil: OutilMesure): string {
	if (valeur === null) return outil.visibilite === "prive" ? "— (privé)" : "—";
	return new Intl.NumberFormat("fr-FR").format(valeur);
}

/** Tableau markdown des huit outils sur les cinq critères. */
export function tableauOutils(jeu: JeuOutils): string {
	const lignes = [
		`| Outil | ${CRITERES.map((c) => c.libelle).join(" | ")} |`,
		`| --- | ${CRITERES.map(() => "---:").join(" | ")} |`,
		...jeu.outils.map(
			(outil) => `| ${outil.nom} | ${CRITERES.map((c) => format(outil[c.cle], outil)).join(" | ")} |`,
		),
	];
	return lignes.join("\n");
}

/** Mots du rapport, table comprise : séparateurs markdown exclus du compte. */
export function compterMots(markdown: string): number {
	return markdown.split(/\s+/).filter((mot) => /\p{L}|\p{N}/u.test(mot)).length;
}
