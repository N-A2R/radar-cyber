/**
 * One check per offline behaviour. Shared by the test entry point and the
 * reproducible measurement command so both report the same number.
 */
import {
	CACHE_PREFIX, CONFIDENTIAL_ROUTES, INDEX_KEY, MAX_AGE_MS, MAX_BYTES, MAX_ENTRIES, MAX_ENTRY_BYTES,
	OFFLINE_ROUTES, OFFLINE_VIEWS, OfflineApiCache, isCacheable, lastOfflineFallback,
	normalizePath, offlineStatus, onOfflineFallback, redactPersonalData, resetOfflineFallback,
	type OfflineStorage,
} from "../src/offline/pwa.js";

const assert = {
	equal(actual: unknown, expected: unknown, message?: string): void {
		if (!Object.is(actual, expected)) throw new Error(message ?? `${String(actual)} != ${String(expected)}`);
	},
	notEqual(actual: unknown, expected: unknown, message?: string): void {
		if (Object.is(actual, expected)) throw new Error(message ?? `${String(actual)} == ${String(expected)}`);
	},
	deepEqual(actual: unknown, expected: unknown, message?: string): void {
		const a = JSON.stringify(actual);
		const b = JSON.stringify(expected);
		if (a !== b) throw new Error(message ?? `${a} != ${b}`);
	},
	ok(value: unknown, message?: string): void {
		if (!value) throw new Error(message ?? "valeur attendue");
	},
};

export type CheckResult = { name: string; ok: boolean; detail: string };

class MemoryStorage implements OfflineStorage {
	private readonly data = new Map<string, string>();

	get length(): number { return this.data.size; }
	key(index: number): string | null { return Array.from(this.data.keys())[index] ?? null; }
	getItem(key: string): string | null { return this.data.get(key) ?? null; }
	setItem(key: string, value: string): void { this.data.set(key, value); }
	removeItem(key: string): void { this.data.delete(key); }
	read(key: string): string | null { return this.data.get(key) ?? null; }
	keys(): string[] { return Array.from(this.data.keys()); }
}

class FailingStorage extends MemoryStorage {
	override setItem(): void { throw new Error("QuotaExceededError"); }
}

const BASE_TIME = Date.parse("2026-11-22T12:00:00.000Z");
let now = BASE_TIME;
const clock = (): number => now;

function entryKey(path: string): string {
	return `${CACHE_PREFIX}entry:${encodeURIComponent(path)}`;
}

