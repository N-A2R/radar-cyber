import { AdmissionTally, admitEvent } from "./contract/admit.js";
import { languageVerdict } from "./collectors/filter.js";
import type { CollectContext, Collector, NormalizedEvent } from "@radar/shared";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { correlateEvents } from "./collectors/correlate.js";
import { runGenericSources } from "./collectors/generic.js";
import { runHermesCollector } from "./collectors/hermes.collector.js";
import { runQuarantineCollector } from "./collectors/quarantine.collector.js";
import { promoteMatches } from "./quarantine/promote.js";
import { fetchResilient } from "./collectors/http.js";
import { collectors, executerCollecteur } from "./collectors/index.js";
import { consignerLot, type JournalEntry } from "./journal/index.js";
import { porteeRegionale } from "./match/territorial.js";
import { closePools, ingestQuery, query } from "./db.js";
import { deliverPendingAlerts, readDeliveryConfig } from "./notify/alert-delivery.js";
import { runRetention } from "./maintenance/retention.js";
import { runDetectionPass } from "./detect/incremental.js";
import { capterAlertesRupture } from "./analyse/rupture.js";
import healthDetailRoute from "./routes/health-detail.js";
import healthCausesRoute from "./routes/health-causes.js";
import eventsRoute from "./routes/events.js";
import historyRoute from "./routes/history.js";
import todayRoute from "./routes/today.js";
import statsDepartementsRoute from "./routes/stats-departements.js";
import couvertureRoute from "./routes/couverture.js";
import flowsRoute from "./routes/flows.js";
import graphRoute from "./routes/graph.js";
import orgsRoute from "./routes/orgs.js";
import directoryRoute from "./routes/directory.js";
import naRoute from "./routes/na.js";
import searchRoute from "./routes/search.js";
import sourcesRoute from "./routes/sources.js";
import statsRoute from "./routes/stats.js";
import streamRoute from "./routes/stream.js";
import alertsRoute from "./routes/alerts.js";
import quarantineRoute from "./routes/quarantine.js";
import reviewRoute from "./routes/review.js";
import journalRoute from "./routes/journal.js";
import orgsLieesRoute from "./routes/orgs-liees.js";
import orgsLieesHistoriqueRoute from "./routes/orgs-liees-historique.js";
import ingestRoute from "./routes/ingest.js";
import { resolveUser } from "./middleware/auth.js";

const port = Number(process.env.PORT ?? 8080);
/** Cadence de la boucle de collecte. */
const TICK_MS = Number(process.env.RADAR_TICK_MS ?? 60000);
/** Fenêtre de rétention, en jours. */
const RETENTION_MS = Number(process.env.RADAR_RETENTION_TICK_MS ?? 24 * 3600 * 1000);
/** Cadence de la quarantaine dark web : 30 min mini (ToS de la source). */
const QUARANTINE_MS = Number(process.env.RADAR_QUARANTINE_TICK_MS ?? 30 * 60 * 1000);
/** Cadence de diffusion des alertes (défaut : 2 min). Aucun effet si non configuré. */
const ALERT_DELIVERY_MS = Number(process.env.RADAR_ALERT_DELIVERY_TICK_MS ?? 2 * 60 * 1000);

const app = Fastify({ logger: true });

/** Origines autorisées pour le cross-origin, séparées par des virgules.
 *  Vide = aucune origine croisée (le front est servi depuis la même origine). */
const corsOrigins = (process.env.RADAR_CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

await app.register(cors, { origin: corsOrigins.length > 0 ? corsOrigins : false });

/** En-têtes de sécurité sur toutes les réponses (nosniff, frameguard,
 *  referrer-policy, HSTS). Le CSP reste à la charge de la couche qui sert du
 *  HTML (le dist statique sur la box) : l'API ne sert que du JSON. */
await app.register(helmet, { contentSecurityPolicy: false });

/* Limite globale généreuse ; les routes sensibles resserrent via config.rateLimit. */
await app.register(rateLimit, { global: false });

/**
 * Porte d'entrée : le dist de `apps/web` servi par l'API même — une seule
 * adresse à ouvrir, un seul processus à tenir. `wildcard: false` : les chemins
 * inconnus répondent 404 plutôt que d'avaler les routes `/api/*` ; le routage
 * de l'app vit dans le hash de l'URL, donc aucune reprise de chemin n'est
 * nécessaire. Le dist est produit par `pnpm -F @radar/web build` ; sans lui,
 * l'API tourne comme avant (JSON seul) et le dit dans son journal.
 */
const webDist = process.env.RADAR_WEB_DIST ?? fileURLToPath(new URL("../../web/dist", import.meta.url));
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, prefix: "/", wildcard: false });
} else {
  app.log.warn(`front statique absent (${webDist}) : pnpm -F @radar/web build`);
}

