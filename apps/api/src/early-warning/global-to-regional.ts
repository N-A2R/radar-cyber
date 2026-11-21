/**
 * Global-to-regional early warning.
 *
 * A campaign becomes identifiable when a second incident shares its anchor
 * (see analyse/campagnes.ts). This module measures, for past campaigns, the
 * elapsed time between the first observation anywhere in the world and the
 * first observation flagged as Nouvelle-Aquitaine, plus the warning lead that
 * existed at the moment the campaign became identifiable.
 *
 * Only non-personal fields cross this boundary: event id, observation time,
 * source id and the regional flag. Victim names, titles, summaries and raw
 * evidence never enter this module.
 */

export type CampaignIncident = {
	id: number;
	observedAt: string | null;
	sourceId: string;
	isRegional: boolean;
};

export type CampaignTimeline = {
	key: string;
	label: string;
	incidents: CampaignIncident[];
};

export type CampaignPropagation = {
	key: string;
	label: string;
	globalFirstAt: string;
	detectionAt: string;
	regionalFirstAt: string;
	incidentCount: number;
	regionalIncidentCount: number;
	/** Hours between the first worldwide observation and the first NA observation. */
	propagationHours: number;
	/** Hours between campaign detection (second incident) and the first NA observation. */
	warningLeadHours: number;
};

export type PropagationSummary = {
	campaigns: number;
	medianPropagationHours: number;
	medianWarningLeadHours: number;
	minPropagationHours: number;
	maxPropagationHours: number;
};

const roundHours = (milliseconds: number): number =>
	Math.round((milliseconds / 3_600_000) * 100) / 100;

function median(values: readonly number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? (sorted[middle] as number)
		: ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/** Returns null when the campaign has no dated NA observation or is not identifiable. */
export function computePropagation(timeline: CampaignTimeline): CampaignPropagation | null {
	const incidents = timeline.incidents
		.map((incident) => ({ ...incident, time: Date.parse(incident.observedAt ?? "") }))
		.filter((incident) => Number.isFinite(incident.time))
		.sort((a, b) => a.time - b.time || a.id - b.id);
	if (incidents.length < 2) return null;

	const globalFirst = incidents[0] as (typeof incidents)[number];
	const detection = incidents[1] as (typeof incidents)[number];
	const regionalFirst = incidents.find((incident) => incident.isRegional);
	if (!regionalFirst) return null;

	return {
		key: timeline.key,
		label: timeline.label,
		globalFirstAt: new Date(globalFirst.time).toISOString(),
		detectionAt: new Date(detection.time).toISOString(),
		regionalFirstAt: new Date(regionalFirst.time).toISOString(),
		incidentCount: incidents.length,
		regionalIncidentCount: incidents.filter((incident) => incident.isRegional).length,
		propagationHours: roundHours(regionalFirst.time - globalFirst.time),
		warningLeadHours: roundHours(Math.max(0, regionalFirst.time - detection.time)),
	};
}

/** The most recent campaigns whose NA arrival is already in the past. */
export function selectPastCampaigns(
	propagations: readonly CampaignPropagation[],
	limit: number,
	now: Date = new Date(),
): CampaignPropagation[] {
	return propagations
		.filter((item) => Date.parse(item.regionalFirstAt) <= now.getTime())
		.sort(
			(a, b) =>
				Date.parse(b.detectionAt) - Date.parse(a.detectionAt) || a.key.localeCompare(b.key),
		)
		.slice(0, Math.max(0, limit));
}

export function summarizePropagations(propagations: readonly CampaignPropagation[]): PropagationSummary {
	const delays = propagations.map((item) => item.propagationHours);
	return {
		campaigns: propagations.length,
		medianPropagationHours: median(delays),
		medianWarningLeadHours: median(propagations.map((item) => item.warningLeadHours)),
		minPropagationHours: delays.length === 0 ? 0 : Math.min(...delays),
		maxPropagationHours: delays.length === 0 ? 0 : Math.max(...delays),
	};
}
