/**
 * Rapport hebdomadaire agrégé du radar.
 *
 * Lecture seule. Toutes les requêtes sont bornées ($1 = date de début) et
 * excluent les événements TLP:RED (stockés `RED` en base) et TLP:RED externe.
 *
 * Le rendu Markdown et HTML vit dans `apps/api/src/analyse/rapport-hebdo.ts` :
 * la suite golden (`apps/api/test/rapports-golden.test.ts`) épingle donc le
 * rendu réellement publié, pas une copie.
 *
 * Usage :
 *   pnpm exec tsx scripts/weekly-report.mts [--days 7] [--out rapport.md] [--html]
 *   pnpm exec tsx scripts/weekly-report.mts --help
 */
import { writeFile } from "node:fs/promises";
import { closePools, ingestQuery } from "../apps/api/src/db.js";
import {
	renderHtml,
	renderMarkdown,
	type ReportData,
	type SourceMueRow,
} from "../apps/api/src/analyse/rapport-hebdo.js";

interface Options {
	days: number;
	out: string | null;
	html: boolean;
	help: boolean;
}

const TLP_FILTER = "e.tlp IS DISTINCT FROM 'TLP:RED' AND e.tlp IS DISTINCT FROM 'RED'";

const USAGE = `Rapport hebdomadaire du radar.

Usage :
  tsx scripts/weekly-report.mts [options]

Options :
  --days N       Fenêtre en jours (défaut : 7)
  --out FILE     Écrit le rapport dans FILE au lieu de stdout
  --html         Rend le rapport en HTML autonome et imprimable
  --help         Affiche cette aide`;

function parseArgs(argv: readonly string[]): Options {
	const options: Options = { days: 7, out: null, html: false, help: false };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			options.help = true;
		} else if (arg === "--html") {
			options.html = true;
		} else if (arg === "--days") {
			const raw = argv[++i];
			const days = raw === undefined ? Number.NaN : Number(raw);
			if (!Number.isInteger(days) || days < 1) {
				throw new Error(`--days attend un entier positif (reçu : ${raw ?? "rien"})`);
			}
			options.days = days;
		} else if (arg === "--out") {
			const raw = argv[++i];
			if (raw === undefined || raw.length === 0) throw new Error("--out attend un chemin de fichier");
			options.out = raw;
		} else {
			throw new Error(`argument inconnu : ${arg}`);
		}
	}
	return options;
}

