/**
 * Detection rules for first-party crisis pages and post-incident statements.
 *
 * Pure and English-only on purpose: the CLI wrappers own I/O and the French
 * report lives in docs/rapports/. No network call and no personal data here.
 */

export type SourceKind = "official" | "grey" | "press" | "unknown";

export type CommunicationRecord = {
	id: string;
	department: string | null;
	organisation: string | null;
	incidentDate: string | null;
	publicationDate: string | null;
	title: string | null;
	url: string | null;
	sourceLabel: string | null;
};

export type Detection = {
	id: string;
	department: string;
	sourceKind: "official" | "grey";
	host: string | null;
	organisationHash: string;
	incidentDate: string | null;
	publishedAt: string;
	delayDays: number | null;
};

export const NA_DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"] as const;

const DEPARTMENT_NAMES: Record<string, string> = {
	charente: "16",
	"charente maritime": "17",
	correze: "19",
	creuse: "23",
	dordogne: "24",
	gironde: "33",
	landes: "40",
	"lot et garonne": "47",
	"pyrenees atlantiques": "64",
	"deux sevres": "79",
	vienne: "86",
	"haute vienne": "87",
};

/** Publishers and leak blogs: they report an incident, they are not the first-party statement. */
const PRESS_HOSTS = [
	"actu.fr", "01net.com", "annonces-landaises.com", "bfmtv.com", "banquedesterritoires.fr",
	"charentelibre.fr", "cyberattaque.org", "darkwebinformer.com", "dordognelibre.fr",
	"egora.fr", "franceinfo.fr", "fuitesinfos.fr", "hautesaintonge.fr", "ici.fr",
	"ladepeche.fr", "lamontagne.fr", "lanouvellerepublique.fr", "legalplanet.fr",
	"localtis.fr", "ouest-france.fr", "petitbleu.fr", "reussir.fr", "siberpol.com",
	"sudouest.fr", "tf1info.fr", "ticsante.com", "wiclic.fr", "pro.tourisme-creuse.com",
] as const;

/** First-party pages published by a non-institutional body (unions, professional orders). */
const GREY_FIRST_PARTY_HOSTS = ["unsa-education.com"] as const;

const OFFICIAL_LABEL = /communiqué officiel|alerte officielle|information officielle|communiqué de presse/i;
const CRISIS_SIGNAL = /alerte|communication|cyber|donnees|fuite|incident|indisponibilite|information|intrusion|piratage|ransom|securite|violation|breach/i;

const HOST_NOISE: Record<string, true> = {
	com: true, fr: true, org: true, www: true, de: true, des: true, du: true,
	la: true, le: true, les: true, saint: true, sainte: true, ville: true,
	mairie: true, centre: true, hopital: true, universite: true,
	association: true, federation: true,
};

export function normalizeText(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/['’]/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

export function isNaDepartment(value: string | null): boolean {
	if (!value) return false;
	const key = normalizeText(value).replace(/\s+/g, " ");
	if (/^\d{2}$/.test(key)) return (NA_DEPARTMENTS as readonly string[]).includes(key);
	return Object.prototype.hasOwnProperty.call(DEPARTMENT_NAMES, key);
}

export function naDepartmentCode(value: string): string | null {
	const key = normalizeText(value).replace(/\s+/g, " ");
	if (/^\d{2}$/.test(key)) return (NA_DEPARTMENTS as readonly string[]).includes(key) ? key : null;
	return DEPARTMENT_NAMES[key] ?? null;
}

export function hostname(url: string | null): string | null {
	if (!url) return null;
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return null;
	}
}

function isHost(host: string | null, allowed: readonly string[]): boolean {
	if (!host) return false;
	return allowed.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function hostMatchesOrganisation(host: string | null, organisation: string | null): boolean {
	if (!host || !organisation) return false;
	const org = normalizeText(organisation);
	const labels = host.replace(/\.fr$/, "").replace(/\.com$/, "").split(/[.-]/);
	return labels.some((label) => {
		const token = normalizeText(label.replace(/\d+/g, ""));
		return token.length >= 4 && HOST_NOISE[token] !== true && new RegExp(`\\b${token}\\b`).test(org);
	});
}

/** A press article is never a crisis communication by itself. */
export function classifySource(record: CommunicationRecord): SourceKind {
	if (isHost(hostname(record.url), PRESS_HOSTS)) return "press";
	if (record.sourceLabel && OFFICIAL_LABEL.test(record.sourceLabel)) return "official";
	if (isHost(hostname(record.url), GREY_FIRST_PARTY_HOSTS)) return "grey";
	if (hostMatchesOrganisation(hostname(record.url), record.organisation)) return "grey";
	return "unknown";
}

export function isPublishedAfterIncident(record: CommunicationRecord): boolean {
	const incident = parseIsoDate(record.incidentDate);
	const published = parseIsoDate(record.publicationDate);
	if (!published || published.getTime() > Date.now()) return false;
	return incident === null || published.getTime() >= incident.getTime();
}

export function isCrisisCommunication(record: CommunicationRecord): boolean {
	if (!record.publicationDate || !parseIsoDate(record.publicationDate)) return false;
	if (!isNaDepartment(record.department)) return false;
	const kind = classifySource(record);
	if (kind !== "official" && kind !== "grey") return false;
	if (!isPublishedAfterIncident(record)) return false;
	const text = normalizeText(`${record.title ?? ""} ${record.url ?? ""}`);
	return CRISIS_SIGNAL.test(text);
}

export function parseIsoDate(value: string | null): Date | null {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const date = new Date(`${value}T00:00:00Z`);
	return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

/** Whole UTC days between the incident and its first public communication. */
export function delayInDays(incidentDate: string | null, publicationDate: string | null): number | null {
	const incident = parseIsoDate(incidentDate);
	const published = parseIsoDate(publicationDate);
	if (!incident || !published) return null;
	const days = Math.round((published.getTime() - incident.getTime()) / 86_400_000);
	return days >= 0 ? days : null;
}
