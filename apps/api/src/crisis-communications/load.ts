/** Loading and validation of the versioned Nouvelle-Aquitaine incident corpus. */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseIsoDate, type CommunicationRecord } from "./model.js";

type CorpusRow = Record<string, unknown>;

function isRow(value: unknown): value is CorpusRow {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

/** Only rows with an explicit publication date belong to the dated corpus. */
export function parseIncidentLine(line: string): CommunicationRecord | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return null;
	}
	if (!isRow(parsed)) return null;
	const publicationDate = stringOrNull(parsed.date_publication);
	if (!publicationDate || !parseIsoDate(publicationDate)) return null;
	const incidentDate = stringOrNull(parsed.date_incident);
	return {
		id: stringOrNull(parsed.id) ?? "",
		department: stringOrNull(parsed.departement),
		organisation: stringOrNull(parsed.organisation),
		incidentDate: incidentDate && parseIsoDate(incidentDate) ? incidentDate : null,
		publicationDate,
		title: stringOrNull(parsed.titre),
		url: stringOrNull(parsed.url),
		sourceLabel: stringOrNull(parsed.source),
	};
}

export function defaultCorpusDirectory(): string {
	return fileURLToPath(new URL("../../../../bench/corpus", import.meta.url));
}

export async function loadIncidentCorpus(directory: string = defaultCorpusDirectory()): Promise<CommunicationRecord[]> {
	const files = (await readdir(directory))
		.filter((name) => /^incidents-.*\.jsonl$/.test(name))
		.sort();
	const records: CommunicationRecord[] = [];
	for (const file of files) {
		const content = await readFile(`${directory}/${file}`, "utf8");
		for (const line of content.split("\n")) {
			if (line.trim().length === 0) continue;
			const record = parseIncidentLine(line);
			if (record) records.push(record);
		}
	}
	return records;
}
