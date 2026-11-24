/**
 * Deterministic perimeter of Nouvelle-Aquitaine public services.
 *
 * The perimeter is derived from the versioned institutional corpus produced by
 * education.gouv.fr's public directory and verified by HTTP GET. Only the twelve
 * Nouvelle-Aquitaine departments are admitted. Rows carry an opaque service id,
 * a public URL, a department code and an institution type: no person name, no
 * victim data and no free text ever enters the measurement.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const NA_DEPARTMENTS: Readonly<Record<string, true>> = {
	"016": true, "017": true, "019": true, "023": true, "024": true,
	"033": true, "040": true, "047": true, "064": true, "079": true,
	"086": true, "087": true,
};

export const PERIMETER_SIZE = 500;

export type PublicService = {
	/** Opaque identifier from the public corpus, never a person. */
	id: string;
	url: string;
	/** Final HTTP URL recorded in the corpus proof, when it differs from `url`. */
	proofUrl?: string;
	department: string;
	kind: string;
};

type CorpusRow = {
	id?: unknown;
	departement?: unknown;
	type?: unknown;
	url?: unknown;
	url_preuve?: unknown;
	preuve?: { http_status?: unknown; url_finale?: unknown } | null;
};

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

/** Parse the versioned JSONL corpus without trusting unverified rows. */
export function parseCorpus(contents: string): PublicService[] {
	const services: PublicService[] = [];
	for (const line of contents.split(/\r?\n/)) {
		if (line.trim().length === 0) continue;
		let row: CorpusRow;
		try {
			row = JSON.parse(line) as CorpusRow;
		} catch {
			continue;
		}
		const id = text(row.id);
		const url = text(row.url);
		const proofUrl = text(row.preuve?.url_finale) || text(row.url_preuve);
		const department = text(row.departement);
		const kind = text(row.type);
		if (!id || !url || NA_DEPARTMENTS[department] !== true || !/^https?:\/\//i.test(url)) continue;
		if (row.preuve?.http_status !== 200) continue;
		services.push({ id, url, ...(proofUrl ? { proofUrl } : {}), department, kind });
	}
	return services;
}

/** Stable ordering: a hash of the opaque id, then the id itself. */
export function perimeterOrder(service: PublicService): string {
	return createHash("sha256").update(service.id).digest("hex");
}

/**
 * Select a fixed-size, region-only perimeter. Selection depends only on opaque
 * ids, so input order, names and URLs cannot influence the sample.
 */
export function buildPerimeter(rows: PublicService[], limit = PERIMETER_SIZE): PublicService[] {
	const eligible = rows.filter(
		(row) => row.id.length > 0 && NA_DEPARTMENTS[row.department] === true && /^https?:\/\//i.test(row.url)
	);
	return [...eligible]
		.sort((a, b) => {
			const left = perimeterOrder(a);
			const right = perimeterOrder(b);
			return left < right ? -1 : left > right ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
		})
		.slice(0, limit)
		.map((row) => ({ id: row.id, url: row.url, ...(row.proofUrl ? { proofUrl: row.proofUrl } : {}), department: row.department, kind: row.kind }));
}

export function readCorpusPerimeter(path: string, limit = PERIMETER_SIZE): PublicService[] {
	return buildPerimeter(parseCorpus(readFileSync(path, "utf8")), limit);
}
