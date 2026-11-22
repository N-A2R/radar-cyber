/**
 * Export STIX des objets partagés.
 *
 * Chaque objet passe par normalizeTrustTags() : TLP, PAP et Admiralty sont
 * normalisés une seule fois, puis portés à la fois dans le JSON STIX
 * (object_marking_refs, confidence numérique, extension x-radar-trust) et dans
 * les colonnes de `stix_object`. TLP:RED et PAP:RED ne sont pas exportés :
 * ils restent en quarantaine, conformément à la règle du produit — un objet
 * marqué « ne pas diffuser » ne peut pas figurer dans un export.
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
};

export type StixExport = {
	id: string;
	tlp: Tlp;
	pap: Pap;
	confidence: string;
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

/** Construit un objet STIX, ou null pour un fait TLP:RED / PAP:RED non publiable. */
export function buildStixObject(row: StixEventRow): StixExport | null {
	const evidence = evidenceTags(row.evidence);
	const tags = normalizeTrustTags({
		tlp: evidence.tlp ?? row.tlp,
		pap: evidence.pap,
		confidence: evidence.confidence ?? row.confidence,
	});
	if (tags.tlp === "RED" || tags.pap === "RED") return null;

	const reference = row.dedup_key ?? String(row.id);
	const id = `indicator--${stixUuid("event", reference)}`;
	const date = row.created_at ?? new Date(0);
	const tlpRef = `marking-definition--${stixUuid("tlp", tags.tlp)}`;
	const papRef = `marking-definition--${stixUuid("pap", tags.pap)}`;

	return {
		id,
		...tags,
		sourceEventId: row.id,
		object: {
			type: "indicator",
			spec_version: "2.1",
			id,
			created: date,
			modified: date,
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
  INSERT INTO stix_object (id, stix_type, tlp, pap, confidence, object, source_event_id)
  VALUES ($1, 'indicator', $2, $3, $4, $5::jsonb, $6)
  ON CONFLICT (id) DO UPDATE SET
    tlp = EXCLUDED.tlp,
    pap = EXCLUDED.pap,
    confidence = EXCLUDED.confidence,
    object = EXCLUDED.object,
    source_event_id = EXCLUDED.source_event_id,
    exported_at = now()
`;

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
): Promise<{ exported: number; skipped: number; rejected: number }> {
	let exported = 0;
	let skipped = 0;
	let rejected = 0;
	for (const row of rows) {
		let built: StixExport | null;
		try {
			built = buildStixObject(row);
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
			built.sourceEventId,
		]);
		exported++;
	}
	return { exported, skipped, rejected };
}
