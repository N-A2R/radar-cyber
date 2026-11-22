/**
 * Real-state readers for the gold corpus builder.
 *
 * Curated rows come from versioned JSON/JSONL files; event, archive and claim
 * rows come from the live radar database. Every row keeps its source reference
 * so a reader can trace the annotation back to the original record.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { query } from "../db.js";
import {
	classifyIncidentType,
	normaliseDepartment,
	normaliseEvidenceUrl,
	redactPersonalData,
	looksLikePersonName,
	type EvidenceTier,
	type GoldCandidate,
	type NaDepartment,
} from "./corpus.js";

const NA_SQL = "'16','17','19','23','24','33','40','47','64','79','86','87'";

const NA_SOURCE_IDS = [
	"gn-16", "gn-17", "gn-19", "gn-23", "gn-24", "gn-33", "gn-40", "gn-47",
	"gn-64", "gn-79", "gn-86", "gn-87", "gn-cyber-na", "gn-fuite-metropoles",
	"gn-mairie-cyber", "gn-press-lamontagne", "gn-press-lepopulaire", "gn-ransom-aquitaine",
];

const PRESS_PATTERN = /france ?3|france ?info|sud ouest|charente libre|nouvelle république|la montagne|le populaire|actu\.fr|france bleu|le quotidien|presse|journal|rss/i;
const GREY_PATTERN = /ransom|leak|claim|revendiqu|dark web|breach|ddos|telegram|paste/i;

const TODAY = new Date().toISOString().slice(0, 10);

type JsonRecord = Record<string, unknown>;

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function firstText(record: JsonRecord, keys: string[]): string {
	for (const key of keys) {
		const value = text(record[key]);
		if (value) return value;
	}
	return "";
}

function isoDate(value: string): string {
	const match = value.match(/\d{4}-\d{2}-\d{2}/);
	return match ? match[0] : TODAY;
}

function sourceKindFrom(label: string): "official" | "press" | "grey" {
	if (GREY_PATTERN.test(label)) return "grey";
	if (PRESS_PATTERN.test(label)) return "press";
	return "official";
}

function makeCandidate(input: {
	sourceRef: string;
	title: string;
	organisation: string;
	department: NaDepartment;
	observedAt: string;
	incidentType?: string;
	evidenceTier: EvidenceTier;
	sourceKind: "official" | "press" | "grey";
	sourceUrl: string;
	sourceLabel: string;
	rule: GoldCandidate["annotation"]["rule"];
	confidence: GoldCandidate["annotation"]["confidence"];
	note: string;
}): GoldCandidate | null {
	const title = redactPersonalData(input.title).slice(0, 240);
	const organisation = redactPersonalData(input.organisation).slice(0, 160);
	if (!input.sourceUrl || title.length < 4 || organisation.length < 2) return null;
	return {
		key: `${input.sourceRef}|${normaliseEvidenceUrl(input.sourceUrl)}`,
		sourceRef: input.sourceRef,
		title,
		organisation,
		department: input.department,
		observedAt: input.observedAt,
		incidentType: classifyIncidentType(`${title} ${input.incidentType ?? ""}`),
		evidenceTier: input.evidenceTier,
		sourceKind: input.sourceKind,
		sourceUrl: input.sourceUrl,
		sourceLabel: redactPersonalData(input.sourceLabel).slice(0, 120),
		annotation: {
			rule: input.rule,
			confidence: input.confidence,
			reviewedAt: TODAY,
			note: input.note,
		},
	};
}

function curatedFromRecord(record: JsonRecord, sourceRef: string): GoldCandidate | null {
	const rawDepartment = record.departement ?? record.department;
	const department = normaliseDepartment(typeof rawDepartment === "string" || typeof rawDepartment === "number" ? rawDepartment : null);
	if (!department) return null;
	const proof = record.preuve;
	const url = firstText(record, ["url"]) ||
		(isJsonRecord(proof) ? firstText(proof, ["url"]) : "");
	const label = firstText(record, ["source", "nom_source"]) || "versioned incident corpus";
	const title = firstText(record, ["titre", "title", "resume", "summary"]);
	const organisation = firstText(record, ["organisation", "entite", "name"]);
	const date = firstText(record, ["date_incident", "dateIncident", "date_publication", "datePublique"]);
	return makeCandidate({
		sourceRef,
		title,
		organisation,
		department,
		observedAt: isoDate(date),
		incidentType: firstText(record, ["type"]),
		evidenceTier: "verified",
		sourceKind: sourceKindFrom(label),
		sourceUrl: url,
		sourceLabel: label,
		rule: "curated.verified.v1",
		confidence: "high",
		note: "Versioned, source-backed incident with a verbatim excerpt and a verified date.",
	});
}

function isJsonRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonl(path: string): JsonRecord[] {
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as JsonRecord);
}

/** Curated files: departmental corpora, coverage witness, fixture reference corpus. */
export function collectCuratedCandidates(root: string): GoldCandidate[] {
	const candidates: GoldCandidate[] = [];
	const corpusDir = join(root, "bench", "corpus");
	for (const file of readdirSync(corpusDir).filter((name) => /^incidents-.*\.jsonl$/.test(name)).sort()) {
		for (const [index, record] of readJsonl(join(corpusDir, file)).entries()) {
			const candidate = curatedFromRecord(record, `curated:${file}:${index + 1}`);
			if (candidate) candidates.push(candidate);
		}
	}
	const extraJsonl = [
		join(root, "bench", "couverture", "incidents.jsonl"),
		join(corpusDir, "ransomware-na.jsonl"),
	];
	for (const file of extraJsonl) {
		for (const [index, record] of readJsonl(file).entries()) {
			const candidate = curatedFromRecord(record, `curated:${file.split("/").pop()}:${index + 1}`);
			if (candidate) candidates.push(candidate);
		}
	}
	const extraJson = [
		join(root, "bench", "fixtures", "corpus-reference-na.json"),
		join(root, "bench", "fixtures", "corpus-temoin-na.json"),
	];
	for (const file of extraJson) {
		const payload = JSON.parse(readFileSync(file, "utf8")) as JsonRecord;
		const incidents = Array.isArray(payload.incidents) ? payload.incidents : [];
		for (const [index, raw] of incidents.entries()) {
			if (!isJsonRecord(raw)) continue;
			const candidate = curatedFromRecord(raw, `curated:${file.split("/").pop()}:${index + 1}`);
			if (candidate) candidates.push(candidate);
		}
	}
	return candidates;
}

