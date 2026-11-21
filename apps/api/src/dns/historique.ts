/**
 * Historique DNS des domaines du référentiel — modèle et comparaison.
 *
 * Ce module ne touche pas la base : il normalise les domaines, interroge les
 * sources publiques (DoH, RDAP) et calcule les différences entre deux
 * observations. La persistance vit dans `store.ts`, l'orchestration dans
 * `releve.ts`.
 *
 * Règle de mesure : un type d'enregistrement dont l'interrogation a échoué
 * n'est **jamais** comparé. Un timeout DoH ne doit pas produire 95 fausses
 * bascules d'IP.
 */

import { dohQuery } from "../enrich/dns.js";
import { enrichDomain } from "../enrich/whois.js";

export type DnsChangeKind = "ip" | "mx" | "ns" | "hebergeur" | "mx-inconnu" | "registrar";

export interface DnsSnapshot {
	domain: string;
	/** Date d'observation, ISO 8601. */
	observedAt: string;
	a: string[];
	aaaa: string[];
	mx: string[];
	ns: string[];
	/** Noms inverses, par adresse IPv4 : `{ "1.2.3.4": ["ptr.example."] }`. */
	ptr: Record<string, string[]>;
	registrar: string | null;
	/** Erreurs par source, préfixées `doh:<TYPE>:` ou `rdap:`. */
	errors: string[];
}

export interface DnsChange {
	kind: DnsChangeKind;
	severity: 1 | 2 | 3;
	summary: string;
	before: Record<string, unknown>;
	after: Record<string, unknown>;
}

export type DnsProviderCategory = "mail" | "dns" | "hosting" | "cdn" | "cloud" | "registrar";

export interface DnsProvider {
	suffix: string;
	name: string;
	category: DnsProviderCategory;
	mode: "suffix" | "contains";
}

/** Sources injectables : les tests ne touchent jamais le réseau. */
export interface DnsFetcher {
	doh(name: string, type: string): Promise<string[]>;
	rdap(domain: string): Promise<{ registrar?: string | null; nameServers: string[] } | null>;
}

export const MX_CATEGORIES: readonly DnsProviderCategory[] = ["mail", "cloud"];
export const NS_CATEGORIES: readonly DnsProviderCategory[] = ["dns", "hosting", "cdn", "cloud"];
export const PTR_CATEGORIES: readonly DnsProviderCategory[] = ["hosting", "cdn", "cloud", "mail"];

const HOSTNAME_RE =
	/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Normalise une valeur du référentiel en nom d'hôte nu.
 *
 * Accepte `https://www.Exemple.fr/chemin`, `www.exemple.fr`, `exemple.fr.`.
 * Retire le préfixe `www.` une seule fois (le domaine suivi est la racine
 * servie, pas un hôte particulier). Refuse vide, IP et faux domaine.
 */
