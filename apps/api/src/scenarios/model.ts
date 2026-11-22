/**
 * Crisis scenario generation for Nouvelle-Aquitaine local authorities.
 *
 * Pure and English-only on purpose. The loader owns database I/O, the CLI
 * wrappers own reporting, and the French narrative lives in docs/rapports/.
 * No network call, no paid service, and no raw source text is ever emitted:
 * scenarios contain codes, dates, hashes and fixed English playbook text.
 */
import { createHash } from "node:crypto";

export const NA_DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"] as const;
export const SCENARIO_TARGET = 10;

export type Theme =
	| "ransomware"
	| "data-leak"
	| "targeted-intrusion"
	| "public-alert"
	| "vulnerability"
	| "credential-exposure";

export type SourceKind = "official" | "grey" | "press";

export type RawSignal = {
	eventId: number;
	orgId: number | null;
	family: string;
	assertionType: string;
	sourceId: string;
	sourceFamily: string;
	observedAt: string;
	severity: number;
	department: string | null;
	orgKind: string;
	orgSector: string | null;
	/** Screening input only. These two fields never leave this module. */
	title: string | null;
	summary: string | null;
};

export type ScreenedSignal = Omit<RawSignal, "title" | "summary"> & { department: string };

export type ScenarioCluster = {
	key: string;
	department: string;
	theme: Theme;
	signals: ScreenedSignal[];
	score: number;
};

export type CrisisScenario = {
	id: string;
	title: string;
	department: string;
	departmentName: string;
	theme: Theme;
	severity: number;
	signalCount: number;
	sourceCount: number;
	organizationCount: number;
	publicSectorSignalCount: number;
	sources: { id: string; kind: SourceKind }[];
	firstObserved: string;
	lastObserved: string;
	evidenceHashes: string[];
	organizationHashes: string[];
	timeline: { offsetDays: number; family: string; assertionType: string; sourceKind: SourceKind }[];
	impactHypothesis: string;
	responseActions: string[];
	dataBoundary: { region: "nouvelle-aquitaine"; victimPersonalData: false; paidServices: false };
};

const THEME_BY_FAMILY: Record<string, Theme> = {
	ransomware: "ransomware",
	leaks: "data-leak",
	paste: "credential-exposure",
	cti: "targeted-intrusion",
	cert_fr: "public-alert",
	cert: "public-alert",
	vuln: "vulnerability",
	phishing: "credential-exposure",
	reputation: "credential-exposure",
};

const DEPARTMENT_NAMES: Record<string, string> = {
	"16": "Charente",
	"17": "Charente-Maritime",
	"19": "Correze",
	"23": "Creuse",
	"24": "Dordogne",
	"33": "Gironde",
	"40": "Landes",
	"47": "Lot-et-Garonne",
	"64": "Pyrenees-Atlantiques",
	"79": "Deux-Sevres",
	"86": "Vienne",
	"87": "Haute-Vienne",
};

const THEME_TITLES: Record<Theme, string> = {
	ransomware: "Ransomware disruption of municipal services",
	"data-leak": "Exposure of local authority records",
	vulnerability: "Exploitable vulnerability in a public-facing service",
	"targeted-intrusion": "Targeted intrusion against public staff",
	"public-alert": "Security alert affecting a public service",
	"credential-exposure": "Credential exposure in a local ecosystem",
};

const IMPACT: Record<Theme, string> = {
	ransomware: "Loss of an internet-facing service and delayed processing of citizen requests.",
	"data-leak": "Unauthorized disclosure of administrative records handled by the authority.",
	"targeted-intrusion": "Compromise of a staff account used for internal or citizen-facing workflows.",
	"public-alert": "A published alert requires rapid verification of the local exposure.",
	vulnerability: "An unpatched public-facing component may be reachable from the internet.",
	"credential-exposure": "Reused credentials may grant access to a local service.",
};

