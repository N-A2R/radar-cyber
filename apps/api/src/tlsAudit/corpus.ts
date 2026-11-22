/** Reads the versioned active-source corpus as TLS audit targets. */
import { readFile } from "node:fs/promises";
import { isNouvelleAquitaineDepartment } from "../regionalLanguages/index.js";
import type { CorpusSite } from "./index.js";

export interface CorpusRow {
	id?: string;
	nom?: string;
	url?: string;
	famille?: string;
	departement?: string;
	preuve?: {
		http_status?: number;
		url_finale?: string;
	};
}

/** Keeps one entry per source URL, only when it is a verified NA source. */
export function sitesFromCorpus(rows: Iterable<CorpusRow>): CorpusSite[] {
	const sites: CorpusSite[] = [];
	for (const row of rows) {
		const url = row.preuve?.url_finale ?? row.url;
		if (!url) continue;
		if (row.preuve?.http_status !== undefined && row.preuve.http_status !== 200) continue;
		if (!isNouvelleAquitaineDepartment(row.departement)) continue;
		sites.push({ url, departement: row.departement });
	}
	return sites;
}

export async function loadCorpusSites(path: string): Promise<CorpusSite[]> {
	const text = await readFile(path, "utf8");
	const rows = text
		.split(/\r?\n/)
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as CorpusRow);
	return sitesFromCorpus(rows);
}
