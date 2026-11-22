/**
 * Export MISP des signaux de veille.
 *
 * Le partenaire importe le flux dans son propre MISP : la réponse suit le
 * format « MISP core format » (`draft-dulaunoy-misp-core-format`, Event avec
 * Orgc, Attribute et Tag) et l'enveloppe `{"response": [...]}` de l'API de
 * recherche MISP.
 *
 * Politique de diffusion : seuls les faits TLP:CLEAR et TLP:GREEN sortent.
 * TLP:AMBER, TLP:RED et tout tag inconnu sont écartés — ni dans le JSON, ni
 * dans un attribut. Le compte des faits écartés est journalisé dans
 * `export_run` avec le SHA-256 du corps exact, pour qu'un partenaire puisse
 * prouver ce qu'il a reçu.
 *
 * Aucune donnée personnelle n'est ajoutée : le flux reprend le titre public
 * de l'événement et ses métadonnées structurelles (famille, type, source,
 * portée régionale). L'organisation émettrice est l'observatoire, jamais une
 * source nationale présentée comme locale.
 */
import { createHash } from "node:crypto";
import { query } from "../db.js";
import {
	normalizeTrustTags,
	UnknownTrustTagError,
	type Tlp,
} from "./trust-tags.js";

export type MispEventRow = {
	id: number;
	dedup_key?: string | null;
	family: string;
	assertion_type: string;
	title: string;
	summary?: string | null;
	observed_at?: string | Date | null;
	valid_at?: string | Date | null;
	at?: string | Date | null;
	collected_at?: string | Date | null;
	created_at?: string | Date | null;
	severity?: number | null;
	confidence?: string | null;
	source_id: string;
	source_url?: string | null;
	evidence?: Record<string, unknown> | null;
	regional?: boolean | null;
	tlp?: string | null;
};

export type MispExportOptions = {
	limit?: number;
	since?: Date | null;
	source?: string | null;
	regional?: boolean | null;
};

export type MispExportRun = {
	id: number;
	sha256: string;
	eventCount: number;
	excludedCount: number;
	payloadBytes: number;
};

export type MispExportResult = {
	body: string;
	payload: { response: Array<{ Event: Record<string, unknown> }> };
	run: MispExportRun;
};

export const DEFAULT_MISP_LIMIT = 1000;
export const MAX_MISP_LIMIT = 5000;

/**
 * Faits dont la diffusion autorise la sortie. Les deux déclarations — colonne
 * et evidence — doivent être diffusable : un AMBER d'un côté ne peut pas être
 * masqué par un CLEAR de l'autre. Tout le reste est exclu.
 */
const DIFFUSABLE_SQL = `coalesce(public.tlp_canonical(e.tlp), 'CLEAR') IN ('CLEAR', 'WHITE', 'GREEN')
  AND coalesce(public.tlp_canonical(e.evidence->>'tlp'), 'CLEAR') IN ('CLEAR', 'WHITE', 'GREEN')`;
const OCCURRED_SQL = `coalesce(e.observed_at, e.valid_at, e.at, e.created_at)`;
const FILTER_SQL = `($1::timestamptz IS NULL OR ${OCCURRED_SQL} >= $1)
  AND ($2::text IS NULL OR e.source_id = $2)
  AND ($3::boolean IS NULL OR e.regional = $3)`;

const ORG = {
	id: "1",
	name: "Radar Cyber — Observatoire régional Nouvelle-Aquitaine",
	uuid: "6f1c1a2e-3b4c-4d5e-8f90-123456789abc",
} as const;

