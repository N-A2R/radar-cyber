import { collector as certfr } from "./certfr.collector.js";
import { collector as kev } from "./kev.collector.js";
import { collector as ransomlook } from "./ransomlook.collector.js";
import { collector as epss } from "./epss.collector.js";
import { collector as nvd } from "./nvd.collector.js";
import { collector as ctlog } from "./ctlog.collector.js";
import { collector as poc } from "./poc.collector.js";
import { collector as fuites } from "./fuites.collector.js";
import { collector as certfrMisp } from "./certfr-misp.collector.js";
import { resetGazetteer } from "./org-gazetteer.js";
import type { CollectContext, Collector, NormalizedEvent } from "@radar/shared";
import { consignerAvec, type JournalEntry } from "../journal/index.js";
import { query, withTransaction } from "../db.js";

// L'insertion des événements de flux — et son `ON CONFLICT (fingerprint) DO NOTHING`
// (migration 045) — vit dans generic.ts : ce fichier ne fait que lister les
// collecteurs dédiés, appelés depuis server.ts.
export const collectors: Collector[] = [certfr, kev, ransomlook, epss, nvd, ctlog, poc, fuites, certfrMisp];

/** Sources dont le flux est lu par un collecteur dédié, jamais par le moteur générique. */
export const COLLECTEURS_DEDIES_IDS: readonly string[] = collectors.map((c) => c.id);

/** Nombre d'échecs consécutifs au-delà duquel une source est déclarée morte. */
export const SEUIL_ECHECS_MORTE = 5;

/**
 * Backoff par source. Un flux en échec n'est pas retenté à chaque tick : la
 * série d'échecs ouvre des fenêtres 1 min / 5 min / 30 min / 2 h / 6 h. Un run
 * réussi remet le compteur à zéro et rouvre la source immédiatement.
 */
export const DELAIS_BACKOFF_MS: readonly number[] = [
	0, 60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000,
];

export function delaiBackoffMs(echecsConsecutifs: number): number {
	if (!Number.isFinite(echecsConsecutifs) || echecsConsecutifs <= 0) return 0;
	const index = Math.min(Math.floor(echecsConsecutifs), DELAIS_BACKOFF_MS.length - 1);
	return DELAIS_BACKOFF_MS[index] as number;
}

export type EtatSante = "jamais-collectee" | "saine" | "degradee" | "en-erreur" | "morte" | "desactivee";

export type SanteSource = {
	id: string;
	etat: EtatSante;
	statut: string;
	enabled: boolean;
	echecsConsecutifs: number;
	dernierOk: Date | null;
	dernierEchec: Date | null;
	dernierMessage: string | null;
	dernierStatutRun: string | null;
};

type LigneSante = {
	statut: string;
	enabled: boolean;
	echecs_consecutifs: number;
	last_ok_at: string | null;
	last_error_at: string | null;
	last_error: string | null;
	dernier_statut: string | null;
};

/** L'état de santé se lit dans la source, pas dans une copie en mémoire. */
export function classifierSante(ligne: LigneSante): EtatSante {
	if (ligne.statut === "morte" || ligne.echecs_consecutifs >= SEUIL_ECHECS_MORTE) return "morte";
	if (!ligne.enabled) return "desactivee";
	if (ligne.echecs_consecutifs >= 3) return "en-erreur";
	if (ligne.echecs_consecutifs > 0) return "degradee";
	if (ligne.last_ok_at === null && ligne.dernier_statut === null) return "jamais-collectee";
	return "saine";
}

export async function lireSanteSource(sourceId: string): Promise<SanteSource | null> {
	const { rows } = await query<LigneSante>(
		`SELECT s.statut, s.enabled, s.echecs_consecutifs, s.last_ok_at, s.last_error_at, s.last_error,
		        (SELECT r.status FROM collector_run r WHERE r.source_id = s.id ORDER BY r.finished_at DESC LIMIT 1) AS dernier_statut
		   FROM source s WHERE s.id = $1`,
		[sourceId],
	);
	const ligne = rows[0];
	if (!ligne) return null;
	const date = (valeur: string | null) => {
		if (valeur === null) return null;
		const t = Date.parse(valeur);
		return Number.isNaN(t) ? null : new Date(t);
	};
	return {
		id: sourceId,
		etat: classifierSante(ligne),
		statut: ligne.statut,
		enabled: ligne.enabled,
		echecsConsecutifs: ligne.echecs_consecutifs,
		dernierOk: date(ligne.last_ok_at),
		dernierEchec: date(ligne.last_error_at),
		dernierMessage: ligne.last_error,
		dernierStatutRun: ligne.dernier_statut,
	};
}

