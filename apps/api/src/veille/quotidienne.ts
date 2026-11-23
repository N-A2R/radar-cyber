/**
 * Veille quotidienne — un cycle complet, du collect au résumé du jour.
 *
 * Enchaîne les primitives déjà en place (cycle de collecte supervisé,
 * détection incrémentale, scores de confiance, campagnes), puis calcule et
 * écrit le résumé daté. Tout est mesuré : durée du cycle, durée totale et
 * compteurs lus en base — jamais déduits d'un exit code.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvenementCampagne } from "../analyse/campagnes.js";
import { analyserCampagnes, enregistrerCampagnes } from "../analyse/campagnes.js";
import {
	computeConfidence,
	loadEvents,
	persistConfidence,
} from "../analyse/confidence-service.js";
import { correlateEvents } from "../collectors/correlate.js";
import { loadValidatedCorpus } from "../analyse/validated-corpus.js";
import { executerCycleCollecte, type OptionsCycle } from "../collecte/cycle.js";
import { query } from "../db.js";
import { resetDetectionCursors, runDetectionPass } from "../detect/incremental.js";

export const LIMITE_CYCLE_MS = 10 * 60 * 1000;

export type ResumeQuotidien = {
	date: string;
	genereLe: string;
	dureeMs: number;
	cycle: {
		id: number;
		statut: string;
		dureeMs: number;
		sourcesOk: number;
		sourcesError: number;
		itemsIn: number;
		itemsNew: number;
	};
	collecte: { tentatives: number; reussis: number; echecs: number };
	evenements: number;
	nouvellesOrganisations: number;
	campagnesActives: number;
	alertes: { duJour: number; ouvertes: number };
	incidents: { nouveaux: number; alertesDetectees: number };
	confiance: { evenementsNotes: number; rattachementsNotes: number; faits: number };
	detection: { evenements: number; indicateurs: number; alertes: number };
	campagnes: { ecrites: number; retirees: number; total: number };
	rapport: string | null;
};

export type OptionsVeille = OptionsCycle & {
	maintenant?: Date;
	/** Faux pour un test qui ne veut pas écrire de fichier. */
	ecrireRapport?: boolean;
	rapportDir?: string;
};

function debutJour(maintenant: Date): Date {
	const jour = new Date(maintenant);
	jour.setUTCHours(0, 0, 0, 0);
	return jour;
}

async function chargerEvenementsCampagnes(): Promise<EvenementCampagne[]> {
	const resultat = await query<{
		id: string;
		family: string;
		title: string;
		observed_at: Date | string | null;
		source_id: string;
		source_url: string | null;
		org_id: string | null;
		sector: string | null;
		evidence: unknown;
	}>(
		`SELECT e.id, e.family, e.title, e.observed_at, e.source_id, e.source_url,
		        e.org_id, o.sector, e.evidence
		   FROM event e LEFT JOIN org o ON o.id = e.org_id
		  ORDER BY e.observed_at NULLS LAST, e.id`,
	);
	return resultat.rows.map((ligne) => ({
		id: Number(ligne.id),
		family: ligne.family,
		title: ligne.title,
		observedAt: ligne.observed_at instanceof Date ? ligne.observed_at.toISOString() : ligne.observed_at,
		sourceId: ligne.source_id,
		sourceUrl: ligne.source_url,
		orgId: ligne.org_id === null ? null : Number(ligne.org_id),
		sector: ligne.sector,
		evidence: typeof ligne.evidence === "object" && ligne.evidence !== null && !Array.isArray(ligne.evidence)
			? (ligne.evidence as Record<string, unknown>)
			: {},
	}));
}

async function lireCompteurs(jour: Date): Promise<{
	evenements: number;
	nouvellesOrganisations: number;
	campagnesActives: number;
	alertesDuJour: number;
	alertesOuvertes: number;
}> {
	const r = await query<Record<string, string>>(
		`SELECT
		   (SELECT count(*) FROM event WHERE collected_at >= $1)::text AS "evenements",
		   (SELECT count(*) FROM org WHERE created_at >= $1)::text AS "nouvellesOrganisations",
		   (SELECT count(*) FROM campaign WHERE fin >= now() - interval '7 days')::text AS "campagnesActives",
		   (SELECT count(*) FROM alert WHERE created_at >= $1)::text AS "alertesDuJour",
		   (SELECT count(*) FROM alert WHERE status = 'open')::text AS "alertesOuvertes"`,
		[jour.toISOString()],
	);
	const ligne = r.rows[0] ?? {};
	return {
		evenements: Number(ligne.evenements ?? 0),
		nouvellesOrganisations: Number(ligne.nouvellesOrganisations ?? 0),
		campagnesActives: Number(ligne.campagnesActives ?? 0),
		alertesDuJour: Number(ligne.alertesDuJour ?? 0),
		alertesOuvertes: Number(ligne.alertesOuvertes ?? 0),
	};
}

