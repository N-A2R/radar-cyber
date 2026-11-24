/**
 * Contrôles réseau partagés par les collecteurs, la découverte et le TSA.
 *
 * Une seule politique : http(s) sans identifiants, pas d'IP privée (même
 * après résolution DNS), redirections manuelles revérifiées à chaque saut,
 * corps et sortie décompressée strictement bornés. L'adresse validée est
 * épinglée via le dispatcher undici de chaque saut (lookup intercepté), ce
 * qui supprime le TOCTOU DNS ; chaque saut est résolu et revérifié avant
 * sa requête.
 */
import type { LookupAddress, LookupOptions } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { Agent, fetch as undiciFetch, interceptors, type BodyInit as UndiciBodyInit, type Dispatcher } from "undici";

export const MAX_HTTP_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_DECOMPRESSED_BYTES = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
export const MAX_TSA_RESPONSE_BYTES = 512 * 1024;
const DNS_TIMEOUT_MS = 2000;

export class UnsafeUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UnsafeUrlError";
	}
}

export class NetworkLimitError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NetworkLimitError";
	}
}

type V4Range = readonly [base: number, bits: number];
const V4_RANGES: readonly V4Range[] = [
	[0x00000000, 8],       // 0.0.0.0/8
	[0x0a000000, 8],       // 10.0.0.0/8
	[0x64400000, 10],      // 100.64.0.0/10 (CGNAT)
	[0x7f000000, 8],       // 127.0.0.0/8
	[0xa9fe0000, 16],      // 169.254.0.0/16 (metadata cloud)
	[0xac100000, 12],      // 172.16.0.0/12
	[0xc0000000, 24],      // 192.0.0.0/24
	[0xc0000200, 24],      // 192.0.2.0/24 (documentation)
	[0xc0580000, 24],      // 192.88.99.0/24 (relais 6to4)
	[0xc0a80000, 16],      // 192.168.0.0/16
	[0xc2120000, 15],      // 198.18.0.0/15 (benchmark)
	[0xc6336400, 24],      // 198.51.100.0/24 (documentation)
	[0xcb007100, 24],      // 203.0.113.0/24 (documentation)
	[0xe0000000, 4],       // 224.0.0.0/4 (multicast)
	[0xf0000000, 4],       // 240.0.0.0/4 (réservé)
];

function v4Number(ip: string): number {
	const parts = ip.split(".");
	if (parts.length !== 4) return -1;
	let n = 0;
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part ?? "")) return -1;
		const octet = Number(part);
		if (octet > 255) return -1;
		n = n * 256 + octet;
	}
	return n >>> 0;
}

function matchesV4(value: number, base: number, bits: number): boolean {
	const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
	return (value & mask) === (base & mask);
}

function isPrivateV4(ip: string): boolean {
	const value = v4Number(ip);
	return value < 0 || V4_RANGES.some(([base, bits]) => matchesV4(value, base, bits));
}

function v6Words(ip: string): number[] | null {
	const clean = ip.split("%")[0] ?? "";
	const double = clean.indexOf("::");
	if (double >= 0 && clean.indexOf("::", double + 2) >= 0) return null;
	const head = double >= 0 ? clean.slice(0, double) : clean;
	const tail = double >= 0 ? clean.slice(double + 2) : "";
	const parse = (part: string): number[] | null => {
		if (!part) return [];
		const words: number[] = [];
		for (const group of part.split(":")) {
			if (group.includes(".")) {
				if (isIP(group) !== 4) return null;
				const bytes = group.split(".").map(Number);
				words.push(((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0), ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0));
				continue;
			}
			if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
			words.push(Number.parseInt(group, 16));
		}
		return words;
	};
	const before = parse(head);
	const after = parse(tail);
	if (!before || !after) return null;
	const fill = 8 - before.length - after.length;
	if (double >= 0 ? fill < 1 : fill !== 0) return null;
	return [...before, ...Array.from({ length: Math.max(0, fill) }, () => 0), ...after];
}

function matchesV6(words: number[], prefix: readonly number[], bits: number): boolean {
	const whole = Math.floor(bits / 16);
	for (let i = 0; i < whole; i += 1) if (words[i] !== prefix[i]) return false;
	if (bits % 16 === 0) return true;
	const shift = 16 - (bits % 16);
	return ((words[whole] ?? 0) >>> shift) === ((prefix[whole] ?? 0) >>> shift);
}

