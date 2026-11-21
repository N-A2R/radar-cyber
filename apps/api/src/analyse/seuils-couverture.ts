/**
 * Seuils de publication du chiffre de couverture.
 *
 * Un taux calculable n'est pas pour autant publiable : un effectif trop faible,
 * un référentiel troué, une source dominante ou une fenêtre trop courte donnent
 * un chiffre exact arithmétiquement et trompeur pour le lecteur. Les quatre
 * garde-fous sont évalués avant publication, sur les incidents de la fenêtre,
 * et tous les refus sont renvoyés : corriger le premier ne doit pas masquer le
 * suivant. Aucune date murale, aucun accès base, aucun réseau ici.
 */
import {
	verifierPubliabilite,
	type VerdictPublication,
} from "./publiabilite.js";

/** Mention exacte du refus : c'est elle que les lecteurs de la sortie cherchent. */
export const REFUS_PUBLICATION = "refus de publication";

/** Incidents dans la fenêtre, pas lignes brutes du fichier. */
export const SEUIL_CORPUS_MIN = 30;

/** Réutilise le seuil déjà défini dans `analyse/publiabilite.ts` (3 secteurs sur 4). */
export { SEUIL_SECTEURS_PUBLIABLES } from "./publiabilite.js";

export const SEUIL_SOURCES_DISTINCTES_MIN = 5;
export const SEUIL_PART_SOURCE_MAX = 0.5;

/** Une fenêtre plus courte qu'un trimestre ne montre qu'une saison de collecte. */
export const SEUIL_FENETRE_JOURS_MIN = 90;

export type FenetreSeuil = { debut: string; fin: string };

/** Un incident n'apporte à la porte que sa date de publication et son éditeur. */
export type IncidentSeuil = { date: string; source?: string | null };

export type CodeRefus =
	| "corpus_trop_petit"
	| "referentiel_trop_troue"
	| "sources_trop_peu_productives"
	| "fenetre_courte";

export type RaisonRefus = { code: CodeRefus; raison: string };

export type VerdictSeuilsCouverture = {
	publiable: boolean;
	/** `null` quand le chiffre peut être publié. */
	mention: typeof REFUS_PUBLICATION | null;
	/** Toutes les raisons, séparées par « ; » ; `null` quand tout passe. */
	raison: string | null;
	refus: RaisonRefus[];
	corpus: { total: number; dansFenetre: number; fenetre: FenetreSeuil; jours: number };
	sources: { distinctes: number; partMax: number; parEditeur: Record<string, number> };
	referentiel: VerdictPublication;
};

export function incidentsDansFenetre(
	incidents: readonly IncidentSeuil[],
	fenetre: FenetreSeuil,
): IncidentSeuil[] {
	return incidents.filter(
		(incident) => incident.date >= fenetre.debut && incident.date <= fenetre.fin,
	);
}

/** Nombre de jours calendaires de la fenêtre, bornes incluses. */
export function joursFenetre(fenetre: FenetreSeuil): number {
	const debut = Date.parse(`${fenetre.debut}T00:00:00Z`);
	const fin = Date.parse(`${fenetre.fin}T00:00:00Z`);
	if (Number.isNaN(debut) || Number.isNaN(fin) || fin < debut) {
		throw new Error(`fenêtre de couverture invalide : ${fenetre.debut} → ${fenetre.fin}`);
	}
	return Math.round((fin - debut) / 86_400_000) + 1;
}

/** Une source = un éditeur, insensible à la casse ; sans éditeur, pas de source. */
function sourcesDes(incidents: readonly IncidentSeuil[]): VerdictSeuilsCouverture["sources"] {
	const parEditeur = new Map<string, number>();
	let avecEditeur = 0;
	for (const incident of incidents) {
		const editeur = incident.source?.trim();
		if (!editeur) continue;
		avecEditeur++;
		const cle = editeur.toLowerCase();
		parEditeur.set(cle, (parEditeur.get(cle) ?? 0) + 1);
	}
	const partMax = avecEditeur === 0 ? 0 : Math.max(...parEditeur.values()) / avecEditeur;
	return {
		distinctes: parEditeur.size,
		partMax,
		parEditeur: Object.fromEntries([...parEditeur.entries()].sort((a, b) => b[1] - a[1])),
	};
}

/** Évalue les quatre seuils à partir des seuls faits disponibles avant publication. */
export function evaluerSeuilsCouverture(intrants: {
	incidents: readonly IncidentSeuil[];
	fenetre: FenetreSeuil;
	parSecteur: Readonly<Record<string, number>>;
}): VerdictSeuilsCouverture {
	const jours = joursFenetre(intrants.fenetre);
	const dansFenetre = incidentsDansFenetre(intrants.incidents, intrants.fenetre);
	const sources = sourcesDes(dansFenetre);
	const referentiel = verifierPubliabilite(intrants.parSecteur);
	const refus: RaisonRefus[] = [];

	if (dansFenetre.length < SEUIL_CORPUS_MIN) {
		refus.push({
			code: "corpus_trop_petit",
			raison: `Corpus trop petit : ${dansFenetre.length} incident(s) dans la fenêtre ${intrants.fenetre.debut} → ${intrants.fenetre.fin}, seuil minimal ${SEUIL_CORPUS_MIN}.`,
		});
	}
	if (!referentiel.publiable && referentiel.raison !== null) {
		refus.push({ code: "referentiel_trop_troue", raison: referentiel.raison });
	}
	if (sources.distinctes < SEUIL_SOURCES_DISTINCTES_MIN || sources.partMax > SEUIL_PART_SOURCE_MAX) {
		refus.push({
			code: "sources_trop_peu_productives",
			raison:
				`Sources trop peu productives : ${sources.distinctes} éditeur(s) distinct(s)` +
				` (seuil ${SEUIL_SOURCES_DISTINCTES_MIN}), part maximale ${Math.round(sources.partMax * 100)} %` +
				` (plafond ${Math.round(SEUIL_PART_SOURCE_MAX * 100)} %).`,
		});
	}
	if (jours < SEUIL_FENETRE_JOURS_MIN) {
		refus.push({
			code: "fenetre_courte",
			raison:
				`Fenêtre trop courte : ${jours} jour(s) de ${intrants.fenetre.debut} à ${intrants.fenetre.fin},` +
				` seuil minimal ${SEUIL_FENETRE_JOURS_MIN} jours.`,
		});
	}

	return {
		publiable: refus.length === 0,
		mention: refus.length === 0 ? null : REFUS_PUBLICATION,
		raison: refus.length === 0 ? null : refus.map((r) => r.raison).join(" ; "),
		refus,
		corpus: { total: intrants.incidents.length, dansFenetre: dansFenetre.length, fenetre: intrants.fenetre, jours },
		sources,
		referentiel,
	};
}

/** Refus explicite : le chiffre ne sort pas, même si un `--json=` a été demandé. */
export class ErreurRefusPublication extends Error {
	constructor(readonly verdict: VerdictSeuilsCouverture) {
		super(`${REFUS_PUBLICATION} : ${verdict.refus.map((r) => `${r.code} — ${r.raison}`).join(" ; ")}`);
		this.name = "ErreurRefusPublication";
	}
}

export function exigerPublication(verdict: VerdictSeuilsCouverture): void {
	if (!verdict.publiable) throw new ErreurRefusPublication(verdict);
}