const ACTIONS: Record<Theme, string[]> = {
	ransomware: [
		"Isolate the affected segment and keep an offline copy of the incident log.",
		"Switch citizen requests to a documented manual fallback.",
		"Verify backups by restoring a non-production copy before any negotiation.",
	],
	"data-leak": [
		"Identify the affected dataset without publishing personal identifiers.",
		"Revoke the exposed access and preserve access logs.",
		"Prepare an anonymous incident notice for the supervisory authority.",
	],
	"targeted-intrusion": [
		"Force a password reset for the affected service accounts.",
		"Enforce multi-factor authentication on remote access.",
		"Brief staff on the observed lure without naming any victim.",
	],
	"public-alert": [
		"Match the published alert against the local asset inventory.",
		"Apply the vendor fix on a test host before production rollout.",
		"Record the decision and its timestamp in the incident log.",
	],
	vulnerability: [
		"Expose only the verified asset identifier, not a victim name.",
		"Patch or remove the exposed service within the agreed window.",
		"Re-scan the perimeter after remediation.",
	],
	"credential-exposure": [
		"Invalidate the affected credentials and check reuse across services.",
		"Review outbound authentication logs for the exposure window.",
		"Publish internal guidance without reproducing leaked material.",
	],
};

/** Deliberately narrow: a broad name regex would reject nearly every French title. */
const PERSONAL_DATA_PATTERNS = [
	/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
	/(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}\b/,
	/\b(?:M\.|Mme|Mr|Monsieur|Madame)\s+[A-ZÀ-Ÿ][a-zà-ÿ-]+\s+[A-ZÀ-Ÿ][a-zà-ÿ-]+/,
	/\b\d{13,15}\b/,
];

export function isNaDepartment(value: string | null | undefined): boolean {
	return typeof value === "string" && (NA_DEPARTMENTS as readonly string[]).includes(value);
}

export function departmentName(code: string): string {
	return DEPARTMENT_NAMES[code] ?? code;
}

export function containsPersonalData(text: string | null | undefined): boolean {
	if (!text) return false;
	return PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(text));
}

export function themeFor(family: string): Theme | null {
	return THEME_BY_FAMILY[family] ?? null;
}

export function classifySource(sourceFamily: string, sourceId: string): SourceKind {
	if (["cert", "cert_fr", "vuln", "warninglist"].includes(sourceFamily)) return "official";
	if (["presse", "presse_cyber"].includes(sourceFamily) || sourceId.startsWith("presse-") || sourceId.startsWith("gn-")) return "press";
	// Trackers and public channels are grey first-rank sources: allowed here.
	return "grey";
}

/** Drops anything outside Nouvelle-Aquitaine or carrying victim personal data. */
export function screenSignal(raw: RawSignal): ScreenedSignal | null {
	if (!isNaDepartment(raw.department)) return null;
	if (containsPersonalData(raw.title) || containsPersonalData(raw.summary)) return null;
	if (Number.isNaN(Date.parse(raw.observedAt))) return null;
	if (themeFor(raw.family) === null) return null;
	const { title: _title, summary: _summary, ...screened } = raw;
	return { ...screened, department: raw.department as string };
}

export function clusterKey(signal: ScreenedSignal): string {
	return `${signal.department}|${themeFor(signal.family)}`;
}

export function groupSignals(signals: ScreenedSignal[]): ScenarioCluster[] {
	const groups = new Map<string, ScreenedSignal[]>();
	for (const signal of signals) {
		const key = clusterKey(signal);
		const bucket = groups.get(key);
		if (bucket) bucket.push(signal);
		else groups.set(key, [signal]);
	}
	return [...groups.entries()].map(([key, bucket]) => {
		const [department, theme] = key.split("|") as [string, Theme];
		return { key, department, theme, signals: bucket, score: scoreCluster(bucket) };
	});
}

export function scoreCluster(signals: ScreenedSignal[]): number {
	const sources = new Set(signals.map((s) => s.sourceId)).size;
	const organizations = new Set(signals.map((s) => s.orgId).filter((id) => id !== null)).size;
	const severity = Math.max(0, ...signals.map((s) => s.severity));
	const dates = signals.map((s) => Date.parse(s.observedAt)).filter((d) => !Number.isNaN(d));
	const span = dates.length > 1 ? (Math.max(...dates) - Math.min(...dates)) / 86_400_000 : 0;
	return Math.round((signals.length + 2 * sources + organizations + severity + Math.min(span, 30) / 30) * 100) / 100;
}