/**
 * Auth : lectures publiques (observatoire consultable sur le réseau local),
 * écritures protégées. Un token valide est attaché à la requête s'il est fourni,
 * ce qui permet au front d'adapter l'UI au rôle.
 */
const PUBLIC_READ = /^\/api\/(health|stats|sources|flows|search|directory|graph|stream|events|history|orgs|enrich|alerts|quarantine|dossier|healthz|na|today|couverture)(\/|$|\?)/;

app.addHook("onRequest", async (req, reply) => {
  const url = req.url.split("?")[0];
  // Hors `/api` : le front statique. Fichiers publics (HTML, JS, CSS) — la
  // garde d'authentification ne s'applique qu'aux routes API, sinon la racine
  // répond 401 et rien n'est ouvrable.
  if (!url.startsWith("/api/")) return;
  if (url === "/api/health") return;
  if (url.startsWith("/api/auth/")) return;
  const user = await resolveUser(req);
  if (req.method !== "GET" || !PUBLIC_READ.test(url)) {
    if (!user) { reply.code(401).send({ error: "unauthorized" }); return; }
  }
  if (user) req.user = user;
});

app.get("/api/health", async () => {
  const r = await query<{ n: string }>("SELECT count(*)::text AS n FROM source");
  return { ok: true, sources: Number(r.rows[0]?.n ?? 0) };
});

await app.register(eventsRoute, { prefix: "/api" });
await app.register(historyRoute, { prefix: "/api" });
await app.register(healthDetailRoute, { prefix: "/api" });
await app.register(healthCausesRoute, { prefix: "/api" });
await app.register(todayRoute, { prefix: "/api" });
await app.register(statsDepartementsRoute, { prefix: "/api" });
await app.register(couvertureRoute, { prefix: "/api" });
await app.register(flowsRoute, { prefix: "/api" });
await app.register(orgsRoute, { prefix: "/api" });

await app.register(directoryRoute, { prefix: "/api" });
await app.register(naRoute, { prefix: "/api" });
await app.register(graphRoute, { prefix: "/api" });
await app.register(streamRoute, { prefix: "/api" });
await app.register(sourcesRoute, { prefix: "/api" });
await app.register(statsRoute, { prefix: "/api" });
await app.register(searchRoute, { prefix: "/api" });
await app.register((await import("./routes/enrich.js")).default, { prefix: "/api" });
await app.register((await import("./routes/auth.js")).default, { prefix: "/api" });
await app.register(alertsRoute, { prefix: "/api" });
await app.register(quarantineRoute, { prefix: "/api" });
await app.register(reviewRoute, { prefix: "/api" });
await app.register(journalRoute, { prefix: "/api" });
await app.register(orgsLieesRoute, { prefix: "/api" });
await app.register(orgsLieesHistoriqueRoute, { prefix: "/api" });
await app.register(ingestRoute, { prefix: "/api" });
await app.register((await import("./routes/dossier.js")).default, { prefix: "/api" });

