/**
 * Cycle de collecte partageable : API en continu et veille quotidienne.
 *
 * Le serveur et le job du matin exécutent exactement les mêmes étapes : plan
 * des sources dues, collecteurs dédiés, découverte et ingestion générique,
 * puis trace de supervision. Les points de contact réseau sont injectables
 * (`collecteurs`, `etapesSupplementaires`) pour qu'un cycle complet puisse
 * être mesuré sur une base de test sans aucun appel sortant.
 */
import type { CollectContext, Collector, NormalizedEvent } from "@radar/shared";
import { AdmissionTally, admitEvent } from "../contract/admit.js";
import { languageVerdict } from "../collectors/filter.js";
import { scoreEventPertinence } from "../collectors/pertinence.js";
import { fetchResilient } from "../collectors/http.js";
import { runGenericSources } from "../collectors/generic.js";
import { runScheduledDiscovery } from "../discovery/discover.js";
import {
	collectors,
	executerCollecteur,
	executerPlan,
	planifierCycle,
	ratisserSourcesJamaisCollectees,
} from "../collectors/index.js";
import { consignerLot, type JournalEntry } from "../journal/index.js";
import { porteeRegionale } from "../match/territorial.js";
import { ingestQuery } from "../db.js";
import {
	enregistrerCycleCollecte,
	type AlerteSupervision,
	type CycleCollecte,
} from "./supervision.js";

export type OptionsCycle = {
	log?: (message: string) => void;
	maintenant?: Date;
	/** Registre de collecteurs remplacé par le job de test (aucun réseau). */
	collecteurs?: readonly Collector[];
	onlyId?: string;
	force?: boolean;
	/** Faux : ni découverte de sitemaps, ni ingestion générique, ni ratissage réseau. */
	etapesSupplementaires?: boolean;
};

type TacheCycle = { nom: string; erreur: string | null };

const messageErreur = (reason: unknown): string => {
	if (reason instanceof Error) return reason.message;
	if (typeof reason === "string") return reason;
	return String(reason);
};

