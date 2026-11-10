/**
 * Rapport hebdomadaire agrégé du radar.
 *
 * Lecture seule. Toutes les requêtes sont bornées ($1 = date de début) et
 * excluent les événements TLP:RED (stockés `RED` en base) et TLP:RED externe.
 *
 * Usage :
 *   pnpm exec tsx scripts/weekly-report.mts [--days 7] [--out rapport.md] [--html]
 *   pnpm exec tsx scripts/weekly-report.mts --help
 */
import { writeFile } from "node:fs/promises";
import { closePools, ingestQuery } from "../apps/api/src/db.js";

interface Options {
	days: number;
	out: string | null;
	html: boolean;
	help: boolean;
}

interface Stats {
	events: number;
	high: number;
	orgsCovered: number;
	orgsTotal: number;
	alerts: number;
	alertsOpen: number;
}

interface FamilyRow {
	family: string;
	events: number;
	maxSeverity: number;
}

interface DeptRow {
	dept: string;
	events: number;
	orgs: number;
}

interface EventRow {
	title: string;
	family: string;
	severity: number;
	org: string;
	sourceUrl: string | null;
	at: Date;
}

interface QuarantineRow {
	status: string;
	n: number;
}

interface ReportData {
	since: Date;
	until: Date;
	days: number;
	stats: Stats;
	families: FamilyRow[];
	depts: DeptRow[];
	events: EventRow[];
	quarantine: QuarantineRow[];
}

const TLP_FILTER = "e.tlp IS DISTINCT FROM 'TLP:RED' AND e.tlp IS DISTINCT FROM 'RED'";
const SEVERITY_LABELS: Record<number, string> = {
	1: "info",
	2: "faible",
	3: "moyen",
	4: "élevé",
	5: "critique",
};

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

function isoDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function severityLabel(severity: number): string {
	return `${severity} · ${SEVERITY_LABELS[severity] ?? "inconnu"}`;
}

