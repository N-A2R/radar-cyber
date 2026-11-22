/**
 * Measures expired, weak and misconfigured TLS certificates on the 1 000 main
 * public Nouvelle-Aquitaine sites.
 *
 * The corpus is the versioned active-source list produced by the previous
 * tranche. One TLS handshake covers every URL sharing a host. The command
 * writes a machine-readable result and a French report; the scan keeps a hard
 * 55-second budget so the whole command stays below one minute.
 *
 * Usage:
 *   pnpm mesure:tls
 *   apps/api/node_modules/.bin/tsx scripts/mesure-tls-na.mts
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadCorpusSites } from "../apps/api/src/tlsAudit/corpus.js";
import {
	buildTargets,
	classifyObservation,
	hostFromUrl,
	isDefectiveStatus,
	summarizeFindings,
	tlsPortFromUrl,
	type CertificateObservation,
	type CorpusSite,
	type Finding,
	type Summary,
} from "../apps/api/src/tlsAudit/index.js";
import { scanTargets, type ScanOptions } from "../apps/api/src/tlsAudit/scan.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const CORPUS = resolve(ROOT, "bench/corpus/sources-na-1000.jsonl");
export const JSON_OUTPUT = resolve(ROOT, "bench/results/tls-na-1000.json");
export const REPORT = resolve(ROOT, "docs/rapport-tls-na.md");

export interface DepartmentSummary {
	sites: number;
	defective: number;
}

export interface AuditReport {
	generatedAt: string;
	durationMs: number;
	corpus: string;
	corpusSha256: string;
	sites: number;
	hosts: number;
	defectiveSites: number;
	defectiveHosts: number;
	byStatus: Summary["byStatus"];
	byReason: Summary["byReason"];
	byDepartment: Record<string, DepartmentSummary>;
	findings: Finding[];
}

export interface AuditOptions extends ScanOptions {
	sites?: CorpusSite[];
	corpusPath?: string;
}

function missingObservation(target: { host: string; port: number }, scannedAt: string): CertificateObservation {
	return { host: target.host, port: target.port, scannedAt, ok: false, error: "NO_OBSERVATION" };
}

function hash(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function number(value: number): string {
	return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function percentage(value: number, total: number): string {
	return total === 0 ? "—" : `${((100 * value) / total).toFixed(1).replace(".", ",")} %`;
}

/** Runs the full audit; `probe` and `sites` are injectable for offline tests. */
export async function measureTlsAudit(options: AuditOptions = {}): Promise<AuditReport> {
	const corpusPath = options.corpusPath ?? CORPUS;
	const corpusText = options.sites ? "" : await readFile(corpusPath, "utf8");
	const sites = options.sites ?? await loadCorpusSites(corpusPath);
	const measuredAt = (options.now ?? (() => new Date()))();
	const started = Date.now();
	const targets = buildTargets(sites);
	const observations = await scanTargets(targets, options);
	const findings = targets.map((target, index) =>
		classifyObservation(observations[index] ?? missingObservation(target, measuredAt.toISOString()), target, measuredAt),
	);
	const summary = summarizeFindings(findings);

	const findingByHostPort = new Map<string, Finding>();
	targets.forEach((target, index) => {
		const finding = findings[index];
		if (finding) findingByHostPort.set(`${target.host}:${target.port}`, finding);
	});
	const byDepartment: Record<string, DepartmentSummary> = {};
	for (const site of sites) {
		const host = hostFromUrl(site.url);
		const port = tlsPortFromUrl(site.url);
		const department = site.departement ?? "non renseigné";
		const finding = host && port !== null ? findingByHostPort.get(`${host}:${port}`) : undefined;
		const entry = byDepartment[department] ?? { sites: 0, defective: 0 };
		entry.sites += 1;
		if (finding && isDefectiveStatus(finding.status)) entry.defective += 1;
		byDepartment[department] = entry;
	}

	return {
		generatedAt: measuredAt.toISOString(),
		durationMs: Date.now() - started,
		corpus: relative(ROOT, corpusPath),
		corpusSha256: hash(corpusText),
		sites: summary.sites,
		hosts: summary.hosts,
		defectiveSites: summary.defectiveSites,
		defectiveHosts: summary.defectiveHosts,
		byStatus: summary.byStatus,
		byReason: summary.byReason,
		byDepartment,
		findings,
	};
}

const STATUS_LABELS: Record<Finding["status"], string> = {
	expired: "Expiré",
	misconfigured: "Mal configuré",
	weak: "Faible",
	clean: "Valide",
	no_tls: "Pas de TLS",
	unknown: "Inconnu",
};

const REASON_LABELS: Record<string, string> = {
	certificate_expired: "Certificat expiré",
	certificate_not_yet_valid: "Certificat pas encore valide",
	hostname_mismatch: "Nom d'hôte hors certificat",
	self_signed_certificate: "Certificat auto-signé",
	untrusted_chain: "Chaîne non reconnue",
	incomplete_chain: "Chaîne incomplète",
	weak_signature: "Signature MD5/SHA-1",
	small_ec_curve: "Courbe EC < 256 bits",
	small_key: "Clé RSA/DSA < 2048 bits",
	deprecated_tls_version: "TLS 1.0/1.1",
	tls_handshake_failed: "Échec TLS sur un site HTTPS",
	no_tls_service: "Pas de service TLS",
	endpoint_unreachable: "Endpoint injoignable",
};

