import type { CollectContext, Collector, NormalizedEvent } from "@radar/shared";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { correlateEvents } from "./collectors/correlate.js";
import { runGenericSources } from "./collectors/generic.js";
import { runHermesCollector } from "./collectors/hermes.collector.js";
import { runQuarantineCollector } from "./collectors/quarantine.collector.js";
import { fetchResilient } from "./collectors/http.js";
import { collectors } from "./collectors/index.js";
import { closePools, ingestQuery, query } from "./db.js";
import { runRetention } from "./maintenance/retention.js";
import eventsRoute from "./routes/events.js";
import flowsRoute from "./routes/flows.js";
import graphRoute from "./routes/graph.js";
import orgsRoute from "./routes/orgs.js";
import searchRoute from "./routes/search.js";
import sourcesRoute from "./routes/sources.js";
import streamRoute from "./routes/stream.js";
import { resolveUser } from "./middleware/auth.js";

const port = Number(process.env.PORT ?? 8080);
/** Cadence de la boucle de collecte. */
const TICK_MS = Number(process.env.RADAR_TICK_MS ?? 60000);
/** Fenêtre de rétention, en jours. */
const RETENTION_MS = Number(process.env.RADAR_RETENTION_TICK_MS ?? 24 * 3600 * 1000);
/** Cadence de la quarantaine dark web : 30 min mini (ToS de la source). */
const QUARANTINE_MS = Number(process.env.RADAR_QUARANTINE_TICK_MS ?? 30 * 60 * 1000);

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

/**
 * Auth : lectures publiques (observatoire consultable sur le réseau local),
 * écritures protégées. Un token valide est attaché à la requête s'il est fourni,
 * ce qui permet au front d'adapter l'UI au rôle.
 */
const PUBLIC_READ = /^\/api\/(health|stats|sources|flows|search|graph|stream|events|orgs|healthz)(\/?$|\?)/;

app.addHook("onRequest", async (req, reply) => {
  const url = req.url.split("?")[0];
  if (url === "/api/health") return;
  if (url.startsWith("/api/auth/")) return;
  const user = await resolveUser(req);
  if (req.method !== "GET" || !PUBLIC_READ.test(url)) {
    if (!user) { reply.code(401).send({ error: "unauthorized" }); return; }
  }
  if (user) req.user = user;
});

app.get("/api/health", async () => {
	const r = await query<{ id: string }>("SELECT id FROM source");
	return { ok: true, sources: r.rows.map((x) => x.id) };
});

await app.register(eventsRoute, { prefix: "/api" });
await app.register(flowsRoute, { prefix: "/api" });
await app.register(orgsRoute, { prefix: "/api" });
await app.register(graphRoute, { prefix: "/api" });
await app.register(streamRoute, { prefix: "/api" });
await app.register(sourcesRoute, { prefix: "/api" });
await app.register(searchRoute, { prefix: "/api" });
await app.register((await import("./routes/auth.js")).default, { prefix: "/api" });

/** Contexte fourni aux collecteurs : HTTP résilient, jamais de fetch nu. */
function makeContext(cursor: Record<string, unknown>, log: (msg: string) => void): CollectContext {
	return {
		fetchJson: async <T = unknown>(url: string): Promise<T> => {
			const res = await fetchResilient(url);
			if (res.notModified) throw new Error(`HTTP 304 inattendu pour ${url}`);
			return JSON.parse(res.text) as T;
		},
		fetchText: async (url: string): Promise<string> => (await fetchResilient(url)).text,
		cursor,
		log,
		now: () => new Date(),
	};
}

/** Dernier passage réussi par collecteur, pour respecter `intervalSec`. */
async function lastRunAgeSec(sourceId: string): Promise<number> {
	const { rows } = await query<{ age: string | null }>(
		"SELECT EXTRACT(EPOCH FROM (now() - max(finished_at)))::text AS age FROM collector_run WHERE source_id=$1 AND status='ok'",
		[sourceId]
	);
	const age = Number(rows[0]?.age ?? NaN);
	return Number.isNaN(age) ? Infinity : age;
}