export type RaisonCollecte =
	| "jamais-collectee" | "forced" | "due" | "backoff" | "intervalle" | "morte" | "desactivee";

export type DecisionCollecte = {
	sourceId: string;
	collecter: boolean;
	raison: RaisonCollecte;
	sante: SanteSource | null;
};

export function doitCollecter(
	sante: SanteSource | null,
	intervalSec: number,
	options: { force?: boolean } = {},
	maintenant = Date.now(),
): DecisionCollecte {
	const sourceId = sante?.id ?? "";
	const decision = (collecter: boolean, raison: RaisonCollecte): DecisionCollecte =>
		({ sourceId, collecter, raison, sante });
	// Une panne de lecture de l'état n'est pas une raison de perdre la source :
	// elle entre dans le cycle comme si elle n'avait jamais été collectée.
	if (!sante) return decision(true, "jamais-collectee");
	if (sante.etat === "morte") return decision(false, "morte");
	if (!sante.enabled) return decision(false, "desactivee");
	if (options.force) return decision(true, "forced");
	if (sante.etat === "jamais-collectee") return decision(true, "jamais-collectee");

	if (sante.dernierEchec && sante.echecsConsecutifs > 0) {
		const echeance = sante.dernierEchec.getTime() + delaiBackoffMs(sante.echecsConsecutifs);
		if (maintenant < echeance) return decision(false, "backoff");
	}
	const reference = sante.dernierOk ?? sante.dernierEchec;
	if (reference && maintenant - reference.getTime() < intervalSec * 0.8 * 1000) {
		return decision(false, "intervalle");
	}
	return decision(true, "due");
}

export type EtapeCycle = DecisionCollecte & { collecteur: Collector; curseur: Record<string, unknown> };

export type PlanCycle = { aExecuter: EtapeCycle[]; sautees: DecisionCollecte[] };

/** Jamais collectées d'abord, puis les plus anciennes, puis l'ordre des ids. */
export function comparerPriorite(a: EtapeCycle, b: EtapeCycle): number {
	const aJamais = a.sante?.etat === "jamais-collectee" ? 0 : 1;
	const bJamais = b.sante?.etat === "jamais-collectee" ? 0 : 1;
	if (aJamais !== bJamais) return aJamais - bJamais;
	const aDate = a.sante?.dernierOk?.getTime() ?? a.sante?.dernierEchec?.getTime() ?? 0;
	const bDate = b.sante?.dernierOk?.getTime() ?? b.sante?.dernierEchec?.getTime() ?? 0;
	if (aDate !== bDate) return aDate - bDate;
	return a.collecteur.id.localeCompare(b.collecteur.id);
}

/**
 * Construit le plan du cycle. Chaque lecture d'état est isolée : une panne sur
 * une source ne doit pas empêcher les autres d'être collectées.
 */
export async function planifierCycle(options: {
	onlyId?: string;
	force?: boolean;
	maintenant?: number;
	log?: (msg: string) => void;
} = {}): Promise<PlanCycle> {
	const maintenant = options.maintenant ?? Date.now();
	const candidats = collectors.filter((c) => !options.onlyId || c.id === options.onlyId);
	const etats = await Promise.all(candidats.map(async (c) => {
		try {
			return await lireSanteSource(c.id);
		} catch (e) {
			options.log?.(`cycle : état de ${c.id} illisible — ${String(e)}`);
			return null;
		}
	}));
	const aExecuter: EtapeCycle[] = [];
	const sautees: DecisionCollecte[] = [];
	for (let i = 0; i < candidats.length; i++) {
		const collecteur = candidats[i] as Collector;
		const sante = etats[i] ?? null;
		const decision = doitCollecter(sante, collecteur.intervalSec, { force: options.force }, maintenant);
		if (!decision.collecter) {
			sautees.push(decision);
			continue;
		}
		const cursor = sante ? await lireCurseur(decision.sourceId) : {};
		aExecuter.push({ ...decision, collecteur, curseur: cursor });
	}
	aExecuter.sort(comparerPriorite);
	return { aExecuter, sautees };
}

