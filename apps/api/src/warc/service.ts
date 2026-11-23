/**
 * WARC capture of eligible NA facts and proof-index persistence.
 *
 * A capture is a real HTTP response, downloaded without any paid service,
 * capped at 512 KB and stripped of personal data before writing. The WARC
 * file and the `warc_proof` row are two halves of the same proof: measurement
 * accepts only verifiable pairs.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { query } from "../db.js";
import { pendingFacts, type EligibleFact } from "./eligibility.js";
import { isPublicHttpUrl, redactText, safeHeaders } from "./redact.js";
import { buildWarcResponse } from "./record.js";

export const WARC_DIR = process.env.WARC_DIR ?? "data/warc";
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8_000;
const ALLOWED_TYPES = /^(text\/|application\/(json|xml|xhtml\+xml|javascript))/i;

const REQUEST_HEADERS: Record<string, string> = {
	"user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
	accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
	"accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
};

export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<Response>;
type RawFetch = (url: string, init: RequestInit) => Promise<Response>;

function cookiePairs(values: string[]): [string, string][] {
	const pairs: [string, string][] = [];
	for (const value of values) {
		const pair = (value.split(";", 1)[0] ?? "").trim();
		const at = pair.indexOf("=");
		if (at > 0) pairs.push([pair.slice(0, at), pair.slice(at + 1)]);
	}
	return pairs;
}

/**
 * Follows redirects while keeping the cookies each hop sets. Some publishers
 * (SudOuest behind Incapsula) answer 302 to the same URL with a session
 * cookie: the gate only opens on the next request, which plain `fetch` never
 * sends. The jar is scoped by host so a cross-host redirect cannot read it.
 */
export async function fetchFollowingCookies(
	url: string,
	signal: AbortSignal,
	raw: RawFetch = fetch,
): Promise<Response> {
	const jar = new Map<string, Map<string, string>>();
	let current = url;
	let last: Response | undefined;
	for (let hop = 0; hop < 8; hop += 1) {
		const target = new URL(current);
		const headers: Record<string, string> = { ...REQUEST_HEADERS };
		const stored = jar.get(target.host);
		if (stored && stored.size > 0) {
			headers.cookie = [...stored].map(([name, value]) => `${name}=${value}`).join("; ");
		}
		last = await raw(current, { redirect: "manual", headers, signal });
		if (last.status < 300 || last.status >= 400) return last;
		const location = last.headers.get("location");
		if (!location) return last;
		let hostCookies = jar.get(target.host);
		if (!hostCookies) jar.set(target.host, (hostCookies = new Map()));
		const before = hostCookies.size;
		const getSetCookie = (last.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
		for (const [name, value] of cookiePairs(getSetCookie ? getSetCookie.call(last.headers) : [])) {
			hostCookies.set(name, value);
		}
		const next = new URL(location, current).toString();
		if (next === current && hostCookies.size === before) return last;
		current = next;
	}
	return last ?? new Response(null, { status: 508 });
}

const LEGACY_RANSOMLOOK_PATH = /^\/page_company\.php$/i;
const DEAD_RANSOMLOOK_PATH = /^\/(?:post\/[^/]+|site\/(?:blog|view))\/?$/i;
const FRENCHBREACHES_ALERT = /^\/alertes\/.+_([A-Za-z0-9+/]+={0,2})$/i;

/**
 * FrenchBreaches hides its alert behind a bot gate. Its slug carries a
 * twice-base64-encoded `domain@group` claim, which the public ransomware.live
 * mirror exposes directly. No paid access and no victim data are involved.
 */
function claimMirror(encoded: string): string | null {
	let inner = "";
	try {
		inner = Buffer.from(encoded, "base64").toString("utf8");
	} catch {
		return null;
	}
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(inner)) return null;
	const claim = Buffer.from(inner, "base64").toString("utf8");
	if (!/^[^\s@/]+@[^\s@/]+$/.test(claim)) return null;
	return `https://www.ransomware.live/id/${encodeURIComponent(inner.replace(/=+$/, ""))}`;
}

/**
 * A dead legacy route can still be proven by the live page carrying the same
 * claim. RansomLook moved `/page_company.php?id=N` to `/group/<name>`, and the
 * collected evidence already holds the group name.
 */
export function alternateUrls(fact: EligibleFact): string[] {
	let url: URL;
	try {
		url = new URL(fact.sourceUrl);
	} catch {
		return [];
	}
	if (!/(^|\.)ransomlook\.io$/i.test(url.hostname)) return blockedRouteAlternates(fact);
	const evidence = fact.evidence as { group?: unknown } | null;
	const group = typeof evidence?.group === "string" ? evidence.group.trim() : "";
	if (!group) return [];
	if (LEGACY_RANSOMLOOK_PATH.test(url.pathname) || DEAD_RANSOMLOOK_PATH.test(url.pathname)) {
		return [`https://www.ransomlook.io/group/${encodeURIComponent(group)}`];
	}
	return blockedRouteAlternates(fact);
}

function blockedRouteAlternates(fact: EligibleFact): string[] {
	let url: URL;
	try {
		url = new URL(fact.sourceUrl);
	} catch {
		return [];
	}
	if (/(^|\.)frenchbreaches\.com$/i.test(url.hostname)) {
		const match = FRENCHBREACHES_ALERT.exec(url.pathname);
		const mirror = match?.[1] ? claimMirror(match[1]) : null;
		return mirror ? [mirror] : [];
	}
	return [];
}

export type ArchiveReport = {
	eligible: number;
	attempted: number;
	archived: number;
	skipped: Record<string, number>;
	files: string[];
};