export function normalizeDomain(raw: string | null | undefined): string | null {
	if (raw == null) return null;
	let value = raw.trim().toLowerCase();
	if (!value) return null;

	if (/^[a-z][a-z0-9+.-]*:\/\//.test(value)) {
		try {
			value = new URL(value).hostname;
		} catch {
			return null;
		}
	}
	value = value.split(/[/?#]/, 1)[0]?.replace(/\.$/, "") ?? "";
	if (value.startsWith("www.")) value = value.slice(4);
	if (!HOSTNAME_RE.test(value)) return null;
	// Un TLD purement numérique est une adresse IP, pas un domaine.
	if (/^\d+$/.test(value.slice(value.lastIndexOf(".") + 1))) return null;
	return value;
}

/** Construit le nom inverse IPv4 (`1.2.3.4` → `4.3.2.1.in-addr.arpa`). */
export function reverseIpv4(ip: string): string | null {
	const parts = ip.split(".");
	if (parts.length !== 4) return null;
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return null;
		if (Number(part) > 255) return null;
	}
	return `${parts.reverse().join(".")}.in-addr.arpa`;
}

function isIpv4(value: string): boolean {
	return reverseIpv4(value) !== null;
}

function isIpv6(value: string): boolean {
	return value.includes(":") && /^[0-9a-f:.]+$/i.test(value);
}

function cleanHost(value: string): string {
	return value.trim().toLowerCase().replace(/\.$/, "");
}

/** Extrait l'hôte d'une réponse MX (« 10 mx.exemple.fr. » → « mx.exemple.fr »). */
export function mxHost(data: string): string | null {
	const parts = data.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return null;
	const host = cleanHost(parts[parts.length - 1] ?? "");
	return host || null;
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort();
}

/** True si l'interrogation de ce type a échoué pour l'observation. */
function typeFailed(snapshot: DnsSnapshot, type: string): boolean {
	return snapshot.errors.some((e) => e.startsWith(`doh:${type}:`));
}

function rdapFailed(snapshot: DnsSnapshot): boolean {
	return snapshot.errors.some((e) => e.startsWith("rdap:"));
}

/** Un suffixe de catalogue correspond-il au nom d'hôte ? */
export function providerMatches(host: string, provider: DnsProvider): boolean {
	const h = cleanHost(host);
	if (provider.mode === "contains") return h.includes(provider.suffix);
	return h === provider.suffix || h.endsWith(`.${provider.suffix}`);
}

/** Fournisseur le plus précis (suffixe le plus long) pour un hôte, ou null. */
export function providerFor(
	host: string,
	catalogue: readonly DnsProvider[],
	categories?: readonly DnsProviderCategory[],
): DnsProvider | null {
	let best: DnsProvider | null = null;
	for (const provider of catalogue) {
		if (categories && !categories.includes(provider.category)) continue;
		if (!providerMatches(host, provider)) continue;
		if (!best || provider.suffix.length > best.suffix.length) best = provider;
	}
	return best;
}

function providerNames(
	hosts: readonly string[],
	catalogue: readonly DnsProvider[],
	categories: readonly DnsProviderCategory[],
): string[] {
	const names = new Set<string>();
	for (const host of hosts) {
		const provider = providerFor(host, catalogue, categories);
		if (provider) names.add(provider.name);
	}
	return [...names].sort();
}

function providerNamesOf(snapshot: DnsSnapshot, catalogue: readonly DnsProvider[]): string[] {
	const ns = providerNames(snapshot.ns, catalogue, NS_CATEGORIES);
	const ptrHosts = Object.values(snapshot.ptr).flat();
	const ptr = providerNames(ptrHosts, catalogue, PTR_CATEGORIES);
	return [...new Set([...ns, ...ptr])].sort();
}

function diffSets(before: readonly string[], after: readonly string[]): {
	added: string[];
	removed: string[];
	changed: boolean;
} {
	const beforeSet = new Set(before);
	const afterSet = new Set(after);
	const added = after.filter((v) => !beforeSet.has(v));
	const removed = before.filter((v) => !afterSet.has(v));
	return { added, removed, changed: added.length > 0 || removed.length > 0 };
}

/** Liste lisible et bornée pour un résumé de changement. */
function compact(values: readonly string[], max = 4): string {
	if (values.length <= max) return values.join(", ");
	return `${values.slice(0, max).join(", ")} (+${values.length - max})`;
}

/**
 * Compare deux observations. `before = null` (première mesure) ne produit
 * aucun changement : on n'invente pas un passé.
 */
export function diffSnapshots(
	before: DnsSnapshot | null,
	after: DnsSnapshot,
	catalogue: readonly DnsProvider[],
): DnsChange[] {
	if (!before || measurementState(before) === "erreur" || measurementState(after) === "erreur") return [];

	const changes: DnsChange[] = [];
	const aComparable = !typeFailed(before, "A") && !typeFailed(after, "A");
	const aaaaComparable = !typeFailed(before, "AAAA") && !typeFailed(after, "AAAA");
	const mxComparable = !typeFailed(before, "MX") && !typeFailed(after, "MX");
	const nsComparable = !typeFailed(before, "NS") && !typeFailed(after, "NS");
	const ptrComparable =
		!before.errors.some((e) => e.startsWith("doh:PTR")) &&
		!after.errors.some((e) => e.startsWith("doh:PTR"));

	// Hébergeur : identité (NS + PTR) avant / après. Un simple ajout de NS
	// secondaire ne suffit pas ; c'est le nom du fournisseur qui doit changer.
	if (nsComparable || ptrComparable) {
		const providersBefore = providerNamesOf(before, catalogue);
		const providersAfter = providerNamesOf(after, catalogue);
		const providersDiff = diffSets(providersBefore, providersAfter);
		if (providersDiff.changed) {
			const appeared = providersDiff.added;
			const left = providersDiff.removed;
			const summary = appeared.length > 0
				? `nouvel hébergeur : ${compact(appeared)}${left.length > 0 ? ` (quitte ${compact(left)})` : ""}`
				: `hébergeur quitté : ${compact(left)}`;
			changes.push({
				kind: "hebergeur",
				severity: 3,
				summary,
				before: { providers: providersBefore },
				after: { providers: providersAfter },
			});
		}
	}

	// Registraire RDAP : identité éditoriale du domaine, rare et significative.
	if (!rdapFailed(before) && !rdapFailed(after) && before.registrar && after.registrar) {
		if (before.registrar !== after.registrar) {
			changes.push({
				kind: "registrar",
				severity: 3,
				summary: `registraire : ${before.registrar} → ${after.registrar}`,
				before: { registrar: before.registrar },
				after: { registrar: after.registrar },
			});
		}
	}

	// MX : nouveau serveur de messagerie, puis alerte si ce serveur est inconnu
	// du catalogue (interception ou petit hébergeur, jamais conclu à sa place).
	if (mxComparable) {
		const mxDiff = diffSets(before.mx, after.mx);
		if (mxDiff.changed) {
			changes.push({
				kind: "mx",
				severity: 2,
				summary: `MX : ${compact(before.mx)} → ${compact(after.mx)}`,
				before: { mx: before.mx },
				after: { mx: after.mx },
			});
			const unknown = mxDiff.added.filter(
				(host) => providerFor(host, catalogue, MX_CATEGORIES) === null,
			);
			if (unknown.length > 0) {
				changes.push({
					kind: "mx-inconnu",
					severity: 3,
					summary: `MX inconnu du catalogue : ${compact(unknown)}`,
					before: { mx: before.mx },
					after: { mx: after.mx, unknown },
				});
			}
		}
	}

	// NS : délégation modifiée, même si le nom commercial du fournisseur reste
	// le même (par exemple nouvelle paire de serveurs chez OVHcloud).
	if (nsComparable) {
		const nsDiff = diffSets(before.ns, after.ns);
		if (nsDiff.changed) {
			const parts: string[] = [];
			if (nsDiff.added.length > 0) parts.push(`+${compact(nsDiff.added)}`);
			if (nsDiff.removed.length > 0) parts.push(`-${compact(nsDiff.removed)}`);
			changes.push({
				kind: "ns",
				severity: 2,
				summary: `NS : ${parts.join(" ")}`,
				before: { ns: before.ns },
				after: { ns: after.ns },
			});
		}
	}

	// Adresses : A et AAAA comptent comme une seule bascule d'IP, pour ne pas
	// noyer le rapport sous deux lignes pour un même déplacement.
	const aDiff = aComparable ? diffSets(before.a, after.a) : { added: [], removed: [], changed: false };
	const aaaaDiff = aaaaComparable ? diffSets(before.aaaa, after.aaaa) : { added: [], removed: [], changed: false };
	if (aDiff.changed || aaaaDiff.changed) {
		const parts: string[] = [];
		if (aDiff.changed) parts.push(`A ${compact(aDiff.added) || "∅"} / -${compact(aDiff.removed) || "∅"}`);
		if (aaaaDiff.changed) parts.push(`AAAA ${compact(aaaaDiff.added) || "∅"} / -${compact(aaaaDiff.removed) || "∅"}`);
		changes.push({
			kind: "ip",
			severity: aDiff.changed ? 2 : 1,
			summary: `bascule d'IP : ${parts.join(" ; ")}`,
			before: { a: before.a, aaaa: before.aaaa },
			after: { a: after.a, aaaa: after.aaaa },
		});
	}

	const rank: Record<DnsChangeKind, number> = {
		hebergeur: 0,
		registrar: 1,
		"mx-inconnu": 2,
		ip: 3,
		mx: 4,
		ns: 5,
	};
	return changes.sort((x, y) => y.severity - x.severity || rank[x.kind] - rank[y.kind]);
}

/** État du relevé, dérivé des erreurs par type. */
export function measurementState(snapshot: DnsSnapshot): "ok" | "partiel" | "erreur" {
	const types = ["A", "AAAA", "MX", "NS"];
	const failed = types.filter((type) => typeFailed(snapshot, type)).length;
	if (failed === types.length) return "erreur";
	return snapshot.errors.length > 0 ? "partiel" : "ok";
}

export interface CollectOptions {
	/** Date à estampiller (injectable pour les tests). */
	now?: Date;
	/** Nombre maximal d'adresses IPv4 dont on demande le PTR (défaut 8). */
	ptrLimit?: number;
}

/**
 * Interroge un domaine. Aucune exception ne sort : chaque panne est consignée
 * dans `errors` et l'observation partielle reste exploitable.
 */
export async function collectDomain(
	domain: string,
	fetcher: DnsFetcher,
	options: CollectOptions = {},
): Promise<DnsSnapshot> {
	const errors: string[] = [];
	const observedAt = (options.now ?? new Date()).toISOString();
	const ptrLimit = options.ptrLimit ?? 8;

	async function query(type: "A" | "AAAA" | "MX" | "NS"): Promise<string[]> {
		try {
			return await fetcher.doh(domain, type);
		} catch (error) {
			errors.push(`doh:${type}: ${error instanceof Error ? error.message : String(error)}`);
			return [];
		}
	}

	async function queryPtr(ip: string): Promise<string[]> {
		const reverse = reverseIpv4(ip);
		if (!reverse) return [];
		try {
			return await fetcher.doh(reverse, "PTR");
		} catch (error) {
			errors.push(`doh:PTR:${ip}: ${error instanceof Error ? error.message : String(error)}`);
			return [];
		}
	}

	const [aRaw, aaaaRaw, mxRaw, nsRaw] = await Promise.all([
		query("A"),
		query("AAAA"),
		query("MX"),
		query("NS"),
	]);

	const a = uniqueSorted(aRaw.map((v) => v.trim()).filter(isIpv4));
	const aaaa = uniqueSorted(aaaaRaw.map((v) => v.trim().toLowerCase()).filter(isIpv6));
	const mx = uniqueSorted(
		mxRaw.map(mxHost).filter((h): h is string => h !== null),
	);
	const ns = uniqueSorted(nsRaw.map(cleanHost).filter(Boolean));

	let registrar: string | null = null;
	try {
		const rdap = await fetcher.rdap(domain);
		registrar = rdap?.registrar ?? null;
	} catch (error) {
		errors.push(`rdap: ${error instanceof Error ? error.message : String(error)}`);
	}

	const ptr: Record<string, string[]> = {};
	for (const ip of a.slice(0, ptrLimit)) {
		const names = uniqueSorted((await queryPtr(ip)).map(cleanHost).filter(Boolean));
		if (names.length > 0) ptr[ip] = names;
	}

	return {
		domain,
		observedAt,
		a,
		aaaa,
		mx,
		ns,
		ptr,
		registrar,
		errors,
	};
}

/** Fetcher réel : DoH Cloudflare et RDAP public, sans clé ni service payant. */
export function createDefaultFetcher(): DnsFetcher {
	return {
		async doh(name: string, type: string): Promise<string[]> {
			const result = await dohQuery(name, type);
			// 0 = succès, 3 = NXDOMAIN (pas d'enregistrement, pas une panne).
			if (result.status !== 0 && result.status !== 3) {
				throw new Error(`statut DoH ${result.status}`);
			}
			return result.answers;
		},
		async rdap(domain: string) {
			const whois = await enrichDomain(domain);
			return { registrar: whois.registrar ?? null, nameServers: whois.nameServers };
		},
	};
}