type EventRow = {
	id: number;
	title: string;
	summary: string | null;
	source_url: string;
	source_id: string;
	observed_at: Date | null;
	family: string;
	dept: string | null;
	org_name: string | null;
	origin: string;
};

/** Live event rows anchored in NA by source scope, regional flag or organisation department. */
export async function collectEventCandidates(): Promise<GoldCandidate[]> {
	const ids = NA_SOURCE_IDS.map((id) => `'${id}'`).join(",");
	const result = await query<EventRow>(`
		SELECT e.id, e.title, e.summary, e.source_url, e.source_id, e.observed_at, e.family,
		       o.dept, o.name AS org_name,
		       CASE WHEN e.source_id IN (${ids}) THEN 'source'
		            WHEN e.regional THEN 'regional' ELSE 'org' END AS origin
		FROM event e
		LEFT JOIN org o ON o.id = e.org_id
		WHERE e.source_url IS NOT NULL AND e.family <> 'vuln'
		  AND (e.regional OR o.dept IN (${NA_SQL}) OR e.source_id IN (${ids}))
		ORDER BY e.id
	`);
	const candidates: GoldCandidate[] = [];
	for (const row of result.rows) {
		const department = normaliseDepartment(row.dept) ?? (row.origin === "source" ? guessDepartmentFromSource(row.source_id) : null);
		if (!department) continue;
		const originRule = row.origin === "source" ? "event.na-source.v1" : row.origin === "regional" ? "event.regional.v1" : "event.na-org.v1";
		const label = row.source_id;
		const candidate = makeCandidate({
			sourceRef: `event:${row.id}`,
			title: `${row.title} ${row.summary ?? ""}`.trim(),
			organisation: row.org_name ?? department,
			department,
			observedAt: isoDate(row.observed_at?.toISOString() ?? ""),
			evidenceTier: "reported",
			sourceKind: row.family === "ransomware" || row.family === "leaks" ? "grey" : sourceKindFrom(label),
			sourceUrl: row.source_url,
			sourceLabel: label,
			rule: originRule,
			confidence: row.origin === "source" ? "medium" : "low",
			note: "Observed event from a live NA-scoped source; attached organisation and date from the radar database.",
		});
		if (candidate) candidates.push(candidate);
	}
	return candidates;
}

function guessDepartmentFromSource(sourceId: string): NaDepartment | null {
	const match = sourceId.match(/^gn-(\d{2})$/);
	return match ? normaliseDepartment(match[1]) : null;
}

