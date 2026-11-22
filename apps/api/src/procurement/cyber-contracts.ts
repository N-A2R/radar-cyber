/**
 * Cyber public contracts in Nouvelle-Aquitaine.
 *
 * Pure, clock-free derivation shared by the collector, the measurement script
 * and the public API route. Only organisation-level fields are kept: buyer,
 * object of the notice, published amount and legal entity of the awardee.
 * Raw notice payloads (which may contain contact details of officials) are
 * never stored.
 */
import { createHash } from "node:crypto";

/** The twelve departments of Nouvelle-Aquitaine (65 is Occitanie). */
export const NA_DEPARTMENTS = [
	"16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
] as const;

const NA_SET: ReadonlySet<string> = new Set(NA_DEPARTMENTS);

/** Terms that make a procurement object cyber-related, after normalisation. */
export const CYBER_TERMS = [
	"cyber", "cybersecurite", "cybersecurisation",
	"securite informatique", "securite numerique",
	"securite des systemes d'information", "securite du systeme d'information",
	"securite des systemes d'informations", "securite des reseaux informatiques",
	"siem", "edr", "xdr", "waf", "pare-feu", "antivirus", "anti-virus",
	"pentest", "test d'intrusion", "chiffrement", "authentification forte",
	"mfa", "iam", "gestion des identites", "certificats electroniques",
	"sase", "scada",
] as const;

/** Physical safety and disaster-vulnerability objects are not cyber markets. */
const NON_CYBER_TERMS = [
	"securite incendie", "coordination securite", "csps", "protection de la sante",
	"vulnerabilite hydrique", "vulnerabilite au risque inondation",
	"systeme de securite incendie",
] as const;

