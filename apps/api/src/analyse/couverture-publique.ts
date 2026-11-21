/**
 * Chiffres de la mesure de couverture exposés par GET /api/couverture.
 *
 * La source est la sortie publiée de `scripts/mesure-couverture.mts`, pas un
 * recalcul à la volée : rejouer le gazetteer à chaque appel donnerait un taux
 * dépendant de l'état de la base et non reproductible. Le corpus versionné est
 * lu à côté pour deux raisons : il porte le département et le type d'entité
 * nécessaires aux décompositions, et son empreinte SHA-256 identifie exactement
 * le jeu d'incidents mesuré.
 *
 * Les incidents `hors_fenetre` sont conservés dans le corpus mais exclus des
 * décompositions, comme du taux global : les inclure gonflerait les
 * dénominateurs avec des faits hors de la période mesurée.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CORPUS = fileURLToPath(
	new URL("../../../../bench/fixtures/corpus-reference-na.json", import.meta.url),
);
const MESURE = fileURLToPath(
	new URL("../../../../bench/results/couverture-2026-11-15-gazetteer4.json", import.meta.url),
);

type Motif = "vu" | "pas_admis" | "pas_rattache" | "hors_fenetre";

type Mesure = {
	dateMesure: string;
	fenetre: { debut: string; fin: string };
	couverture: { vus: number; total: number; taux: number; motifs: Record<string, number> };
	incidents: { id: string; motif: Motif }[];
};

type IncidentCorpus = {
	id: string;
	departement: string | null;
	entiteType: string | null;
};

export type LigneCouverture = {
	vus: number;
	total: number;
	taux: number;
};

export type CouverturePublique = {
	dateCalcul: string;
	hashCorpus: string;
	fenetre: { debut: string; fin: string };
	global: LigneCouverture;
	parMotif: Array<{ motif: string; incidents: number; part: number }>;
	parDepartement: Array<LigneCouverture & { departement: string }>;
	parSecteur: Array<LigneCouverture & { secteur: string }>;
};

/** Arrondi au dixième, comme la mesure publiée (1000/10 plutôt que *100/10). */
function taux(vus: number, total: number): number {
	return total === 0 ? 0 : Math.round((vus / total) * 1000) / 10;
}

/**
 * Décomposition d'une dimension du corpus. Le libellé `non renseigné` évite
 * de faire disparaître un incident dont le département ou le type manque.
 */
function decomposer<T extends LigneCouverture>(
	incidents: readonly IncidentCorpus[],
	motifs: ReadonlyMap<string, Motif>,
	cle: (incident: IncidentCorpus) => string | null,
	fabrique: (nom: string, ligne: LigneCouverture) => T,
): T[] {
	const groupes = new Map<string, { vus: number; total: number }>();
	for (const incident of incidents) {
		if (motifs.get(incident.id) === "hors_fenetre") continue;
		const nom = cle(incident) ?? "non renseigné";
		const ligne = groupes.get(nom) ?? { vus: 0, total: 0 };
		ligne.total += 1;
		if (motifs.get(incident.id) === "vu") ligne.vus += 1;
		groupes.set(nom, ligne);
	}
	return [...groupes.entries()]
		.sort(([a, aLigne], [b, bLigne]) => bLigne.total - aLigne.total || a.localeCompare(b, "fr"))
		.map(([nom, ligne]) => fabrique(nom, { ...ligne, taux: taux(ligne.vus, ligne.total) }));
}

export function lireCouverturePublique(): CouverturePublique {
	const corpusBrut = readFileSync(CORPUS, "utf8");
	const mesureBrut = readFileSync(MESURE, "utf8");
	const corpus = JSON.parse(corpusBrut) as { incidents: IncidentCorpus[] };
	const mesure = JSON.parse(mesureBrut) as Mesure;
	const motifs = new Map(mesure.incidents.map((i) => [i.id, i.motif]));
	const { total } = mesure.couverture;

	return {
		dateCalcul: mesure.dateMesure,
		hashCorpus: createHash("sha256").update(corpusBrut).digest("hex"),
		fenetre: mesure.fenetre,
		global: {
			vus: mesure.couverture.vus,
			total,
			taux: mesure.couverture.taux,
		},
		parMotif: Object.entries(mesure.couverture.motifs)
			.sort(([a], [b]) => a.localeCompare(b, "fr"))
			.map(([motif, incidents]) => ({ motif, incidents, part: taux(incidents, total) })),
		parDepartement: decomposer(
			corpus.incidents,
			motifs,
			(i) => i.departement,
			(departement, ligne) => ({ departement, ...ligne }),
		),
		parSecteur: decomposer(
			corpus.incidents,
			motifs,
			(i) => i.entiteType,
			(secteur, ligne) => ({ secteur, ...ligne }),
		),
	};
}

/** Mesure figée : ni le corpus ni la publication ne changent pendant le service. */
export const COUVERTURE_PUBLIQUE = lireCouverturePublique();