export function rankClusters(clusters: ScenarioCluster[]): ScenarioCluster[] {
	return [...clusters].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

/** One scenario per department first, then the strongest remaining clusters. */
export function selectClusters(clusters: ScenarioCluster[], limit = SCENARIO_TARGET): ScenarioCluster[] {
	const ranked = rankClusters(clusters);
	const selected: ScenarioCluster[] = [];
	const used = new Set<string>();
	for (const cluster of ranked) {
		if (selected.length >= limit) break;
		if (used.has(cluster.department)) continue;
		selected.push(cluster);
		used.add(cluster.department);
	}
	for (const cluster of ranked) {
		if (selected.length >= limit) break;
		if (!selected.includes(cluster)) selected.push(cluster);
	}
	return selected;
}

function hash(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function buildScenario(cluster: ScenarioCluster): CrisisScenario {
	const signals = [...cluster.signals].sort(
		(a, b) => a.observedAt.localeCompare(b.observedAt) || a.eventId - b.eventId,
	);
	const firstObserved = signals[0]?.observedAt ?? "";
	const firstMs = Date.parse(firstObserved);
	const sourceIds = [...new Set(signals.map((s) => s.sourceId))].sort();
	const orgIds = [...new Set(signals.map((s) => s.orgId).filter((id): id is number => id !== null))].sort((a, b) => a - b);
	const theme = cluster.theme;
	const title = (THEME_TITLES[theme] ?? theme).trim();

	return {
		id: `na-${cluster.department}-${theme}-${firstObserved.slice(0, 10)}`,
		title: `${title} - ${departmentName(cluster.department)} (${cluster.department})`,
		department: cluster.department,
		departmentName: departmentName(cluster.department),
		theme,
		severity: Math.max(0, ...signals.map((s) => s.severity)),
		signalCount: signals.length,
		sourceCount: sourceIds.length,
		organizationCount: orgIds.length,
		publicSectorSignalCount: signals.filter((s) => ["collectivite", "sante", "enseignement", "association"].includes(s.orgKind)).length,
		sources: sourceIds.map((id) => {
			const signal = signals.find((s) => s.sourceId === id);
			return { id, kind: classifySource(signal?.sourceFamily ?? "", id) };
		}),
		firstObserved,
		lastObserved: signals[signals.length - 1]?.observedAt ?? "",
		evidenceHashes: [...new Set(signals.map((s) => hash(`event:${s.eventId}`)))].sort(),
		organizationHashes: orgIds.slice(0, 10).map((id) => hash(`org:${id}`)),
		timeline: signals.map((s) => ({
			offsetDays: Math.round((Date.parse(s.observedAt) - firstMs) / 86_400_000),
			family: s.family,
			assertionType: s.assertionType,
			sourceKind: classifySource(s.sourceFamily, s.sourceId),
		})),
		impactHypothesis: IMPACT[theme],
		responseActions: [...ACTIONS[theme]],
		dataBoundary: { region: "nouvelle-aquitaine", victimPersonalData: false, paidServices: false },
	};
}

export type Screening = {
	raw: number;
	outsideRegion: number;
	personalData: number;
	unknownTheme: number;
	usable: number;
};

export function generateScenarios(raw: RawSignal[], limit = SCENARIO_TARGET): { scenarios: CrisisScenario[]; screening: Screening } {
	const screening: Screening = { raw: raw.length, outsideRegion: 0, personalData: 0, unknownTheme: 0, usable: 0 };
	const screened: ScreenedSignal[] = [];
	for (const signal of raw) {
		if (!isNaDepartment(signal.department)) { screening.outsideRegion++; continue; }
		if (containsPersonalData(signal.title) || containsPersonalData(signal.summary)) { screening.personalData++; continue; }
		if (themeFor(signal.family) === null) { screening.unknownTheme++; continue; }
		if (Number.isNaN(Date.parse(signal.observedAt))) { screening.unknownTheme++; continue; }
		const clean = screenSignal(signal);
		if (clean) screened.push(clean);
	}
	screening.usable = screened.length;
	return { scenarios: selectClusters(groupSignals(screened), limit).map(buildScenario), screening };
}
