/**
 * GET /attestations-negatives — registre public des absences signées.
 *
 * Lecture seule, sans donnée personnelle : identité publique d'organisation,
 * fenêtre, nombre de sources interrogées, sceau. La portée est répétée dans la
 * réponse : l'absence porte sur le magasin d'événements du radar, pas sur le
 * monde. Aucun chiffre n'est présenté comme une preuve d'innocuité.
 */
import type { FastifyInstance } from "fastify";
import { badRequest } from "../errors.js";
import { query } from "../db.js";
import { verifyNegativeAttestation, type SignedNegativeAttestation } from "../attestations/negative.js";

type Row = {
	id: number;
	org_slug: string;
	org_name: string;
	entity_source: string | null;
	entity_code: string | null;
	window_start: string;
	window_end: string;
	sources_checked: number;
	source_digest: string;
	events_found: number;
	method: string;
	signed: boolean;
	signature: string;
	signature_method: "hmac-sha256" | "sha256-content";
	payload_digest: string;
	still_absent: boolean;
};

const PORTEE =
	"Absence d'événement rattaché à l'organisation dans le magasin du radar sur la fenêtre ; " +
	"ne prouve pas qu'aucun incident n'a eu lieu.";

function instant(value: unknown, label: string): string {
	const date = new Date(String(value));
	if (Number.isNaN(date.getTime())) throw badRequest(`${label} doit être une date ISO 8601`);
	return date.toISOString();
}

export default async function attestationsNegativesRoute(app: FastifyInstance) {
	app.get("/attestations-negatives", async (req) => {
		const q = req.query as Record<string, string | undefined>;
		const limit = q.limit === undefined ? 100 : Number(q.limit);
		if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
			throw badRequest("limit doit être un entier entre 1 et 500");
		}
		const orgId = q.orgId === undefined ? null : Number(q.orgId);
		if (orgId !== null && (!Number.isInteger(orgId) || orgId <= 0)) {
			throw badRequest("orgId doit être un entier positif");
		}
		const from = q.from === undefined ? null : instant(q.from, "from");
		const to = q.to === undefined ? null : instant(q.to, "to");
		if (from !== null && to !== null && to <= from) {
			throw badRequest("to doit être postérieur à from");
		}

		const clauses = ["signed = true", "window_end > window_start"];
		const params: unknown[] = [];
		if (orgId !== null) {
			params.push(orgId);
			clauses.push(`org_id = $${params.length}`);
		}
		if (from !== null) {
			params.push(from);
			clauses.push(`window_end > $${params.length}`);
		}
		if (to !== null) {
			params.push(to);
			clauses.push(`window_start < $${params.length}`);
		}
		params.push(limit);

		const rows = await query<Row>(
			`SELECT n.id, n.org_slug, n.org_name, n.entity_source, n.entity_code,
			        n.window_start, n.window_end, n.sources_checked, n.source_digest,
			        n.events_found, n.method, n.signed, n.signature, n.signature_method,
			        n.payload_digest,
			        NOT EXISTS (
			          SELECT 1 FROM event e
			          WHERE e.org_id = n.org_id
			            AND e.observed_at >= n.window_start
			            AND e.observed_at < n.window_end
			        ) AS still_absent
			 FROM negative_attestation n
			 WHERE ${clauses.join(" AND ")}
			 ORDER BY n.window_end DESC, n.org_slug ASC
			 LIMIT $${params.length}`,
			params,
		);

		const total = await query<{ n: string }>(
			`SELECT count(*)::text AS n FROM negative_attestation
			 WHERE sources_checked >= 3 AND signed = true AND window_end > window_start`,
		);

		const key = process.env.RADAR_ATTESTATION_KEY ?? null;
		return {
			portee: PORTEE,
			methode: "event-store-window-v1",
			totalSignees: Number(total.rows[0]?.n ?? 0),
			count: rows.rows.length,
			attestations: rows.rows.map((row) => {
				const signed: SignedNegativeAttestation = {
					orgSlug: row.org_slug,
					orgName: row.org_name,
					entitySource: row.entity_source,
					entityCode: row.entity_code,
					windowStart: new Date(row.window_start).toISOString(),
					windowEnd: new Date(row.window_end).toISOString(),
					sourcesChecked: Number(row.sources_checked),
					sourceDigest: row.source_digest,
					eventsFound: Number(row.events_found),
					method: row.method,
					signed: true,
					signature: row.signature,
					signatureMethod: row.signature_method,
					payloadDigest: row.payload_digest,
				};
				return {
					orgSlug: row.org_slug,
					orgName: row.org_name,
					entitySource: row.entity_source,
					entityCode: row.entity_code,
					windowStart: signed.windowStart,
					windowEnd: signed.windowEnd,
					sourcesChecked: signed.sourcesChecked,
					sourceDigest: signed.sourceDigest,
					signatureMethod: signed.signatureMethod,
					// Recalculé à la lecture : une attestation que des événements
					// ultérieurs ont démentie reste visible, mais marquée périmée.
					stillAbsent: row.still_absent,
					// Un sceau HMAC n'est vérifiable que par une instance qui détient
					// la clé ; un digest de contenu se vérifie sans secret. On ne
					// confronte jamais un sceau HMAC à un digest sha256.
					signatureValid:
						row.signature_method === "sha256-content"
							? verifyNegativeAttestation(signed, null)
							: key === null
								? null
								: verifyNegativeAttestation(signed, key),
				};
			}),
		};
	});
}
