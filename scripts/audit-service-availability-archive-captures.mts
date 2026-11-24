/**
 * Reproducible grey-source audit of the open Wayback CDX index. It counts the
 * service-days that real archived HTTP captures could still supply for the
 * missing UTC days; it never writes observations or invents a date.
 *
 *   apps/api/node_modules/.bin/tsx scripts/audit-service-availability-archive-captures.mts \
 *     --from=2026-11-18 --to=2026-11-20
 */
import { resolve } from "node:path";
import {
	capturableServiceDays,
	archiveAuditVerdict,
	parseArchiveCaptures,
	type ArchiveCapture,
} from "../apps/api/src/serviceAvailability/archiveProofs.js";
import { readCorpusPerimeter } from "../apps/api/src/serviceAvailability/perimeter.js";

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const from = option("from", "2026-11-18");
const to = option("to", "2026-11-20");
if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
	throw new RangeError("expected --from=YYYY-MM-DD and --to=YYYY-MM-DD with from <= to");
}

const services = readCorpusPerimeter(resolve("bench/corpus/institutions-complet.jsonl"));
const hosts = [...new Set(
	services
		.map((service) => {
			try {
				return new URL(service.url).hostname.toLowerCase().replace(/^www\./, "");
			} catch {
				return "";
			}
		})
		.filter((host) => host.length > 0)
)].sort();
const captures: ArchiveCapture[] = [];
let unavailable = 0;
let next = 0;

async function worker(): Promise<void> {
	while (next < hosts.length) {
		const host = hosts[next++];
		const url = `https://web.archive.org/cdx/search/cdx?url=${host}/*` +
			`&from=${from.replace(/-/g, "")}&to=${to.replace(/-/g, "")}` +
			"&output=json&fl=timestamp,original,statuscode&limit=100";
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(3000),
				headers: { "user-agent": "radar-cyber-availability-audit/1.0" },
			});
			if (!response.ok) {
				unavailable += 1;
				continue;
			}
			const body = await response.text();
			if (!body.trimStart().startsWith("[")) {
				unavailable += 1;
				continue;
			}
			captures.push(...parseArchiveCaptures(JSON.parse(body)));
		} catch {
			unavailable += 1;
		}
	}
}

await Promise.all(Array.from({ length: 16 }, worker));
const keys = capturableServiceDays(captures, services, from, to);
const verdict = archiveAuditVerdict(unavailable, keys.size);
console.log(
	`hosts=${hosts.length} window=${from}..${to} captures=${captures.length} ` +
	`capturable_service_days=${keys.size} cdx_unavailable=${unavailable} verdict=${verdict}`
);
if (keys.size > 0) {
	console.log(`capturable=${[...keys].map((key) => key.replace("\u0000", "@")).join(",")}`);
}