export function contexteCollecteur(
	cursor: Record<string, unknown>,
	log: (message: string) => void,
): CollectContext {
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
export async function runCollectors(options: OptionsCycle = {}): Promise<void> {
	const log = options.log ?? (() => {});
	const plan = await planifierCycle({
		onlyId: options.onlyId,
		force: options.force,
		collecteurs: options.collecteurs,
		maintenant: options.maintenant?.getTime(),
		log,
	});
	for (const sautee of plan.sautees) {
		log(`collecteur ${sautee.sourceId} sauté : ${sautee.raison}`);
	}
	const resultat = await executerPlan(plan, async (etape) => {
		const c = etape.collecteur;
		const cursor = etape.curseur;
		let itemsIn = 0;
		let itemsNew = 0;
		let langueSkipped = 0;
		try {
			const result = await executerCollecteur(c, contexteCollecteur(cursor, log));
			itemsIn = result.events.length;
			// Le contrat vérifie pour de vrai les événements renvoyés par les
			// collecteurs et compte ses écarts.
			const contract = new AdmissionTally();
			const faits: JournalEntry[] = [];
			for (const ev of result.events as NormalizedEvent[]) {
				const admitted = admitEvent(ev as unknown as Record<string, unknown>);
				contract.record(admitted);
				if (!admitted.ok) continue;
				const event = admitted.event;
				const langue = languageVerdict(event.title, event.summary);
				const pertinence = scoreEventPertinence({
					title: event.title,
					summary: event.summary,
					sourceUrl: event.sourceUrl,
				});
				if (!langue.keep) {
					langueSkipped++;
					continue;
				}
				const portee = porteeRegionale(`${event.title} ${event.summary ?? ""}`, null);
				const r = await ingestQuery(
					`INSERT INTO event (dedup_key, family, assertion_type, title, summary, langue, observed_at, valid_at, severity, confidence, source_id, source_url, evidence, geo_type, lat, lon, regional, regional_motif, pertinence_score, pertinence_rule)
					 VALUES ($1,$2,$3,$4,$5,$18,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$19,$20)
					 ON CONFLICT (dedup_key) DO UPDATE SET observed_at = COALESCE(event.observed_at, EXCLUDED.observed_at)`,
					[event.dedupKey, event.family, event.assertionType, event.title, event.summary ?? null,
					 event.observedAt ?? null, event.observedAt ?? new Date().toISOString(), event.severity,
					 event.confidence ?? null, event.sourceId, event.sourceUrl ?? null,
					 JSON.stringify(event.evidence ?? {}), event.geoType, event.lat ?? null, event.lon ?? null,
					 portee.regional, portee.motif, langue.language, pertinence.score, pertinence.rule],
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
			if (faits.length > 0) {
				const lot = await consignerLot(faits);
				if (lot.lacunes > 0 || lot.erreurs.length > 0) {
					log(`[journal] ${c.id} : ${lot.consignes} fait(s) consigné(s), ${lot.lacunes} lacune(s), ${lot.erreurs.length} échec(s)`);
				}
			}
			await ingestQuery("UPDATE source SET cursor=$1, last_ok_at=now() WHERE id=$2", [JSON.stringify(result.cursor ?? cursor), c.id]);
			await ingestQuery("INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new) VALUES ($1, now(), 'ok', $2, $3)", [c.id, itemsIn, itemsNew]);
			log(`collecteur ${c.id} : ${itemsIn} élément(s), ${itemsNew} nouveau(x)${langueSkipped > 0 ? `, ${langueSkipped} langue(s) exclue(s)` : ""}`);
			const contractLine = contract.logLine();
			if (contractLine) log(`collecteur ${c.id} : contrat — ${contractLine}`);
		} catch (e: unknown) {
			const err = messageErreur(e);
			log(`collecteur ${c.id} en échec : ${err}`);
			await ingestQuery("UPDATE source SET last_error_at=now(), last_error=$1 WHERE id=$2", [err, c.id]).catch(() => {});
			await ingestQuery("INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, error) VALUES ($1, now(), 'error', $2, $3, $4)", [c.id, itemsIn, itemsNew, err]).catch(() => {});
		}
	}, { log });

	if (options.etapesSupplementaires !== false && !options.onlyId) {
		await ratisserSourcesJamaisCollectees(
			async (ids) => runGenericSources(log, { sourceIds: ids, force: true }),
			{ log: (m) => log(m) },
		);
	}
	log(
		`cycle collecteurs : ${resultat.reussis} source(s) traitée(s), ${resultat.echecs} échec(s), ` +
		`memoire ${resultat.memoire.avantMo}→${resultat.memoire.apresMo} Mo`,
	);
}

/** Cycle complet chronométré et enregistré dans la table de supervision. */
export async function executerCycleCollecte(
	options: OptionsCycle = {},
): Promise<{ cycle: CycleCollecte; alertes: AlerteSupervision[] }> {
	const log = options.log ?? (() => {});
	const startedAt = options.maintenant ?? new Date();
	const memoireAvant = process.memoryUsage();
	const taches: TacheCycle[] = [];
	const aFaire: { nom: string; run: () => Promise<void> }[] = [
		{ nom: "collecteurs", run: () => runCollectors(options) },
	];
	if (options.etapesSupplementaires !== false) {
		aFaire.push(
			{ nom: "sitemap discovery", run: () => runScheduledDiscovery(log) },
			{ nom: "ingestion générique", run: () => runGenericSources(log) },
		);
	}
	const resultats = await Promise.allSettled(aFaire.map((t) => t.run()));
	resultats.forEach((resultat, i) => {
		taches.push({
			nom: aFaire[i]?.nom ?? "inconnu",
			erreur: resultat.status === "rejected" ? messageErreur(resultat.reason) : null,
		});
	});
	for (const tache of taches) {
		if (tache.erreur) log(`${tache.nom} : ${tache.erreur}`);
	}
	const fin = process.memoryUsage();
	const enregistre = await enregistrerCycleCollecte({
		startedAt,
		finishedAt: new Date(),
		maintenant: options.maintenant,
		memoireAvant: { rss: memoireAvant.rss, heapUsed: memoireAvant.heapUsed },
		memoireApres: { rss: fin.rss, heapUsed: fin.heapUsed },
		taches,
	});
	log(
		`cycle ${enregistre.cycle.id} : ${enregistre.cycle.statut}, ${enregistre.cycle.dureeMs} ms, ` +
		`${enregistre.cycle.sourcesOk} source(s) ok, ${enregistre.cycle.sourcesError} en erreur, ` +
		`${enregistre.cycle.itemsIn} élément(s), ${enregistre.cycle.itemsNew} nouveau(x), ` +
		`${enregistre.alertes.length} alerte(s) de supervision`,
	);
	return enregistre;
}