type ClaimRow = {
	id: number;
	org_hint: string;
	source: string;
	source_url: string;
	groupe: string | null;
	claimed_at: Date | null;
	org_name: string;
	dept: string;
};

/** Grey claims whose claimed name matches an NA organisation in the public registry. */
export async function collectClaimCandidates(): Promise<GoldCandidate[]> {
	const result = await query<ClaimRow>(`
		WITH hints AS (
			SELECT DISTINCT lower(btrim(org_hint)) AS key
			FROM quarantine_raw
			WHERE org_hint IS NOT NULL AND length(btrim(org_hint)) >= 6
		)
		SELECT DISTINCT ON (q.id) q.id, q.org_hint, q.source, q.source_url, q.groupe, q.claimed_at,
		       o.name AS org_name, o.dept
		FROM quarantine_raw q
		JOIN hints h ON h.key = lower(btrim(q.org_hint))
		JOIN org o ON o.name_norm = h.key AND o.dept IN (${NA_SQL})
		WHERE q.source_url IS NOT NULL AND o.kind = 'entreprise' AND o.siren IS NOT NULL
		ORDER BY q.id, o.id
	`);
	const candidates: GoldCandidate[] = [];
	for (const row of result.rows) {
		const department = normaliseDepartment(row.dept);
		if (!department || looksLikePersonName(row.org_name)) continue;
		const label = `${row.source}${row.groupe ? ` — ${row.groupe}` : ""}`;
		const candidate = makeCandidate({
			sourceRef: `claim:${row.id}`,
			title: `${row.org_hint} — claimed by ${row.groupe ?? row.source}`,
			organisation: row.org_name,
			department,
			observedAt: isoDate(row.claimed_at?.toISOString() ?? ""),
			incidentType: "ransomware claim",
			evidenceTier: "claimed",
			sourceKind: "grey",
			sourceUrl: row.source_url,
			sourceLabel: label,
			rule: "claim.na-org.v1",
			confidence: "low",
			note: "Attacker claim; NA organisation matched by exact registry name. Incident not independently verified.",
		});
		if (candidate) candidates.push(candidate);
	}
	return candidates;
}


type PrecisionEntry = {
	ordre: number;
	indice: string;
	source: string;
	sourceUrl: string | null;
	groupe: string | null;
	claimedAt: string | null;
	org: { id: number; name: string; dept: string | null };
	verdict: { verdict: string; motif: string };
};

/** Claims with a human verdict (exact/partial/inconclusive) in the frozen precision corpus. */
export function collectPrecisionClaimCandidates(root: string): GoldCandidate[] {
	const path = join(root, "bench", "precision", "corpus-v1.json");
	const payload = JSON.parse(readFileSync(path, "utf8")) as { entrees: PrecisionEntry[] };
	const accepted: Record<string, true> = { exacte: true, partielle: true, indecidable: true };
	const candidates: GoldCandidate[] = [];
	for (const entry of payload.entrees) {
		const department = normaliseDepartment(entry.org?.dept);
		if (!department || !accepted[entry.verdict?.verdict ?? ""] || looksLikePersonName(entry.org?.name ?? "")) continue;
		const candidate = makeCandidate({
			sourceRef: `precision:${entry.ordre}`,
			title: `${entry.indice} — claimed by ${entry.groupe ?? entry.source}`,
			organisation: entry.org.name,
			department,
			observedAt: isoDate(entry.claimedAt ?? ""),
			incidentType: "ransomware claim",
			evidenceTier: "claimed",
			sourceKind: "grey",
			sourceUrl: entry.sourceUrl ?? "",
			sourceLabel: `${entry.source}${entry.groupe ? ` — ${entry.groupe}` : ""}`,
			rule: "claim.human-verified.v1",
			confidence: entry.verdict.verdict === "exacte" ? "medium" : "low",
			note: `Human verdict ${entry.verdict.verdict} with registry and source-site proof in bench/precision/corpus-v1.json.`,
		});
		if (candidate) candidates.push(candidate);
	}
	return candidates;
}

export async function collectDatabaseCounts(): Promise<{ orgs: number; sources: number; events: number }> {
	const result = await query<{ orgs: string; sources: string; events: string }>(`
		SELECT (SELECT count(*) FROM org) AS orgs,
		       (SELECT count(*) FROM source) AS sources,
		       (SELECT count(*) FROM event) AS events
	`);
	const row = result.rows[0];
	return {
		orgs: Number(row?.orgs ?? 0),
		sources: Number(row?.sources ?? 0),
		events: Number(row?.events ?? 0),
	};
}
