/**
 * Build and read WARC 1.1 (ISO 28500) response records.
 *
 * Pure module: no files, no network. A `response` record holds the complete
 * HTTP response (status, headers, body) plus two hashes: the standard SHA-1
 * base32 block digest and a SHA-256 payload digest for independent checks.
 */
import { createHash, randomUUID } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const CRLF = "\r\n";

export type WarcResponseInput = {
	targetUri: string;
	date?: Date;
	status: number;
	reason?: string;
	headers: Record<string, string>;
	body: Buffer;
	contentType?: string;
	recordId?: string;
};

export type WarcRecordBytes = {
	bytes: Buffer;
	recordId: string;
	blockSha1: string;
	payloadSha256: string;
	targetUri: string;
};
export type ParsedWarcRecord = {
	headers: Record<string, string>;
	block: Buffer;
	httpStatus: number | null;
	body: Buffer;
};

function base32(bytes: Buffer): string {
	let value = 0;
	let bits = 0;
	let out = "";
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += BASE32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
	return out;
}



/** Build a self-contained WARC record ready to be appended to a file. */
export function buildWarcResponse(input: WarcResponseInput): WarcRecordBytes {
	if (!input.targetUri || !/^https?:\/\//i.test(input.targetUri)) {
		throw new Error("WARC target URI must be an http(s) URL");
	}
	if (!Number.isInteger(input.status) || input.status < 100 || input.status > 599) {
		throw new Error("WARC response status must be a valid HTTP status");
	}
	const recordId = input.recordId ?? `urn:uuid:${randomUUID()}`;
	const date = (input.date ?? new Date()).toISOString();
	const contentType = input.contentType ?? input.headers["content-type"] ?? "application/octet-stream";
	const safeHeaders = Object.entries(input.headers)
		.filter(([name]) => !/^(content-length|transfer-encoding|connection)$/i.test(name))
		.map(([name, value]) => `${name.replace(/[\r\n]/g, "")}: ${String(value).replace(/[\r\n]/g, " ")}${CRLF}`)
		.join("");
	const httpHead = Buffer.from(
		`HTTP/1.1 ${input.status} ${input.reason ?? "OK"}${CRLF}` +
		`Content-Type: ${contentType}${CRLF}` +
		`Content-Length: ${input.body.length}${CRLF}${safeHeaders}${CRLF}`,
		"utf8",
	);
	const block = Buffer.concat([httpHead, input.body]);
	const blockSha1 = `sha1:${base32(createHash("sha1").update(block).digest())}`;
	const payloadSha256 = createHash("sha256").update(input.body).digest("hex");
	const headerLines = [
		"WARC/1.1",
		"WARC-Type: response",
		`WARC-Record-ID: <${recordId}>`,
		`WARC-Date: ${date}`,
		`WARC-Target-URI: ${input.targetUri}`,
		`WARC-Payload-Digest: sha256:${createHash("sha256").update(input.body).digest("base64")}`,
		`WARC-Block-Digest: ${blockSha1}`,
		"Content-Type: application/http; msgtype=response",
		`Content-Length: ${block.length}`,
	];
	const bytes = Buffer.concat([
		Buffer.from(headerLines.join(CRLF) + CRLF + CRLF, "utf8"),
		block,
		Buffer.from(CRLF + CRLF, "utf8"),
	]);
	return { bytes, recordId, blockSha1, payloadSha256, targetUri: input.targetUri };
}

/** Read WARC records produced by `buildWarcResponse` from a file buffer. */
export function parseWarcFile(bytes: Buffer): ParsedWarcRecord[] {
	const records: ParsedWarcRecord[] = [];
	const marker = Buffer.from("WARC/1.1" + CRLF, "utf8");
	let cursor = 0;
	while (cursor < bytes.length) {
		if (!bytes.subarray(cursor, cursor + marker.length).equals(marker)) {
			throw new Error(`invalid WARC record at offset ${cursor}`);
		}
		const headerStart = cursor + marker.length;
		const headerEnd = bytes.indexOf(CRLF + CRLF, headerStart, "utf8");
		if (headerEnd < 0) throw new Error("truncated WARC headers");
		const headers: Record<string, string> = {};
		for (const line of bytes.subarray(headerStart, headerEnd).toString("utf8").split(CRLF)) {
			const separator = line.indexOf(":");
			if (separator > 0) headers[line.slice(0, separator).toLowerCase().trim()] = line.slice(separator + 1).trim();
		}
		const length = Number(headers["content-length"]);
		if (!Number.isInteger(length) || length < 0) throw new Error("invalid WARC content length");
		const blockStart = headerEnd + 4;
		const block = bytes.subarray(blockStart, blockStart + length);
		if (block.length !== length) throw new Error("truncated WARC block");
		const bodyStart = block.indexOf(CRLF + CRLF);
		const httpHead = (bodyStart < 0 ? block.toString("utf8") : block.subarray(0, bodyStart).toString("utf8"))
			.split(CRLF);
		const statusLine = /^HTTP\/\d\.\d\s+(\d{3})/.exec(httpHead[0] ?? "");
		records.push({
			headers,
			block,
			httpStatus: statusLine ? Number(statusLine[1]) : null,
			body: bodyStart < 0 ? Buffer.alloc(0) : block.subarray(bodyStart + 4),
		});
		cursor = blockStart + length;
		while (bytes.subarray(cursor, cursor + 2).toString("utf8") === CRLF) cursor += 2;
	}
	return records;
}

/** Verify the base32 SHA-1 block digest without rebuilding the record. */
export function verifyBlockDigest(block: Buffer, digest: string): boolean {
	return digest === `sha1:${base32(createHash("sha1").update(block).digest())}`;
}