type Capture = {
	fact: EligibleFact;
	recordId: string;
	blockSha1: string;
	payloadSha256: string;
	targetUri: string;
	status: number;
	contentType: string;
	byteLength: number;
	redacted: boolean;
};

async function readCapped(response: Response): Promise<Buffer | null> {
	const reader = response.body?.getReader();
	if (!reader) return null;
	const chunks: Buffer[] = [];
	let size = 0;
	while (size < MAX_BYTES) {
		const { done, value } = await reader.read();
		if (done) break;
		const chunk = Buffer.from(value);
		const kept = chunk.subarray(0, MAX_BYTES - size);
		chunks.push(kept);
		size += kept.length;
		if (kept.length < chunk.length) {
			await reader.cancel();
			break;
		}
	}
	return Buffer.concat(chunks);
}

type Fetched = { response: Response; url: string };

async function fetchOne(fact: EligibleFact, fetchImpl: FetchLike): Promise<Fetched | { reason: string }> {
	let lastReason = "fetch-failed";
	const candidates = [fact.sourceUrl, ...alternateUrls(fact)];
	for (const [index, url] of candidates.entries()) {
		let response: Response;
		try {
			response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		} catch {
			lastReason = "fetch-failed";
			continue;
		}
		if (response.status >= 200 && response.status < 400) return { response, url };
		lastReason = `http-${response.status}`;
		// Only a dead route (or a bot gate with a claim-specific public mirror)
		// justifies trying another URL; a live refusal still stops the capture.
		const gated = response.status === 403 && candidates.length > 1;
		if (index === 0 && response.status !== 404 && response.status !== 410 && !gated) break;
	}
	return { reason: lastReason };
}

async function capture(fact: EligibleFact, fetchImpl: FetchLike): Promise<{ record?: Buffer; proof?: Capture; reason?: string }> {
	if (!isPublicHttpUrl(fact.sourceUrl)) return { reason: "unsafe-url" };
	const fetched = await fetchOne(fact, fetchImpl);
	if (!("response" in fetched)) return { reason: fetched.reason };
	const { response, url } = fetched;
	const contentType = response.headers.get("content-type") ?? "application/octet-stream";
	if (!ALLOWED_TYPES.test(contentType)) return { reason: "unsupported-content-type" };
	const targetUri = response.url && isPublicHttpUrl(response.url) ? response.url : url;
	if (!isPublicHttpUrl(targetUri)) return { reason: "unsafe-redirect" };
	const raw = await readCapped(response);
	if (!raw || raw.length === 0) return { reason: "empty-body" };
	const cleaned = redactText(raw.toString("utf8"));
	if (cleaned.text.length === 0) return { reason: "empty-body" };
	const body = Buffer.from(cleaned.text, "utf8");
	const built = buildWarcResponse({
		targetUri,
		status: response.status,
		headers: safeHeaders(response.headers),
		body,
		contentType,
	});
	return {
		record: built.bytes,
		proof: {
			fact,
			recordId: built.recordId,
			blockSha1: built.blockSha1,
			payloadSha256: built.payloadSha256,
			targetUri,
			status: response.status,
			contentType,
			byteLength: body.length,
			redacted: cleaned.redacted,
		},
	};
}

function stamp(): string {
	return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

/**
 * Archive a bounded batch. `maxSeconds` keeps each invocation short: the
 * caller can rerun it until the scope is exhausted.
 */
export async function archiveWarcFacts(options: {
	dir?: string;
	limit?: number;
	maxSeconds?: number;
	concurrency?: number;
	fetchImpl?: FetchLike;
} = {}): Promise<ArchiveReport> {
	const dir = options.dir ?? WARC_DIR;
	const maxSeconds = options.maxSeconds ?? 45;
	const concurrency = Math.max(1, options.concurrency ?? 6);
	const deadline = Date.now() + maxSeconds * 1000;
	const queue = await pendingFacts(options.limit ?? 500);
	const file = join(dir, `warc-${stamp()}-${process.pid}.warc`);
	const report: ArchiveReport = {
		eligible: queue.length,
		attempted: 0,
		archived: 0,
		skipped: {},
		files: [],
	};
	await mkdir(dir, { recursive: true });
	let writeChain: Promise<void> = Promise.resolve();
	let next = 0;
	const worker = async (): Promise<void> => {
		while (Date.now() < deadline) {
			const index = next++;
			const fact = queue[index];
			if (!fact) return;
			report.attempted++;
			const result = await capture(fact, options.fetchImpl ?? ((url, init) => fetchFollowingCookies(url, init.signal)));
			if (!result.proof || !result.record) {
				const reason = result.reason ?? "unknown";
				report.skipped[reason] = (report.skipped[reason] ?? 0) + 1;
				continue;
			}
			const proof = result.proof;
			const bytes = result.record;
			const write = writeChain.then(() => appendFile(file, bytes));
			writeChain = write.catch(() => undefined);
			await write;
			await query(
				`INSERT INTO warc_proof
				    (event_id, source_url, target_uri, warc_file, record_id, block_sha1,
				     payload_sha256, http_status, content_type, byte_length, redacted, warc_record)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
				 ON CONFLICT (event_id) DO NOTHING`,
				[proof.fact.id, proof.fact.sourceUrl, proof.targetUri, file, proof.recordId,
				 proof.blockSha1, proof.payloadSha256, proof.status, proof.contentType,
				 proof.byteLength, proof.redacted, bytes],
			);
			report.archived++;
		}
	};
	await Promise.all(Array.from({ length: concurrency }, worker));
	if (report.archived > 0) report.files.push(file);
	return report;
}
