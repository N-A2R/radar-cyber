/**
 * Export STIX des objets partagés.
 *
 * Chaque objet passe par normalizeTrustTags() : TLP, PAP et Admiralty sont
 * normalisés une seule fois, puis portés à la fois dans le JSON STIX
 * (object_marking_refs, confidence numérique, extension x-radar-trust) et dans
 * les colonnes de `stix_object`.
 *
 * L'export est le périmètre public : seuls les faits TLP:CLEAR (normalisés
 * WHITE) produisent un objet. GREEN, AMBER et RED restent hors de l'export,
 * et un PAP:RED aussi. Un partenaire ne reçoit donc jamais un fait dont la
 * diffusion est restreinte, même si l'appelant lui passe toutes les lignes.
 * La liste blanche `export_public_event` (migration 200) est la seconde
 * barrière : `listPublicEvents()` ne lit que les événements qui y figurent.
 *
 * Seuls des champs structurels sont exportés (famille, type d'affirmation,
 * identifiant) : ni titre, résumé, evidence brute, ni nom de victime.
 */
import { createHash } from "node:crypto";
import { query } from "../db.js";
import {
	normalizeTrustTags,
	stixConfidence,
	UnknownTrustTagError,
	type Pap,
	type Tlp,
} from "./trust-tags.js";

export type StixEventRow = {
	id: number;
	dedup_key?: string | null;
	family: string;
	assertion_type: string;
	tlp?: string | null;
	confidence?: string | null;
	evidence?: Record<string, unknown> | null;
	created_at?: string | Date | null;
	valid_at?: string | Date | null;
	at?: string | Date | null;
	observed_at?: string | Date | null;
};

export type StixExport = {
	id: string;
	tlp: Tlp;
	pap: Pap;
	confidence: string;
	validFrom: string | Date;
	object: Record<string, unknown>;
	sourceEventId: number;
};

export type SqlQuery = (
	text: string,
	params?: unknown[],
) => Promise<{ rows: unknown[]; rowCount: number | null }>;

/**
 * Identifiant STIX déterministe, identique à celui de la migration
 * (`md5('event:' || dedup_key)::uuid`) : un événement repris par le backfill
 * puis réexporté met à jour la même ligne au lieu d'en créer une seconde.
 */
function stixUuid(namespace: string, value: string): string {
	const hex = createHash("md5").update(`${namespace}:${value}`).digest("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function evidenceTags(evidence: StixEventRow["evidence"]): Record<string, unknown> {
	return evidence && typeof evidence === "object" && !Array.isArray(evidence) ? evidence : {};
}

/** Construit un objet STIX, ou null pour un fait hors du périmètre public. */
export function buildStixObject(row: StixEventRow, modifieLe?: Date): StixExport | null {
	const evidence = evidenceTags(row.evidence);
	const tags = normalizeTrustTags({
		tlp: evidence.tlp ?? row.tlp,
		pap: evidence.pap,
		confidence: evidence.confidence ?? row.confidence,
	});
	if (tags.tlp !== "WHITE" || tags.pap === "RED") return null;

	const reference = row.dedup_key ?? String(row.id);
	const id = `indicator--${stixUuid("event", reference)}`;
	const date = row.created_at ?? new Date(0);
	// `at` = date d'apprentissage par le radar ; `valid_at` = date à laquelle
	// le fait est vrai. Les deux restent distincts dans l'objet exporté.
	const created = row.at ?? row.observed_at ?? date;
	const validFrom = row.valid_at ?? row.observed_at ?? created;
	const modifiedAt = modifieLe && modifieLe.getTime() > new Date(created).getTime()
		? modifieLe.toISOString()
		: new Date(created).toISOString();
	const tlpRef = `marking-definition--${stixUuid("tlp", tags.tlp)}`;
	const papRef = `marking-definition--${stixUuid("pap", tags.pap)}`;

	return {
		id,
		...tags,
		validFrom,
		sourceEventId: row.id,
		object: {
			type: "indicator",
			spec_version: "2.1",
			id,
			created,
			modified: modifiedAt,
			valid_from: validFrom,
			name: `${row.family} / ${row.assertion_type}`,
			pattern_type: "radar-event-id",
			pattern: `[x-radar:event-id = ${row.id}]`,
			object_marking_refs: [tlpRef, papRef],
			confidence: stixConfidence(tags.confidence),
			extensions: {
				"x-radar-trust": {
					tlp: tags.tlp,
					pap: tags.pap,
					confidence: tags.confidence,
				},
			},
		},
	};
}

export const UPSERT_STIX_OBJECT = `
  INSERT INTO stix_object (id, stix_type, tlp, pap, confidence, object, valid_from, source_event_id)
  VALUES ($1, 'indicator', $2, $3, $4, $5::jsonb, $6::timestamptz, $7)
  ON CONFLICT (id) DO UPDATE SET
    tlp = EXCLUDED.tlp,
    pap = EXCLUDED.pap,
    confidence = EXCLUDED.confidence,
    object = EXCLUDED.object,
    valid_from = EXCLUDED.valid_from,
    source_event_id = EXCLUDED.source_event_id,
    exported_at = now()
`;

/**
 * Lignes du seul périmètre public : la liste blanche `export_public_event`
 * (migration 200). Lire autre chose que cette liste serait un export inattentif.
 */
export const PUBLIC_EVENTS_SQL = `
  SELECT e.id, e.dedup_key, e.family, e.assertion_type, e.tlp, e.confidence, e.evidence,
         e.created_at, e.valid_at, e.at, e.observed_at
    FROM event e
    JOIN export_public_event x ON x.event_id = e.id
   ORDER BY e.id
`;

export async function listPublicEvents(sql: SqlQuery = query): Promise<StixEventRow[]> {
	const r = await sql(PUBLIC_EVENTS_SQL);
	return r.rows as StixEventRow[];
}

/**
 * Écrit les objets exportables ; renvoie les comptes, sans rien taire.
 *
 * Un tag explicite inconnu n'est jamais deviné : la ligne est rejetée et
 * comptée dans `rejected`, les lignes valides du même lot sont quand même
 * exportées. Une seule preuve mal taguée ne bloque donc pas tout l'export,
 * mais elle n'entre jamais dans `stix_object` — la base le refuserait aussi.
 */
export async function persistStixObjects(
	rows: readonly StixEventRow[],
	sql: SqlQuery = query,
	options: { modifieLe?: Date } = {},
): Promise<{ exported: number; skipped: number; rejected: number }> {
	const modifieLe = options.modifieLe ?? new Date();
	let exported = 0;
	let skipped = 0;
	let rejected = 0;
	for (const row of rows) {
		let built: StixExport | null;
		try {
			built = buildStixObject(row, modifieLe);
		} catch (error) {
			if (error instanceof UnknownTrustTagError) {
				rejected++;
				continue;
			}
			throw error;
		}
		if (!built) {
			skipped++;
			continue;
		}
		await sql(UPSERT_STIX_OBJECT, [
			built.id,
			built.tlp,
			built.pap,
			built.confidence,
			JSON.stringify(built.object),
			built.validFrom,
			built.sourceEventId,
		]);
		exported++;
	}
	return { exported, skipped, rejected };
}
