/**
 * Replays the committed CT baseline and TLS snapshot: no network, no clock in
 * the detector, no database. Prints alert count and false positive rate and
 * writes the full versioned result used by the French report.
 *
 *   pnpm mesure:tls-monitor
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
	baselineFromInventory,
	detectCertificateChanges,
	falsePositiveRate,
	type CtInventoryRow,
	type CurrentCertificate,
	type ReviewVerdict,
} from "../apps/api/src/tlsMonitor/detection.js";

const argv = process.argv.slice(2);
const option = (name: string, fallback: string): string =>
	argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;

const baselinePath = option("baseline", "../bench/results/ctlogs-inventaire-2026-11-21.json");
const snapshotPath = option("snapshot", "../bench/results/tls-monitor-snapshot-2026-11-22.json");
const verdictsPath = option("verdicts", "../bench/results/tls-monitor-verdicts.json");
const outPath = option("out", "../bench/results/tls-monitor-na-2026-11-22.json");

const baselineBuffer = readFileSync(new URL(baselinePath, import.meta.url));
const baselineHash = createHash("sha256").update(baselineBuffer).digest("hex");
const inventory = JSON.parse(baselineBuffer.toString("utf8")) as { sous_domaines: CtInventoryRow[] };
const snapshot = JSON.parse(readFileSync(new URL(snapshotPath, import.meta.url), "utf8")) as {
	generatedAt: string;
	baselineSha256: string;
	hostsTargeted: number;
	hostsObserved: number;
	durationMs: number;
	observations: CurrentCertificate[];
};
if (snapshot.baselineSha256 !== baselineHash) {
	throw new Error("TLS snapshot does not match the committed CT baseline");
}
const verdicts = JSON.parse(readFileSync(new URL(verdictsPath, import.meta.url), "utf8")) as Record<
	string,
	{ verdict: ReviewVerdict; reason: string }
>;

const baseline = baselineFromInventory(inventory.sous_domaines);
const alerts = detectCertificateChanges(baseline, snapshot.observations);
const reviewed = alerts.map((alert) => verdicts[alert.key]?.verdict ?? "unclassified");
const classified = reviewed.filter((verdict) => verdict !== "unclassified").length;
const dates = baseline.map((entry) => Date.parse(entry.firstSeen)).filter(Number.isFinite);

const report = {
	generatedAt: snapshot.generatedAt,
	command: "pnpm mesure:tls-monitor",
	sources: {
		baseline: baselinePath,
		baselineSha256: baselineHash,
		snapshot: snapshotPath,
		verdicts: verdictsPath,
	},
	base: {
		ctHosts: baseline.length,
		domains: new Set(baseline.map((entry) => entry.domain)).size,
		organizations: new Set(baseline.map((entry) => entry.organization)).size,
		firstCertificateSeen: new Date(Math.min(...dates)).toISOString().slice(0, 10),
		lastCertificateSeen: new Date(Math.max(...dates)).toISOString().slice(0, 10),
		hostsTargeted: snapshot.hostsTargeted,
		hostsObserved: snapshot.hostsObserved,
		probeDurationMs: snapshot.durationMs,
	},
	rules: {
		issuerChange: alerts.filter((alert) => alert.rules.includes("issuer_change")).length,
		newCaForDomain: alerts.filter((alert) => alert.rules.includes("new_ca_for_domain")).length,
		identityMismatch: alerts.filter((alert) => alert.rules.includes("identity_mismatch")).length,
	},
	totalAlerts: alerts.length,
	review: {
		classified,
		truePositives: reviewed.filter((verdict) => verdict === "true").length,
		falsePositives: reviewed.filter((verdict) => verdict === "false").length,
		unclassified: reviewed.length - classified,
		falsePositiveRate: falsePositiveRate(reviewed),
	},
	alerts: alerts.map((alert) => ({ ...alert, verdict: verdicts[alert.key] ?? null })),
};
writeFileSync(new URL(outPath, import.meta.url), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
	base: report.base,
	rules: report.rules,
	totalAlerts: report.totalAlerts,
	review: report.review,
	result: outPath,
}, null, 2));