async function loadReport(days: number): Promise<ReportData> {
	const until = new Date();
	const since = new Date(until.getTime() - days * 86_400_000);

	const statsQuery = `
		SELECT count(*)::int AS events,
		       count(*) FILTER (WHERE e.severity >= 4)::int AS high,
		       count(DISTINCT e.org_id)::int AS orgs
		FROM event e
		WHERE coalesce(e.observed_at, e.collected_at) >= $1 AND ${TLP_FILTER}`;
	const orgsTotalQuery = "SELECT count(*)::int AS total FROM org";
	const alertsQuery = `
		SELECT count(*)::int AS alerts,
		       count(*) FILTER (WHERE a.status = 'open')::int AS open
		FROM alert a
		WHERE a.created_at >= $1
		  AND NOT EXISTS (
		    SELECT 1 FROM event e
		    WHERE e.id = a.event_id AND (e.tlp = 'TLP:RED' OR e.tlp = 'RED')
		  )`;
	const familiesQuery = `
		SELECT e.family, count(*)::int AS events, max(e.severity)::int AS max_severity
		FROM event e
		WHERE coalesce(e.observed_at, e.collected_at) >= $1 AND ${TLP_FILTER}
		GROUP BY e.family
		ORDER BY events DESC
		LIMIT 20`;
	const deptsQuery = `
		SELECT coalesce(o.dept, 'Non renseigné') AS dept,
		       count(*)::int AS events,
		       count(DISTINCT e.org_id)::int AS orgs
		FROM event e
		JOIN org o ON o.id = e.org_id
		WHERE coalesce(e.observed_at, e.collected_at) >= $1 AND ${TLP_FILTER}
		GROUP BY 1
		ORDER BY events DESC
		LIMIT 10`;
	const eventsQuery = `
		SELECT e.title, e.family, e.severity, coalesce(o.name, '—') AS org,
		       e.source_url, coalesce(e.observed_at, e.collected_at) AS at
		FROM event e
		JOIN org o ON o.id = e.org_id
		WHERE coalesce(e.observed_at, e.collected_at) >= $1 AND ${TLP_FILTER}
		ORDER BY e.severity DESC, at DESC
		LIMIT 10`;
	const sourcesMuettesQuery = `
		SELECT s.id, s.name, s.family, s.last_ok_at AS last_ok, s.last_error,
		       CASE
		         WHEN c.last_collect IS NULL OR c.last_collect < now() - interval '7 days' THEN 'dormante'
		         ELSE 'muette'
		       END AS categorie,
		       (s.id LIKE 'gn-%' OR s.id IN ('presse-sudouest','presse-sudouest-rss','presse-sudouest-gironde',
		         'presse-sudouest-pyrenees','presse-sudouest-charente','presse-sudouest-charente-maritime',
		         'presse-sudouest-dordogne','presse-sudouest-landes','presse-sudouest-lot-et-garonne',
		         'presse-sudouest-deux-sevres','presse-lnr-vienne','presse-lnr-deuxsevres','presse-charentelibre',
		         'presse-france3-na','presse-mediacites','presse-rue89bordeaux','presse-ouestfrance-rss',
		         'eco-jde-na','univ-limoges','univ-larochelle','chu-poitiers',
		         'gn-press-lamontagne','gn-press-lepopulaire')) AS na
		FROM source s
		LEFT JOIN (SELECT source_id, max(started_at) AS last_collect FROM collector_run GROUP BY source_id) c
		  ON c.source_id = s.id
		LEFT JOIN (SELECT source_id, count(*) AS events_30d FROM event
		            WHERE collected_at >= now() - interval '30 days' GROUP BY source_id) e
		  ON e.source_id = s.id
		-- Un flux d'indicateurs (FireHOL, reputation…) ne produit pas d'event :
		-- il n'est « muette » que s'il n'a rien vu non plus côté indicator.
		WHERE s.enabled = true
		  AND (
		    c.last_collect IS NULL OR c.last_collect < now() - interval '7 days'
		    OR (coalesce(e.events_30d, 0) = 0
		        AND NOT EXISTS (
		          SELECT 1 FROM indicator i
		           WHERE i.source_id = s.id AND i.last_seen >= now() - interval '30 days'
		        ))
		  )
		ORDER BY na DESC, categorie, s.last_ok_at NULLS FIRST, s.id
		LIMIT 40`;
	const quarantineQuery = `
		SELECT q.status, count(*)::int AS n
		FROM quarantine_raw q
		WHERE q.received_at >= $1
		GROUP BY q.status
		ORDER BY n DESC`;

	const [statsRes, orgsTotalRes, alertsRes, familiesRes, deptsRes, eventsRes, quarantineRes, sourcesMuettesRes] = await Promise.all([
		ingestQuery<{ events: number; high: number; orgs: number }>(statsQuery, [since]),
		ingestQuery<{ total: number }>(orgsTotalQuery),
		ingestQuery<{ alerts: number; open: number }>(alertsQuery, [since]),
		ingestQuery<{ family: string; events: number; max_severity: number }>(familiesQuery, [since]),
		ingestQuery<{ dept: string; events: number; orgs: number }>(deptsQuery, [since]),
		ingestQuery<{ title: string; family: string; severity: number; org: string; source_url: string | null; at: Date }>(
			eventsQuery,
			[since],
		),
		ingestQuery<{ status: string; n: number }>(quarantineQuery, [since]),
		ingestQuery<SourceMueRow>(sourcesMuettesQuery),
	]);

	const statsRow = statsRes.rows[0];
	const alertsRow = alertsRes.rows[0];
	return {
		since,
		until,
		days,
		stats: {
			events: statsRow?.events ?? 0,
			high: statsRow?.high ?? 0,
			orgsCovered: statsRow?.orgs ?? 0,
			orgsTotal: orgsTotalRes.rows[0]?.total ?? 0,
			alerts: alertsRow?.alerts ?? 0,
			alertsOpen: alertsRow?.open ?? 0,
		},
		families: familiesRes.rows.map((row) => ({
			family: row.family,
			events: row.events,
			maxSeverity: row.max_severity,
		})),
		depts: deptsRes.rows.map((row) => ({ dept: row.dept, events: row.events, orgs: row.orgs })),
		events: eventsRes.rows.map((row) => ({
			title: row.title,
			family: row.family,
			severity: row.severity,
			org: row.org,
			sourceUrl: row.source_url,
			at: row.at,
		})),
		quarantine: quarantineRes.rows.map((row) => ({ status: row.status, n: row.n })),
		sourcesMuettes: sourcesMuettesRes.rows.map((row) => ({
			id: row.id,
			name: row.name,
			family: row.family,
			categorie: row.categorie,
			na: Boolean(row.na),
			lastOk: row.last_ok,
			lastError: row.last_error,
		})),
	};
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(USAGE);
		return;
	}
	const data = await loadReport(options.days);
	const output = options.html ? renderHtml(data) : renderMarkdown(data);
	if (options.out) {
		await writeFile(options.out, `${output}\n`, "utf8");
		console.error(`rapport écrit : ${options.out} (${options.html ? "html" : "markdown"})`);
	} else {
		process.stdout.write(`${output}\n`);
	}
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
} finally {
	await closePools();
}