async function lireCurseur(sourceId: string): Promise<Record<string, unknown>> {
	try {
		const { rows } = await query<{ cursor: unknown }>("SELECT cursor FROM source WHERE id=$1", [sourceId]);
		const valeur = rows[0]?.cursor;
		return valeur !== null && typeof valeur === "object" ? (valeur as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

/** RSS en Mo, après GC quand le processus l'expose (--expose-gc). */
export function mesurerMemoireMo(): number {
	// `gc` n'existe qu'avec --expose-gc ; le typage Node ne le déclare pas.
	const globalAvecGc: { gc?: () => void } = globalThis;
	globalAvecGc.gc?.();
	return Math.round(process.memoryUsage().rss / 1048576);
}

export type MemoireCycle = { avantMo: number; apresMo: number; deltaMo: number };

export type ResultatCycle = {
	tentatives: number;
	reussis: number;
	echecs: number;
	erreurs: string[];
	memoire: MemoireCycle;
};

/**
 * Exécute un plan en isolant chaque source. Une erreur de lecture, de parsing
 * ou d'écriture n'interrompt jamais la suite du cycle. Les deux mesures de
 * mémoire encadrent le cycle complet tel qu'il s'est réellement déroulé.
 */
export async function executerPlan(
	plan: PlanCycle,
	traiter: (etape: EtapeCycle) => Promise<void>,
	options: { log?: (msg: string) => void } = {},
): Promise<ResultatCycle> {
	const avantMo = mesurerMemoireMo();
	const resultat: ResultatCycle = {
		tentatives: plan.aExecuter.length, reussis: 0, echecs: 0, erreurs: [],
		memoire: { avantMo, apresMo: avantMo, deltaMo: 0 },
	};
	for (const etape of plan.aExecuter) {
		try {
			await traiter(etape);
			resultat.reussis++;
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			resultat.echecs++;
			resultat.erreurs.push(`${etape.collecteur.id}: ${message}`);
			options.log?.(`cycle : ${etape.collecteur.id} en échec, on continue — ${message}`);
		}
	}
	const apresMo = mesurerMemoireMo();
	resultat.memoire = { avantMo, apresMo, deltaMo: apresMo - avantMo };
	return resultat;
}

/**
 * Sources actives encore sans aucun run : le ratissage de fin de cycle les
 * reprend une par une. Même un échec y écrit un `collector_run`, donc une
 * source tentée n'est plus « jamais collectée » — elle est désormais mesurable.
 */
export async function sourcesJamaisCollectees(limite = 100, ids?: readonly string[]): Promise<string[]> {
	const params: unknown[] = [[...COLLECTEURS_DEDIES_IDS, "hermes_radar_cyber"]];
	let sql = `SELECT s.id FROM source s
		  WHERE s.enabled AND s.statut <> 'morte' AND s.kind <> 'quarantine'
		    AND s.id <> ALL($1::text[])
		    AND NOT EXISTS (SELECT 1 FROM collector_run r WHERE r.source_id = s.id)`;
	if (ids?.length) {
		params.push([...ids]);
		sql += ` AND s.id = ANY($2::text[])`;
	}
	params.push(limite);
	sql += ` ORDER BY s.id LIMIT $${params.length}`;
	const { rows } = await query<{ id: string }>(sql, params);
	return rows.map((r) => r.id);
}

export async function ratisserSourcesJamaisCollectees(
	traiter: (ids: string[]) => Promise<void>,
	options: { limite?: number; ids?: readonly string[]; log?: (msg: string) => void } = {},
): Promise<string[]> {
	const limite = options.limite ?? 100;
	const ids = await sourcesJamaisCollectees(limite, options.ids);
	for (const id of ids) {
		try {
			await traiter([id]);
		} catch (e) {
			options.log?.(`ratissage : ${id} en échec, on continue — ${String(e)}`);
		}
	}
	return sourcesJamaisCollectees(limite, options.ids);
}

/** Libère l'index partagé en fin de cycle : le processus reste sous son budget. */
export function libererMemoireCycle(): void {
	resetGazetteer();
}

type ResultatCollecte = { events: NormalizedEvent[]; cursor?: Record<string, unknown> };

/**
 * Exécute un collecteur du registre et tient à jour son état de santé.
 *
 * Le marquage n'intervient qu'après cinq échecs *consécutifs* : un run réussi
 * remet le compteur à zéro. La source n'est jamais supprimée — on la désactive
 * seulement, comme pour la décision admin, et le fait est écrit dans le journal
 * dans la même transaction que le changement d'état.
 */
export async function executerCollecteur(c: Collector, ctx: CollectContext): Promise<ResultatCollecte> {
	try {
		const resultat = await c.run(ctx);
		await constaterSucces(c.id, ctx.log);
		return resultat;
	} catch (e) {
		await constaterEchec(c.id, e, ctx.log);
		// L'erreur remonte : l'orchestrateur journalise le run en échec.
		throw e;
	}
}

async function tracer(client: {
	query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}, entre: JournalEntry): Promise<void> {
	const trace = await consignerAvec((sql, params) => client.query(sql, params as unknown[]), entre);
	if (!trace.ok) throw new Error(`journal indisponible : ${trace.error}`);
}

async function constaterSucces(sourceId: string, log: (msg: string) => void): Promise<void> {
	try {
		const { rows: avant } = await query<{ echecs: number }>(
			"SELECT echecs_consecutifs AS echecs FROM source WHERE id = $1", [sourceId],
		);
		const echecsAvant = avant[0]?.echecs ?? 0;
		await query(
			`UPDATE source
			    SET echecs_consecutifs = 0, last_ok_at = now(), last_error = NULL, last_error_at = NULL
			  WHERE id = $1`,
			[sourceId],
		);
		if (echecsAvant === 0) return;
		await withTransaction(async (client) => {
			await tracer(client, {
				kind: "source.changed",
				subject: sourceId,
				summary: `source ${sourceId} saine à nouveau après ${echecsAvant} échec(s)`,
				actor: `collecteur:${sourceId}`,
				payload: { transition: "sante-retour", echecsConsecutifs: echecsAvant },
			});
		});
	} catch (e) {
		log(`collecteur ${sourceId} : état de santé non mis à jour — ${String(e)}`);
	}
}

async function constaterEchec(sourceId: string, erreur: unknown, log: (msg: string) => void): Promise<void> {
	const message = erreur instanceof Error ? erreur.message : String(erreur);
	try {
		const constat = await withTransaction(async (client) => {
			const compteur = await client.query<{ echecs_consecutifs: number }>(
				`UPDATE source
				    SET echecs_consecutifs = echecs_consecutifs + 1,
				        last_error = $2,
				        last_error_at = now()
				  WHERE id = $1 AND statut = 'active'
				  RETURNING echecs_consecutifs`,
				[sourceId, message],
			);
			const echecs = compteur.rows[0]?.echecs_consecutifs;
			// Source inconnue, ou déjà morte : rien à compter.
			if (echecs === undefined) return null;
			if (echecs === 1) {
				await tracer(client, {
					kind: "source.changed",
					subject: sourceId,
					summary: `source ${sourceId} dégradée : premier échec — ${message}`,
					actor: `collecteur:${sourceId}`,
					payload: { transition: "sante-degradee", echecsConsecutifs: 1, raison: message.slice(0, 300) },
				});
			}
			if (echecs < SEUIL_ECHECS_MORTE) return { echecs, morte: false };

			const morte = await client.query(
				`UPDATE source
				    SET statut = 'morte',
				        derniere_erreur = $1,
				        enabled = false,
				        disabled_at = COALESCE(disabled_at, now()),
				        disabled_reason = $1
				  WHERE id = $2 AND statut = 'active'
				  RETURNING id`,
				[message, sourceId],
			);
			if (!morte.rows[0]) return null;

			const trace = await consignerAvec((sql, params) => client.query(sql, params as unknown[]), {
				kind: "source.morte",
				subject: sourceId,
				summary: `source ${sourceId} marquée morte après ${echecs} échecs consécutifs — ${message}`,
				actor: `collecteur:${sourceId}`,
				payload: { seuil: SEUIL_ECHECS_MORTE, echecsConsecutifs: echecs, raison: message.slice(0, 300) },
			});
			if (!trace.ok) throw new Error(`journal indisponible : ${trace.error}`);
			return { echecs, morte: true };
		});
		if (constat?.morte) {
			log(`collecteur ${sourceId} : ${SEUIL_ECHECS_MORTE} échecs consécutifs, source marquée morte`);
		}
	} catch (e) {
		// Un compteur indisponible ne doit pas faire perdre la collecte : on laisse
		// remonter l'erreur d'origine et on signale le trou dans les logs.
		log(`collecteur ${sourceId} : compteur d'échecs non mis à jour — ${String(e)}`);
	}
}
