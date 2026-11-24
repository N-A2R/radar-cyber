import { AdmissionTally, admitEvent } from "./contract/admit.js";
import { languageVerdict } from "./collectors/filter.js";
import { scoreEventPertinence } from "./collectors/pertinence.js";
import type { CollectContext, Collector, NormalizedEvent } from "@radar/shared";
import cors from "@fastify/cors";

import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { correlateEvents } from "./collectors/correlate.js";
import { correlaterIndicateursCertfrMisp } from "./collectors/certfr-misp-correlate.js";
import { runGenericSources } from "./collectors/generic.js";
import { runScheduledDiscovery } from "./discovery/discover.js";
import { runHermesCollector } from "./collectors/hermes.collector.js";
import { runQuarantineCollector } from "./collectors/quarantine.collector.js";
import { promoteMatches } from "./quarantine/promote.js";
import { fetchResilient } from "./collectors/http.js";
import { collectors, executerCollecteur, executerPlan, planifierCycle, ratisserSourcesJamaisCollectees } from "./collectors/index.js";
import { enregistrerCycleCollecte } from "./collecte/supervision.js";
import { startLiveStream } from "./collecte/live.js";
import { closeRun, openRun, withRunId } from "./collecte/runs.js";
import { consignerLot, type JournalEntry } from "./journal/index.js";
import { ancrerJournalDuJour } from "./journal/anchor.js";
import { porteeRegionale } from "./match/territorial.js";
import { closePools, ingestQuery, query } from "./db.js";
import { deliverPendingAlerts, isDeliveryConfigured, readDeliveryConfig } from "./notify/alert-delivery.js";
import {
	orientationVerificationDue,
	verifierOrientationCollectivites,
} from "./orientation/verification.js";
import { runRetention } from "./maintenance/retention.js";
import { applyAlertFatiguePolicy } from "./maintenance/alert-fatigue.js";
import { registerApiRoutes } from "./routes/index.js";
import { installApiCore } from "./app.js";
import { runDetectionPass } from "./detect/incremental.js";
import { runSilentSourceCheck } from "./detect/silent-source-monitor.js";
import { installSecurityHeaders } from "./security/headers.js";
import type { LanceurCollecte } from "./routes/sources.js";
import { runForumCycle } from "./forums/collect.js";
import { capterAlertesRupture } from "./analyse/rupture.js";
import { capterAgentsCpu } from "./analyse/agents-cpu.js";
import { instruireDemandesDroitReponse } from "./domain/rectification-delais.js";
import exportMispRoute from "./routes/export-misp.js";


const port = Number(process.env.PORT ?? 8080);
/** Cadence de la boucle de collecte. */
const TICK_MS = Number(process.env.RADAR_TICK_MS ?? 60000);
/** Fenêtre de rétention, en jours. */
const RETENTION_MS = Number(process.env.RADAR_RETENTION_TICK_MS ?? 24 * 3600 * 1000);
/** Cadence de la quarantaine dark web : 30 min mini (ToS de la source). */
const QUARANTINE_MS = Number(process.env.RADAR_QUARANTINE_TICK_MS ?? 30 * 60 * 1000);
/** Cadence de diffusion des alertes (défaut : 2 min). Aucun effet si non configuré. */
const ALERT_DELIVERY_MS = Number(process.env.RADAR_ALERT_DELIVERY_TICK_MS ?? 2 * 60 * 1000);
/** Cadence de la politique de fatigue (défaut : 1 min, comme la collecte). */
const ALERT_FATIGUE_MS = Number(process.env.RADAR_ALERT_FATIGUE_TICK_MS ?? 60_000);
/**
 * Proxies de confiance (E5/NET-09) : liste d'adresses ou CIDR séparés par des
 * virgules, transmise à Fastify. Vide = aucune délégation, `req.ip` reste
 * l'adresse du pair — un client ne peut pas usurper X-Forwarded-For.
 * Exemple : RADAR_TRUST_PROXY=127.0.0.1,::1 derrière un Caddy local.
 */
const trustProxy = process.env.RADAR_TRUST_PROXY?.trim() || undefined;



