/**
 * Moteur de couverture — confrontation du corpus versionné à la base réelle.
 *
 * Un incident est « vu » lorsqu'un événement du radar lui correspond et porte
 * un `org_id` : un texte collecté mais non rattaché n'est pas un incident vu.
 * Chaque verdict est accompagné des trois requêtes SQL exécutées pour l'obtenir
 * (correspondance, preuve de collecte, filtre cyber) et de leurs paramètres :
 * aucun motif n'est affirmé sans preuve rejouable.
 *
 * Le moteur est déterministe : ni date courante, ni accès réseau, ni ordre
 * aléatoire.À base et corpus égaux, le rapport est octet pour octet identique.
 */
import { createHash } from "node:crypto";
import { query as queryBase } from "../db.js";
import { classifyFamily, type Family } from "../collectors/classify.js";
import {
	consoliderCorpus,
	type CorpusConsolide,
	type IncidentCorpus,
} from "./corpus-couverture.js";

/** Requête exécutable sur un pool PG ; garde l'injection possible pour les tests. */
export type ExecuteurSQL = <T = any>(texte: string, params?: unknown[]) => Promise<{ rows: T[] }>;

export type Motif = "vu" | "pas_collecte" | "pas_rattache" | "pas_juge_cyber" | "indetermine";

export type LigneCouverture = { vus: number; total: number; taux: number };

/** Normalisation SQL identique à celle appliquée aux paramètres côté TS. */
const SQL_URL = (colonne: string): string =>
	`regexp_replace(regexp_replace(regexp_replace(lower(${colonne}), '^https?://(www\\.)?', ''), '[?#].*$', ''), '/+$', '')`;
const SQL_TEXTE = (colonne: string): string =>
	`trim(regexp_replace(unaccent(lower(${colonne})), '[^a-z0-9]+', ' ', 'g'))`;

/** 1. Existe-t-il un événement correspondant ? (event + archives, avec org_id). */
export const SQL_EVENEMENTS = `
WITH demande AS (SELECT $1::text AS url, $2::text AS titre, $3::text AS org, $4::date AS jour),
tout AS (
	SELECT 'event' AS table_source, e.id::text AS id, e.org_id, NULL::text AS org_name,
	       e.family, e.source_id, e.source_url, e.title, e.observed_at, e.collected_at
	  FROM event e
	UNION ALL
	SELECT 'event_archive' AS table_source, a.id::text AS id, a.org_id, a.org_name,
	       a.family, a.source_id, a.source_url, NULL::text AS title, a.observed_at, a.collected_at
	  FROM event_archive a
)
SELECT t.table_source, t.id, t.org_id, t.org_name, t.family, t.source_id,
       t.source_url, t.title, t.observed_at, t.collected_at
  FROM tout t CROSS JOIN demande d
 WHERE (t.source_url IS NOT NULL AND ${SQL_URL("t.source_url")} = d.url)
    OR (t.title IS NOT NULL AND ${SQL_TEXTE("t.title")} = d.titre AND t.observed_at::date = d.jour)
    OR (t.org_name IS NOT NULL AND ${SQL_TEXTE("t.org_name")} = d.org AND t.observed_at::date = d.jour)
 ORDER BY t.collected_at ASC
 LIMIT 100`.trim();

/** 2. Le média était-il déclaré et collecté le jour de publication ? */
export const SQL_COLLECTE = `
WITH demande AS (SELECT $1::text AS host, $2::text AS media, $3::date AS jour),
sources AS (
	SELECT s.* FROM source s CROSS JOIN demande d
	 WHERE (d.host <> '' AND position(d.host in lower(coalesce(s.url, ''))) > 0)
	    OR (d.media <> '' AND (
	          position(d.media in ${SQL_TEXTE("s.name")}) > 0
	       OR position(${SQL_TEXTE("s.name")} in d.media) > 0))
)
SELECT s.id, s.name, s.family, s.url, s.enabled, s.last_ok_at,
       (SELECT count(*)::int FROM collector_run r
         WHERE r.source_id = s.id AND r.started_at::date = d.jour) AS executions_du_jour,
       (SELECT count(*)::int FROM event e
         WHERE e.source_id = s.id AND e.collected_at::date = d.jour) AS evenements_du_jour,
       (SELECT max(r.started_at) FROM collector_run r WHERE r.source_id = s.id) AS derniere_execution
  FROM sources s CROSS JOIN demande d
 ORDER BY s.id`.trim();

