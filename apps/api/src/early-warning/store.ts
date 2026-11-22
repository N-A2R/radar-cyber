/**
 * Read-only access to past campaign timelines for global-to-regional warning.
 *
 * The query deliberately projects only non-personal columns: event id,
 * observation time, source id and the NA flag. No victim title, summary,
 * evidence or personal detail is fetched.
 */
import { query } from "../db.js";
import type { CampaignTimeline } from "./global-to-regional.js";

export const GLOBAL_TO_REGIONAL_QUERY = `
SELECT c.cle, c.label, e.id, e.observed_at, e.source_id, e.regional
FROM campaign c
CROSS JOIN LATERAL unnest(c.incidents) AS i(id)
JOIN event e ON e.id = i.id
ORDER BY c.cle, e.observed_at, e.id`;

type TimelineRow = {
	cle: string;
	label: string;
	id: number;
	observed_at: Date | string | null;
	source_id: string;
	regional: boolean | null;
};

export async function fetchCampaignTimelines(): Promise<CampaignTimeline[]> {
	const result = await query<TimelineRow>(GLOBAL_TO_REGIONAL_QUERY);
	const timelines = new Map<string, CampaignTimeline>();
	for (const row of result.rows) {
		let timeline = timelines.get(row.cle);
		if (!timeline) {
			timeline = { key: row.cle, label: row.label, incidents: [] };
			timelines.set(row.cle, timeline);
		}
		timeline.incidents.push({
			id: row.id,
			observedAt: row.observed_at === null ? null : new Date(row.observed_at).toISOString(),
			sourceId: row.source_id,
			isRegional: row.regional === true,
		});
	}
	return [...timelines.values()];
}
