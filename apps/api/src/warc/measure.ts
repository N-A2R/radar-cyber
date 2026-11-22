/**
 * Reproducible WARC-proof measurement: a fact counts only when its
 * `warc_proof` row, WARC record (database or file), hashes and NA scope all
 * agree.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { query } from "../db.js";
import { PROOF_SQL, scopeWhere, scopeParams } from "./eligibility.js";
import { containsPersonalData } from "./redact.js";
import { parseWarcFile, verifyBlockDigest, type ParsedWarcRecord } from "./record.js";
import { WARC_DIR } from "./service.js";

type ProofRow = {
	event_id: string;
	source_url: string;
	target_uri: string;
	warc_file: string;
	warc_record: Buffer | null;
	record_id: string;
	block_sha1: string;
	payload_sha256: string;
	http_status: number;
	byte_length: number;
	captured_at: string;
};

export type WarcMeasurement = {
	scope: string;
	eligibleFacts: number;
	factsWithArchivableProof: number;
	target: number;
	coveragePercent: number;
	warcFiles: number;
	warcBytes: number;
	invalidProofs: { eventId: string; reason: string }[];
	recent: {
		eventId: string;
		sourceUrl: string;
		recordId: string;
		sha256: string;
		capturedAt: string;
	}[];
	generatedAt: string;
};

function checkProof(row: ProofRow, record: ParsedWarcRecord | undefined, dir: string): string | null {
	if (!record) return "record-missing";
	if (record.headers["warc-type"] !== "response") return "not-a-response";
	const id = (record.headers["warc-record-id"] ?? "").replace(/^<|>$/g, "");
	if (id !== row.record_id) return "record-id-mismatch";
	if (record.headers["warc-target-uri"] !== row.target_uri) return "target-uri-mismatch";
	if (!verifyBlockDigest(record.block, row.block_sha1)) return "block-digest-mismatch";
	if (createHash("sha256").update(record.body).digest("hex") !== row.payload_sha256) return "payload-digest-mismatch";
	if (record.httpStatus !== row.http_status) return "status-mismatch";
	if (record.body.length !== row.byte_length) return "length-mismatch";
	if (containsPersonalData(record.body.toString("utf8"))) return "personal-data";
	if (!resolve(row.warc_file).startsWith(resolve(dir))) return "file-outside-warc-dir";
	return null;
}

/** Recount verifiable proofs without trusting the table alone. */
export async function measureWarcProofs(dir: string = WARC_DIR): Promise<WarcMeasurement> {
	const [{ rows: counts }, { rows: proofs }] = await Promise.all([
		query<{ eligible: string }>(
			`SELECT count(*)::text AS eligible FROM event e LEFT JOIN org o ON o.id=e.org_id WHERE ${scopeWhere()}`,
			scopeParams(),
		),
		query<ProofRow>(PROOF_SQL, scopeParams()),
	]);
	const eligibleFacts = Number(counts[0]?.eligible ?? 0);
	const invalidProofs: WarcMeasurement["invalidProofs"] = [];
	let valid = 0;
	let warcBytes = 0;
	for (const proof of proofs) {
		warcBytes += proof.warc_record?.length ?? proof.byte_length;
		let record: ParsedWarcRecord | undefined;
		try {
			const bytes = proof.warc_record ? Buffer.from(proof.warc_record) : await readFile(proof.warc_file);
			record = parseWarcFile(bytes).find(
				(r) => (r.headers["warc-record-id"] ?? "").replace(/^<|>$/g, "") === proof.record_id,
			);
		} catch {
			record = undefined;
		}
		const reason = checkProof(proof, record, dir);
		if (reason) invalidProofs.push({ eventId: proof.event_id, reason });
		else valid++;
	}
	return {
		scope: "Nouvelle-Aquitaine",
		eligibleFacts,
		factsWithArchivableProof: valid,
		target: eligibleFacts,
		coveragePercent: eligibleFacts > 0 ? Math.round((valid / eligibleFacts) * 10000) / 100 : 0,
		warcFiles: new Set(proofs.map((p) => p.warc_file)).size,
		warcBytes,
		invalidProofs,
		recent: proofs.slice(0, 10).map((p) => ({
			eventId: p.event_id,
			sourceUrl: p.source_url,
			recordId: p.record_id,
			sha256: p.payload_sha256,
			capturedAt: p.captured_at,
		})),
		generatedAt: new Date().toISOString(),
	};
}
