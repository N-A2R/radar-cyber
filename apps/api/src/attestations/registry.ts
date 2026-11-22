/**
 * Générateur du registre des absences.
 *
 * La requête d'absence est ensembliste : pour chaque organisation confirmée
 * et active, on interroge le magasin `event` sur la fenêtre demandée. Une ligne
 * n'est écrite que si ZÉRO événement n'est rattaché à l'organisation. Le sceau
 * est calculé en code (negative.ts) avant l'insertion, jamais en SQL.
 *
 * Ce que la requête ne voit pas, et qu'il ne faut donc pas prétendre :
 *   * un événement sans organisation rattachée, ou rattaché à une autre
 *     entité (homonyme, établissement parent) reste hors du périmètre ;
 *   * une panne de collecte sur une source active ressemble à une absence :
 *     `source_digest` + `sources_checked` disent ce qui a été interrogé, pas
 *     si la collecte était fraîche. La fraîcheur se lit dans `source`.
 */
import { query } from "../db.js";
import {
	MIN_SOURCES_CHECKED,
	NEGATIVE_ATTESTATION_METHOD,
	normalizeAttestationWindow,
	sealNegativeAttestation,
	sourceScopeDigest,
	type SignatureMethod,
} from "./negative.js";

const INSERT_BATCH = 400;

export type GenerateNegativeAttestationsOptions = {
	windowStart: Date | string;
	windowEnd: Date | string;
	/** Clé HMAC. Absente : sceau d'intégrité sha256, rejouable sans secret. */
	key?: string | null;
	dryRun?: boolean;
	/** Borne de sécurité pour les très grosses bases / mesures ciblées. */
	limit?: number | null;
};

export type NegativeAttestationReport = {
	windowStart: string;
	windowEnd: string;
	sourcesChecked: number;
	sourceDigest: string;
	method: string;
	dryRun: boolean;
	signatureMethod: SignatureMethod | null;
	/** Organisations confirmées et actives examinées. */
	organizations: number;
	/** Celles sans aucun événement sur la fenêtre. */
	absences: number;
	/** Lignes réellement insérées ou rafraîchies (0 en dry-run). */
	written: number;
	sample: Array<{
		orgSlug: string;
		orgName: string;
		sourcesChecked: number;
		signatureMethod: SignatureMethod;
	}>;
};

type Candidate = {
	id: number;
	slug: string;
	name: string;
	entity_source: string | null;
	entity_code: string | null;
};

export async function generateNegativeAttestations(
	options: GenerateNegativeAttestationsOptions,
): Promise<NegativeAttestationReport> {
	const { windowStart, windowEnd } = normalizeAttestationWindow(options.windowStart, options.windowEnd);
	const dryRun = options.dryRun ?? false;
	const key = options.key ?? process.env.RADAR_ATTESTATION_KEY ?? null;

	const sources = await query<{ id: string }>("SELECT id FROM source WHERE enabled ORDER BY id");
	const sourceIds = sources.rows.map((row) => row.id);
	if (sourceIds.length < MIN_SOURCES_CHECKED) {
		throw new Error(
			`${sourceIds.length} source(s) active(s) : le registre exige au moins ${MIN_SOURCES_CHECKED} sources interrogées`,
		);
	}
	const sourceDigest = sourceScopeDigest(sourceIds);

	const total = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM org WHERE status = 'confirme' AND valid_to IS NULL",
	);
	const limit = options.limit ?? null;
	const candidates = await query<Candidate>(
		`SELECT o.id, o.slug, o.name, o.entity_source, o.entity_code
		 FROM org o
		 WHERE o.status = 'confirme'
		   AND o.valid_to IS NULL
		   AND NOT EXISTS (
		     SELECT 1 FROM event e
		     WHERE e.org_id = o.id
		       AND e.observed_at >= $1
		       AND e.observed_at < $2
		   )
		 ORDER BY o.id
		 ${limit === null ? "" : "LIMIT $3"}`,
		limit === null ? [windowStart, windowEnd] : [windowStart, windowEnd, limit],
	);

	const sealed = candidates.rows.map((org) => ({
		org,
		attestation: sealNegativeAttestation(
			{
				orgSlug: org.slug,
				orgName: org.name,
				entitySource: org.entity_source,
				entityCode: org.entity_code,
				windowStart,
				windowEnd,
				sourcesChecked: sourceIds.length,
				sourceDigest,
				eventsFound: 0,
			},
			key,
		),
	}));

	let written = 0;
	if (!dryRun && sealed.length > 0) {
		for (let offset = 0; offset < sealed.length; offset += INSERT_BATCH) {
			const batch = sealed.slice(offset, offset + INSERT_BATCH);
			const values: unknown[] = [];
			const tuples = batch.map(({ org, attestation: row }, index) => {
				const base = index * 16;
				values.push(
					org.id,
					row.orgSlug,
					row.orgName,
					row.entitySource,
					row.entityCode,
					row.windowStart,
					row.windowEnd,
					row.sourcesChecked,
					"enabled-sources",
					row.sourceDigest,
					row.eventsFound,
					row.method,
					row.signed,
					row.signature,
					row.signatureMethod,
					row.payloadDigest,
				);
				return `(${Array.from({ length: 16 }, (_, i) => `$${base + i + 1}`).join(",")})`;
			});
			const result = await query(
				`INSERT INTO negative_attestation
				   (org_id, org_slug, org_name, entity_source, entity_code,
				    window_start, window_end, sources_checked, source_scope,
				    source_digest, events_found, method, signed, signature,
				    signature_method, payload_digest)
				 VALUES ${tuples.join(",")}
				 ON CONFLICT (org_slug, window_start, window_end, method) DO UPDATE SET
				   org_id = EXCLUDED.org_id,
				   org_name = EXCLUDED.org_name,
				   entity_source = EXCLUDED.entity_source,
				   entity_code = EXCLUDED.entity_code,
				   sources_checked = EXCLUDED.sources_checked,
				   source_scope = EXCLUDED.source_scope,
				   source_digest = EXCLUDED.source_digest,
				   events_found = EXCLUDED.events_found,
				   signed = EXCLUDED.signed,
				   signature = EXCLUDED.signature,
				   signature_method = EXCLUDED.signature_method,
				   payload_digest = EXCLUDED.payload_digest,
				   updated_at = now()`,
				values,
			);
			written += result.rowCount ?? 0;
		}
	}

	return {
		windowStart,
		windowEnd,
		sourcesChecked: sourceIds.length,
		sourceDigest,
		method: NEGATIVE_ATTESTATION_METHOD,
		dryRun,
		signatureMethod: sealed[0]?.attestation.signatureMethod ?? null,
		organizations: Number(total.rows[0]?.n ?? 0),
		absences: sealed.length,
		written,
		sample: sealed.slice(0, 5).map(({ attestation: row }) => ({
			orgSlug: row.orgSlug,
			orgName: row.orgName,
			sourcesChecked: row.sourcesChecked,
			signatureMethod: row.signatureMethod,
		})),
	};
}
