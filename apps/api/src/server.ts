import { AdmissionTally, admitEvent } from "./contract/admit.js";
import { languageVerdict } from "./collectors/filter.js";
import { scoreEventPertinence } from "./collectors/pertinence.js";
import type { CollectContext, Collector, NormalizedEvent } from "@radar/shared";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
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
import { prechaufferIndexRevue } from "./quarantine/review-index.js";
import { reviewQueue } from "./quarantine/review.js";
import { fetchResilient } from "./collectors/http.js";
import { collectors, executerCollecteur, executerPlan, planifierCycle, ratisserSourcesJamaisCollectees } from "./collectors/index.js";
import { enregistrerCycleCollecte } from "./collecte/supervision.js";
import { startLiveStream } from "./collecte/live.js";
import { closeRun, openRun, withRunId } from "./collecte/runs.js";
import { consignerLot, type JournalEntry } from "./journal/index.js";
import { ancrerJournalDuJour } from "./journal/anchor.js";
import { porteeRegionale } from "./match/territorial.js";
import { closePools, ingestQuery, query } from "./db.js";
import { deliverPendingAlerts, readDeliveryConfig } from "./notify/alert-delivery.js";
import {
	orientationVerificationDue,
	verifierOrientationCollectivites,
} from "./orientation/verification.js";
import { runRetention } from "./maintenance/retention.js";
import { instruireDemandesDroitReponse } from "./domain/rectification-delais.js";
import { runDetectionPass } from "./detect/incremental.js";
import { runSilentSourceCheck } from "./detect/silent-source-monitor.js";
import { capterAlertesRupture } from "./analyse/rupture.js";
import { capterAgentsCpu } from "./analyse/agents-cpu.js";
import { requireRole } from "./middleware/auth.js";
import { registerApiRoutes } from "./routes/index.js";
import { installAccessControl } from "./security/rbac.js";
import { installSecurityHeaders } from "./security/headers.js";
import { installErrorHandler } from "./errors.js";
import { installPublicApi } from "./openapi/install.js";

const port = Number(process.env.PORT ?? 8080);
/** Cadence de la boucle de collecte. */
const TICK_MS = Number(process.env.RADAR_TICK_MS ?? 60000);
/** Fenêtre de rétention, en jours. */
const RETENTION_MS = Number(process.env.RADAR_RETENTION_TICK_MS ?? 24 * 3600 * 1000);
/** Cadence de la quarantaine dark web : 30 min mini (ToS de la source). */
const QUARANTINE_MS = Number(process.env.RADAR_QUARANTINE_TICK_MS ?? 30 * 60 * 1000);
/** Cadence de diffusion des alertes (défaut : 2 min). Aucun effet si non configuré. */
const ALERT_DELIVERY_MS = Number(process.env.RADAR_ALERT_DELIVERY_TICK_MS ?? 2 * 60 * 1000);

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
installErrorHandler(app);
// Avant toute route : matrices d'accès, identifiant de corrélation et audit.
installAccessControl(app);

// API publique versionnée, documentée et à quotas (déclarée avant les routes historiques).
await installPublicApi(app);

/** Origines autorisées pour le cross-origin, séparées par des virgules.
 *  Vide = aucune origine croisée (le front est servi depuis la même origine). */
const corsOrigins = (process.env.RADAR_CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

await app.register(cors, { origin: corsOrigins.length > 0 ? corsOrigins : false });
await installSecurityHeaders(app);

/** En-têtes de sécurité sur toutes les réponses (nosniff, frameguard,
 *  referrer-policy, HSTS). Le CSP reste à la charge de la couche qui sert du
 *  HTML (le dist statique sur la box) : l'API ne sert que du JSON. */
await app.register(helmet, { contentSecurityPolicy: false });

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

/** Toutes les routes API sont déclarées dans un registre unique, audité par
 *  le test de couverture des règles d'accès. */
await registerApiRoutes(app);

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
/** Relance manuelle d'une source : le bouton « relancer » du registre. */
const relancesEnCours = new Set<string>();
app.post<{ Params: { id: string } }>(
  "/api/sources/:id/collecte",
  { preHandler: requireRole("admin") },
  async (req, reply) => {
    const id = req.params.id;
    const { rows } = await query<{ id: string; enabled: boolean; kind: string }>(
      "SELECT id, enabled, kind FROM source WHERE id=$1",
      [id],
    );
    const source = rows[0];
    if (!source) return reply.code(404).send({ error: "source introuvable" });
    if (!source.enabled) return reply.code(409).send({ error: "source désactivée" });
    if (relancesEnCours.has(id)) return reply.code(409).send({ error: "collecte déjà en cours" });

    const dedie = collectors.find((c) => c.id === id);
    const tache = dedie
      ? () => runCollectors({ onlyId: id, force: true })
      : id === "hermes_radar_cyber"
        ? () => runHermesCollector(log)
        : source.kind === "quarantine"
          ? () => runQuarantineCollector(log)
          : () => runGenericSources(log, { sourceIds: [id], force: true });

    relancesEnCours.add(id);
    void tache().catch((e: unknown) => {
      app.log.error(e);
    }).finally(() => {
      relancesEnCours.delete(id);
    });
    return reply.code(202).send({ id, lancee: true });
  },
);

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
			log(`rétention : ${r.events} événement(s), ${r.indicators} indicateur(s), ${r.collectorRuns} run(s), ${r.cyclesSupervision} cycle(s) purgé(s), ${r.accessLog} accès`);
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
// Index de la file de revue : chargé une seule fois, avant d'accepter du trafic.
// Page par page et en rendant la main, donc sans figer la boucle ; aucune
// requête ne paiera ensuite les balayages `org` / `org_alias`.
{
	const debut = performance.now();
	try {
		await prechaufferIndexRevue();
		// Un premier passage à vide : la première requête réelle ne paie ni le
		// JIT ni l'échauffement des requêtes SQL de la file.
		await reviewQueue({ limit: 1 });
		log(`index de revue : chargé en ${Math.round(performance.now() - debut)} ms (org + org_alias)`);
	} catch (e) {
		app.log.error(e, "index de revue indisponible au démarrage");
	}
}
await app.listen({ port, host });
