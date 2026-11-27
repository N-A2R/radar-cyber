/**
 * Rafraîchissement des scores EPSS (FIRST, API publique sans clé).
 *
 * Télécharge le dump EPSS complet du jour (~402 000 CVE) et l'écrit dans la
 * table `epss` (migration 021 : `cve` PK, `score`, `percentile`, `updated_at`).
 * Aucun événement n'est créé : les scores alimentent `loadCoverageContext()` /
 * `admitByEpss()` (`collectors/relevance.ts`), ce dernier utilisant le seuil
 * `EPSS_ADMISSION_THRESHOLD`.
 *
 * L'API FIRST **n'a pas de tri** : `order=!epss` est accepté mais ignoré
 * (vérifié : la réponse est identique avec et sans paramètre). Il n'existe donc
 * aucun moyen d'obtenir « les N meilleurs scores » côté serveur ; on pagine tout
 * via `limit`/`offset` (limit plafonné à 10 000) jusqu'à `total`, sinon on ne
 * récupère qu'une tranche arbitraire des CVE (les premiers du tri interne).
 * L'API renvoie occasionnellement des 504 : les pages sont rejouées avec backoff.
 *
 * Les lignes sont déversées dans une table temporaire puis upsertées
 * (`ON CONFLICT (cve) DO UPDATE`) : un COPY direct dans `epss` échouerait sur
 * les doublons et ne sait pas faire de mise à jour.
 *
 * Défaut : --dry-run (aucune écriture dans epss). --apply pour écrire dans epss.
 *
 * Usage :
 *   pnpm -F @radar/api exec tsx ../../scripts/refresh-epss.mts            # simulation
 *   pnpm -F @radar/api exec tsx ../../scripts/refresh-epss.mts --apply    # écrit dans epss
 *   pnpm -F @radar/api exec tsx ../../scripts/refresh-epss.mts --apply --date=2026-11-10
 */
import { ingestPool, closePools } from "../apps/api/src/db.js";
import { EPSS_ADMISSION_THRESHOLD } from "../apps/api/src/collectors/relevance.js";

const API = "https://api.first.org/data/v1/epss";
const USER_AGENT = "radar-cyber-epss/1.0 (+https://radar-cyber.local; EPSS refresh)";
/** L'API plafonne `limit` à 10 000 (vérifié : demander 100 001 rend limit=10000). */
const MAX_LIMIT = 10_000;
/** Politesse : 1,1 s entre deux requêtes, y compris après un échec. */
const MIN_REQUEST_INTERVAL_MS = 1_100;
/** 504/429 observés sous charge ; 5 tentatives avec backoff exponentiel. */
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 2_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
/** Taille maximale du tampon de dédoublonnage et des lots insérés dans la table temporaire. */
const STAGE_BATCH = 5_000;

interface Options {
	apply: boolean;
	date: string | null;
	limit: number;
	pageDelayMs: number;
}

interface EpssApiRow {
	cve?: unknown;
	epss?: unknown;
	percentile?: unknown;
}

interface EpssApiPage {
	total?: unknown;
	data?: unknown;
}

interface ScoreRow {
	cve: string;
	score: number;
	percentile: number | null;
}

function parseArgs(argv: string[]): Options {
	const opts: Options = { apply: false, date: null, limit: MAX_LIMIT, pageDelayMs: MIN_REQUEST_INTERVAL_MS };
	for (const arg of argv) {
		if (arg === "--apply") opts.apply = true;
		else if (arg === "--dry-run") opts.apply = false;
		else if (arg.startsWith("--date=")) opts.date = arg.slice(7).trim() || null;
		else if (arg.startsWith("--limit=")) opts.limit = Math.min(MAX_LIMIT, Math.max(1, Number(arg.slice(8)) || MAX_LIMIT));
		else if (arg.startsWith("--page-delay=")) opts.pageDelayMs = Math.max(MIN_REQUEST_INTERVAL_MS, Number(arg.slice(13)) || MIN_REQUEST_INTERVAL_MS);
		else if (arg === "--help" || arg === "-h") {
			console.log("usage: refresh-epss.mts [--apply] [--date=AAAA-MM-JJ] [--limit=N] [--page-delay=ms]");
			process.exit(0);
		}
	}
	return opts;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Date du jour (UTC) au format de l'API ; validation stricte d'un --date. */
function resolveDate(explicit: string | null): string {
	if (explicit !== null) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(explicit)) throw new Error(`--date invalide : ${explicit} (attendu AAAA-MM-JJ)`);
		return explicit;
	}
	return new Date().toISOString().slice(0, 10);
}

/** Cadence globale : aucune requête ne part moins de `delayMs` après la précédente. */
function makePacer(delayMs: number): () => Promise<void> {
	let lastStart = 0;
	return async () => {
		const wait = lastStart + delayMs - Date.now();
		if (wait > 0) await sleep(wait);
		lastStart = Date.now();
	};
}

function isRetryable(error: unknown): boolean {
	if (error instanceof Error && "status" in error && typeof (error as { status?: unknown }).status === "number") {
		return RETRYABLE_STATUS.has((error as { status: number }).status);
	}
	// Erreur réseau / timeout : pas de statut HTTP.
	return true;
}