function isPrivateV6(ip: string): boolean {
	const w = v6Words(ip);
	if (!w) return true;
	const prefixes: Array<[readonly number[], number]> = [
		[[0, 0, 0, 0, 0, 0, 0, 0], 128],       // ::
		[[0, 0, 0, 0, 0, 0, 0, 1], 128],       // ::1
		[[0xfc00, 0, 0, 0, 0, 0, 0, 0], 7],    // fc00::/7
		[[0xfe80, 0, 0, 0, 0, 0, 0, 0], 10],   // fe80::/10
		[[0x2001, 0x0db8, 0, 0, 0, 0, 0, 0], 32], // documentation
		[[0x0064, 0xff9b, 1, 0, 0, 0, 0, 0], 48], // NAT64 local
		[[0xff00, 0, 0, 0, 0, 0, 0, 0], 8],    // multicast
	];
	if (prefixes.some(([prefix, bits]) => matchesV6(w, prefix, bits))) return true;
	const mapped = matchesV6(w, [0, 0, 0, 0, 0, 0xffff, 0, 0], 96);
	const nat64 = w[0] === 0x0064 && w[1] === 0xff9b && w.slice(2, 6).every((part) => part === 0);
	const compatible = matchesV6(w, [0, 0, 0, 0, 0, 0, 0, 0], 96);
	const sixToFour = w[0] === 0x2002;
	if (mapped || sixToFour || nat64 || compatible) {
		const embedded = `${((w[6] ?? 0) >>> 8) & 0xff}.${(w[6] ?? 0) & 0xff}.${((w[7] ?? 0) >>> 8) & 0xff}.${(w[7] ?? 0) & 0xff}`;
		return isPrivateV4(embedded);
	}
	return false;
}

export function isPublicIp(ip: string): boolean {
	const version = isIP(ip);
	if (version === 4) return !isPrivateV4(ip);
	if (version === 6) return !isPrivateV6(ip);
	return false;
}

/** Domaine RFC 1123 nu (pas d'IP, d'URL, de joker ou de label numérique). */
export function assertPublicDomain(value: string): string {
	const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
	const domain = raw.endsWith(".") ? raw.slice(0, -1) : raw;
	if (domain.length < 4 || domain.length > 253 || isIP(domain) !== 0) {
		throw new UnsafeUrlError("domaine invalide");
	}
	const labels = domain.split(".");
	if (labels.length < 2) throw new UnsafeUrlError("domaine invalide");
	for (const label of labels) {
		if (label.length < 1 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) {
			throw new UnsafeUrlError("domaine invalide");
		}
	}
	if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(labels[labels.length - 1] ?? "")) {
		throw new UnsafeUrlError("domaine invalide");
	}
	return domain;
}

export type SafeUrlOptions = {
	resolve?: boolean;
	/** Uniquement pour un serveur local explicite en test (jamais en production). */
	allowPrivate?: boolean;
	/** Graines de découverte : refuser même une IP publique littérale. */
	rejectIpLiteral?: boolean;
};
export type StaticUrl = { url: URL; hostname: string };
export type CheckedUrl = StaticUrl & { addresses: string[] };

/** Contrôle sans DNS : utilisable par les parseurs et les graines de découverte. */
export function assertStaticHttpUrl(input: string, options: SafeUrlOptions = {}): StaticUrl {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new UnsafeUrlError("URL invalide");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new UnsafeUrlError(`protocole refusé : ${url.protocol}`);
	}
	if (url.username || url.password) throw new UnsafeUrlError("identifiants dans l'URL refusés");
	const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
	if (!hostname) throw new UnsafeUrlError("hôte absent");
	if (options.allowPrivate && process.env.NODE_ENV === "production") {
		throw new UnsafeUrlError("les hôtes privés sont interdits en production");
	}
	if (/^(?:localhost|.*\.(?:localhost|local|internal))$/.test(hostname)) {
		throw new UnsafeUrlError(`hôte local refusé : ${hostname}`);
	}
	const version = isIP(hostname);
	if (version !== 0) {
		if (options.rejectIpLiteral) throw new UnsafeUrlError(`hôte littéral IP refusé : ${hostname}`);
		if (!options.allowPrivate && !isPublicIp(hostname)) {
			throw new UnsafeUrlError(`adresse IP non publique refusée : ${hostname}`);
		}
		return { url, hostname };
	}
	if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(hostname)) {
		throw new UnsafeUrlError(`hôte invalide : ${hostname}`);
	}
	return { url, hostname };
}