function uuidDeterministe(namespace: string, valeur: string): string {
	const h = createHash("sha256").update(`${namespace}:${valeur}`).digest("hex");
	const variante = ((Number.parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function dateEvenement(row: MispEventRow): Date {
	const brut = row.observed_at ?? row.valid_at ?? row.at ?? row.created_at ?? row.collected_at;
	if (brut === null || brut === undefined) return new Date(0);
	const date = brut instanceof Date ? brut : new Date(String(brut));
	return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function horodatage(date: Date): string {
	return String(Math.floor(date.getTime() / 1000));
}

/** Texte MISP : une ligne, borné, jamais vide. */
function texteMisp(brut: unknown, max: number, defaut: string): string {
	const valeur = typeof brut === "string" ? brut.replace(/\s+/g, " ").trim() : "";
	return Array.from(valeur || defaut).slice(0, max).join("");
}

function niveauMenace(severity: number | null | undefined): string {
	if (severity === 4 || severity === 5) return "1"; // haut
	if (severity === 3) return "2"; // moyen
	if (severity === 1 || severity === 2) return "3"; // bas
	return "4"; // indéfini
}

function niveauAnalyse(assertionType: string): string {
	if (assertionType === "confirmed_incident" || assertionType === "technical_indicator") return "2";
	if (assertionType === "third_party_claim") return "1";
	return "0";
}

function distributionEvenement(tlp: Tlp): string {
	// GREEN reste réservé à la communauté ; CLEAR va à toutes les communautés.
	return tlp === "GREEN" ? "2" : "3";
}

export type MispEvent = Record<string, unknown>;

/**
 * Construit un Event MISP, ou null si le fait n'est pas diffusable.
 * La fonction est pure : le test peut la vérifier sans base.
 */
export function buildMispEvent(row: MispEventRow): MispEvent | null {
	const evidence = row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence)
		? row.evidence
		: {};
	let tlp: Tlp;
	let pap: string;
	let confidence: string;
	try {
		const tags = normalizeTrustTags({
			tlp: evidence.tlp ?? row.tlp,
			pap: evidence.pap,
			confidence: evidence.confidence ?? row.confidence,
		});
		tlp = tags.tlp;
		pap = tags.pap;
		confidence = tags.confidence;
	} catch (error) {
		if (error instanceof UnknownTrustTagError) return null;
		throw error;
	}
	if (tlp !== "WHITE" && tlp !== "GREEN") return null;

	const date = dateEvenement(row);
	const timestamp = horodatage(date);
	const reference = row.dedup_key ?? String(row.id);
	const eventId = String(row.id);
	const uuid = uuidDeterministe("misp-event", reference);
	const valeur = texteMisp(row.title, 255, `Signal régional #${row.id}`);
	const info = texteMisp(`[RADAR] ${valeur}`, 255, `Signal régional #${row.id}`);
	const portee = row.regional === true ? "regional" : "non-regional";
	const nomTlp = tlp === "GREEN" ? "tlp:green" : "tlp:clear";

	const tags = [
		`${nomTlp}`,
		`radar:family=${row.family}`,
		`radar:assertion=${row.assertion_type}`,
		`radar:scope=${portee}`,
		`radar:source=${row.source_id}`,
	];
	if (pap !== "WHITE") tags.push(`pap:${pap.toLowerCase()}`);
	if (confidence !== "F6") tags.push(`admiralty:${confidence.toLowerCase()}`);
	const Tag = [...new Set(tags)].map((name) => ({ name, colour: "#ffffff", exportable: true }));

	return {
		id: eventId,
		uuid,
		info,
		date: date.toISOString().slice(0, 10),
		timestamp,
		publish_timestamp: timestamp,
		first_publication: timestamp,
		published: true,
		threat_level_id: niveauMenace(row.severity),
		analysis: niveauAnalyse(row.assertion_type),
		distribution: distributionEvenement(tlp),
		sharing_group_id: "0",
		org_id: ORG.id,
		orgc_id: ORG.id,
		attribute_count: "1",
		locked: false,
		Org: ORG,
		Orgc: ORG,
		Attribute: [
			{
				id: "1",
				event_id: eventId,
				uuid: uuidDeterministe("misp-attribute", `${reference}:1`),
				type: "text",
				category: "Other",
				to_ids: false,
				distribution: "5",
				sharing_group_id: "0",
				deleted: false,
				timestamp,
				value: valeur,
				comment: `RADAR ${row.family}/${row.assertion_type}; source=${row.source_id}; scope=${portee}`,
			},
		],
		Tag,
	};
}

function bornerLimit(limit: number | undefined): number {
	if (limit === undefined) return DEFAULT_MISP_LIMIT;
	if (!Number.isFinite(limit)) return DEFAULT_MISP_LIMIT;
	return Math.min(Math.max(Math.trunc(limit), 1), MAX_MISP_LIMIT);
}

/**
 * Lit les faits diffusables, construit le flux et journalise l'export.
 * Une ligne `export_run` par appel réussi, avec le hash du corps exact.
 */
export async function exportMisp(options: MispExportOptions = {}): Promise<MispExportResult> {
	const limit = bornerLimit(options.limit);
	const since = options.since ?? null;
	const source = options.source?.trim() || null;
	const regional = options.regional ?? null;
	const params = [since, source, regional, limit];

	const lignes = await query<MispEventRow>(
		`SELECT e.id, e.dedup_key, e.family, e.assertion_type, e.title, e.summary,
		        e.observed_at, e.valid_at, e.at, e.collected_at, e.created_at,
		        e.severity, e.confidence, e.source_id, e.source_url, e.evidence,
		        e.regional, e.tlp
		   FROM public.event e
		  WHERE ${DIFFUSABLE_SQL}
		    AND ${FILTER_SQL}
		  ORDER BY ${OCCURRED_SQL} DESC, e.id DESC
		  LIMIT $4`,
		params,
	);

	const evenements = lignes.rows
		.map(buildMispEvent)
		.filter((event): event is MispEvent => event !== null);

	const exclus = await query<{ n: number }>(
		`SELECT count(*)::int AS n
		   FROM public.event e
		  WHERE NOT (${DIFFUSABLE_SQL})
		    AND ${FILTER_SQL}`,
		[since, source, regional],
	);

	// Un fait que le SQL croyait diffusable mais que le normaliseur rejette
	// (tag inconnu) est un fait écarté, jamais un succès silencieux.
	const excludedCount = Number(exclus.rows[0]?.n ?? 0) + (lignes.rows.length - evenements.length);
	const payload = { response: evenements.map((Event) => ({ Event })) };
	const body = JSON.stringify(payload);
	const sha256 = createHash("sha256").update(body, "utf8").digest("hex");
	const payloadBytes = Buffer.byteLength(body, "utf8");
	const filters = { limit, since: since?.toISOString() ?? null, source, regional };

	const run = await query<{ id: number }>(
		`INSERT INTO public.export_run
		   (format, sha256, event_count, excluded_count, payload_bytes, filters)
		 VALUES ('misp', $1, $2, $3, $4, $5::jsonb)
		 RETURNING id`,
		[sha256, evenements.length, excludedCount, payloadBytes, JSON.stringify(filters)],
	);

	return {
		body,
		payload,
		run: {
			id: Number(run.rows[0]!.id),
			sha256,
			eventCount: evenements.length,
			excludedCount,
			payloadBytes,
		},
	};
}