async function runCollectors(): Promise<void> {
	for (const c of collectors) {
		const age = await lastRunAgeSec(c.id);
		if (age < c.intervalSec * 0.8) continue;

		const { rows } = await query<{ cursor: unknown }>("SELECT cursor FROM source WHERE id=$1", [c.id]);
		// Colonne jsonb : la forme réelle n'est connue qu'à l'exécution.
		const stored: unknown = rows[0]?.cursor;
		const cursor = stored !== null && typeof stored === "object" ? (stored as Record<string, unknown>) : {};

		let itemsIn = 0;
		let itemsNew = 0;
		try {
			const result = await c.run(makeContext(cursor, (m) => app.log.info(m)));
			itemsIn = result.events.length;
			for (const ev of result.events as NormalizedEvent[]) {
				const r = await ingestQuery(
					`INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at, severity, confidence, source_id, source_url, evidence, geo_type, lat, lon)
					 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
					 ON CONFLICT (dedup_key) DO UPDATE SET observed_at = COALESCE(event.observed_at, EXCLUDED.observed_at)`,
					[ev.dedupKey, ev.family, ev.assertionType, ev.title, ev.summary ?? null, ev.observedAt ?? null, ev.severity, ev.confidence ?? null, ev.sourceId, ev.sourceUrl ?? null, JSON.stringify(ev.evidence ?? {}), ev.geoType, ev.lat ?? null, ev.lon ?? null]
				);
				if ((r.rowCount ?? 0) > 0) itemsNew++;
			}
			const newCursor = result.cursor ?? cursor;
			await ingestQuery("UPDATE source SET cursor=$1, last_ok_at=now() WHERE id=$2", [JSON.stringify(newCursor), c.id]);
			await ingestQuery("INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new) VALUES ($1, now(), 'ok', $2, $3)", [c.id, itemsIn, itemsNew]);
			app.log.info(`collecteur ${c.id} : ${itemsIn} élément(s), ${itemsNew} nouveau(x)`);
		} catch (e: unknown) {
			const err = String((e as { message?: string })?.message ?? e);
			app.log.error(e);
			await ingestQuery("UPDATE source SET last_error_at=now(), last_error=$1 WHERE id=$2", [err, c.id]).catch(() => {});
			await ingestQuery("INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, error) VALUES ($1, now(), 'error', $2, $3, $4)", [c.id, itemsIn, itemsNew, err]).catch(() => {});
		}
	}
}

/**
 * Garde de ré-entrance : sans elle, chaque tick lançait un nouveau balayage
 * par-dessus le précédent (runGenericSources dépasse la minute), et les runs
 * empilés saturaient la base jusqu'à rendre l'API muette.
 */
const inFlight = new Set<string>();
async function guarded(name: string, fn: () => Promise<void>): Promise<void> {
	if (inFlight.has(name)) {
		app.log.debug(`${name} : passage précédent encore en cours, on saute ce tick`);
		return;
	}
	inFlight.add(name);
	const started = Date.now();
	try {
		await fn();
	} catch (e) {
		app.log.error(e);
	} finally {
		inFlight.delete(name);
		app.log.info(`${name} : ${((Date.now() - started) / 1000).toFixed(1)} s`);
	}
}

const log = (m: string) => app.log.info(m);

/** RADAR_COLLECT=0 : API seule, sans boucle de collecte (dev, UI, déploiement séparé). */
const COLLECT = process.env.RADAR_COLLECT !== "0";

if (COLLECT) {
	// Un premier passage au démarrage, puis un tick régulier par tâche.
	void guarded("collecteurs", runCollectors);
	void guarded("corrélation", () => correlateEvents(log));
	void guarded("hermes", () => runHermesCollector(log));
	void guarded("ingestion générique", () => runGenericSources(log));
	void guarded("quarantaine", () => runQuarantineCollector(log));
	void guarded("rétention", async () => {
		const r = await runRetention(log);
		log(`rétention : ${r.events} événement(s), ${r.indicators} indicateur(s), ${r.collectorRuns} run(s) purgé(s)`);
	});

	setInterval(() => {
		void guarded("collecteurs", runCollectors);
		void guarded("corrélation", () => correlateEvents(log));
		void guarded("ingestion générique", () => runGenericSources(log));
	}, TICK_MS);

	// Quarantaine : poll 1/30 min max (ToS ransomware.live), donc tick dédié.
	setInterval(() => {
		void guarded("quarantaine", () => runQuarantineCollector(log));
	}, QUARANTINE_MS);

	setInterval(() => {
		void guarded("hermes", () => runHermesCollector(log));
		void guarded("rétention", async () => {
			const r = await runRetention(log);
			log(`rétention : ${r.events} événement(s), ${r.indicators} indicateur(s), ${r.collectorRuns} run(s) purgé(s)`);
		});
	}, RETENTION_MS);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => {
		app.log.info(`${signal} reçu : arrêt propre`);
		void app.close().finally(() => closePools().finally(() => process.exit(0)));
	});
}

// Écoute locale par défaut : l'API n'a pas à être visible depuis le réseau
// (vite proxifie /api en localhost). Pour l'exposer sciemment — tailnet, LAN —
// lancer avec HOST=0.0.0.0.
const host = process.env.HOST ?? "127.0.0.1";
await app.listen({ port, host });