export async function assertSafeFetchUrl(input: string, options: SafeUrlOptions = {}): Promise<CheckedUrl> {
	const { url, hostname } = assertStaticHttpUrl(input, options);
	if (isIP(hostname) !== 0) return { url, hostname, addresses: [hostname] };
	// `.test`/`.invalid`/`.example` ne résolvent jamais sur l'Internet public (RFC 6761).
	if (options.resolve === false || hostname.endsWith(".test") || hostname.endsWith(".invalid") || hostname.endsWith(".example")) {
		return { url, hostname, addresses: [] };
	}
	let resolved: LookupAddress[];
	const { promise: dnsTimeout, reject: onDnsTimeout } = Promise.withResolvers<LookupAddress[]>();
	const dnsTimer = setTimeout(() => onDnsTimeout(new Error("DNS timeout")), DNS_TIMEOUT_MS);
	try {
		resolved = await Promise.race([lookup(hostname, { all: true, verbatim: true }), dnsTimeout]);
	} catch {
		throw new UnsafeUrlError(`résolution DNS impossible : ${hostname}`);
	} finally {
		clearTimeout(dnsTimer);
	}
	if (resolved.length === 0) throw new UnsafeUrlError(`aucune adresse pour ${hostname}`);
	if (!options.allowPrivate && resolved.some((entry) => !isPublicIp(entry.address))) {
		throw new UnsafeUrlError(`résolution DNS vers une adresse non publique : ${hostname}`);
	}
	return { url, hostname, addresses: resolved.map((entry) => entry.address) };
}

/** URL `.onion` : jamais résolue ici, elle sort uniquement par le proxy SOCKS. */
export function assertOnionFetchUrl(input: string): URL {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new UnsafeUrlError("URL .onion invalide");
	}
	if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
		throw new UnsafeUrlError("URL .onion invalide");
	}
	if (!url.hostname.toLowerCase().replace(/\.$/, "").endsWith(".onion")) {
		throw new UnsafeUrlError("hôte .onion attendu");
	}
	return url;
}

export type BoundedFetchOptions = {
	headers?: Record<string, string>;
	method?: string;
	body?: UndiciBodyInit;
	timeoutMs?: number;
	signal?: AbortSignal;
	maxBytes?: number;
	maxRedirects?: number;
	allowPrivate?: boolean;
	rejectIpLiteral?: boolean;
	fetchImpl?: typeof globalThis.fetch;
};

export type HeaderReader = { get(name: string): string | null };
export type HttpResponse = {
	status: number;
	headers: HeaderReader;
	body: {
		getReader(): {
			read(): Promise<{ done: boolean; value?: Uint8Array }>;
			cancel(): Promise<void>;
			releaseLock(): void;
		};
		cancel(): Promise<void>;
	} | null;
};

export type BoundedFetchResult = {
	status: number;
	headers: HeaderReader;
	buffer: Buffer;
	url: string;
};

function redirectHeaders(headers: Record<string, string>, from: URL, to: URL): Record<string, string> {
	if (from.origin === to.origin) return headers;
	const allowed: Record<string, true> = { accept: true, "accept-language": true, "user-agent": true };
	return Object.fromEntries(Object.entries(headers).filter(([name]) => allowed[name.toLowerCase()] === true));
}

/** Corps lu au plus `maxBytes` : l'excédent déclenche une erreur, jamais un buffer géant. */
export async function readBoundedBody(response: HttpResponse, maxBytes = MAX_HTTP_BODY_BYTES): Promise<Buffer> {
	const declared = response.headers.get("content-length");
	if (declared && /^\d+$/.test(declared.trim()) && Number(declared) > maxBytes) {
		void response.body?.cancel().catch(() => {});
		throw new NetworkLimitError(`corps trop volumineux (${declared} octets > ${maxBytes})`);
	}
	const reader = response.body?.getReader();
	if (!reader) return Buffer.alloc(0);
	const chunks: Buffer[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			total += value.byteLength;
			if (total > maxBytes) {
				await reader.cancel().catch(() => {});
				throw new NetworkLimitError(`corps trop volumineux (> ${maxBytes} octets)`);
			}
			chunks.push(Buffer.from(value));
		}
	} finally {
		reader.releaseLock();
	}
	return Buffer.concat(chunks, total);
}

/** Idem pour les flux Node (chemin Tor `http.request`). */
export function readBoundedStream(stream: Readable, maxBytes = MAX_HTTP_BODY_BYTES): Promise<Buffer> {
	const { promise, resolve, reject } = Promise.withResolvers<Buffer>();
	const chunks: Buffer[] = [];
	let total = 0;
	const onData = (chunk: Buffer) => {
		total += chunk.length;
		if (total > maxBytes) {
			stream.destroy(new NetworkLimitError(`flux trop volumineux (> ${maxBytes} octets)`));
			return;
		}
		chunks.push(chunk);
	};
	stream.on("data", onData);
	stream.on("end", () => resolve(Buffer.concat(chunks, total)));
	stream.on("error", (err) => {
		stream.off("data", onData);
		reject(err);
	});
	return promise;
}