/** Un passage complet : collecte, incidents, confiance, campagnes, résumé. */
export async function executerVeilleQuotidienne(
	options: OptionsVeille = {},
): Promise<ResumeQuotidien> {
	const log = options.log ?? (() => {});
	const maintenant = options.maintenant ?? new Date();
	const debut = performance.now();

	const { cycle } = await executerCycleCollecte({ ...options, maintenant });

	// Même rattachement que la boucle de l'API : sans lui, les événements
	// fraîchement admis n'ont pas d'organisation et aucune alerte n'atteint
	// le seuil de revue.
	await correlateEvents(log);
	// Le curseur de détection est relu depuis la base : un passage quotidien ne
	// dépend pas de l'état mémoire laissé par la boucle de l'API.
	resetDetectionCursors();
	const detection = await runDetectionPass();

	const evenements = await loadEvents();
	const jour = debutJour(maintenant);
	const idsDuJour = new Set(
		evenements.filter((e) => new Date(e.collectedAt).getTime() >= jour.getTime()).map((e) => e.id),
	);
	const batch = computeConfidence(evenements, maintenant, loadValidatedCorpus());
	await persistConfidence(batch);
	const incidentsNouveaux = batch.factScores.filter(
		(fait) => fait.incident && fait.eventIds.some((id) => idsDuJour.has(id)),
	).length;

	const analyse = analyserCampagnes(await chargerEvenementsCampagnes());
	const ecritures = await enregistrerCampagnes(analyse.campagnes);
	const compteurs = await lireCompteurs(jour);

	const resume: ResumeQuotidien = {
		date: maintenant.toISOString().slice(0, 10),
		genereLe: new Date().toISOString(),
		dureeMs: Math.round(performance.now() - debut),
		cycle: {
			id: Number(cycle.id),
			statut: cycle.statut,
			dureeMs: cycle.dureeMs,
			sourcesOk: cycle.sourcesOk,
			sourcesError: cycle.sourcesError,
			itemsIn: cycle.itemsIn,
			itemsNew: cycle.itemsNew,
		},
		collecte: {
			tentatives: cycle.sourcesOk + cycle.sourcesError,
			reussis: cycle.sourcesOk,
			echecs: cycle.sourcesError,
		},
		evenements: compteurs.evenements,
		nouvellesOrganisations: compteurs.nouvellesOrganisations,
		campagnesActives: compteurs.campagnesActives,
		alertes: { duJour: compteurs.alertesDuJour, ouvertes: compteurs.alertesOuvertes },
		incidents: { nouveaux: incidentsNouveaux, alertesDetectees: detection.alerts },
		confiance: {
			evenementsNotes: batch.events.length,
			rattachementsNotes: batch.attachments.length,
			faits: batch.facts.total,
		},
		detection: {
			evenements: detection.events,
			indicateurs: detection.indicators,
			alertes: detection.alerts,
		},
		campagnes: { ecrites: ecritures.ecrites, retirees: ecritures.retirees, total: analyse.campagnes.length },
		rapport: null,
	};

	if (options.ecrireRapport !== false) {
		const dossier = options.rapportDir ?? process.env.RADAR_VEILLE_OUT ?? "out";
		await mkdir(dossier, { recursive: true });
		const chemin = join(dossier, `veille-quotidienne-${resume.date}.json`);
		await writeFile(chemin, `${JSON.stringify(resume, null, 2)}\n`, "utf8");
		resume.rapport = chemin;
	}

	log(
		`veille ${resume.date} : ${resume.dureeMs} ms · ${resume.evenements} événement(s), ` +
		`${resume.nouvellesOrganisations} organisation(s) nouvelle(s), ` +
		`${resume.campagnesActives} campagne(s) active(s), ${resume.alertes.duJour} alerte(s) ` +
		`(${resume.incidents.nouveaux} incident(s) nouveau(x))`,
	);
	return resume;
}
