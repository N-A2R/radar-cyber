/** Pure detection pipeline: incident corpus in, privacy-safe communications out. */
import { createHash } from "node:crypto";
import {
	classifySource,
	delayInDays,
	hostname,
	isCrisisCommunication,
	isNaDepartment,
	naDepartmentCode,
	parseIsoDate,
	type CommunicationRecord,
	type Detection,
} from "./model.js";

export type DetectionReport = {
	detections: Detection[];
	recordsScanned: number;
	pressPages: number;
	pressPagesAccepted: number;
	outsideNa: number;
	outsideNaAccepted: number;
	datedDetections: number;
	undatedDetections: number;
	negativeDelays: number;
};

/**
 * One detection per verified first-party page. Only a salt-free truncated hash
 * of the organisation is exported: never a title, a summary or a victim name.
 */
export function detectCrisisCommunications(records: readonly CommunicationRecord[]): DetectionReport {
	const seen = new Set<string>();
	const detections: Detection[] = [];
	const report: DetectionReport = {
		detections,
		recordsScanned: records.length,
		pressPages: 0,
		pressPagesAccepted: 0,
		outsideNa: 0,
		outsideNaAccepted: 0,
		datedDetections: 0,
		undatedDetections: 0,
		negativeDelays: 0,
	};

	for (const record of records) {
		const kind = classifySource(record);
		if (kind === "press") report.pressPages += 1;
		const incident = parseIsoDate(record.incidentDate);
		const published = parseIsoDate(record.publicationDate);
		if (incident && published && published.getTime() < incident.getTime()) report.negativeDelays += 1;

		if (!isCrisisCommunication(record)) continue;
		if (kind === "press") report.pressPagesAccepted += 1;
		if (!isNaDepartment(record.department)) report.outsideNaAccepted += 1;
		if (seen.has(record.id)) continue;
		seen.add(record.id);

		const delay = delayInDays(record.incidentDate, record.publicationDate);
		if (delay === null) report.undatedDetections += 1;
		else report.datedDetections += 1;
		detections.push({
			id: record.id,
			department: naDepartmentCode(record.department!)!,
			sourceKind: kind === "official" ? "official" : "grey",
			host: hostname(record.url),
			organisationHash: createHash("sha256").update(record.organisation ?? "").digest("hex").slice(0, 12),
			incidentDate: record.incidentDate,
			publishedAt: record.publicationDate!,
			delayDays: delay,
		});
	}

	detections.sort((a, b) => a.id.localeCompare(b.id));
	return report;
}