/** 3. Que la collecte du média a-t-elle produit autour de la publication ? */
export const SQL_FILTRE = `
WITH demande AS (SELECT $1::date AS jour)
SELECT coalesce(e.family, '(aucune)') AS famille, count(*)::int AS evenements
  FROM event e CROSS JOIN demande d
 WHERE e.source_id = ANY($2::text[])
   AND e.collected_at::date BETWEEN d.jour - INTERVAL '7 days' AND d.jour + INTERVAL '7 days'
 GROUP BY 1 ORDER BY 2 DESC, 1`.trim();

/** État de la base auquel se rapporte la mesure (aucune date murale). */
export const SQL_ETAT_BASE = `
SELECT (SELECT max(collected_at)::date FROM event) AS derniere_collecte,
       (SELECT max(started_at)::date FROM collector_run) AS derniere_execution,
       (SELECT count(*)::int FROM event) AS evenements,
       (SELECT count(*)::int FROM event_archive) AS evenements_archives,
       (SELECT count(*)::int FROM source) AS sources,
       (SELECT count(*)::text FROM org) AS organisations`.trim();

type EvenementRow = {
	table_source: "event" | "event_archive";
	id: string;
	org_id: number | null;
	org_name: string | null;
	family: string;
	source_id: string;
	source_url: string | null;
	title: string | null;
	observed_at: Date | string | null;
	collected_at: Date | string;
};

type SourceRow = {
	id: string;
	name: string;
	family: string;
	url: string | null;
	enabled: boolean;
	last_ok_at: Date | string | null;
	executions_du_jour: number;
	evenements_du_jour: number;
	derniere_execution: Date | string | null;
};

type FiltreRow = { famille: string; evenements: number };
type EtatBaseRow = {
	derniere_collecte: string | null;
	derniere_execution: string | null;
	evenements: number;
	evenements_archives: number;
	sources: number;
	organisations: string;
};

export type RequetePreuve = { sql: string; params: unknown[] };

export type PreuveIncident = {
	id: string;
	organisation: string;
	datePublication: string;
	departement: string | null;
	type: string | null;
	source: string | null;
	url: string;
	vu: boolean;
	motif: Motif;
	/** Heures entre la publication et la première collecte ; null si non vu. */
	delaiHeures: number | null;
	premiereCollecte: string | null;
	correspondance: {
		table: string;
		id: string;
		orgId: number | null;
		regle: "url" | "titre" | "organisation";
		collecteLe: string;
	} | null;
	sources: Array<{
		id: string;
		nom: string;
		famille: string;
		executionsDuJour: number;
		evenementsDuJour: number;
	}>;
	collecteeCeJour: boolean;
	familleSortie: string | null;
	filtreRefuse: boolean | null;
	famillesProduites: FiltreRow[];
	preuve: string;
	requetes: {
		evenements: RequetePreuve;
		collecte: RequetePreuve;
		filtre: RequetePreuve;
	};
};

export type RapportCouverture = {
	dateCalcul: string;
	hashCorpus: string;
	fenetre: { debut: string; fin: string };
	sequenceCorpus: string;
	base: EtatBaseRow & { empreinte: string };
	global: LigneCouverture;
	parMotif: Array<{ motif: Motif; incidents: number; part: number }>;
	parDepartement: Array<LigneCouverture & { departement: string }>;
	parType: Array<LigneCouverture & { type: string }>;
	parMois: Array<LigneCouverture & { mois: string }>;
	delaiMedianHeures: number | null;
	incidents: PreuveIncident[];
	method: {
		vu: string;
		priorite: Motif[];
		delai: string;
		collecte: string;
		correspondance: string;
		filtreCyber: string;
	};
};

const MOTIFS: Motif[] = ["vu", "pas_collecte", "pas_rattache", "pas_juge_cyber", "indetermine"];

export function tauxPourcent(vus: number, total: number): number {
	return total === 0 ? 0 : Math.round((vus / total) * 1000) / 10;
}

