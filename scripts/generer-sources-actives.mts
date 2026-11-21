/**
 * Builds the versioned corpus of active Nouvelle-Aquitaine sources.
 *
 * Inputs are already verified corpora: each retained line carries an HTTP 200
 * proof and visible page text collected on the verification date. The generator
 * never fetches the network and never invents a source or an item: one corpus
 * line becomes one source with one item extracted from that page.
 *
 * Usage:
 *   node scripts/generer-sources-actives.mts [--limit 1000]
 *       [--output bench/corpus/sources-na-1000.jsonl]
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const OUTPUT = fileURLToPath(new URL("../bench/corpus/sources-na-1000.jsonl", import.meta.url));
export const INPUTS = [
	fileURLToPath(new URL("../bench/corpus/institutions-complet.jsonl", import.meta.url)),
	fileURLToPath(new URL("../bench/corpus/presse-communale.jsonl", import.meta.url)),
];
export const DEFAULT_LIMIT = 1000;

const NA_DEPARTMENTS = new Set(["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"]);
const DEPARTMENT_NAMES: Record<string, string> = {
	charente: "16", "charente-maritime": "17", correze: "19", creuse: "23", dordogne: "24",
	gironde: "33", landes: "40", "lot-et-garonne": "47", "pyrenees-atlantiques": "64",
	"pyrénées-atlantiques": "64", "deux-sevres": "79", "deux-sèvres": "79", vienne: "86",
	"haute-vienne": "87",
};

/** Rejects records that describe a person rather than an organisation. */
const PERSONAL = /\b(victime|victims?|sinistré|M\.|Mme|Monsieur|Madame)\b/i;

export interface CorpusItem {
	titre: string;
	date: string | null;
	extrait: string;
}

export interface VerifiedSource {
	id: string;
	nom: string;
	url: string;
	famille: string;
	departement: string;
	preuve: {
		http_status: 200;
		verifie_le: string | null;
		url_finale: string;
		extrait: string;
		methode: string;
		corpus_source: string;
	};
	item: CorpusItem;
}

export interface RejectedLine {
	fichier: string;
	ligne: number;
	motif: string;
}

