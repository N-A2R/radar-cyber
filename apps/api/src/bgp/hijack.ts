/**
 * Passive detection of BGP prefix hijacks affecting Nouvelle-Aquitaine operators.
 *
 * The detector is pure: no clock, no database, no network. It consumes
 * announcements observed by public route collectors and returns alerts carrying
 * only operator identifiers, prefixes, AS numbers and observation metadata.
 * No victim personal data is read or produced.
 */

export type HijackKind = "more-specific" | "origin-change";

export interface BgpOperator {
	asn: number;
	name: string;
	region: string;
	prefixes?: readonly string[];
}

export interface BgpAnnouncement {
	timestamp: string;
	prefix: string;
	originAs: number | null;
	type?: string;
	peer?: string;
	source?: string;
}

export interface HijackAlert {
	prefix: string;
	parentPrefix: string;
	kind: HijackKind;
	operator: string;
	expectedAs: number;
	observedAs: number;
	timestamp: string;
	peer: string;
	source: string;
}

interface ParsedPrefix {
	version: 4 | 6;
	base: bigint;
	bits: number;
	total: number;
}

function prefixMask(bits: number, total: number): bigint {
	if (bits <= 0) return 0n;
	return ((1n << BigInt(bits)) - 1n) << BigInt(total - bits);
}

/** Parse an IPv4 or IPv6 CIDR prefix; return null for malformed input. */
export function parsePrefix(value: string): ParsedPrefix | null {
	const [address, bitsText, extra] = value.trim().split("/");
	if (!address || extra !== undefined || !bitsText || !/^\d{1,3}$/.test(bitsText)) return null;
	const bits = Number(bitsText);

	if (address.includes(":")) {
		if (bits > 128) return null;
		const halves = address.split("::");
		if (halves.length > 2) return null;
		const left = halves[0] ? halves[0].split(":") : [];
		const right = halves[1] ? halves[1].split(":") : [];
		if (halves.length === 1 && left.length !== 8) return null;
		if (halves.length === 2 && left.length + right.length > 7) return null;
		const groups = [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
		let base = 0n;
		for (const group of groups) {
			if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
			base = (base << 16n) | BigInt(parseInt(group, 16));
		}
		return { version: 6, base: base & prefixMask(bits, 128), bits, total: 128 };
	}

	const parts = address.split(".");
	if (parts.length !== 4 || bits > 32) return null;
	let base = 0n;
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return null;
		const octet = Number(part);
		if (octet > 255) return null;
		base = (base << 8n) | BigInt(octet);
	}
	return { version: 4, base: base & prefixMask(bits, 32), bits, total: 32 };
}

/** True when `child` is inside `parent` (same address family, equal or longer mask). */
export function prefixContains(parent: ParsedPrefix, child: ParsedPrefix): boolean {
	if (parent.version !== child.version || child.bits < parent.bits) return false;
	// Compare the network bits of both absolute addresses: drop the parent's
	// host bits, not merely the difference between the two mask lengths.
	const shift = BigInt(parent.total - parent.bits);
	return child.base >> shift === parent.base >> shift;
}

export interface DetectOptions {
	/** AS numbers explicitly allowed to originate an observed prefix. */
	allowedOrigins?: readonly number[];
	/** Only operators of this region are monitored. Defaults to Nouvelle-Aquitaine. */
	region?: string;
}

/**
 * Detect unexpected origins for prefixes covered by scoped operators.
 *
 * Expected prefixes are taken from the operator definition when provided, then
 * completed from the observed announcements originated by the operator itself.
 * Withdrawals and duplicate (prefix, origin, operator) triples are ignored.
 */
export function detectPrefixHijacks(
	announcements: readonly BgpAnnouncement[],
	operators: readonly BgpOperator[],
	options: DetectOptions = {},
): HijackAlert[] {
	const region = options.region ?? "NA";
	const scoped = operators.filter((operator) => operator.region === region);
	const byAsn = new Map<number, BgpOperator>();
	for (const operator of scoped) byAsn.set(operator.asn, operator);
	if (byAsn.size === 0) return [];

	const expected = new Map<number, Array<{ prefix: string; parsed: ParsedPrefix }>>();
	for (const operator of scoped) expected.set(operator.asn, []);
	for (const operator of scoped) {
		for (const prefix of operator.prefixes ?? []) {
			const parsed = parsePrefix(prefix);
			if (!parsed) continue;
			expected.get(operator.asn)!.push({ prefix, parsed });
		}
	}
	for (const announcement of announcements) {
		if (announcement.originAs == null) continue;
		const list = expected.get(announcement.originAs);
		if (!list || list.some((entry) => entry.prefix === announcement.prefix)) continue;
		const parsed = parsePrefix(announcement.prefix);
		if (parsed) list.push({ prefix: announcement.prefix, parsed });
	}

	const allowed = new Set(options.allowedOrigins ?? []);
	const seen = new Set<string>();
	const alerts: HijackAlert[] = [];
	for (const announcement of announcements) {
		if ((announcement.type ?? "A").toUpperCase() !== "A") continue;
		if (announcement.originAs == null || allowed.has(announcement.originAs)) continue;
		const parsed = parsePrefix(announcement.prefix);
		if (!parsed) continue;

		let best: { operator: BgpOperator; parent: string; bits: number } | null = null;
		for (const [asn, entries] of expected) {
			for (const entry of entries) {
				if (!prefixContains(entry.parsed, parsed)) continue;
				if (best && entry.parsed.bits <= best.bits) continue;
				best = { operator: byAsn.get(asn)!, parent: entry.prefix, bits: entry.parsed.bits };
			}
		}
		if (!best || best.operator.asn === announcement.originAs) continue;

		const key = `${announcement.prefix}|${announcement.originAs}|${best.operator.asn}`;
		if (seen.has(key)) continue;
		seen.add(key);

		alerts.push({
			prefix: announcement.prefix,
			parentPrefix: best.parent,
			kind: announcement.prefix === best.parent ? "origin-change" : "more-specific",
			operator: best.operator.name,
			expectedAs: best.operator.asn,
			observedAs: announcement.originAs,
			timestamp: announcement.timestamp,
			peer: announcement.peer ?? "unknown",
			source: announcement.source ?? "observed",
		});
	}

	return alerts.sort(
		(left, right) => left.timestamp.localeCompare(right.timestamp) || left.prefix.localeCompare(right.prefix),
	);
}

/** Guard used by the measurement script: alert payloads must stay non-personal. */
export function personalDataFindings(alerts: readonly HijackAlert[]): string[] {
	const text = JSON.stringify(alerts);
	const findings: string[] = [];
	if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) findings.push("email");
	if (/(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/.test(text)) findings.push("phone");
	if (/\b(?:victim|first.?name|last.?name)\b/i.test(text)) findings.push("personal-label");
	return findings;
}