const app = Fastify({
  logger: {
    serializers: {
      req: (req: { method?: string; url?: string; hostname?: string; ip?: string; remotePort?: number }) => ({
        method: req.method,
        url: String(req.url ?? "").replace(/([?&]token=)[^&]*/gi, "$1<redacted>"),
        hostname: req.hostname,
        remoteAddress: req.ip,
        remotePort: req.remotePort,
      }),
    },
  },
  bodyLimit: 1024 * 1024,
  trustProxy,
});
// Un seul ordre de hooks pour la production, les tests et les sondes :
// identité → RBAC → quotas/en-têtes publics (C1).
await installApiCore(app);
/** Origines autorisées pour le cross-origin, séparées par des virgules.
 *  Vide = aucune origine croisée (le front est servi depuis la même origine). */
const corsOrigins = (process.env.RADAR_CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

await app.register(cors, { origin: corsOrigins.length > 0 ? corsOrigins : false });
await installSecurityHeaders(app);


/**
 * Limite globale, par utilisateur authentifié ou par adresse IP. Les routes
 * sensibles resserrent la limite via `config.rateLimit` (connexion, demande
 * de rectification). Le payload d'erreur garde le format `{ error: {...} }`.
 */
await app.register(rateLimit, {
  global: true,
  max: Number(process.env.RADAR_RATE_LIMIT_MAX ?? 300),
  timeWindow: Number(process.env.RADAR_RATE_LIMIT_WINDOW_MS ?? 60_000),
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `ip:${req.ip}`),
  // Le quota protège l'API, pas la livraison du front : une page ouverte
  // demande une quarantaine de fichiers, et plusieurs onglets ou une IP
  // partagée épuiseraient le quota avant même le premier appel d'API.
  // Sans cette exemption, les rechargements reçoivent des 429 sur le CSS et le
  // JS, et l'écran reste blanc.
  allowList: (req) => !(req.url ?? "").startsWith("/api/"),
  errorResponseBuilder: (_req, context) => ({
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "too many requests",
      details: { retryAfter: Number(context.after), max: context.max },
    },
  }),
});

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
/** Relance manuelle d'une source : le bouton « relancer » du registre. Le
 *  handler HTTP vit dans `routes/sources.ts` pour être couvert par la matrice
 *  RBAC et par le test de couverture ; seule l'exécution est propre au serveur. */
const relancesEnCours = new Set<string>();
const lanceurCollecte: LanceurCollecte = (id, source) => {
  if (relancesEnCours.has(id)) return false;
  const journal = (m: string) => app.log.info(m);
  const dedie = collectors.find((c) => c.id === id);
  const tache = dedie
    ? () => runCollectors({ onlyId: id, force: true })
    : id === "hermes_radar_cyber"
      ? () => runHermesCollector(journal)
      : source.kind === "quarantine"
        ? () => runQuarantineCollector(journal)
        : () => runGenericSources(journal, { sourceIds: [id], force: true });
  relancesEnCours.add(id);
  void tache().catch((e: unknown) => {
    app.log.error(e);
  }).finally(() => {
    relancesEnCours.delete(id);
  });
  return true;
};
app.decorate("lanceurCollecte", lanceurCollecte);


/** Toutes les routes API sont déclarées dans un registre unique, audité par
 *  le test de couverture des règles d'accès. */
await registerApiRoutes(app);

/** Alias racine du flux MISP, pour le partenaire qui importe l'URL telle
 *  quelle. Les alias `/api` et `/api/v1` restent servis par les registres. */
await app.register(exportMispRoute);

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

/**
 * Un cycle est planifié puis exécuté source par source : santé, backoff et
 * priorité aux sources jamais collectées sont décidés dans le registre, et
 * `executerPlan` isole chaque échec pour que la suite du cycle ait lieu.
 */
