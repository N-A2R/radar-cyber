/**
 * One check per offline behaviour. Shared by the test entry point and the
 * reproducible measurement command so both report the same number.
 */
import assert from "node:assert/strict";
import {
	CACHE_PREFIX, INDEX_KEY, MAX_AGE_MS, MAX_BYTES, MAX_ENTRIES, MAX_ENTRY_BYTES,
	OFFLINE_ROUTES, OFFLINE_VIEWS, OfflineApiCache, isCacheable, lastOfflineFallback,
	normalizePath, offlineStatus, onOfflineFallback, redactPersonalData, resetOfflineFallback,
	type OfflineStorage,
} from "../src/offline/pwa.js";

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

	check("every product view has a replayable read route", () => {
		const missing = OFFLINE_VIEWS.filter((view) => !OFFLINE_ROUTES.some((route) => route.views.includes(view)));
		assert.deepEqual(missing, []);
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

	check("all view read endpoints are allowed", () => {
		const endpoints = [
			"/orgs", "/orgs/1", "/orgs/liees", "/orgs/liees/historique?jours=30", "/events",
			"/today", "/today/departements", "/directory", "/review/queue", "/quarantine/queue",
			"/journal/review", "/corpus/stats", "/couverture", "/sources", "/health",
			"/health/detail", "/health/causes", "/collecte/metrics", "/graph", "/graph/temporal",
			"/na/overview", "/na/events?dept=33", "/alerts", "/alerts/1", "/alerts/stats",
			"/flows", "/search?q=bordeaux", "/enrich/events/1",
		];
		for (const path of endpoints) assert.equal(isCacheable("GET", path), true, path);
	});

	check("filter order does not multiply cache keys", () => {
		assert.equal(normalizePath("/events?b=2&a=1&a=0"), normalizePath("/events?a=0&a=1&b=2"));
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
		cache.remember("GET", "/today?family=cyber", { family: "cyber" });
		cache.remember("GET", "/today?family=phishing", { family: "phishing" });
		assert.deepEqual(cache.recall("GET", "/today?family=cyber")?.value, { family: "cyber" });
		assert.deepEqual(cache.recall("GET", "/today?family=phishing")?.value, { family: "phishing" });
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
		cache.remember("GET", "/journal/review", {
			rows: [{ acteur: "victim-name", email: "victim@example.test", review: [{ by: "analyst@example.test" }] }],
			contactNom: "victim-name",
		});
		const raw = storage.read(entryKey("/journal/review")) ?? "";
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
