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
import { collectors, executerCollecteur, executerPlan, planifierCycle } from "../collectors/index.js";
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
	/** Faux : ni découverte de sitemaps, ni ingestion générique. */
	etapesSupplementaires?: boolean;
};

type TacheCycle = { nom: string; erreur: string | null };

const messageErreur = (reason: unknown): string => {
	if (reason instanceof Error) return reason.message;
	if (typeof reason === "string") return reason;
	return String(reason);
};

/**
 * Insertion et rafraîchissement en une seule instruction atomique.
 *
 * `ON CONFLICT DO UPDATE` renvoie `rowCount=1` même quand rien n'a changé :
 * `DO NOTHING RETURNING` distingue la vraie insertion du conflit. Le
 * rafraîchissement ne touche que les colonnes que la source peut corriger,
 * jamais les décisions enrichies en aval (org_id, tlp, regional, evidence…).
 */
const SQL_INGERER_EVENEMENT = `
WITH src AS (
  SELECT $1::text AS dedup_key, $2::text AS family, $3::text AS assertion_type,
         $4::text AS title, $5::text AS summary, $6::timestamptz AS observed_at,
         $7::timestamptz AS valid_at, $8::smallint AS severity, $9::text AS confidence,
         $10::text AS source_id, $11::text AS source_url, $12::jsonb AS evidence,
         $13::text AS geo_type, $14::double precision AS lat, $15::double precision AS lon,
         $16::boolean AS regional, $17::text AS regional_motif, $18::text AS langue,
         $19::smallint AS pertinence_score, $20::text AS pertinence_rule
), ins AS (
  INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at, valid_at,
                     severity, confidence, source_id, source_url, evidence, geo_type, lat, lon,
                     regional, regional_motif, langue, pertinence_score, pertinence_rule)
  SELECT dedup_key, family, assertion_type, title, summary, observed_at, valid_at,
         severity, confidence, source_id, source_url, evidence, geo_type, lat, lon,
         regional, regional_motif, langue, pertinence_score, pertinence_rule
  FROM src
  ON CONFLICT (dedup_key) DO NOTHING
  RETURNING id
), avant AS (
  SELECT ARRAY_REMOVE(ARRAY[
    CASE WHEN e.title IS DISTINCT FROM s.title THEN 'title' END,
    CASE WHEN e.summary IS DISTINCT FROM s.summary THEN 'summary' END,
    CASE WHEN e.severity IS DISTINCT FROM s.severity THEN 'severity' END,
    CASE WHEN e.confidence IS DISTINCT FROM s.confidence THEN 'confidence' END,
    CASE WHEN e.source_url IS DISTINCT FROM s.source_url THEN 'source_url' END,
    CASE WHEN e.geo_type IS DISTINCT FROM s.geo_type THEN 'geo_type' END,
    CASE WHEN e.lat IS DISTINCT FROM s.lat THEN 'lat' END,
    CASE WHEN e.lon IS DISTINCT FROM s.lon THEN 'lon' END,
    CASE WHEN e.langue IS DISTINCT FROM s.langue THEN 'langue' END,
    CASE WHEN e.pertinence_score IS DISTINCT FROM s.pertinence_score THEN 'pertinence_score' END,
    CASE WHEN e.pertinence_rule IS DISTINCT FROM s.pertinence_rule THEN 'pertinence_rule' END
  ], NULL::text)::text[] AS champs
  FROM event e JOIN src s ON s.dedup_key = e.dedup_key
  WHERE NOT EXISTS (SELECT 1 FROM ins)
), maj AS (
  UPDATE event e SET
    title = s.title, summary = s.summary, severity = s.severity, confidence = s.confidence,
    source_url = s.source_url, geo_type = s.geo_type, lat = s.lat, lon = s.lon,
    langue = s.langue, pertinence_score = s.pertinence_score, pertinence_rule = s.pertinence_rule
  FROM src s
  WHERE e.dedup_key = s.dedup_key
    AND EXISTS (SELECT 1 FROM avant WHERE cardinality(avant.champs) > 0)
  RETURNING e.id
)
SELECT (SELECT id FROM ins) AS inserted_id,
       (SELECT champs FROM avant) AS champs,
       (SELECT id FROM maj) AS updated_id;
`;

type ResultatIngestion = { inserted_id: number | null; champs: string[] | null; updated_id: number | null };

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
				if (!admitted.ok) {
					const brut = ev as unknown as Record<string, unknown>;
					const cle = typeof brut.dedupKey === "string" && brut.dedupKey.length >= 8
						? brut.dedupKey
						: admitted.hint;
					faits.push({
						kind: "event.rejected",
						subject: `event:${cle}`,
						summary: `${c.id} : événement refusé (${admitted.rejections.join(", ")})`,
						actor: `collecteur:${c.id}`,
						payload: {
							reason: admitted.rejections,
							sourceId: typeof brut.sourceId === "string" ? brut.sourceId : "",
							hint: admitted.hint,
						},
						validAt: null,
					});
					continue;
				}
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
				const r = await ingestQuery<ResultatIngestion>(SQL_INGERER_EVENEMENT,
					[event.dedupKey, event.family, event.assertionType, event.title, event.summary ?? null,
					 event.observedAt ?? null, event.observedAt ?? new Date().toISOString(), event.severity,
					 event.confidence ?? null, event.sourceId, event.sourceUrl ?? null,
					 JSON.stringify(event.evidence ?? {}), event.geoType, event.lat ?? null, event.lon ?? null,
					 portee.regional, portee.motif, langue.language, pertinence.score, pertinence.rule],
				);
				const champs = r.rows[0]?.champs ?? [];
				if (r.rows[0]?.inserted_id != null) {
					itemsNew++;
					faits.push({
						kind: "event.admitted",
						subject: event.dedupKey,
						summary: `${c.id} : événement admis (${event.family})`,
						actor: `collecteur:${c.id}`,
						payload: { family: event.family, assertionType: event.assertionType },
						validAt: event.observedAt ?? null,
					});
				} else if (champs.length > 0) {
					faits.push({
						kind: "event.updated",
						subject: event.dedupKey,
						summary: `${c.id} : champs corrigés (${champs.join(", ")})`,
						actor: `collecteur:${c.id}`,
						payload: { champs, family: event.family },
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
			await ingestQuery("UPDATE source SET cursor=$1, last_ok_at=now(), pret_a_collecter=true WHERE id=$2", [JSON.stringify(result.cursor ?? cursor), c.id]);
			await ingestQuery("INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new) VALUES ($1, $2, 'ok', $3, $4)", [c.id, new Date().toISOString(), itemsIn, itemsNew]);
			log(`collecteur ${c.id} : ${itemsIn} élément(s), ${itemsNew} nouveau(x)${langueSkipped > 0 ? `, ${langueSkipped} langue(s) exclue(s)` : ""}`);
			const contractLine = contract.logLine();
			if (contractLine) log(`collecteur ${c.id} : contrat — ${contractLine}`);
		} catch (e: unknown) {
			const err = messageErreur(e);
			log(`collecteur ${c.id} en échec : ${err}`);
			await ingestQuery("UPDATE source SET last_error_at=now(), last_error=$1 WHERE id=$2", [err, c.id]).catch(() => {});
			await ingestQuery("INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, error) VALUES ($1, $2, 'error', $3, $4, $5)", [c.id, new Date().toISOString(), itemsIn, itemsNew, err]).catch(() => {});
		}
	}, { log });

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