async function runCollectors(options?: { onlyId?: string; force?: boolean }): Promise<void> {
	const plan = await planifierCycle({
		onlyId: options?.onlyId,
		force: options?.force,
		log: (m) => app.log.info(m),
	});
	for (const sautee of plan.sautees) {
		app.log.debug(`collecteur ${sautee.sourceId} sauté : ${sautee.raison}`);
	}
	const resultat = await executerPlan(plan, async (etape) => {
		const c = etape.collecteur;
		const cursor = etape.curseur;
		let itemsIn = 0;
		let itemsNew = 0;
		let langueSkipped = 0;
		// Le run est ouvert avant l'exécution : les événements écrits par
		// l'orchestrateur le citent dans `evidence.run_id` (migration 206).
		let runId: number | null = null;
		try {
			runId = await openRun(c.id);
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
				const pertinence = scoreEventPertinence({ title: event.title, summary: event.summary, sourceUrl: event.sourceUrl });
				if (!langue.keep) {
					langueSkipped++;
					continue;
				}
				const portee = porteeRegionale(`${event.title} ${event.summary ?? ""}`, null);
				const r = await ingestQuery(
					`INSERT INTO event (dedup_key, family, assertion_type, title, summary, langue, observed_at, valid_at, severity, confidence, source_id, source_url, evidence, geo_type, lat, lon, regional, regional_motif, pertinence_score, pertinence_rule)
					 VALUES ($1,$2,$3,$4,$5,$18,$6,$17,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$19,$20)
					 ON CONFLICT (dedup_key) DO UPDATE SET observed_at = COALESCE(event.observed_at, EXCLUDED.observed_at)`,
					[event.dedupKey, event.family, event.assertionType, event.title, event.summary ?? null, event.observedAt ?? null,
					 event.observedAt ?? new Date().toISOString(), event.severity, event.confidence ?? null, event.sourceId, event.sourceUrl ?? `urn:source:${c.id}`, JSON.stringify(withRunId(event.evidence ?? {}, runId)), event.geoType, event.lat ?? null, event.lon ?? null, portee.regional, portee.motif, langue.language, pertinence.score, pertinence.rule]
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
			await closeRun(runId, { itemsIn, itemsNew });
			app.log.info(`collecteur ${c.id} : ${itemsIn} élément(s), ${itemsNew} nouveau(x)${langueSkipped > 0 ? `, ${langueSkipped} langue(s) exclue(s)` : ""}`);
			const contractLine = contract.logLine();
			if (contractLine) app.log.warn(`collecteur ${c.id} : contrat — ${contractLine}`);
		} catch (e: unknown) {
			const err = e instanceof Error ? e.message : String(e);
			app.log.error(e);
			await ingestQuery("UPDATE source SET last_error_at=now(), last_error=$1 WHERE id=$2", [err, c.id]).catch(() => {});
			if (runId !== null) {
				await closeRun(runId, { status: "error", itemsIn, itemsNew, error: err }).catch(() => {});
			} else {
				await ingestQuery("INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, error) VALUES ($1, now(), 'error', $2, $3, $4)", [c.id, itemsIn, itemsNew, err]).catch(() => {});
			}
		}
	}, { log: (m) => app.log.info(m) });

	let restants: string[] = [];
	if (!options?.onlyId) {
		restants = await ratisserSourcesJamaisCollectees(
			async (ids) => runGenericSources((m) => app.log.info(m), { sourceIds: ids, force: true }),
			{ log: (m) => app.log.warn(m) },
		);
	}
	app.log.info(
		`cycle collecteurs : ${resultat.reussis} source(s) traitée(s), ${resultat.echecs} échec(s), ` +
		`memoire ${resultat.memoire.avantMo}→${resultat.memoire.apresMo} Mo, ` +
		`${restants.length} source(s) jamais collectée(s)`,
	);
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

/**
 * Un cycle de collecte = les collecteurs dédiés et génériques lancés ensemble,
 * chronométrés, puis enregistrés avec leurs alertes. Les deux tâches restent
 * concurrentes : `allSettled` évite qu'un collecteur en erreur empêche l'autre
 * de finir, et le garde de ré-entrance de `guarded` empêche les cycles empilés.
 */
async function executerCycleCollecte(): Promise<void> {
	const startedAt = new Date();
	const memoireAvant = process.memoryUsage();
	const taches: { nom: string; run: () => Promise<void> }[] = [
		{ nom: "collecteurs", run: runCollectors },
		{ nom: "sitemap discovery", run: () => runScheduledDiscovery(log) },
		{ nom: "ingestion générique", run: () => runGenericSources(log) },
	];
	const resultats = await Promise.allSettled(taches.map((t) => t.run()));
	const etats = resultats.map((r, i) => ({
		nom: taches[i].nom,
		erreur: r.status === "rejected" ? messageErreur(r.reason) : null,
	}));
	for (const etat of etats) {
		if (etat.erreur) app.log.error(`${etat.nom} : ${etat.erreur}`);
	}
	const fin = process.memoryUsage();
	const { cycle, alertes } = await enregistrerCycleCollecte({
		startedAt,
		finishedAt: new Date(),
		memoireAvant: { rss: memoireAvant.rss, heapUsed: memoireAvant.heapUsed },
		memoireApres: { rss: fin.rss, heapUsed: fin.heapUsed },
		taches: etats,
	});
	log(
		`cycle ${cycle.id} : ${cycle.statut}, ${cycle.dureeMs} ms, ` +
		`${cycle.sourcesOk} source(s) ok, ${cycle.sourcesError} en erreur, ` +
		`${cycle.itemsIn} élément(s), ${cycle.itemsNew} nouveau(x), ` +
		`${alertes.length} alerte(s) de supervision`,
	);
}

function messageErreur(reason: unknown): string {
	if (reason instanceof Error) return reason.message;
	if (typeof reason === "string") return reason;
	return String(reason);
}

/** RADAR_COLLECT=0 : API seule, sans boucle de collecte (dev, UI, déploiement séparé). */
const COLLECT = process.env.RADAR_COLLECT !== "0";

if (COLLECT) {
	// Un premier passage au démarrage, puis un tick régulier par tâche.
	// Collecteurs dédiés et génériques forment un seul cycle mesuré.
	void guarded("cycle de collecte", executerCycleCollecte);
	// Fast lane: opted-in Nouvelle-Aquitaine sources, polled independently of
	// the 60-second cycle. The DB trigger records publication-to-record latency.
	startLiveStream(log);
	void guarded("corrélation", correler);
	void guarded("hermes", () => runHermesCollector(log));
	void guarded("forums", () => runForumCycle(log));
	void guarded("détection", async () => {
		const pass = await runDetectionPass();
		log(`detection initiale : ${pass.alerts} alerte(s) sur ${pass.events} evenement(s)`);
	});
	void guarded("silent sources", () => runSilentSourceCheck().then(() => undefined));
	// Agents de rupture : même cadence que la détection, alertes persistées dans
	// la revue (scope 'rupture-revue', une ligne par agent × organisation), jamais diffusées.
	void guarded("ruptures", async () => {
		const r = await capterAlertesRupture();
		if (r.emises > 0) {
			log(`ruptures : ${r.emises} alerte(s) — ${r.creees} nouvelle(s), ${r.misesAJour} mise(s) à jour, ${r.lacunes} lacune(s)`);
		}
	});
	// Agents CPU : trois détecteurs supplémentaires, même cadence, même file de
	// revue (scope 'agents-cpu'), jamais diffusés.
	void guarded("agents-cpu", async () => {
		const r = await capterAgentsCpu();
		if (r.emises > 0) {
			log(`agents-cpu : ${r.emises} alerte(s) — ${r.creees} nouvelle(s), ${r.misesAJour} mise(s) à jour, ${r.lacunes} lacune(s)`);
		}
	});
	void guarded("quarantaine", () => runQuarantineCollector(log));
	void guarded("rétention", async () => {
		const r = await runRetention(log);
		log(`rétention : ${r.events} événement(s), ${r.indicators} indicateur(s), ${r.collectorRuns} run(s), ${r.cyclesSupervision} cycle(s) purgé(s), ${r.rawRows} brut(s) sur ${r.rawSources} source(s), ${r.accessLog} accès`);
		log(`rétention : ${r.events} événement(s), ${r.indicators} indicateur(s), ${r.collectorRuns} run(s), ${r.cyclesSupervision} cycle(s) purgé(s), ${r.accessLog} accès`);
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
		void guarded("cycle de collecte", executerCycleCollecte);
		void guarded("corrélation", correler);
		void guarded("détection", detect);
		void guarded("silent sources", () => runSilentSourceCheck().then(() => undefined));
		void guarded("ruptures", () =>
			capterAlertesRupture().then((r) => {
				if (r.emises > 0) {
					log(`ruptures : ${r.emises} alerte(s) — ${r.creees} nouvelle(s), ${r.misesAJour} mise(s) à jour, ${r.lacunes} lacune(s)`);
				}
			}),
		);
		void guarded("agents-cpu", () =>
			capterAgentsCpu().then((r) => {
				if (r.emises > 0) {
					log(`agents-cpu : ${r.emises} alerte(s) — ${r.creees} nouvelle(s), ${r.misesAJour} mise(s) à jour, ${r.lacunes} lacune(s)`);
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
			log(`rétention : ${r.events} événement(s), ${r.indicators} indicateur(s), ${r.collectorRuns} run(s), ${r.cyclesSupervision} cycle(s) purgé(s), ${r.rawRows} brut(s) sur ${r.rawSources} source(s), ${r.accessLog} accès`);
		});
	}, RETENTION_MS);

	// Diffusion des alertes : uniquement si un canal est configuré.
	const deliveryCfg = readDeliveryConfig();
	if (isDeliveryConfigured(deliveryCfg)) {
		const deliver = () => void guarded("diffusion alertes", () => deliverPendingAlerts(log).then(() => undefined));
		deliver();
		setInterval(deliver, ALERT_DELIVERY_MS);
	}
}


/**
 * Fatigue d'alerte : acquitte les doublons (organisation, jour Europe/Paris,
 * règle) puis republie la charge sur 30 jours glissants. Indépendant des
 * collecteurs (`RADAR_COLLECT=0`) : la mesure et la déduplication tournent
 * quand même, et aucun doublon acquitté ne peut partir en diffusion.
 */
async function appliquerFatigueAlerte(): Promise<void> {
  const r = await applyAlertFatiguePolicy();
  log(
    `fatigue alerte : ${r.acknowledgedDuplicates} doublon(s) acquitté(s), ` +
      `${r.dailyRows} organisation(s)-jour(s) mesuré(s)`,
  );
}
void guarded("fatigue alerte", appliquerFatigueAlerte);
setInterval(() => {
  void guarded("fatigue alerte", appliquerFatigueAlerte);
}, ALERT_FATIGUE_MS);

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

/**
 * Relevé nocturne des huit indicateurs du tableau de bord de couverture.
 * Même logique que `orgs_liees_historique` : un appel au démarrage, puis
 * toutes les 24 h ; la fonction SQL remplace le point du jour et purge les
 * relevés au-delà de 90 jours.
 */
const MESURE_KPI_COUVERTURE_MS = 24 * 3600 * 1000;
async function mesurerKpiCouverture(): Promise<void> {
  const releve = await query<{ indicateur: string }>("SELECT * FROM enregistrer_kpi_couverture()");
  log(`kpi couverture : ${releve.rows.length} indicateur(s) relevé(s)`);
}
void guarded("mesure kpi couverture", mesurerKpiCouverture);
setInterval(() => {
  void guarded("mesure kpi couverture", mesurerKpiCouverture);
}, MESURE_KPI_COUVERTURE_MS);

/**
 * Guichet d'orientation des collectivités : contrôle HTTP réel du lien 17Cyber
 * au démarrage puis chaque jour, rejoué seulement si la dernière date vérifiée
 * a plus de 7 jours (cadence hebdomadaire). Indépendant de la collecte : un
 * déploiement `RADAR_COLLECT=0` doit aussi garder son guichet vérifié.
 */
const ORIENTATION_TICK_MS = 24 * 3600 * 1000;
async function verifierOrientation() {
  if (!(await orientationVerificationDue(query))) return;
  const r = await verifierOrientationCollectivites(query);
  if (r.conforme) {
    log(`orientation collectivités : ${r.ok}/${r.alertes} lien(s) HTTP 200, date ${r.verifie_le}`);
  } else {
    app.log.error(
      `orientation collectivités : contrôle NON conforme (${r.ok}/${r.alertes} en 200, cible ${r.cible}) — date non modifiée`,
    );
  }
}
void guarded("orientation collectivités", verifierOrientation);

/** Corrélations : organisationnelle puis CERT-FR MISP. Les deux sont lancées
 *  ensemble ; un échec de l'une ne prive pas l'autre de son passage, et la
 *  corrélation MISP ne rafraîchit jamais `source.last_ok_at` (c'est l'ingestion
 *  qui prouve la fraîcheur du flux). */
async function correler(): Promise<void> {
	const [organisationnelle, misp] = await Promise.allSettled([
		correlateEvents(log),
		correlaterIndicateursCertfrMisp({ log }),
	]);
	if (organisationnelle.status === "rejected") throw organisationnelle.reason;
	if (misp.status === "rejected") log(`certfr_misp : corrélation non écrite — ${messageErreur(misp.reason)}`);
}

/** Ancrage quotidien du journal de vérité : la veille est scellée une fois par
 *  jour (racine Merkle recomputable + jeton RFC 3161), même quand la collecte
 *  est coupée. Sans cet ancrage, corriger une projection effacerait la preuve
 *  de ce qu'on croyait la veille. Un rattrapage borné comble les jours laissés
 *  nus par un arrêt de l'API ; `RADAR_ANCRAGE_JOURNAL=0` coupe le déclenchement. */
const ANCRAGE_JOURNAL_MS = 24 * 3600 * 1000;
async function ancrerJournal(): Promise<void> {
	const resultat = await ancrerJournalDuJour({ rattrapage: 7 });
	if (resultat.ancres.length > 0) {
		log(`ancrage journal : ${resultat.ancres.map((a) => `${a.ancrage.jour} (${a.statut})`).join(", ")}`);
	}
	for (const echec of resultat.echecs) {
		log(`ancrage journal ${echec.jour} : échec — ${echec.erreur}`);
	}
}
if (process.env.RADAR_ANCRAGE_JOURNAL !== "0") {
	void guarded("ancrage journal", ancrerJournal);
	setInterval(() => {
		void guarded("ancrage journal", ancrerJournal);
	}, ANCRAGE_JOURNAL_MS);
}

setInterval(() => void guarded("orientation collectivités", verifierOrientation), ORIENTATION_TICK_MS);

/**
 * Droit de réponse : instruction puis clôture dans le délai d'un mois.
 * Indépendant de la collecte : un déploiement `RADAR_COLLECT=0` doit aussi
 * tenir l'échéance. Le trigger SQL couvre l'insertion ; ce tick couvre le
 * vieillissement des demandes déjà en base. Six heures de cadence laissent
 * une marge d'un jour sous le seuil de 30 jours.
 */
const DROIT_REPONSE_TICK_MS = Number(process.env.RADAR_DROIT_REPONSE_TICK_MS ?? 6 * 3600 * 1000);
async function instruireDroitReponse() {
  const r = await instruireDemandesDroitReponse();
  if (r.reconstituees || r.instruites || r.closes) {
    log(
      `droit de réponse : ${r.instruites} instruction(s), ${r.closes} clôture(s), ` +
      `${r.reconstituees} histoire(s) reconstituée(s) (délai ${r.delaiJours} j)`,
    );
  }
}
void guarded("droit de réponse", instruireDroitReponse);
setInterval(() => void guarded("droit de réponse", instruireDroitReponse), DROIT_REPONSE_TICK_MS);

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
// L'index de la file de revue (org + org_alias, 1,5 à 2,8 Go) n'est plus
// chargé ici : il se construit à la première requête de revue, en tâche de
// fond, et celle-ci répond « en préparation » pendant ce temps. Le démarrage
// n'attend donc plus ~20 s et le RSS au repos reste celui du serveur seul.
await app.listen({ port, host });
