/**
 * Collect one bounded TLS observation snapshot for the versioned CT baseline.
 *
 * Network access is confined to this script. The detector and the measurement
 * replay only the committed snapshot, so the published figures are stable.
 * The whole run stops after a bounded probe deadline plus in-flight timeouts.
 *
 *   apps/api/node_modules/.bin/tsx scripts/refresh-tls-monitor-snapshot.mts \
 *     --baseline=../bench/results/ctlogs-inventaire-2026-11-21.json \
 *     --out=../bench/results/tls-monitor-snapshot-2026-11-22.json
 */
import { createHash } from "node:crypto";
import dns from "node:dns";
import { readFileSync, writeFileSync } from "node:fs";
import tls from "node:tls";
import {
	baselineFromInventory,
	hostnameMatches,
	type BaselineCertificate,
	type CurrentCertificate,
	type CtInventoryRow,
} from "../apps/api/src/tlsMonitor/detection.js";
dns.setDefaultResultOrder("ipv4first");

const argv = process.argv.slice(2);
const option = (name: string, fallback: string): string =>
	argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;

const baselinePath = option("baseline", "../bench/results/ctlogs-inventaire-2026-11-21.json");
const day = new Date().toISOString().slice(0, 10);
const outPath = option("out", `../bench/results/tls-monitor-snapshot-${day}.json`);
const timeoutMs = Number(option("timeout", "4000"));
const concurrency = Number(option("concurrency", "4"));
const deadlineMs = Number(option("deadline", "30000"));
const maxHosts = Number(option("hosts", "30"));
if (![timeoutMs, concurrency, deadlineMs, maxHosts].every(Number.isFinite)) {
	throw new RangeError("Invalid probe budget");
}

const baselineBuffer = readFileSync(new URL(baselinePath, import.meta.url));
const inventory = JSON.parse(baselineBuffer.toString("utf8")) as { sous_domaines: CtInventoryRow[] };
const priority = (entry: BaselineCertificate): number =>
	(entry.host.startsWith("www.") ? 0 : 1) + entry.host.split(".")[0]!.length / 100;
const baseline: BaselineCertificate[] = baselineFromInventory(inventory.sous_domaines)
	.filter((entry) => entry.issuer !== null)
	.sort((a, b) => priority(a) - priority(b) || a.host.localeCompare(b.host))
	.slice(0, maxHosts);

function isoDate(value: string | undefined): string | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function probe(entry: BaselineCertificate, observedAt: string): Promise<CurrentCertificate> {
	return new Promise((resolve) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const failed = (error: string): CurrentCertificate => ({ host: entry.host, observedAt, ok: false, error });
		const finish = (observation: CurrentCertificate): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.destroy();
			resolve(observation);
		};
		const socket = tls.connect(
			{ host: entry.host, port: 443, servername: entry.host, rejectUnauthorized: false, timeout: timeoutMs },
			() => {
				const certificate = socket.getPeerCertificate();
				const subjectAltName = certificate.subjectaltname ?? null;
				const commonName = certificate.subject?.CN ?? null;
				finish({
					host: entry.host,
					observedAt,
					ok: true,
					issuerOrganization: certificate.issuer?.O ?? null,
					issuerCommonName: certificate.issuer?.CN ?? null,
					subjectCommonName: commonName,
					subjectAltName,
					validFrom: isoDate(certificate.valid_from),
					validTo: isoDate(certificate.valid_to),
					fingerprint: certificate.fingerprint ?? null,
					serialNumber: certificate.serialNumber ?? null,
					authorized: socket.authorized,
					selfSigned: certificate.subject === certificate.issuer,
					hostnameMatch: hostnameMatches(entry.host, subjectAltName, commonName),
				});
			},
		);
		timer = setTimeout(() => finish(failed("timeout")), timeoutMs);
		socket.on("timeout", () => finish(failed("timeout")));
		socket.on("error", (error) =>
			finish(failed((error as NodeJS.ErrnoException).code ?? "error")),
		);
	});
}

const started = Date.now();
const observations: CurrentCertificate[] = [];
for (let index = 0; index < baseline.length; index += concurrency) {
	if (Date.now() - started > deadlineMs) break;
	const batch = baseline.slice(index, index + concurrency);
	const batchTime = new Date().toISOString();
	observations.push(...(await Promise.all(batch.map((entry) => probe(entry, batchTime)))));
}
observations.sort((a, b) => a.host.localeCompare(b.host));

const snapshot = {
	generatedAt: new Date().toISOString(),
	baselineFile: baselinePath,
	baselineSha256: createHash("sha256").update(baselineBuffer).digest("hex"),
	hostsTargeted: baseline.length,
	hostsObserved: observations.filter((observation) => observation.ok).length,
	durationMs: Date.now() - started,
	observations,
};
writeFileSync(new URL(outPath, import.meta.url), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
	targeted: snapshot.hostsTargeted,
	observed: snapshot.hostsObserved,
	failed: snapshot.hostsTargeted - snapshot.hostsObserved,
	durationMs: snapshot.durationMs,
	out: outPath,
}, null, 2));
process.exit(0);
