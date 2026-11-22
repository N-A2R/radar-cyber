/**
 * GET /api/exposition/new-services — newly exposed services recorded by the
 * daily pass, with the latency between first observation and detection.
 *
 * Only public network metadata is returned (IP, port, CPE-derived technology)
 * plus the organisation name. No victim data, no active scanning.
 */
import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;
const MAX_ROWS = 500;

type SummaryRow = {
	total: number;
	last24h: number;
	p50_hours: number | null;
	p95_hours: number | null;
	max_hours: number | null;
};

type ServiceRow = {
	service_id: string;
	org_id: number;
	org_name: string;
	department: string | null;
	ip: string;
	port: number;
	category: string;
	service: string;
	technology: string;
	version: string | null;
	source: string;
	source_url: string;
	first_seen_at: Date;
	detected_at: Date;
	latency_hours: number;
};

export default async function newExposedServicesRoute(app: FastifyInstance) {
	app.get("/exposition/new-services", async (req) => {
		const raw = (req.query as { days?: string } | undefined)?.days;
		const parsed = Number(raw ?? DEFAULT_DAYS);
		const days = Number.isFinite(parsed)
			? Math.min(MAX_DAYS, Math.max(1, Math.trunc(parsed)))
			: DEFAULT_DAYS;

		const [summary, services] = await Promise.all([
			query<SummaryRow>(
				`SELECT count(*)::int AS total,
				        count(*) FILTER (WHERE detected_at >= now() - interval '24 hours')::int AS "last24h",
				        round(percentile_cont(0.5) WITHIN GROUP (
				          ORDER BY extract(epoch FROM (detected_at - first_seen_at)) / 3600.0)::numeric, 2)::float8 AS p50_hours,
				        round(percentile_cont(0.95) WITHIN GROUP (
				          ORDER BY extract(epoch FROM (detected_at - first_seen_at)) / 3600.0)::numeric, 2)::float8 AS p95_hours,
				        round(max(extract(epoch FROM (detected_at - first_seen_at)) / 3600.0)::numeric, 2)::float8 AS max_hours
				   FROM exposition_service_detection
				  WHERE detected_on >= (now() AT TIME ZONE 'UTC')::date - ($1::int - 1)`,
				[days],
			),
			query<ServiceRow>(
				`SELECT d.service_id, d.org_id, o.name AS org_name, o.dept AS department,
				        s.ip, s.port, s.category, s.service, s.technology, s.version,
				        s.source, s.source_url, d.first_seen_at, d.detected_at,
				        round((extract(epoch FROM (d.detected_at - d.first_seen_at)) / 3600.0)::numeric, 2)::float8 AS latency_hours
				   FROM exposition_service_detection d
				   JOIN exposition_service s ON s.id = d.service_id
				   JOIN org o ON o.id = d.org_id
				  WHERE d.detected_on >= (now() AT TIME ZONE 'UTC')::date - ($1::int - 1)
				  ORDER BY d.detected_at DESC, d.id DESC
				  LIMIT $2`,
				[days, MAX_ROWS],
			),
		]);

		const row = summary.rows[0];
		return {
			windowDays: days,
			targetHours: 24,
			generatedAt: new Date().toISOString(),
			summary: {
				total: row?.total ?? 0,
				last24h: row?.last24h ?? 0,
				p50Hours: row?.p50_hours ?? 0,
				p95Hours: row?.p95_hours ?? 0,
				maxHours: row?.max_hours ?? 0,
			},
			services: services.rows.map((service) => ({
				serviceId: Number(service.service_id),
				orgId: service.org_id,
				orgName: service.org_name,
				department: service.department,
				ip: service.ip,
				port: service.port,
				category: service.category,
				service: service.service,
				technology: service.technology,
				version: service.version,
				source: service.source,
				sourceUrl: service.source_url,
				firstSeenAt: service.first_seen_at,
				detectedAt: service.detected_at,
				latencyHours: service.latency_hours,
			})),
		};
	});
}