/** Normalisation TS calquée sur SQL_URL / SQL_TEXTE (les paramètres sont pré-normalisés). */
export function normaliserUrl(valeur: string): string {
	return valeur
		.toLowerCase()
		.replace(/^https?:\/\/(www\.)?/, "")
		.replace(/[?#].*$/, "")
		.replace(/\/+$/, "");
}

export function normaliserTexte(valeur: string): string {
	return valeur
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function horodatage(valeur: unknown): string | null {
	if (valeur === null || valeur === undefined) return null;
	return valeur instanceof Date ? valeur.toISOString() : String(valeur);
}

function jourLocal(valeur: unknown): string | null {
	if (valeur === null || valeur === undefined) return null;
	if (valeur instanceof Date) {
		return `${valeur.getFullYear()}-${String(valeur.getMonth() + 1).padStart(2, "0")}-${String(valeur.getDate()).padStart(2, "0")}`;
	}
	return String(valeur).slice(0, 10);
}

function host(valeur: string): string {
	try {
		return new URL(valeur).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return "";
	}
}

function regleCorrespondance(ligne: EvenementRow, url: string, titre: string, org: string): "url" | "titre" | "organisation" {
	if (ligne.source_url && normaliserUrl(ligne.source_url) === url) return "url";
	if (ligne.title && normaliserTexte(ligne.title) === titre) return "titre";
	return "organisation";
}

function decomposer<T extends LigneCouverture>(
	incidents: readonly IncidentCorpus[],
	verdicts: ReadonlyMap<string, PreuveIncident>,
	cle: (incident: IncidentCorpus) => string | null,
	fabrique: (nom: string, ligne: LigneCouverture) => T,
): T[] {
	const groupes = new Map<string, { vus: number; total: number }>();
	for (const incident of incidents) {
		const nom = cle(incident) ?? "non renseigné";
		const ligne = groupes.get(nom) ?? { vus: 0, total: 0 };
		ligne.total += 1;
		if (verdicts.get(incident.id)?.vu) ligne.vus += 1;
		groupes.set(nom, ligne);
	}
	return [...groupes.entries()]
		.sort(([a], [b]) => a.localeCompare(b, "fr"))
		.map(([nom, ligne]) => fabrique(nom, { ...ligne, taux: tauxPourcent(ligne.vus, ligne.total) }));
}

function mediane(valeurs: readonly number[]): number | null {
	if (valeurs.length === 0) return null;
	const triees = [...valeurs].sort((a, b) => a - b);
	const milieu = Math.floor(triees.length / 2);
	return triees.length % 2 === 1
		? triees[milieu]
		: Math.round(((triees[milieu - 1] + triees[milieu]) / 2) * 10) / 10;
}

/** Calcule le taux et ses preuves. `query` permet de rejouer la mesure sur un autre pool. */
export async function mesurerCouverture(options?: {
	corpus?: CorpusConsolide;
	query?: ExecuteurSQL;
}): Promise<RapportCouverture> {
	const sql = options?.query ?? (queryBase as ExecuteurSQL);
	const corpus = options?.corpus ?? consoliderCorpus();
	const etatBrut = (await sql<EtatBaseRow>(SQL_ETAT_BASE)).rows[0];
	const etat: EtatBaseRow = etatBrut
		? {
				...etatBrut,
				derniere_collecte: jourLocal(etatBrut.derniere_collecte),
				derniere_execution: jourLocal(etatBrut.derniere_execution),
			}
		: {
				derniere_collecte: null,
				derniere_execution: null,
				evenements: 0,
				evenements_archives: 0,
				sources: 0,
				organisations: "0",
			};
	const empreinteBase = createHash("sha256").update(JSON.stringify(etatBrut ?? null)).digest("hex");

	const incidents: PreuveIncident[] = [];
	for (const incident of corpus.incidents) {
		const url = normaliserUrl(incident.url);
		const titre = normaliserTexte(incident.titre);
		const org = normaliserTexte(incident.organisation);
		const paramsEvenements = [url, titre, org, incident.date_publication];
		const paramsCollecte = [host(incident.url), normaliserTexte(incident.source ?? ""), incident.date_publication];
		const [evenements, sources] = await Promise.all([
			sql<EvenementRow>(SQL_EVENEMENTS, paramsEvenements),
			sql<SourceRow>(SQL_COLLECTE, paramsCollecte),
		]);

		const sourceReference = sources.rows[0] ?? null;
		const paramsFiltre = [incident.date_publication, sources.rows.map((s) => s.id)];
		const filtres = sourceReference ? (await sql<FiltreRow>(SQL_FILTRE, paramsFiltre)).rows : [];

		const correspondance = evenements.rows.find((e) => e.org_id !== null) ?? evenements.rows[0] ?? null;
		const avecOrg = correspondance !== null && correspondance.org_id !== null;
		const sansOrg = correspondance !== null && correspondance.org_id === null;
		const collecteeCeJour = sources.rows.some(
			(s) =>
				s.executions_du_jour > 0 ||
				s.evenements_du_jour > 0 ||
				jourLocal(s.last_ok_at) === incident.date_publication,
		);
		const familleSortie = sourceReference
			? classifyFamily({
					title: incident.titre,
					summary: incident.resume,
					sourceFamily: sourceReference.family as Family,
					sourceName: sourceReference.name,
				})
			: null;
		const filtreRefuse = familleSortie === null ? null : familleSortie === "presse";
		let motif: Motif;
		if (avecOrg) motif = "vu";
		else if (sansOrg) motif = "pas_rattache";
		else if (collecteeCeJour && filtreRefuse === true) motif = "pas_juge_cyber";
		else if (!collecteeCeJour) motif = "pas_collecte";
		else motif = "indetermine";

		const collecteLe = correspondance ? horodatage(correspondance.collected_at) : null;
		const delaiHeures =
			collecteLe === null
				? null
				: Math.round(
						((Date.parse(collecteLe) - Date.parse(`${incident.date_publication}T00:00:00Z`)) /
							3_600_000) *
							10,
					) / 10;

		const correspondancePublique = correspondance
			? {
					table: correspondance.table_source,
					id: correspondance.id,
					orgId: correspondance.org_id,
					regle: regleCorrespondance(correspondance, url, titre, org),
					collecteLe: collecteLe ?? "",
				}
			: null;

		const preuve =
			motif === "vu"
				? `événement ${correspondancePublique?.table}#${correspondancePublique?.id} rattaché à org_id ${correspondance?.org_id}`
				: motif === "pas_rattache"
					? `événement ${correspondancePublique?.table}#${correspondancePublique?.id} sans org_id`
					: motif === "pas_juge_cyber"
						? `${sourceReference?.name} collecté le ${incident.date_publication}, filtre ${sourceReference?.family} → ${familleSortie}`
						: motif === "pas_collecte"
							? sourceReference === null
								? "média absent de la table source"
								: `aucune collecte le ${incident.date_publication} pour ${sourceReference.name}`
							: `collecté le ${incident.date_publication}, aucune correspondance retenue`;

		incidents.push({
			id: incident.id,
			organisation: incident.organisation,
			datePublication: incident.date_publication,
			departement: incident.departement,
			type: incident.type,
			source: incident.source,
			url: incident.url,
			vu: avecOrg,
			motif,
			delaiHeures,
			premiereCollecte: collecteLe,
			correspondance: correspondancePublique,
			sources: sources.rows.map((s) => ({
				id: s.id,
				nom: s.name,
				famille: s.family,
				executionsDuJour: s.executions_du_jour,
				evenementsDuJour: s.evenements_du_jour,
			})),
			collecteeCeJour,
			familleSortie,
			filtreRefuse,
			famillesProduites: filtres,
			preuve,
			requetes: {
				evenements: { sql: SQL_EVENEMENTS, params: paramsEvenements },
				collecte: { sql: SQL_COLLECTE, params: paramsCollecte },
				filtre: { sql: SQL_FILTRE, params: paramsFiltre },
			},
		});
	}

	const vus = incidents.filter((i) => i.vu).length;
	const total = incidents.length;
	const parMotif = MOTIFS.map((motif) => {
		const nb = incidents.filter((i) => i.motif === motif).length;
		return { motif, incidents: nb, part: tauxPourcent(nb, total) };
	});
	const verdicts = new Map(incidents.map((i) => [i.id, i]));
	const dates = corpus.incidents.map((i) => i.date_publication).sort();

	return {
		dateCalcul: etat?.derniere_collecte ?? etat?.derniere_execution ?? "inconnue",
		hashCorpus: corpus.sha256,
		fenetre: { debut: dates[0], fin: dates[dates.length - 1] },
		sequenceCorpus: corpus.doublons.length === 0 ? "stable" : `doublons ignorés : ${corpus.doublons.join(", ")}`,
		base: { ...etat, empreinte: empreinteBase },
		global: { vus, total, taux: tauxPourcent(vus, total) },
		parMotif,
		parDepartement: decomposer(
			corpus.incidents,
			verdicts,
			(i) => i.departement,
			(departement, ligne) => ({ departement, ...ligne }),
		),
		parType: decomposer(
			corpus.incidents,
			verdicts,
			(i) => i.type,
			(type, ligne) => ({ type, ...ligne }),
		),
		parMois: decomposer(
			corpus.incidents,
			verdicts,
			(i) => i.date_publication.slice(0, 7),
			(mois, ligne) => ({ mois, ...ligne }),
		),
		delaiMedianHeures: mediane(incidents.flatMap((i) => (i.delaiHeures === null ? [] : [i.delaiHeures]))),
		incidents,
		method: {
			vu: "un événement de event ou event_archive correspond à l'incident et porte un org_id non nul",
			priorite: MOTIFS,
			delai: "heures entre la publication (00:00 UTC) et collected_at du premier événement correspondant",
			collecte: "collector_run ou event le jour de publication pour le média déclaré, ou last_ok_at ce jour",
			correspondance: "URL normalisée identique, ou titre normalisé identique le jour de publication, ou organisation normalisée le jour de publication",
			filtreCyber: "classifyFamily() du collecteur : une sortie 'presse' est refusée à l'admission",
		},
	};
}
