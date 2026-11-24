/**
 * Offline-first API cache for the PWA.
 *
 * The map snapshot in `../offline.ts` covers one panel. This module covers the
 * read-only API traffic of the four destinations: responses seen online are
 * kept in a bounded local cache and replayed, dated, when the network fails.
 *
 * Rules that must never be relaxed:
 *   - GET only, and only on an allowlist of read-only routes;
 *   - no personal data (fields such as victim/contact/actor names are redacted
 *     before a payload is written, and identity-only routes are refused);
 *   - a bounded cache with eviction, so a field device cannot be filled up;
 *   - cached data is always labelled with its age, never called "up to date".
 */

export type OfflineStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export type CachedValue<T> = { value: T; at: number };

export const CACHE_PREFIX = "radar:pwa:";
export const INDEX_KEY = `${CACHE_PREFIX}index`;
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_BYTES = 2_500_000;
export const MAX_ENTRY_BYTES = 600_000;
export const MAX_ENTRIES = 120;

/**
 * Free-text casework and moderation queues must never reach localStorage:
 * they contain names, accusations and evidence. They stay online-only even
 * though the corresponding views have offline shells.
 */
export const CONFIDENTIAL_ROUTES = ["/journal", "/quarantine"] as const;

const FREE_TEXT_FRAGMENTS = [
	"raison", "reason", "resume", "sujet", "subject", "preuve", "proof",
	"motif", "commentaire", "comment", "message", "note", "detail",
	"description", "texte", "text", "contenu", "content", "extrait",
	"justification", "temoignage", "declaration",
] as const;

/**
 * Aggregate breakdowns are schema, not prose: `parMotif` carries the coded
 * reasons CouvertureView renders and `motifs` the rejection counters. They
 * must be traversed rather than replaced, so the cached view keeps its arrays.
 */
const AGGREGATE_KEYS: Record<string, true> = {
	motifs: true,
	parmotif: true,
};

/** A controlled code inside an aggregate, never a victim's own words. */
const AGGREGATE_ENUM_KEYS: Record<string, true> = { motif: true };

const CODE_PATTERN = /^[a-z0-9_:-]+$/i;

/** Compare keys without accents or separators: `résumé` and `resume` agree. */
function cleNormee(cle: string): string {
	return cle
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

/**
 * The four destinations of the shell. Legacy screens are panels or tabs inside
 * them: their API endpoints stay cacheable as data, but are not offline views.
 */
export const OFFLINE_VIEWS = ["map", "action", "sources", "journal"] as const;

export type OfflineRoute = { prefix: string; views: readonly string[] };

/** Read-only routes used by the shell, grouped by destination. */
export const OFFLINE_ROUTES: readonly OfflineRoute[] = [
	{ prefix: "/orgs", views: ["map"] },
	{ prefix: "/events", views: ["map"] },
	{ prefix: "/map", views: ["map"] },

	{ prefix: "/sources", views: ["sources"] },
	{ prefix: "/stats", views: ["map", "sources"] },
	{ prefix: "/graph", views: ["map"] },
	{ prefix: "/na", views: ["map"] },
	{ prefix: "/today", views: ["map"] },
	{ prefix: "/corpus", views: ["sources"] },
	{ prefix: "/couverture", views: ["map"] },
	{ prefix: "/health", views: ["sources"] },
	{ prefix: "/flows", views: ["map"] },
	{ prefix: "/collecte", views: ["sources"] },
	{ prefix: "/directory", views: ["map"] },
	{ prefix: "/search", views: ["map"] },
	{ prefix: "/alerts", views: ["action"] },
	{ prefix: "/review", views: ["action"] },
	{ prefix: "/quarantine", views: ["action"] },
	{ prefix: "/journal", views: ["journal"] },
	{ prefix: "/enrich", views: ["map"] },
	{ prefix: "/actor-attributions", views: ["map"] },
	{ prefix: "/warc/proofs", views: ["sources"] },
	{ prefix: "/custody", views: ["journal"] },
];

/** Routes that can carry identity or message bodies: never written to disk. */
export const REFUSED_ROUTES = ["/auth", "/rectifications", "/dossier"] as const;

const PERSONAL_KEYS: Record<string, true> = {
	acteur: true, author: true, auteur: true, by: true, contactnom: true,
	contact_nom: true, email: true, firstname: true, first_name: true,
	lastname: true, last_name: true, phone: true, prenom: true,
	promotedby: true, promoted_by: true, ackedby: true, acked_by: true,
	victim: true, victime: true,
};

function matches(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(`${prefix}/`);
}

/** True only for a safe, read-only API path. The caller passes a path after `/api`. */
export function isCacheable(method: string, path: string): boolean {
	if (method.toUpperCase() !== "GET") return false;
	const clean = path.split("?")[0] || "/";
	if ([...REFUSED_ROUTES, ...CONFIDENTIAL_ROUTES].some((prefix) => matches(clean, prefix))) return false;
	return OFFLINE_ROUTES.some((route) => matches(clean, route.prefix));
}

/** Filter order must not multiply cache entries or hide a different query. */
export function normalizePath(path: string): string {
	const split = path.indexOf("?");
	if (split < 0) return path;
	const base = path.slice(0, split);
	const pairs = Array.from(new URLSearchParams(path.slice(split + 1)).entries())
		.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
	const query = new URLSearchParams(pairs).toString();
	return query ? `${base}?${query}` : base;
}

type RedactionContext = { confidential: boolean; aggregate: boolean };

function redact(value: unknown, context: RedactionContext): unknown {
	if (Array.isArray(value)) return value.map((item) => redact(item, context));
	if (value !== null && typeof value === "object") {
		const clean: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			const normee = cleNormee(key);
			const aggregate = AGGREGATE_KEYS[normee] === true;
			const code = context.aggregate && AGGREGATE_ENUM_KEYS[normee] === true
				&& typeof item === "string" && CODE_PATTERN.test(item);
			const confidentiel = !aggregate && !code && (
				PERSONAL_KEYS[key.toLowerCase()] === true || PERSONAL_KEYS[normee] === true
				|| FREE_TEXT_FRAGMENTS.some((fragment) => normee.includes(fragment))
			);
			clean[key] = redact(item, {
				confidential: context.confidential || confidentiel,
				aggregate: context.aggregate || aggregate,
			});
		}
		return clean;
	}
	return context.confidential && typeof value === "string" ? "[redacted]" : value;
}