async function fetchPage(pageOffset: number, limit: number, date: string | null, pace: () => Promise<void>): Promise<EpssApiPage> {
	// Pas de `order` : l'API l'ignore et renvoie toujours le même tri interne.
	const params = new URLSearchParams({ limit: String(limit), offset: String(pageOffset), date });
	let attempt = 0;
	for (;;) {
		await pace();
		try {
			const res = await fetch(`${API}?${params.toString()}`, {
				headers: { "user-agent": USER_AGENT, accept: "application/json" },
				signal: AbortSignal.timeout(60_000),
			});
			if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} sur ${API} (offset ${pageOffset})`), { status: res.status });
			const payload: unknown = await res.json();
			if (payload === null || typeof payload !== "object") throw new Error("réponse EPSS non objet");
			return payload as EpssApiPage;
		} catch (error) {
			if (attempt >= MAX_RETRIES || !isRetryable(error)) throw error;
			const backoff = RETRY_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 500);
			attempt++;
			const reason = error instanceof Error ? error.message : String(error);
			console.warn(`  retry ${attempt}/${MAX_RETRIES} dans ${backoff} ms (offset ${pageOffset}) : ${reason}`);
			await sleep(backoff);
		}
	}
}

function asRows(page: EpssApiPage): EpssApiRow[] {
	return Array.isArray(page.data) ? (page.data.filter((row): row is EpssApiRow => row !== null && typeof row === "object") as EpssApiRow[]) : [];
}

/** Déverse un lot dans la table temporaire ; l'upsert évite les doublons internes. */
async function stageBatch(client: import("pg").PoolClient, rows: ScoreRow[]): Promise<void> {
	await client.query(
		`INSERT INTO epss_stage (cve, score, percentile)
		 SELECT cve, score, percentile
		   FROM unnest($1::text[], $2::double precision[], $3::double precision[]) AS t(cve, score, percentile)
		 ON CONFLICT (cve) DO UPDATE SET
		   score = EXCLUDED.score,
		   percentile = EXCLUDED.percentile`,
		[rows.map((r) => r.cve), rows.map((r) => r.score), rows.map((r) => r.percentile)]
	);
}

/** Table de session, dédiée à ce run : aucun verrou ni écriture durable avant l'upsert final. */
async function prepareStage(client: import("pg").PoolClient): Promise<void> {
	await client.query("DROP TABLE IF EXISTS pg_temp.epss_stage");
	await client.query(
		`CREATE TEMP TABLE epss_stage (
		   cve text PRIMARY KEY,
		   score double precision NOT NULL,
		   percentile double precision
		 )`
	);
}

async function main(): Promise<void> {
	const opts = parseArgs(process.argv.slice(2));
	const date = resolveDate(opts.date);
	const pace = makePacer(opts.pageDelayMs);
	const client = await ingestPool.connect();

	try {
		await prepareStage(client);
		// L'API fournit l'ordre de pagination ; le ON CONFLICT de la table de session
		// conserve la dernière valeur de chaque CVE dans cet ordre, sans tout garder en RAM.
		const pending = new Map<string, ScoreRow>();
		const flush = async (): Promise<void> => {
			if (pending.size === 0) return;
			await stageBatch(client, [...pending.values()]);
			pending.clear();
		};

		let offset = 0;
		let total: number | null = null;
		let pages = 0;
		const startedAt = Date.now();

		while (total === null || offset < total) {
			const page = await fetchPage(offset, opts.limit, date, pace);
			if (page.total !== undefined && Number.isFinite(Number(page.total))) total = Number(page.total);
			const rows = asRows(page);
			if (rows.length === 0) {
				console.warn(`  page vide à offset ${offset} (total ${total ?? "?"}) : arrêt`);
				break;
			}
			for (const row of rows) {
				const cve = String(row.cve ?? "").trim().toUpperCase();
				const score = Number(row.epss);
				if (!cve || !Number.isFinite(score)) continue;
				const percentile = row.percentile === undefined || row.percentile === null ? null : Number(row.percentile);
				pending.set(cve, { cve, score, percentile: percentile !== null && Number.isFinite(percentile) ? percentile : null });
				if (pending.size >= STAGE_BATCH) await flush();
			}
			offset += rows.length;
			pages++;
			if (total !== null) console.log(`  page ${pages} : offset ${offset}/${total}`);
			// Garde-fou : une API incohérente ne doit pas boucler à l'infini.
			if (pages > 100) throw new Error("dépassement du plafond de pagination (API incohérente)");
		}
		await flush();

		const stats = await client.query<{ retained: string; high: string }>(
			`SELECT count(*)::text AS retained,
			        count(*) FILTER (WHERE score >= $1)::text AS high
			   FROM epss_stage`,
			[EPSS_ADMISSION_THRESHOLD]
		);
		const retained = Number(stats.rows[0].retained);
		const high = Number(stats.rows[0].high);
		const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
		console.log(`EPSS ${date} — ${pages} page(s), téléchargées=${offset}, retenues=${retained} (total API ${total ?? "?"}) en ${elapsed} s`);
		console.log(`  score >= ${EPSS_ADMISSION_THRESHOLD} : ${high}`);

		if (!opts.apply) {
			console.log("  mode dry-run : aucune écriture (utiliser --apply)");
			return;
		}

		const before = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM epss");
		await client.query("BEGIN");
		await client.query(
			`INSERT INTO epss (cve, score, percentile, updated_at)
			 SELECT cve, score, percentile, now() FROM epss_stage
			 ON CONFLICT (cve) DO UPDATE SET
			   score = EXCLUDED.score,
			   percentile = EXCLUDED.percentile,
			   updated_at = EXCLUDED.updated_at`
		);
		await client.query("COMMIT");
		const after = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM epss");
		const inserted = Number(after.rows[0].count) - Number(before.rows[0].count);
		console.log(`  epss : ${retained} score(s) upsertés (${inserted} nouveaux, ${retained - inserted} mis à jour, total ${after.rows[0].count})`);
	} catch (error) {
		await client.query("ROLLBACK").catch(() => undefined);
		throw error;
	} finally {
		await client.query("DROP TABLE IF EXISTS pg_temp.epss_stage").catch(() => undefined);
		client.release();
	}
}

main()
	.catch((error: unknown) => {
		console.error(`refresh-epss : ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