function mdCell(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function htmlEscape(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
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
	const quarantineQuery = `
		SELECT q.status, count(*)::int AS n
		FROM quarantine_raw q
		WHERE q.received_at >= $1
		GROUP BY q.status
		ORDER BY n DESC`;

	const [statsRes, orgsTotalRes, alertsRes, familiesRes, deptsRes, eventsRes, quarantineRes] = await Promise.all([
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
	};
}

function summaryLines(data: ReportData): string[] {
	const { stats } = data;
	const topFamily = data.families[0];
	const lines = [
		`${stats.events} événement(s) sur ${data.days} jour(s), dont ${stats.high} de sévérité élevée ou critique.`,
		`${stats.alerts} alerte(s) créée(s), ${stats.alertsOpen} encore ouverte(s).`,
		topFamily
			? `Famille dominante : ${topFamily.family} (${topFamily.events} événement(s)).`
			: "Aucune famille d'événement sur la période.",
		data.depts[0]
			? `Département le plus touché : ${data.depts[0].dept} (${data.depts[0].events} événement(s)).`
			: "Aucun département identifiable sur la période.",
		`${stats.orgsCovered} organisation(s) couverte(s) sur ${stats.orgsTotal}.`,
	];
	return lines.slice(0, 5);
}

function renderMarkdown(data: ReportData): string {
	const lines: string[] = [];
	lines.push(`# Rapport hebdomadaire — ${isoDay(data.until)}`);
	lines.push("");
	lines.push(`Période : ${isoDay(data.since)} → ${isoDay(data.until)} (${data.days} jours).`);
	lines.push("");
	lines.push("## Synthèse");
	lines.push("");
	for (const line of summaryLines(data)) lines.push(`- ${line}`);
	lines.push("");

	lines.push("## Événements par famille");
	lines.push("");
	lines.push("| Famille | Événements | Sévérité max |");
	lines.push("| --- | ---: | --- |");
	if (data.families.length === 0) lines.push("| — | 0 | — |");
	for (const row of data.families) {
		lines.push(`| ${mdCell(row.family)} | ${row.events} | ${severityLabel(row.maxSeverity)} |`);
	}
	lines.push("");

	lines.push("## Top 10 départements");
	lines.push("");
	lines.push("| Département | Événements | Organisations |");
	lines.push("| --- | ---: | ---: |");
	if (data.depts.length === 0) lines.push("| — | 0 | 0 |");
	for (const row of data.depts) {
		lines.push(`| ${mdCell(row.dept)} | ${row.events} | ${row.orgs} |`);
	}
	lines.push("");

	lines.push("## 10 événements marquants");
	lines.push("");
	lines.push("| Date | Sévérité | Famille | Organisation | Titre |");
	lines.push("| --- | --- | --- | --- | --- |");
	if (data.events.length === 0) {
		lines.push("| — | — | — | — | *Aucun incident rattaché à une organisation régionale cette semaine* |");
	}
	for (const row of data.events) {
		const title = row.sourceUrl ? `[${mdCell(row.title)}](${row.sourceUrl})` : mdCell(row.title);
		lines.push(
			`| ${isoDay(row.at)} | ${severityLabel(row.severity)} | ${mdCell(row.family)} | ${mdCell(row.org)} | ${title} |`,
		);
	}
	lines.push("");

	if (data.quarantine.length > 0) {
		lines.push("## Quarantaine");
		lines.push("");
		lines.push("| Statut | Volume |");
		lines.push("| --- | ---: |");
		for (const row of data.quarantine) lines.push(`| ${mdCell(row.status)} | ${row.n} |`);
		lines.push("");
	}

	lines.push(`_${data.stats.orgsCovered} organisations couvertes sur ${data.stats.orgsTotal}._`);
	return lines.join("\n");
}

const PRINT_CSS = `
	:root { color-scheme: light; }
	body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; color: #111; background: #fff; line-height: 1.5; }
	h1 { font-size: 1.6rem; border-bottom: 2px solid #111; padding-bottom: .4rem; }
	h2 { font-size: 1.15rem; margin-top: 1.8rem; border-bottom: 1px solid #999; padding-bottom: .2rem; }
	table { border-collapse: collapse; width: 100%; margin: .6rem 0 1rem; font-size: .875rem; }
	th, td { border: 1px solid #999; padding: .35rem .5rem; text-align: left; vertical-align: top; }
	th { background: #eee; font-weight: 600; }
	td.num, th.num { text-align: right; }
	ul { margin: .4rem 0 1rem 1.2rem; padding: 0; }
	.meta, .footer { color: #444; font-size: .85rem; }
	@media print {
		body { margin: 0; max-width: none; padding: 0; color: #000; background: #fff; font-size: 11pt; }
		h1, h2, th, td, .meta, .footer { color: #000; }
		th { background: #fff; border-bottom: 2px solid #000; }
		table { page-break-inside: auto; }
		tr { page-break-inside: avoid; }
		a { color: #000; text-decoration: none; }
	}
`;

function renderHtml(data: ReportData): string {
	const esc = htmlEscape;
	const familyRows =
		data.families.length === 0
			? `<tr><td colspan="3">Aucun événement</td></tr>`
			: data.families
					.map(
						(row) =>
							`<tr><td>${esc(row.family)}</td><td class="num">${row.events}</td><td>${esc(severityLabel(row.maxSeverity))}</td></tr>`,
					)
					.join("\n");
	const deptRows =
		data.depts.length === 0
			? `<tr><td colspan="3">Aucun département</td></tr>`
			: data.depts
					.map(
						(row) =>
							`<tr><td>${esc(row.dept)}</td><td class="num">${row.events}</td><td class="num">${row.orgs}</td></tr>`,
					)
					.join("\n");
	const eventRows =
		data.events.length === 0
			? `<tr><td colspan="5">Aucun événement</td></tr>`
			: data.events
					.map(
						(row) =>
							`<tr><td>${isoDay(row.at)}</td><td>${esc(severityLabel(row.severity))}</td><td>${esc(row.family)}</td><td>${esc(row.org)}</td><td>${esc(row.title)}</td></tr>`,
					)
					.join("\n");
	const quarantineBlock =
		data.quarantine.length === 0
			? ""
			: `<h2>Quarantaine</h2>
<table>
<thead><tr><th>Statut</th><th class="num">Volume</th></tr></thead>
<tbody>
${data.quarantine.map((row) => `<tr><td>${esc(row.status)}</td><td class="num">${row.n}</td></tr>`).join("\n")}
</tbody>
</table>`;
	const summary = summaryLines(data)
		.map((line) => `<li>${esc(line)}</li>`)
		.join("\n");

	return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport hebdomadaire — ${isoDay(data.until)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<h1>Rapport hebdomadaire — ${isoDay(data.until)}</h1>
<p class="meta">Période : ${isoDay(data.since)} → ${isoDay(data.until)} (${data.days} jours).</p>
<h2>Synthèse</h2>
<ul>
${summary}
</ul>
<h2>Événements par famille</h2>
<table>
<thead><tr><th>Famille</th><th class="num">Événements</th><th>Sévérité max</th></tr></thead>
<tbody>
${familyRows}
</tbody>
</table>
<h2>Top 10 départements</h2>
<table>
<thead><tr><th>Département</th><th class="num">Événements</th><th class="num">Organisations</th></tr></thead>
<tbody>
${deptRows}
</tbody>
</table>
<h2>10 événements marquants</h2>
<table>
<thead><tr><th>Date</th><th>Sévérité</th><th>Famille</th><th>Organisation</th><th>Titre</th></tr></thead>
<tbody>
${eventRows}
</tbody>
</table>
${quarantineBlock}
<p class="footer">${data.stats.orgsCovered} organisations couvertes sur ${data.stats.orgsTotal}.</p>
</body>
</html>`;
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