export function runOfflineChecks(): { passed: number; total: number; results: CheckResult[] } {
	const results: CheckResult[] = [];
	const check = (name: string, run: () => void): void => {
		try {
			run();
			results.push({ name, ok: true, detail: "" });
		} catch (error) {
			results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
		}
	};

	check("every destination has a replayable read route, legacy screens do not", () => {
		assert.deepEqual([...OFFLINE_VIEWS], ["map", "action", "sources", "journal"]);
		const missing = OFFLINE_VIEWS.filter((view) => !OFFLINE_ROUTES.some((route) => route.views.includes(view)));
		assert.deepEqual(missing, []);
		for (const route of OFFLINE_ROUTES) {
			for (const view of route.views) {
				assert.ok((OFFLINE_VIEWS as readonly string[]).includes(view), `${route.prefix}: ${view}`);
			}
		}
	});

	check("write methods are never cached", () => {
		assert.equal(isCacheable("POST", "/orgs"), false);
		assert.equal(isCacheable("PUT", "/alerts/1/ack"), false);
		assert.equal(isCacheable("DELETE", "/alerts/1"), false);
		assert.equal(isCacheable("GET", "/orgs"), true);
	});

	check("identity routes are never cached", () => {
		for (const path of ["/auth/login", "/rectifications/3", "/dossier"]) {
			assert.equal(isCacheable("GET", path), false, path);
		}
	});

	check("routes outside the read allowlist are ignored", () => {
		assert.equal(isCacheable("GET", "/internal/audit"), false);
		assert.equal(isCacheable("GET", "/admin/export"), false);
	});

	check("all workspace read endpoints are allowed, including legacy panels", () => {
		const endpoints = [
			"/orgs", "/orgs/1", "/orgs/liees", "/orgs/liees/historique?jours=30", "/events",
			"/today", "/today/departements", "/directory", "/review/queue",
			"/map/timeline/buckets?dept=33", "/map/timeline/events?dept=33",
			"/corpus/stats", "/couverture", "/sources", "/health",
			"/health/detail", "/health/causes", "/collecte/metrics", "/graph", "/graph/temporal",
			"/na/overview", "/na/events?dept=33", "/alerts", "/alerts/1", "/alerts/stats",
			"/flows", "/search?q=bordeaux", "/enrich/events/1",
			"/actor-attributions", "/warc/proofs", "/custody?subject=evt-1",
		];
		for (const path of endpoints) assert.equal(isCacheable("GET", path), true, path);
	});

	check("confidential casework is never persisted", () => {
		const storage = new MemoryStorage();
		const cache = new OfflineApiCache(storage, clock);
		for (const path of CONFIDENTIAL_ROUTES) {
			const cible = `${path}/review`;
			assert.equal(isCacheable("GET", cible), false, cible);
			assert.equal(cache.remember("GET", cible, { reason: "texte sensible" }), false, cible);
			assert.equal(cache.recall("GET", cible), null, cible);
		}
		assert.equal(storage.keys().filter((key) => key.includes("entry:")).length, 0);
	});

	check("free text is redacted recursively before persistence", () => {
		const storage = new MemoryStorage();
		const cache = new OfflineApiCache(storage, clock);
		const secret = "Sophie accuse Marc — preuve confidentielle";
		const path = "/review/queue?etat=attente";
		cache.remember("GET", path, {
			rows: [{ raison: secret, nested: [{ resume: secret }] }],
			motifDominant: secret,
			commentaire: secret,
			ville: "Bordeaux",
		});
		const raw = storage.read(entryKey(path)) ?? "";
		assert.equal(raw.includes("Sophie"), false);
		assert.equal(raw.includes("preuve confidentielle"), false);
		assert.ok(raw.includes("[redacted]"));
		assert.ok(raw.includes("Bordeaux"));
		assert.deepEqual(redactPersonalData({ imbrique: [{ sujet: secret }] }), {
			imbrique: [{ sujet: "[redacted]" }],
		});
	});

	check("couverture aggregates replay offline without casework", () => {
		const secret = "Sophie accuse Marc — preuve confidentielle";
		const path = "/couverture";
		const couverture = {
			dateCalcul: "2026-11-22T12:00:00.000Z",
			hashCorpus: "corpus-couverture-52540025",
			fenetre: { debut: "2026-11-15T00:00:00.000Z", fin: "2026-11-22T00:00:00.000Z" },
			global: { vus: 8, total: 10, taux: 80 },
			parMotif: [
				{ motif: "vu", incidents: 8, part: 80 },
				{ motif: "pas_rattache", incidents: 2, part: 20 },
			],
			parDepartement: [{ departement: "33", vus: 8, total: 10, taux: 80 }],
			parType: [{ type: "association", vus: 8, total: 10, taux: 80 }],
			stale: false,
			victime: secret,
			notes: [secret],
		};
		const storage = new MemoryStorage();
		const cache = new OfflineApiCache(storage, clock);
		assert.equal(cache.remember("GET", path, couverture), true);
		assert.equal(cache.remember("GET", "/journal/review", couverture), false);
		assert.equal(cache.remember("GET", "/quarantine/review", couverture), false);
		const raw = storage.read(entryKey(path)) ?? "";
		assert.equal(raw.includes("Sophie"), false);
		const stored = JSON.parse(raw) as { value: typeof couverture; at: number };
		assert.equal(stored.at, BASE_TIME);
		assert.deepEqual(stored.value.global, couverture.global);
		assert.deepEqual(stored.value.fenetre, couverture.fenetre);
		assert.deepEqual(stored.value.parMotif, couverture.parMotif);
		assert.deepEqual(stored.value.parDepartement, couverture.parDepartement);
		assert.deepEqual(stored.value.parType, couverture.parType);
		assert.equal(stored.value.stale, false);
		assert.equal(stored.value.victime, "[redacted]");
		assert.deepEqual(stored.value.notes, ["[redacted]"]);
		assert.deepEqual(redactPersonalData({ parMotif: [] }), { parMotif: [] });
		const hit = cache.recall<typeof couverture>("GET", path);
		assert.ok(hit);
		assert.deepEqual(hit?.value.parMotif, couverture.parMotif);
	});

	check("confidential entries written by an older build are purged", () => {
		const storage = new MemoryStorage();
		storage.setItem(entryKey("/journal/review"), JSON.stringify({ value: { raison: "secret" }, at: BASE_TIME }));
		storage.setItem(INDEX_KEY, JSON.stringify([{ key: "/journal/review", at: BASE_TIME, bytes: 40 }]));
		new OfflineApiCache(storage, clock);
		assert.equal(storage.read(entryKey("/journal/review")), null);
		assert.deepEqual(JSON.parse(storage.read(INDEX_KEY) ?? "[]"), []);
	});

	check("map timeline buckets and events replay offline", () => {
		assert.ok(OFFLINE_ROUTES.some((route) => route.prefix === "/map" && route.views.includes("map")));
		const buckets = "/map/timeline/buckets?dept=33";
		const events = "/map/timeline/events?dept=33";
		assert.equal(isCacheable("GET", buckets), true);
		assert.equal(isCacheable("GET", events), true);
		const cache = new OfflineApiCache(new MemoryStorage(), clock);
		assert.equal(cache.remember("GET", buckets, { buckets: [] }), true);
		assert.ok(cache.recall("GET", buckets));
	});

	check("filter order does not multiply cache keys or rename filters", () => {
		assert.equal(normalizePath("/events?b=2&a=1&a=0"), normalizePath("/events?a=0&a=1&b=2"));
		assert.equal(
			normalizePath("/events?family=phishing&dept=33&page=2"),
			"/events?dept=33&family=phishing&page=2",
		);
	});

	check("an online read is written through to the cache", () => {
		const cache = new OfflineApiCache(new MemoryStorage(), clock);
		assert.equal(cache.remember("GET", "/sources", [{ id: "src-1" }], 200), true);
		const hit = cache.recall("GET", "/sources");
		assert.deepEqual(hit?.value, [{ id: "src-1" }]);
		assert.equal(hit?.at, BASE_TIME);
	});

	check("error responses are never written to the cache", () => {
		const storage = new MemoryStorage();
		const cache = new OfflineApiCache(storage, clock);
		for (const status of [401, 404, 500]) assert.equal(cache.remember("GET", "/orgs", [], status), false);
		assert.equal(storage.keys().length, 0);
	});

	check("different filters keep separate cached payloads", () => {
		const cache = new OfflineApiCache(new MemoryStorage(), clock);
		cache.remember("GET", "/events?family=cyber&dept=33", { family: "cyber" });
		cache.remember("GET", "/events?family=phishing&dept=33", { family: "phishing" });
		assert.deepEqual(cache.recall("GET", "/events?family=cyber&dept=33")?.value, { family: "cyber" });
		assert.deepEqual(cache.recall("GET", "/events?family=phishing&dept=33")?.value, { family: "phishing" });
		assert.deepEqual(cache.recall("GET", "/events?dept=33&family=cyber")?.value, { family: "cyber" });
	});

	check("a failed read without a cached response has no fake fallback", () => {
		assert.equal(new OfflineApiCache(new MemoryStorage(), clock).recall("GET", "/events"), null);
	});

	check("entries older than the age limit are not replayed", () => {
		const cache = new OfflineApiCache(new MemoryStorage(), clock);
		cache.remember("GET", "/events", ["evt"]);
		now = BASE_TIME + MAX_AGE_MS + 1;
		assert.equal(cache.recall("GET", "/events"), null);
		now = BASE_TIME;
	});

	check("a cached date in the future is rejected", () => {
		const storage = new MemoryStorage();
		const cache = new OfflineApiCache(storage, () => BASE_TIME);
		cache.remember("GET", "/events", ["evt"]);
		now = BASE_TIME - 120_000;
		assert.equal(new OfflineApiCache(storage, clock).recall("GET", "/events"), null);
		now = BASE_TIME;
	});

	check("oversized payloads are skipped", () => {
		const storage = new MemoryStorage();
		const cache = new OfflineApiCache(storage, clock);
		assert.equal(cache.remember("GET", "/graph", "x".repeat(MAX_ENTRY_BYTES + 1)), false);
		assert.equal(storage.keys().length, 0);
	});

	check("oldest entries are evicted under the byte budget", () => {
		const storage = new MemoryStorage();
		const cache = new OfflineApiCache(storage, () => now);
		for (let i = 0; i < 12; i += 1) {
			now = BASE_TIME + i * 10_000;
			cache.remember("GET", `/graph?page=${i}`, "y".repeat(300_000));
		}
		const index = JSON.parse(storage.read(INDEX_KEY) ?? "[]") as Array<{ bytes: number }>;
		assert.ok(index.reduce((sum, entry) => sum + entry.bytes, 0) <= MAX_BYTES);
		assert.equal(storage.read(entryKey("/graph?page=0")), null);
		assert.notEqual(storage.read(entryKey("/graph?page=11")), null);
		now = BASE_TIME;
	});

	check("the entry count is bounded", () => {
		const storage = new MemoryStorage();
		const cache = new OfflineApiCache(storage, () => now);
		for (let i = 0; i < MAX_ENTRIES + 15; i += 1) {
			now = BASE_TIME + i * 1_000;
			cache.remember("GET", `/directory?page=${i}`, { page: i });
		}
		const index = JSON.parse(storage.read(INDEX_KEY) ?? "[]") as unknown[];
		assert.ok(index.length <= MAX_ENTRIES);
		now = BASE_TIME;
	});

	check("a full storage never breaks an online read", () => {
		const cache = new OfflineApiCache(new FailingStorage(), clock);
		assert.equal(cache.remember("GET", "/events", [{ id: "e" }]), false);
		assert.equal(cache.recall("GET", "/events"), null);
	});

	check("corrupt entries are discarded instead of replayed", () => {
		const storage = new MemoryStorage();
		storage.setItem(entryKey("/events"), "not-json");
		const hit = new OfflineApiCache(storage, clock).recall("GET", "/events");
		assert.equal(hit, null);
		assert.equal(storage.read(entryKey("/events")), null);
	});

	check("personal fields are redacted before a payload is stored", () => {
		const storage = new MemoryStorage();
		const cache = new OfflineApiCache(storage, clock);
		cache.remember("GET", "/review/queue", {
			rows: [{ acteur: "victim-name", email: "victim@example.test", review: [{ by: "analyst@example.test" }] }],
			contactNom: "victim-name",
		});
		const raw = storage.read(entryKey("/review/queue")) ?? "";
		assert.equal(raw.includes("victim-name"), false);
		assert.equal(raw.includes("victim@example.test"), false);
		assert.equal(raw.includes("analyst@example.test"), false);
		assert.ok(raw.includes("[redacted]"));
		assert.deepEqual(redactPersonalData({ victim: "name", city: "Bordeaux" }), { victim: "[redacted]", city: "Bordeaux" });
	});

	check("sign-out clears every cached response", () => {
		const storage = new MemoryStorage();
		const cache = new OfflineApiCache(storage, clock);
		cache.remember("GET", "/orgs", []);
		cache.remember("GET", "/sources", []);
		cache.clear();
		assert.equal(storage.keys().filter((key) => key.startsWith(CACHE_PREFIX)).length, 0);
		assert.equal(lastOfflineFallback(), null);
	});

	check("replaying a response notifies the offline banner", () => {
		const cache = new OfflineApiCache(new MemoryStorage(), clock);
		cache.remember("GET", "/today", { ok: true });
		resetOfflineFallback();
		const seen: Array<{ path: string; at: number }> = [];
		const unsubscribe = onOfflineFallback((info) => seen.push(info));
		cache.recall("GET", "/today");
		unsubscribe();
		assert.deepEqual(seen, [{ path: "/today", at: BASE_TIME }]);
		assert.deepEqual(lastOfflineFallback(), { path: "/today", at: BASE_TIME });
		resetOfflineFallback();
	});

	check("the banner is English and age-aware", () => {
		const cases: Array<[number, string]> = [
			[0, "this session"], [45 * 60_000, "45 min ago"],
			[3 * 60 * 60_000, "3 h ago"], [3 * 24 * 60 * 60_000, "3 d ago"],
		];
		for (const [age, expected] of cases) {
			const { label, state } = offlineStatus(BASE_TIME - age, BASE_TIME);
			assert.equal(state, "perime");
			assert.ok(label.startsWith("Offline · cached data from "), label);
			assert.ok(label.includes(expected), label);
			assert.equal(/à jour|hors ligne/i.test(label), false);
		}
	});

	check("a missing cache is reported honestly", () => {
		const status = offlineStatus(null, BASE_TIME);
		assert.equal(status.state, "absent");
		assert.equal(status.label, "Offline · no cached data for this view");
	});

	const passed = results.filter((result) => result.ok).length;
	return { passed, total: results.length, results };
}
