/**
 * Rendu du rapport hebdomadaire (Markdown et HTML autonome).
 *
 * Le chargement des données reste dans `scripts/weekly-report.mts` : ce module
 * est pur et peut être utilisé par la suite golden sans accéder à la base.
 */
export interface Stats {
	events: number;
	high: number;
	orgsCovered: number;
	orgsTotal: number;
	alerts: number;
	alertsOpen: number;
}

export interface FamilyRow {
	family: string;
	events: number;
	maxSeverity: number;
}

export interface DeptRow {
	dept: string;
	events: number;
	orgs: number;
}

/** Source active muette (0 événement en 30 j) ou dormante (aucune collecte réussie en 7 j). */
export interface SourceMueRow {
	id: string;
	name: string;
	family: string;
	categorie: string;
	na: boolean;
	last_ok: Date | null;
	last_error: string | null;
}

export interface EventRow {
	title: string;
	family: string;
	severity: number;
	org: string;
	sourceUrl: string | null;
	at: Date;
}

export interface QuarantineRow {
	status: string;
	n: number;
}

export interface ReportData {
	since: Date;
	until: Date;
	days: number;
	stats: Stats;
	families: FamilyRow[];
	depts: DeptRow[];
	events: EventRow[];
	quarantine: QuarantineRow[];
	sourcesMuettes: {
		id: string;
		name: string;
		family: string;
		categorie: string;
		na: boolean;
		lastOk: Date | null;
		lastError: string | null;
	}[];
}

const SEVERITY_LABELS: Record<number, string> = {
	1: "info",
	2: "faible",
	3: "moyen",
	4: "élevé",
	5: "critique",
};

export function isoDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function severityLabel(severity: number): string {
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

export function renderMarkdown(data: ReportData): string {
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

	// Une source muette depuis 7 jours ne doit pas disparaître du poste : elle
	// réapparaît ici, nommée, avec son dernier état. Une source éteinte à dessein
	// porte un motif dans la base et n'est plus `enabled` — elle ne figure pas.
	if (data.sourcesMuettes.length > 0) {
		lines.push("## Sources actives muettes ou dormantes (7 j)");
		lines.push("");
		lines.push("| Source | Famille | Catégorie | Périmètre | Dernière collecte OK | Erreur |");
		lines.push("| --- | --- | --- | --- | --- | --- |");
		for (const row of data.sourcesMuettes) {
			lines.push(
				`| ${mdCell(row.name)} \`${mdCell(row.id)}\` | ${mdCell(row.family)} | ${row.categorie} | ${row.na ? "Nouvelle-Aquitaine" : "national/international"} | ${row.lastOk ? isoDay(row.lastOk) : "jamais"} | ${row.lastError ? mdCell(row.lastError.slice(0, 120)) : "—"} |`,
			);
		}
		lines.push("");
	} else {
		lines.push("## Sources actives muettes ou dormantes (7 j)");
		lines.push("");
		lines.push("Aucune source active muette ou dormante depuis 7 jours.");
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

export function renderHtml(data: ReportData): string {
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
	const sourcesMuettesBlock =
		data.sourcesMuettes.length === 0
			? `<h2>Sources actives muettes ou dormantes (7 j)</h2>
<p>Aucune source active muette ou dormante depuis 7 jours.</p>`
			: `<h2>Sources actives muettes ou dormantes (7 j)</h2>
<table>
<thead><tr><th>Source</th><th>Famille</th><th>Catégorie</th><th>Périmètre</th><th>Dernière collecte OK</th><th>Erreur</th></tr></thead>
<tbody>
${data.sourcesMuettes
	.map(
		(row) =>
			`<tr><td>${esc(row.name)} <code>${esc(row.id)}</code></td><td>${esc(row.family)}</td><td>${esc(row.categorie)}</td><td>${row.na ? "Nouvelle-Aquitaine" : "national/international"}</td><td>${row.lastOk ? isoDay(row.lastOk) : "jamais"}</td><td>${esc(row.lastError ? row.lastError.slice(0, 120) : "—")}</td></tr>`,
	)
	.join("\n")}
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
${sourcesMuettesBlock}
<p class="footer">${data.stats.orgsCovered} organisations couvertes sur ${data.stats.orgsTotal}.</p>
</body>
</html>`;
}