/** Accent- and apostrophe-insensitive comparison text. */
export function normalizeText(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[’‘`´]/g, "'")
		.toLowerCase();
}

const patternFor = (terms: readonly string[]): RegExp => {
	const alternatives = terms.map((term) =>
		term.length <= 4
			? `\\b${term}\\b`
			: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	return new RegExp(alternatives.join("|"));
};

const CYBER_PATTERN = patternFor(CYBER_TERMS);
const NON_CYBER_PATTERN = patternFor(NON_CYBER_TERMS);

export function isCyberObject(object: string): boolean {
	const text = normalizeText(object);
	return CYBER_PATTERN.test(text) && !NON_CYBER_PATTERN.test(text);
}

/** A notice is regional only when every place of execution is in the region. */
export function isNaDepartments(departments: readonly string[]): boolean {
	return departments.length > 0 && departments.every((code) => NA_SET.has(code));
}

export type AmountKind = "awarded" | "estimated";

export type ContractNotice = {
	id: string;
	date: string;
	departments: string[];
	buyer: string;
	object: string;
	nature: string;
	folderId: string | null;
	amountEur: number | null;
	amountKind: AmountKind | null;
	awardees: string[];
};

export type CyberContract = {
	id: string;
	firstPublished: string;
	department: string;
	buyer: string;
	object: string;
	amountEur: number | null;
	amountKind: AmountKind | null;
	awardees: string[];
	noticeIds: string[];
};

/** Recover a published EUR amount from a BOAMP notice payload. */
export function extractAmount(
	raw: string | null,
	noticeNature?: string | null,
): { amountEur: number | null; kind: AmountKind | null } {
	if (!raw) return { amountEur: null, kind: null };
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { amountEur: null, kind: null };
	}
	const awardedNotice = noticeNature === "ATTRIBUTION";
	const found: { value: number; priority: number; kind: AmountKind }[] = [];
	const collect = (key: string, entry: Record<string, unknown>): void => {
		const currency = String(entry["@devise"] ?? entry["@currencyID"] ?? "EUR").toUpperCase();
		if (currency !== "EUR") return;
		const legacy = /^(montant|valeurEstimee|estimationValeur)$/i.test(key);
		const rawValue = legacy ? entry.valeur ?? entry.value : entry["#text"];
		const amount = Number(String(rawValue ?? "").replace(/\s/g, "").replace(",", "."));
		if (!Number.isFinite(amount) || amount <= 0) return;
		const awardKey = /^(?:cbc:)?(TotalAmount|PayableAmount)$/.test(key) || /^montant$/i.test(key);
		const awarded = awardKey && (awardedNotice || /^montant$/i.test(key));
		const priority = awarded ? (/TotalAmount|montant/i.test(key) ? 0 : 1) : 2;
		found.push({ value: amount, priority, kind: awarded ? "awarded" : "estimated" });
	};
	const visit = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const item of node) visit(item);
			return;
		}
		if (node === null || typeof node !== "object") return;
		for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
			if (value !== null && typeof value === "object" && (/Amount$/.test(key) || /^(montant|valeurEstimee|estimationValeur)$/i.test(key))) {
				collect(key, value as Record<string, unknown>);
			}
			visit(value);
		}
	};
	visit(parsed);
	if (found.length === 0) return { amountEur: null, kind: null };
	found.sort((a, b) => a.priority - b.priority || b.value - a.value);
	return { amountEur: found[0].value, kind: found[0].kind };
}

/** Company names only; never a natural person or a contact detail. */
export function extractAwardees(gestionRaw: string | null, donneesRaw?: string | null): string[] {
	const names: string[] = [];
	const add = (value: unknown): void => {
		if (typeof value !== "string") return;
		const name = value.trim();
		if (name.length >= 2 && name.length <= 120 && !names.includes(name)) names.push(name);
	};
	if (gestionRaw) {
		try {
			const parsed = JSON.parse(gestionRaw) as Record<string, unknown>;
			const indexation = parsed.INDEXATION as Record<string, unknown> | undefined;
			const titulaires = indexation?.TITULAIRES as Record<string, unknown> | undefined;
			if (titulaires) {
				const denomination = titulaires.DENOMINATION;
				if (Array.isArray(denomination)) denomination.forEach(add);
				else add(denomination);
			}
		} catch {
			// A malformed notice simply has no known awardee.
		}
	}
	if (names.length === 0 && donneesRaw) {
		try {
			const parsed = JSON.parse(donneesRaw) as Record<string, unknown>;
			const mapa = parsed.MAPA as Record<string, unknown> | undefined;
			const attribution = mapa?.attribution as Record<string, unknown> | undefined;
			const result = attribution?.attribution as Record<string, unknown> | undefined;
			const attribue = result?.resultat as Record<string, unknown> | undefined;
			const titulaire = (attribue?.attribue as Record<string, unknown> | undefined)?.titulaire as Record<string, unknown> | undefined;
			add(titulaire?.PersonneMorale);
		} catch {
			// Same rule as above.
		}
	}
	return names.sort();
}

function contractKey(notice: ContractNotice): string {
	if (notice.folderId) return `folder:${notice.folderId}`;
	const digest = createHash("sha256")
		.update(`${normalizeText(notice.buyer)}|${normalizeText(notice.object)}`)
		.digest("hex")
		.slice(0, 16);
	return `fingerprint:${digest}`;
}

/** One market per contract folder, or per buyer+object fingerprint. */
export function groupContracts(notices: readonly ContractNotice[]): CyberContract[] {
	const grouped = new Map<string, CyberContract>();
	for (const notice of notices) {
		const key = contractKey(notice);
		const existing = grouped.get(key);
		if (!existing) {
			grouped.set(key, {
				id: key,
				firstPublished: notice.date,
				department: notice.departments.find((code) => NA_SET.has(code)) ?? "",
				buyer: notice.buyer,
				object: notice.object,
				amountEur: notice.amountEur,
				amountKind: notice.amountKind,
				awardees: [...notice.awardees].sort(),
				noticeIds: [notice.id],
			});
			continue;
		}
		if (notice.date < existing.firstPublished) {
			existing.firstPublished = notice.date;
			existing.object = notice.object;
			existing.department = notice.departments.find((code) => NA_SET.has(code)) ?? existing.department;
		}
		if (!existing.noticeIds.includes(notice.id)) existing.noticeIds.push(notice.id);
		for (const name of notice.awardees) {
			if (!existing.awardees.includes(name)) existing.awardees.push(name);
		}
		existing.awardees.sort();
		const rank = (kind: AmountKind | null): number => (kind === "awarded" ? 0 : kind === "estimated" ? 1 : 2);
		if (notice.amountEur !== null && (
			existing.amountEur === null ||
			rank(notice.amountKind) < rank(existing.amountKind) ||
			(rank(notice.amountKind) === rank(existing.amountKind) && notice.amountEur > existing.amountEur)
		)) {
			existing.amountEur = notice.amountEur;
			existing.amountKind = notice.amountKind;
		}
	}
	return [...grouped.values()].sort((a, b) =>
		a.firstPublished.localeCompare(b.firstPublished) || a.id.localeCompare(b.id));
}

const monthsInWindow = (from: string, to: string): string[] => {
	const result: string[] = [];
	const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
	const end = to.slice(0, 7);
	for (let i = 0; i < 24; i += 1) {
		const month = cursor.toISOString().slice(0, 7);
		result.push(month);
		if (month === end) break;
		cursor.setUTCMonth(cursor.getUTCMonth() + 1);
	}
	return result;
};

export type ContractsMeasure = {
	window: { from: string; to: string; months: string[] };
	count: number;
	totalAmountEur: number;
	withAmount: number;
	withAwardee: number;
	byMonth: { month: string; contracts: number }[];
	byDepartment: { department: string; contracts: number }[];
	awardees: { name: string; contracts: number; amountEur: number }[];
	contracts: CyberContract[];
};

/** All the figures come from the versioned corpus: no network, no clock. */
export function measureContracts(
	contracts: readonly CyberContract[],
	from: string,
	to: string,
): ContractsMeasure {
	const inWindow = contracts.filter((c) => c.firstPublished >= from && c.firstPublished <= to);
	const months = monthsInWindow(from, to);
	const byMonth = months.map((month) => ({
		month,
		contracts: inWindow.filter((c) => c.firstPublished.startsWith(month)).length,
	}));
	const departmentCounts = new Map<string, number>();
	const awardeeStats = new Map<string, { name: string; contracts: number; amountEur: number }>();
	for (const contract of inWindow) {
		departmentCounts.set(contract.department, (departmentCounts.get(contract.department) ?? 0) + 1);
		for (const name of contract.awardees) {
			const stat = awardeeStats.get(name) ?? { name, contracts: 0, amountEur: 0 };
			stat.contracts += 1;
			stat.amountEur += contract.amountEur ?? 0;
			awardeeStats.set(name, stat);
		}
	}
	return {
		window: { from, to, months },
		count: inWindow.length,
		totalAmountEur: inWindow.reduce((sum, c) => sum + (c.amountEur ?? 0), 0),
		withAmount: inWindow.filter((c) => c.amountEur !== null).length,
		withAwardee: inWindow.filter((c) => c.awardees.length > 0).length,
		byMonth,
		byDepartment: [...departmentCounts.entries()]
			.map(([department, contracts]) => ({ department, contracts }))
			.sort((a, b) => a.department.localeCompare(b.department)),
		awardees: [...awardeeStats.values()].sort((a, b) =>
			b.contracts - a.contracts || a.name.localeCompare(b.name)),
		contracts: inWindow,
	};
}

/** Guard the versioned corpus against accidental personal or raw fields. */
export function safeNoticeKeys(notice: Record<string, unknown>): boolean {
	const allowed = [
		"id", "date", "departments", "buyer", "object", "nature",
		"folderId", "amountEur", "amountKind", "awardees",
	];
	const keys = Object.keys(notice);
	return keys.every((key) => allowed.includes(key)) &&
		keys.length === allowed.length &&
		!/(victim|victime|email|telephone|@|personnephysique)/i.test(JSON.stringify(notice));
}