/** Contexte fourni aux collecteurs : HTTP résilient, jamais de fetch nu. */
function makeContext(cursor: Record<string, unknown>, log: (msg: string) => void): CollectContext {
	return {
		fetchJson: async <T = unknown>(url: string): Promise<T> => {
			const res = await fetchResilient(url);
			if (res.notModified) throw new Error(`HTTP 304 inattendu pour ${url}`);
			const text = res.text.trim();
			if (text.startsWith("<")) {
				if (text.toLowerCase().includes("cloudflare") || res.status === 429 || /error code: 1015/i.test(text)) {
					throw new Error("NVD : rate limit Cloudflare (429)");
				}
				throw new Error(`Réponse non-JSON (HTML) pour ${url}`);
			}
			try {
				return JSON.parse(text) as T;
			} catch {
				throw new Error("NVD : rate limit Cloudflare (429)");
			}
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

		const { rows } = await query<{ cursor: unknown; statut: string; enabled: boolean }>(
			"SELECT cursor, statut, enabled FROM source WHERE id=$1", [c.id],
		);
		// Une source morte (décision admin ou 5 échecs) ne doit plus être collectée.
		if (rows[0]?.statut === "morte" || rows[0]?.enabled === false) continue;
		// Colonne jsonb : la forme réelle n'est connue qu'à l'exécution.
		const stored: unknown = rows[0]?.cursor;
		const cursor = stored !== null && typeof stored === "object" ? (stored as Record<string, unknown>) : {};

		let itemsIn = 0;
		let itemsNew = 0;
		let langueSkipped = 0;
		try {
			const result = await executerCollecteur(c, makeContext(cursor, (m) => app.log.info(m)));
			itemsIn = result.events.length;
			// Le type `NormalizedEvent` n'était qu'une assertion du compilateur :
			// les collecteurs renvoient ce qu'ils veulent à l'exécution. Le
			// contrat vérifie pour de vrai, et compte ses écarts.
			const contract = new AdmissionTally();
			// Faits de journal pour cette source. Accumulés puis écrits en une
			// passe : sans eux, 1 921 événements sur 3 758 n'avaient aucune
			// trace, et `verify:journal` le disait sans qu'on l'écoute.
			const faits: JournalEntry[] = [];
			for (const ev of result.events as NormalizedEvent[]) {
				const admitted = admitEvent(ev as unknown as Record<string, unknown>);
				contract.record(admitted);
				if (!admitted.ok) continue;
				const event = admitted.event;
				const langue = languageVerdict(event.title, event.summary);
				if (!langue.keep) {
					langueSkipped++;
					continue;
				}
				const portee = porteeRegionale(`${event.title} ${event.summary ?? ""}`, null);
				const r = await ingestQuery(
					`INSERT INTO event (dedup_key, family, assertion_type, title, summary, langue, observed_at, valid_at, severity, confidence, source_id, source_url, evidence, geo_type, lat, lon, regional, regional_motif)
					 VALUES ($1,$2,$3,$4,$5,$18,$6,$17,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
					 ON CONFLICT (dedup_key) DO UPDATE SET observed_at = COALESCE(event.observed_at, EXCLUDED.observed_at)`,
					[event.dedupKey, event.family, event.assertionType, event.title, event.summary ?? null, event.observedAt ?? null,
					 event.observedAt ?? new Date().toISOString(), event.severity, event.confidence ?? null, event.sourceId, event.sourceUrl ?? null, JSON.stringify(event.evidence ?? {}), event.geoType, event.lat ?? null, event.lon ?? null, portee.regional, portee.motif, langue.language]
				);
				if ((r.rowCount ?? 0) > 0) {
					itemsNew++;
					faits.push({
						kind: "event.admitted",
						subject: event.dedupKey,
						summary: `${c.id} : événement admis (${event.family})`,
						actor: `collecteur:${c.id}`,
						payload: { family: event.family, assertionType: event.assertionType },
						validAt: event.observedAt ?? null,
					});
				}
			}
			// Une lacune de journal est visible et réparable ; une collecte
			// perdue ne l'est pas. On signale, on ne bloque pas.
			if (faits.length > 0) {
				const lot = await consignerLot(faits);
				if (lot.lacunes > 0 || lot.erreurs.length > 0) {
					app.log.warn(`[journal] ${c.id} : ${lot.consignes} fait(s) consigné(s), ${lot.lacunes} lacune(s), ${lot.erreurs.length} échec(s) — ${lot.erreurs[0]?.slice(0, 120) ?? ""}`);
				}
			}
			const newCursor = result.cursor ?? cursor;
			await ingestQuery("UPDATE source SET cursor=$1, last_ok_at=now() WHERE id=$2", [JSON.stringify(newCursor), c.id]);
			await ingestQuery("INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new) VALUES ($1, now(), 'ok', $2, $3)", [c.id, itemsIn, itemsNew]);
			app.log.info(`collecteur ${c.id} : ${itemsIn} élément(s), ${itemsNew} nouveau(x)${langueSkipped > 0 ? `, ${langueSkipped} langue(s) exclue(s)` : ""}`);
			const contractLine = contract.logLine();
			if (contractLine) app.log.warn(`collecteur ${c.id} : contrat — ${contractLine}`);
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
	void guarded("détection", async () => {
		const pass = await runDetectionPass();
		log(`detection initiale : ${pass.alerts} alerte(s) sur ${pass.events} evenement(s)`);
	});
	// Agents de rupture : même cadence que la détection, alertes persistées dans
	// la revue (scope 'rupture-revue', une ligne par agent × organisation), jamais diffusées.
	void guarded("ruptures", async () => {
		const r = await capterAlertesRupture();
		if (r.emises > 0) {
			log(`ruptures : ${r.emises} alerte(s) — ${r.creees} nouvelle(s), ${r.misesAJour} mise(s) à jour, ${r.lacunes} lacune(s)`);
		}
	});
	void guarded("quarantaine", () => runQuarantineCollector(log));
	void guarded("rétention", async () => {
		const r = await runRetention(log);
		log(`rétention : ${r.events} événement(s), ${r.indicators} indicateur(s), ${r.collectorRuns} run(s) purgé(s)`);
	});

	// Détection : après chaque vague de collecte, sur un lot borné. Sans ce
	// passage, seuls les faits promus de la quarantaine produisaient des alertes.
	const detect = async () => {
		const pass = await runDetectionPass();
		if (pass.events || pass.indicators || pass.late || pass.alerts) {
			log(
				`detection : ${pass.events} evenement(s), ${pass.indicators} indicateur(s), ` +
				`${pass.late} rattachement(s) tardif(s) -> ${pass.alerts} alerte(s)`,
			);
		}
	};

	setInterval(() => {
		void guarded("collecteurs", runCollectors);
		void guarded("corrélation", () => correlateEvents(log));
		void guarded("ingestion générique", () => runGenericSources(log));
		void guarded("détection", detect);
		void guarded("ruptures", () =>
			capterAlertesRupture().then((r) => {
				if (r.emises > 0) {
					log(`ruptures : ${r.emises} alerte(s) — ${r.creees} nouvelle(s), ${r.misesAJour} mise(s) à jour, ${r.lacunes} lacune(s)`);
				}
			}),
		);
	}, TICK_MS);

	// Quarantaine : poll 1/30 min max (ToS ransomware.live), donc tick dédié.
	setInterval(() => {
		void guarded("quarantaine", () => runQuarantineCollector(log));
		// Promotion automatique des faits qui matchent une organisation.
		void guarded("promotion quarantaine", () => promoteMatches().then(() => undefined));
	}, QUARANTINE_MS);

	setInterval(() => {
		void guarded("hermes", () => runHermesCollector(log));
		void guarded("rétention", async () => {
			const r = await runRetention(log);
			log(`rétention : ${r.events} événement(s), ${r.indicators} indicateur(s), ${r.collectorRuns} run(s) purgé(s)`);
		});
	}, RETENTION_MS);

	// Diffusion des alertes : uniquement si un canal est configuré.
	const deliveryCfg = readDeliveryConfig();
	if (deliveryCfg.webhookUrl || (deliveryCfg.telegramBotToken && deliveryCfg.telegramChatId)) {
		const deliver = () => void guarded("diffusion alertes", () => deliverPendingAlerts(log).then(() => undefined));
		deliver();
		setInterval(deliver, ALERT_DELIVERY_MS);
	}
}

/**
 * Relevé quotidien des compteurs de la carte « organisations reliées ».
 * Un point par jour dans orgs_liees_historique, même quand la collecte est
 * désactivée (RADAR_COLLECT=0) : la mesure ne dépend pas des collecteurs.
 */
const MESURE_ORGS_LIEES_MS = 24 * 3600 * 1000;
async function mesurerOrgsLiees(): Promise<void> {
  await query("SELECT enregistrer_orgs_liees()");
  log("organisations reliées : relevé du jour enregistré");
}
void guarded("mesure organisations reliées", mesurerOrgsLiees);
setInterval(() => {
  void guarded("mesure organisations reliées", mesurerOrgsLiees);
}, MESURE_ORGS_LIEES_MS);

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