/**
 * Remove identity-bearing fields and any free-text field recursively,
 * including inside arrays. The marker replaces scalar values only: arrays
 * and objects keep their shape, so a cached view still renders its counters,
 * its aggregate breakdowns and its timestamp.
 */
export function redactPersonalData(value: unknown): unknown {
	return redact(value, { confidential: false, aggregate: false });
}


type IndexEntry = { key: string; at: number; bytes: number };
type Stored<T> = { value: T; at: number };

type FallbackListener = (info: { path: string; at: number }) => void;
const listeners = new Set<FallbackListener>();
let lastFallback: { path: string; at: number } | null = null;

export function onOfflineFallback(listener: FallbackListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function lastOfflineFallback(): { path: string; at: number } | null {
	return lastFallback;
}

/** Test seam: forget which fallback was used in a previous session. */
export function resetOfflineFallback(): void {
	lastFallback = null;
}

export class OfflineApiCache {
	constructor(
		private readonly storage: OfflineStorage | null,
		private readonly now: () => number = Date.now,
	) {
		this.purgeConfidential();
	}

	/** An older build may have written confidential entries: drop them now. */
	private purgeConfidential(): void {
		if (this.storage === null) return;
		const index = this.readIndex();
		const kept = index.filter((entry) => {
			try {
				const path = normalizePath(decodeURIComponent(entry.key)).split("?")[0] || "/";
				return !CONFIDENTIAL_ROUTES.some((prefix) => matches(path, prefix));
			} catch {
				return false;
			}
		});
		if (kept.length === index.length) return;
		for (const entry of index) {
			if (!kept.includes(entry)) this.drop(entry.key);
		}
		this.writeIndex(kept);
	}


	private entryKey(key: string): string {
		return `${CACHE_PREFIX}entry:${encodeURIComponent(key)}`;
	}

	private readIndex(): IndexEntry[] {
		if (this.storage === null) return [];
		try {
			const raw = this.storage.getItem(INDEX_KEY);
			if (raw === null) return [];
			const parsed: unknown = JSON.parse(raw);
			if (!Array.isArray(parsed)) return [];
			return parsed.filter((entry): entry is IndexEntry =>
				entry !== null && typeof entry === "object"
				&& typeof (entry as IndexEntry).key === "string"
				&& typeof (entry as IndexEntry).at === "number"
				&& typeof (entry as IndexEntry).bytes === "number",
			);
		} catch {
			return [];
		}
	}

	private writeIndex(index: IndexEntry[]): void {
		if (this.storage === null) return;
		try {
			this.storage.setItem(INDEX_KEY, JSON.stringify(index));
		} catch {
			// A full quota must not break the online path.
		}
	}

	private drop(key: string): void {
		try {
			this.storage?.removeItem(this.entryKey(key));
		} catch {
			// Nothing else can be done if storage refuses a removal.
		}
	}

	/** Evict oldest entries first, both by count and by total bytes. */
	private trimmed(index: IndexEntry[]): IndexEntry[] {
		const chronological = [...index].sort((a, b) => a.at - b.at);
		const evicted: IndexEntry[] = [];
		while (chronological.length > MAX_ENTRIES) evicted.push(chronological.shift()!);
		let bytes = chronological.reduce((sum, entry) => sum + entry.bytes, 0);
		while (chronological.length > 0 && bytes > MAX_BYTES) {
			const oldest = chronological.shift()!;
			bytes -= oldest.bytes;
			evicted.push(oldest);
		}
		for (const entry of evicted) this.drop(entry.key);
		return chronological;
	}

	/** Store a response after a successful online read. Returns true when kept. */
	remember(method: string, path: string, payload: unknown, status = 200): boolean {
		if (!isCacheable(method, path) || status < 200 || status >= 300 || this.storage === null) return false;
		const key = normalizePath(path);
		const clean = redactPersonalData(payload);
		let stored: string;
		try {
			stored = JSON.stringify({ value: clean, at: this.now() } satisfies Stored<unknown>);
		} catch {
			return false;
		}
		const bytes = stored.length;
		if (bytes > MAX_ENTRY_BYTES) return false;
		try {
			this.storage.setItem(this.entryKey(key), stored);
		} catch {
			return false;
		}
		const at = this.now();
		const index = this.readIndex().filter((entry) => entry.key !== key);
		index.push({ key, at, bytes });
		this.writeIndex(this.trimmed(index));
		return true;
	}

	/** Replay a dated payload only when the network read failed. */
	recall<T>(method: string, path: string): CachedValue<T> | null {
		if (!isCacheable(method, path) || this.storage === null) return null;
		const key = normalizePath(path);
		let raw: string | null = null;
		try {
			raw = this.storage.getItem(this.entryKey(key));
		} catch {
			return null;
		}
		if (raw === null) return null;
		try {
			const parsed = JSON.parse(raw) as Stored<T>;
			const now = this.now();
			if (typeof parsed?.at !== "number" || !("value" in parsed)) throw new Error("invalid entry");
			if (now - parsed.at > MAX_AGE_MS || parsed.at - now > 60_000) throw new Error("stale entry");
			lastFallback = { path: key, at: parsed.at };
			for (const listener of listeners) listener(lastFallback);
			return { value: parsed.value, at: parsed.at };
		} catch {
			this.drop(key);
			this.writeIndex(this.readIndex().filter((entry) => entry.key !== key));
			return null;
		}
	}

	/** Forget every cached response, for example when the user signs out. */
	clear(): void {
		if (this.storage === null) return;
		try {
			const keys: string[] = [];
			for (let i = 0; i < this.storage.length; i += 1) {
				const key = this.storage.key(i);
				if (key?.startsWith(CACHE_PREFIX)) keys.push(key);
			}
			for (const key of keys) this.storage.removeItem(key);
		} catch {
			// The cache is best effort; sign-out must still complete.
		}
		resetOfflineFallback();
	}
}

/** Honest status for the banner: cached data is never presented as live. */
export function offlineStatus(cachedAt: number | null, now: number): { state: "perime" | "absent"; label: string } {
	if (cachedAt === null || !Number.isFinite(cachedAt)) {
		return { state: "absent", label: "Offline · no cached data for this view" };
	}
	const minutes = Math.max(0, Math.floor((now - cachedAt) / 60_000));
	if (minutes < 1) return { state: "perime", label: "Offline · cached data from this session" };
	if (minutes < 60) return { state: "perime", label: `Offline · cached data from ${minutes} min ago` };
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return { state: "perime", label: `Offline · cached data from ${hours} h ago` };
	return { state: "perime", label: `Offline · cached data from ${Math.floor(hours / 24)} d ago` };
}
