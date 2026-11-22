/**
 * Lightweight Nouvelle-Aquitaine honeypot: pure capture rules and aggregates.
 *
 * The sensor only answers reserved `.nouvelle-aquitaine.invalid` decoy hosts.
 * It never reads request bodies, never stores a raw address, and never uses an
 * organisation or victim record from the corpus as a target.
 */
import { createHmac } from "node:crypto";

export const NA_DECOY_HOST_SUFFIX = ".nouvelle-aquitaine.invalid";
export const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

/** Routes a scanner actually probes; anything else is ordinary traffic. */
export const DECOY_PROBES = [
	"/.env",
	"/.git/config",
	"/actuator/env",
	"/phpmyadmin/",
	"/wp-login.php",
	"/xmlrpc.php",
] as const;
export type DecoyProbe = (typeof DECOY_PROBES)[number];

export const NETWORK_LABELS = ["tor-exit", "abuse-reported", "unknown"] as const;
export type NetworkLabel = (typeof NETWORK_LABELS)[number];
export type KnownNetworkLabel = Exclude<NetworkLabel, "unknown">;

export const AGENT_FAMILIES = ["nmap", "masscan", "curl", "script", "browser", "unknown"] as const;
export type AgentFamily = (typeof AGENT_FAMILIES)[number];

export const PATH_LABELS = ["direct", "forwarded"] as const;
export type PathLabel = (typeof PATH_LABELS)[number];

export interface Provenance {
	agent: AgentFamily;
	network: NetworkLabel;
	path: PathLabel;
}

export interface HoneypotScan {
	id: string;
	receivedAt: string;
	host: string;
	probe: DecoyProbe;
	method: string;
	/** Truncated HMAC of the observed address. The address itself is never kept. */
	fingerprint: string;
	provenance: Provenance;
}

export interface ScanSummary {
	region: "nouvelle-aquitaine";
	windowMs: number;
	from: string;
	to: string;
	scans: number;
	distinctActors: number;
	byNetwork: Record<NetworkLabel, number>;
	byAgent: Record<AgentFamily, number>;
	byPath: Record<PathLabel, number>;
	byProbe: Record<string, number>;
	firstAt: string | null;
	lastAt: string | null;
}

export interface NetworkDataset {
	generatedAt: string;
	sources: {
		label: KnownNetworkLabel;
		url: string;
		addresses: string[];
	}[];
}

export type NetworkClassifier = (address: string) => NetworkLabel;

export interface ScanStore {
	add(scan: HoneypotScan): void;
	all(): HoneypotScan[];
	summary(now?: Date, windowMs?: number): ScanSummary;
}

function emptyCounts<T extends string>(labels: readonly T[]): Record<T, number> {
	const counts = {} as Record<T, number>;
	for (const label of labels) counts[label] = 0;
	return counts;
}

/** Accept only a named host below the reserved Nouvelle-Aquitaine decoy suffix. */
export function decoyHost(raw: string | undefined): string | null {
	if (typeof raw !== "string") return null;
	const host = raw.trim().toLowerCase().split(":", 1)[0] ?? "";
	if (!host.endsWith(NA_DECOY_HOST_SUFFIX)) return null;
	const label = host.slice(0, -NA_DECOY_HOST_SUFFIX.length);
	return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) ? host : null;
}

/** Query strings and fragments are dropped: they can carry victim data or credentials. */
export function probeFor(raw: string | undefined): DecoyProbe | null {
	if (typeof raw !== "string" || raw.length > 256) return null;
	const path = raw.split(/[?#]/, 1)[0] ?? "";
	return (DECOY_PROBES as readonly string[]).includes(path) ? (path as DecoyProbe) : null;
}

export function isIPv4(value: string): boolean {
	const parts = value.split(".");
	return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** Only the first forwarded address is used; the full chain may contain user data. */
export function firstForwardedFor(header: string | string[] | undefined): string | null {
	const raw = Array.isArray(header) ? header[0] : header;
	if (typeof raw !== "string") return null;
	const first = raw.split(",", 1)[0]?.trim() ?? "";
	return isIPv4(first) ? first : null;
}

export function fingerprintAddress(address: string, secret: string): string {
	return createHmac("sha256", secret).update(address.trim().toLowerCase()).digest("hex").slice(0, 16);
}

export function classifyAgent(header: string | string[] | undefined): AgentFamily {
	const raw = Array.isArray(header) ? header[0] : header;
	const value = (raw ?? "").toLowerCase();
	if (/nmap/.test(value)) return "nmap";
	if (/masscan|zmap/.test(value)) return "masscan";
	if (/^curl\//.test(value)) return "curl";
	if (/python-requests|python-urllib|wget|go-http-client|axios/.test(value)) return "script";
	if (/mozilla\/|applewebkit|chrome\/|safari\//.test(value)) return "browser";
	return "unknown";
}

/** Offline classification from a versioned snapshot of free, public grey lists. */
export function createNetworkClassifier(dataset: NetworkDataset): NetworkClassifier {
	const byAddress = new Map<string, NetworkLabel>();
	for (const source of dataset.sources) {
		for (const address of source.addresses) byAddress.set(address.toLowerCase(), source.label);
	}
	return (address) => byAddress.get(address.trim().toLowerCase()) ?? "unknown";
}

export function summarize(
	scans: readonly HoneypotScan[],
	now: Date = new Date(),
	windowMs: number = WINDOW_24H_MS,
): ScanSummary {
	const toMs = now.getTime();
	const fromMs = toMs - windowMs;
	const inWindow = scans.filter((scan) => {
		const time = Date.parse(scan.receivedAt);
		return Number.isFinite(time) && time >= fromMs && time <= toMs;
	});

	const byNetwork = emptyCounts(NETWORK_LABELS);
	const byAgent = emptyCounts(AGENT_FAMILIES);
	const byPath = emptyCounts(PATH_LABELS);
	const byProbe: Record<string, number> = {};
	const actors = new Set<string>();
	let firstMs = Number.POSITIVE_INFINITY;
	let lastMs = Number.NEGATIVE_INFINITY;

	for (const scan of inWindow) {
		byNetwork[scan.provenance.network] += 1;
		byAgent[scan.provenance.agent] += 1;
		byPath[scan.provenance.path] += 1;
		byProbe[scan.probe] = (byProbe[scan.probe] ?? 0) + 1;
		actors.add(scan.fingerprint);
		const time = Date.parse(scan.receivedAt);
		firstMs = Math.min(firstMs, time);
		lastMs = Math.max(lastMs, time);
	}

	return {
		region: "nouvelle-aquitaine",
		windowMs,
		from: new Date(fromMs).toISOString(),
		to: new Date(toMs).toISOString(),
		scans: inWindow.length,
		distinctActors: actors.size,
		byNetwork,
		byAgent,
		byPath,
		byProbe,
		firstAt: Number.isFinite(firstMs) ? new Date(firstMs).toISOString() : null,
		lastAt: Number.isFinite(lastMs) ? new Date(lastMs).toISOString() : null,
	};
}

/** Bounded in-memory ring: a long-running decoy cannot grow without limit. */
export function createScanStore(options: { max?: number } = {}): ScanStore {
	const max = options.max ?? 10_000;
	const scans: HoneypotScan[] = [];
	return {
		add(scan) {
			scans.push(scan);
			if (scans.length > max) scans.splice(0, scans.length - max);
		},
		all() {
			return scans.slice();
		},
		summary(now, windowMs) {
			return summarize(scans, now, windowMs);
		},
	};
}