export function normalizeUrl(url: string): string {
	return url.trim().toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.replace(/#.*$/, "")
		.replace(/\?.*$/, "")
		.replace(/\/+$/, "");
}

function department(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const value = raw.trim();
	const digits = value.replace(/^0+/, "");
	if (NA_DEPARTMENTS.has(digits)) return digits;
	return DEPARTMENT_NAMES[value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")] ?? null;
}

function text(value: unknown): string {
	return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function clip(value: string, length: number): string {
	if (value.length <= length) return value;
	const cut = value.slice(0, length);
	const lastSpace = cut.lastIndexOf(" ");
	return `${lastSpace > length / 2 ? cut.slice(0, lastSpace) : cut}…`;
}

function date(value: unknown): string | null {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function makeId(url: string): string {
	return `na-active-${createHash("sha256").update(normalizeUrl(url)).digest("hex").slice(0, 12)}`;
}

/** Converts one verified institutional page into a source with its page item. */
function fromInstitution(row: Record<string, unknown>, file: string, line: number): VerifiedSource | RejectedLine {
	const proof = row.preuve && typeof row.preuve === "object" ? row.preuve as Record<string, unknown> : {};
	const dept = department(row.departement);
	const url = text(row.url_preuve) || text(row.url);
	const extrait = text(proof.extrait);
	const common = { fichier: file, ligne: line };
	if (proof.http_status !== 200 || !url || !extrait || !dept) {
		return { ...common, motif: "not_verified_na" };
	}
	const nom = text(row.nom);
	if (!nom || PERSONAL.test(nom) || PERSONAL.test(extrait)) return { ...common, motif: "personal_data" };
	const finalUrl = text(proof.url_finale) || url;
	return {
		id: makeId(url), nom, url, famille: "institutionnel", departement: dept,
		preuve: {
			http_status: 200,
			verifie_le: date(proof.verifie_le),
			url_finale: finalUrl,
			extrait,
			methode: text(proof.methode) || "GET HTTP 200 and discriminant token in visible text",
			corpus_source: file,
		},
		item: { titre: clip(extrait, 110), date: date(proof.verifie_le), extrait: clip(extrait, 240) },
	};
}

/** Converts one verified municipal news page into a source with its page item. */
function fromCommune(row: Record<string, unknown>, file: string, line: number): VerifiedSource | RejectedLine {
	const dept = department(row.departement);
	const url = text(row.url);
	const extrait = text(row.preuve);
	const common = { fichier: file, ligne: line };
	if (row.statut_http !== 200 || row.statut !== "verifie" || !url || !extrait || !dept) {
		return { ...common, motif: "not_verified_na" };
	}
	const nom = text(row.nom_source);
	if (!nom || PERSONAL.test(nom) || PERSONAL.test(extrait)) return { ...common, motif: "personal_data" };
	return {
		id: makeId(url), nom, url, famille: "presse", departement: dept,
		preuve: {
			http_status: 200,
			verifie_le: date(row.verifie_le),
			url_finale: url,
			extrait,
			methode: "GET HTTP 200 and visible text collected by the commune corpus",
			corpus_source: file,
		},
		item: { titre: clip(nom, 110), date: date(row.verifie_le), extrait: clip(extrait, 240) },
	};
}

/** Pure builder: deterministic, deduplicated by normalized URL. */
export function build(
	inputs: Array<{ file: string; lines: string[] }>,
	limit: number = DEFAULT_LIMIT,
): { sources: VerifiedSource[]; rejected: RejectedLine[] } {
	if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");
	const rejected: RejectedLine[] = [];
	const byUrl = new Map<string, VerifiedSource>();
	for (const input of inputs) {
		const file = input.file.split("/").pop() ?? input.file;
		input.lines.forEach((raw, index) => {
			if (!raw.trim()) return;
			let parsed: unknown;
			try {
				parsed = JSON.parse(raw);
			} catch {
				rejected.push({ fichier: file, ligne: index + 1, motif: "invalid_json" });
				return;
			}
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				rejected.push({ fichier: file, ligne: index + 1, motif: "invalid_json" });
				return;
			}
			const row = parsed as Record<string, unknown>;
			const from = file.startsWith("presse-communale") ? fromCommune : fromInstitution;
			const result = from(row, file, index + 1);
			if ("motif" in result) {
				rejected.push(result);
				return;
			}
			const key = normalizeUrl(result.url);
			if (!byUrl.has(key)) byUrl.set(key, result);
		});
	}
	const sources = [...byUrl.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit);
	return { sources, rejected };
}

export function serialize(sources: VerifiedSource[]): string {
	return sources.map((source) => JSON.stringify(source)).join("\n") + "\n";
}

/**
 * Counts sources with an HTTP 200 proof and at least one usable item.
 * Rows without an item, or with an empty one, are not active sources.
 */
export function countActiveSources(sources: readonly unknown[]): number {
	return sources.filter((source) => {
		if (!source || typeof source !== "object") return false;
		const row = source as {
			preuve?: { http_status?: unknown };
			item?: { titre?: unknown; extrait?: unknown };
		};
		return row.preuve?.http_status === 200
			&& typeof row.item?.titre === "string" && row.item.titre.trim().length > 0
			&& typeof row.item?.extrait === "string" && row.item.extrait.trim().length > 0;
	}).length;
}

export async function generate(options: { inputs?: string[]; output?: string; limit?: number } = {}): Promise<{
	count: number;
	rejected: number;
	output: string;
}> {
	const inputs = options.inputs ?? INPUTS;
	const limit = options.limit ?? DEFAULT_LIMIT;
	const loaded = await Promise.all(inputs.map(async (path) => ({
		file: path,
		lines: (await readFile(path, "utf8")).split("\n"),
	})));
	const { sources, rejected } = build(loaded, limit);
	if (sources.length < limit) {
		throw new Error(`only ${sources.length} verified sources available, ${limit} required`);
	}
	const output = options.output ?? OUTPUT;
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, serialize(sources), "utf8");
	return { count: sources.length, rejected: rejected.length, output };
}

const argv = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
	let limit = DEFAULT_LIMIT;
	let output = OUTPUT;
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--limit" && argv[i + 1]) limit = Number(argv[++i]);
		else if (argv[i] === "--output" && argv[i + 1]) output = argv[++i];
		else throw new Error(`unknown option: ${argv[i]}`);
	}
	const result = await generate({ limit, output });
	console.log(`verified sources: ${result.count}; rejected lines: ${result.rejected}; output: ${result.output}`);
}