export type PinnedDnsRecord = { address: string; ttl: number; family: 4 | 6 };

/** Lookup undici qui ne peut répondre que les adresses déjà validées. */
export function pinnedDnsLookup(addresses: readonly string[]): (
	origin: URL,
	options: LookupOptions,
	callback: (error: NodeJS.ErrnoException | null, found: PinnedDnsRecord[]) => void,
) => void {
	const records: PinnedDnsRecord[] = addresses.map((address) => ({
		address,
		ttl: 60,
		family: isIP(address) === 6 ? 6 : 4,
	}));
	return (_origin, _options, callback) => callback(null, records);
}

/** GET borné, redirections manuelles : chaque saut est revalidé et épinglé. */
export async function fetchBounded(input: string, options: BoundedFetchOptions = {}): Promise<BoundedFetchResult> {
	const useInjected = options.fetchImpl !== undefined;
	const doFetch = options.fetchImpl ?? globalThis.fetch;
	const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
	const maxBytes = options.maxBytes ?? MAX_HTTP_BODY_BYTES;
	const signal = options.signal ?? (options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined);
	let current = input;
	let headers = options.headers ?? {};
	for (let hop = 0; hop <= maxRedirects; hop += 1) {
		const checked = await assertSafeFetchUrl(current, {
			allowPrivate: options.allowPrivate,
			rejectIpLiteral: options.rejectIpLiteral,
		});
		let dispatcher: Dispatcher | undefined;
		if (!useInjected) {
			if (checked.addresses.length === 0) {
				throw new UnsafeUrlError(`aucune adresse validée à épingler pour ${checked.hostname}`);
			}
			dispatcher = new Agent().compose(interceptors.dns({ lookup: pinnedDnsLookup(checked.addresses) }));
		}
		let response: HttpResponse;
		try {
			const init = {
				method: options.method ?? "GET",
				headers,
				body: options.body,
				redirect: "manual",
				signal,
			} as const;
			response = dispatcher
				? await undiciFetch(current, { ...init, dispatcher })
				: await doFetch(current, init);
			const location = response.headers.get("location");
			if ([301, 302, 303, 307, 308].includes(response.status) && location) {
				if (hop === maxRedirects) {
					void response.body?.cancel().catch(() => {});
					throw new UnsafeUrlError("trop de redirections HTTP");
				}
				const from = new URL(current);
				current = new URL(location, from).href;
				headers = redirectHeaders(headers, from, new URL(current));
				void response.body?.cancel().catch(() => {});
				continue;
			}
			if (response.status < 200 || (response.status >= 300 && response.status < 400)) {
				void response.body?.cancel().catch(() => {});
				return { status: response.status, headers: response.headers, buffer: Buffer.alloc(0), url: current };
			}
			const buffer = await readBoundedBody(response, maxBytes);
			return { status: response.status, headers: response.headers, buffer, url: current };
		} finally {
			if (dispatcher) await dispatcher.close();
		}
	}
	throw new UnsafeUrlError("trop de redirections HTTP");
}

/** Décompression synchrone mais à sortie bornée (zlib échoue au-delà). */
export function decompressBounded(buffer: Buffer, kind: "gzip" | "deflate" | "brotli", maxBytes = MAX_DECOMPRESSED_BYTES): Buffer {
	const limit = { maxOutputLength: maxBytes };
	try {
		if (kind === "gzip") return gunzipSync(buffer, limit);
		if (kind === "deflate") return inflateSync(buffer, limit);
		return brotliDecompressSync(buffer, limit);
	} catch (error) {
		const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
		if (code === "ERR_BUFFER_TOO_LARGE") {
			throw new NetworkLimitError(`contenu décompressé trop volumineux (> ${maxBytes} octets)`);
		}
		throw error;
	}
}

/** JSON distant borné : utilisé par les enrichissements publics. */
export async function fetchBoundedJson<T>(input: string, options: BoundedFetchOptions = {}): Promise<T> {
	const response = await fetchBounded(input, options);
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`fournisseur inaccessible (HTTP ${response.status})`);
	}
	try {
		return JSON.parse(response.buffer.toString("utf8")) as T;
	} catch {
		throw new Error("réponse fournisseur invalide");
	}
}