function tableRows(entries: [string, number][], labels: Record<string, string>): string[] {
	return [
		"| Motif | Sites |",
		"| --- | ---: |",
		...(entries.length === 0
			? ["| — | 0 |"]
			: entries.map(([key, count]) => `| ${labels[key] ?? key} | ${count} |`)),
	];
}

export function renderMarkdown(report: AuditReport): string {
	const statusRows = (Object.entries(report.byStatus) as [Finding["status"], number][]).map(
		([status, count]) => `| ${STATUS_LABELS[status]} | ${count} |`,
	);
	const reasons = Object.entries(report.byReason)
		.filter(([, count]) => count > 0)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	const departments = Object.entries(report.byDepartment).sort((a, b) => a[0].localeCompare(b[0]));
	const defective = report.findings
		.filter((finding) => isDefectiveStatus(finding.status))
		.sort((a, b) => b.entries - a.entries || a.host.localeCompare(b.host))
		.slice(0, 20);

	return `# Certificats TLS des sites publics de Nouvelle-Aquitaine

**Mesure du ${report.generatedAt}.** Corpus : \`${report.corpus}\`
(empreinte SHA-256 \`${report.corpusSha256}\`).

## Résultat mesuré

Sur **${number(report.sites)} sites** du corpus et **${number(report.hosts)} hôtes distincts**, **${report.defectiveSites} sites**
(${percentage(report.defectiveSites, report.sites)}) présentent un certificat **expiré, faible ou mal configuré**.
Ces sites occupent **${report.defectiveHosts} hôtes** distincts.

Commande reproductible, depuis la racine du dépôt :

\`\`\`sh
pnpm mesure:tls
\`\`\`

Durée de la mesure : ${(report.durationMs / 1000).toFixed(1).replace(".", ",")} s.

## Répartition par état

| État | Sites |
| --- | ---: |
${statusRows.join("\n")}

Les états \`Pas de TLS\` et \`Inconnu\` ne sont pas comptés comme défauts de certificat :
les sites uniquement HTTP n'ont pas de certificat à auditer, et un endpoint
injoignable après une nouvelle tentative est une mesure manquante, pas une preuve
de mauvaise configuration.

## Motifs observés

${tableRows(reasons, REASON_LABELS).join("\n")}

Un site peut cumuler plusieurs motifs ; le statut retient le plus grave
(expiré, puis mal configuré, puis faible).

## Répartition par département

| Département | Sites | Défaut |
| --- | ---: | ---: |
${departments.map(([department, entry]) => `| ${department} | ${entry.sites} | ${entry.defective} |`).join("\n")}

## Sites les plus représentés parmi les défauts

| Hôte | Sites | État | Motifs |
| --- | ---: | --- | --- |
${defective.map((finding) => `| ${finding.host} | ${finding.entries} | ${STATUS_LABELS[finding.status]} | ${finding.reasons.join(", ")} |`).join("\n")}

## Méthode

1. Le corpus versionné \`bench/corpus/sources-na-1000.jsonl\` est lu sans appel
   réseau : 1 000 sources actives, déjà vérifiées en HTTP 200, toutes en
   Nouvelle-Aquitaine.
2. Les URL sont regroupées par hôte : un handshake TLS couvre toutes les pages
   d'un même hôte. Les URL HTTP sont tout de même testées sur le port 443 pour
   voir si un service TLS existe.
3. Chaque hôte reçoit un handshake TLS avec \`rejectUnauthorized: false\`, ce qui
   permet de lire le certificat même expiré, auto-signé ou hors nom.
4. Les règles pures classent le certificat : expiration, nom d'hôte, chaîne,
   auto-signature, signature MD5/SHA-1, taille de clé, version TLS.
5. Une nouvelle tentative est faite sur les erreurs transitoires (DNS, timeout,
   connexion refusée) ; un endpoint toujours injoignable reste \`Inconnu\`.
6. Le scan est borné à 64 connexions simultanées et à un budget global de 55 s,
   pour que la commande reste sous la limite d'une minute.

## Limites

- Mesure ponctuelle : un certificat peut expirer ou être renouvelé après la
  mesure. La date et l'empreinte du corpus sont écrites pour rejouer la mesure.
- Les sites derrière un même certificat wildcard partagent le verdict : le
  défaut est compté pour chaque source du corpus, pas une fois par certificat.
- Aucune donnée personnelle de victime n'est lue ni écrite : le corpus ne
  contient que des sites publics et leurs preuves HTTP.
`;
}

export async function writeOutputs(report: AuditReport): Promise<void> {
	await mkdir(dirname(JSON_OUTPUT), { recursive: true });
	await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, "\t")}\n`, "utf8");
	await mkdir(dirname(REPORT), { recursive: true });
	await writeFile(REPORT, renderMarkdown(report), "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const report = await measureTlsAudit();
	await writeOutputs(report);
	console.log(`sites=${report.sites}`);
	console.log(`hosts=${report.hosts}`);
	console.log(`defective_sites=${report.defectiveSites}`);
	console.log(`defective_hosts=${report.defectiveHosts}`);
	console.log(`expired=${report.byStatus.expired}`);
	console.log(`weak=${report.byStatus.weak}`);
	console.log(`misconfigured=${report.byStatus.misconfigured}`);
	console.log(`no_tls=${report.byStatus.no_tls}`);
	console.log(`unknown=${report.byStatus.unknown}`);
	console.log(`duration_ms=${report.durationMs}`);
	console.log(`report=${relative(ROOT, REPORT)}`);
}
