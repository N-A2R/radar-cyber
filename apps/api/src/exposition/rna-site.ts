/**
 * Qualification of Répertoire National des Associations (RNA) open-data rows.
 *
 * Only `siret`, `adrs_codepostal` and `siteweb` are read. Association names,
 * officers, addresses, emails and phone numbers are never copied.
 */
import { publicSiteCandidate, type PublicSiteCandidate } from "./public-site.js";

/** Splits one RNA CSV line; quoted fields may contain semicolons or doubled quotes. */
export function parseRnaCsvLine(line: string): string[] {
	const values: string[] = [];
	let field = "";
	let quoted = false;
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index]!;
		if (quoted) {
			if (char === '"' && line[index + 1] === '"') {
				field += '"';
				index += 1;
			} else if (char === '"') {
				quoted = false;
			} else {
				field += char;
			}
		} else if (char === '"') {
			quoted = true;
		} else if (char === ";") {
			values.push(field);
			field = "";
		} else {
			field += char;
		}
	}
	values.push(field);
	return values;
}

/** Maps a parsed RNA row to the named columns of its CSV header. */
export function rnaRowFromLine(line: string, header: readonly string[]): RnaRow {
	const values = parseRnaCsvLine(line);
	const row: RnaRow = {};
	header.forEach((name, index) => {
		row[name] = values[index] ?? "";
	});
	return row;
}

export const RNA_SOURCE = "rna-http-200";

export type RnaRow = Record<string, string | undefined>;

/** Returns one joinable association website, or `null` when evidence is missing. */
export function rnaCandidate(row: RnaRow, departments: readonly string[]): PublicSiteCandidate | null {
	return publicSiteCandidate(row.siret, row.siteweb, row.adrs_codepostal, departments);
}
