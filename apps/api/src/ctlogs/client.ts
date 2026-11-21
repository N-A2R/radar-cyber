/**
 * Client CT logs : crt.sh d'abord, Cert Spotter en repli et en source de
 * première vue. Les deux fournisseurs sont interrogés pour chaque domaine :
 * crt.sh expose `first_seen`, Cert Spotter expose les noms SAN complets.
 *
 * Le client est injectable (fetch, horloge, sommeil) pour que les tests
 * couvrent les pannes, les 429 et le taux d'échec sans réseau ni attente.
 */
import type { CertificatCT, Fournisseur, Tentative } from "./inventaire.js";

export type OptionsClientCT = {
	fetchImpl?: typeof fetch;
	dormir?: (ms: number) => Promise<void>;
	maintenant?: () => number;
	timeoutMs?: number;
	/** Requêtes Cert Spotter par fenêtre de 60 s (quota gratuit : 10). */
	capacite?: number;
	fenetreMs?: number;
	utiliserCrtSh?: boolean;
};

export type ResultatInterrogation = {
	certificats: CertificatCT[];
	tentatives: Tentative[];
};

type ReponseBrute = {
	statut: number;
	corps: string;
	retryAfterMs: number | null;
};

type EntreeCrtSh = {
	name_value?: string;
	common_name?: string;
	first_seen?: string;
	not_before?: string;
	id?: string | number;
	issuer_name?: string;
};

type EntreeCertSpotter = {
	dns_names?: string[];
	not_before?: string;
	id?: string;
	issuer?: { name?: string } | string | null;
};

const CRT_URL = "https://crt.sh/?q=";
const SPOTTER_URL = "https://api.certspotter.com/v1/issuances";

/** Normalise les dates des deux fournisseurs en ISO-8601 (UTC). */
function isoDate(valeur: string | undefined): string {
	if (!valeur) return new Date(0).toISOString();
	const texte = valeur.trim().replace(" ", "T");
	const date = new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(texte) ? texte : `${texte}Z`);
	return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

export function parserCrtSh(json: unknown, requete: string): CertificatCT[] {
	if (!Array.isArray(json)) return [];
	const certificats: CertificatCT[] = [];
	for (const brut of json) {
		const entree = brut as EntreeCrtSh;
		const noms = String(entree.name_value ?? entree.common_name ?? "").split(/[\r\n]+/);
		const premiereVue = isoDate(entree.first_seen ?? entree.not_before);
		for (const nom of noms) {
			if (!nom.trim()) continue;
			certificats.push({
				nom: nom.trim(),
				premiereVue,
				source: "crt.sh",
				certificatId: entree.id === undefined ? null : String(entree.id),
				emetteur: entree.issuer_name ?? null,
				requete,
			});
		}
	}
	return certificats;
}

export function parserCertSpotter(json: unknown, requete: string): CertificatCT[] {
	if (!Array.isArray(json)) return [];
	const certificats: CertificatCT[] = [];
	for (const brut of json) {
		const entree = brut as EntreeCertSpotter;
		const emetteur = typeof entree.issuer === "string" ? entree.issuer : (entree.issuer?.name ?? null);
		const premiereVue = isoDate(entree.not_before);
		for (const nom of entree.dns_names ?? []) {
			if (!nom.trim()) continue;
			certificats.push({
				nom: nom.trim(),
				premiereVue,
				source: "certspotter",
				certificatId: entree.id ?? null,
				emetteur,
				requete,
			});
		}
	}
	return certificats;
}


/** Sommeil par défaut, sans callback imbriqué. */
async function sleepParDefaut(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	await promise;
}
export class ClientCT {
	private readonly fetchImpl: typeof fetch;
	private readonly dormir: (ms: number) => Promise<void>;
	private readonly maintenant: () => number;
	private readonly timeoutMs: number;
	private readonly capacite: number;
	private readonly fenetreMs: number;
	private readonly utiliserCrtSh: boolean;
	private appelsSpotter: number[] = [];

	constructor(options: OptionsClientCT = {}) {
		this.fetchImpl = options.fetchImpl ?? fetch;
		this.dormir = options.dormir ?? sleepParDefaut;
		this.maintenant = options.maintenant ?? Date.now;
		this.timeoutMs = options.timeoutMs ?? 15_000;
		this.capacite = options.capacite ?? 10;
		this.fenetreMs = options.fenetreMs ?? 60_000;
		this.utiliserCrtSh = options.utiliserCrtSh ?? true;
	}

	/** Respecte le quota glissant de Cert Spotter avant chaque appel. */
	private async attendrePlace(): Promise<void> {
		for (;;) {
			const maintenant = this.maintenant();
			this.appelsSpotter = this.appelsSpotter.filter((t) => maintenant - t < this.fenetreMs);
			if (this.appelsSpotter.length < this.capacite) {
				this.appelsSpotter.push(maintenant);
				return;
			}
			const plusAncien = this.appelsSpotter[0] ?? maintenant;
			await this.dormir(Math.max(250, plusAncien + this.fenetreMs - maintenant + 250));
		}
	}

	private async obtenir(url: string, estSpotter: boolean): Promise<ReponseBrute> {
		for (let tentative = 0; tentative < 2; tentative++) {
			if (estSpotter) await this.attendrePlace();
			const controle = new AbortController();
			const timer = setTimeout(() => controle.abort(), this.timeoutMs);
			try {
				const reponse = await this.fetchImpl(url, {
					signal: controle.signal,
					headers: { "User-Agent": "radar-cyber-ct-inventory/1.0", Accept: "application/json" },
				});
				const retryAfter = reponse.headers?.get("retry-after");
				const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : null;
				const corps = await reponse.text();
				if (reponse.status === 429 && retryAfterMs !== null && tentative === 0) {
					await this.dormir(retryAfterMs);
					continue;
				}
				return { statut: reponse.status, corps, retryAfterMs };
			} catch (erreur) {
				if (tentative === 0 && estSpotter) {
					await this.dormir(1000);
					continue;
				}
				return { statut: 0, corps: "", retryAfterMs: null };
			} finally {
				clearTimeout(timer);
			}
		}
		return { statut: 0, corps: "", retryAfterMs: null };
	}

	private async interrogerFournisseur(
		domaine: string,
		fournisseur: Fournisseur,
	): Promise<{ certificats: CertificatCT[]; tentative: Tentative }> {
		const url =
			fournisseur === "crt.sh"
				? `${CRT_URL}${encodeURIComponent(domaine)}&output=json`
				: `${SPOTTER_URL}?domain=${encodeURIComponent(domaine)}&include_subdomains=true&expand=dns_names`;
		const debut = this.maintenant();
		const reponse = await this.obtenir(url, fournisseur === "certspotter");
		const certificats: CertificatCT[] = [];
		let erreur: string | null = null;
		if (!reponse.statut || reponse.statut < 200 || reponse.statut >= 300) {
			erreur = `HTTP ${reponse.statut || "réseau"}`;
		} else {
			try {
				const json: unknown = JSON.parse(reponse.corps);
				certificats.push(
					...(fournisseur === "crt.sh"
						? parserCrtSh(json, domaine)
						: parserCertSpotter(json, domaine)),
				);
			} catch {
				erreur = "JSON invalide";
			}
		}
		return {
			certificats,
			tentative: {
				fournisseur,
				domaine,
				statut: reponse.statut || null,
				ok: erreur === null,
				erreur,
				dureeMs: Math.max(0, this.maintenant() - debut),
			},
		};
	}

	/** Interroge chaque domaine ; les variantes typo suivent le même chemin. */
	async interroger(domaines: string[]): Promise<ResultatInterrogation> {
		const certificats: CertificatCT[] = [];
		const tentatives: Tentative[] = [];
		for (const domaine of domaines) {
			if (this.utiliserCrtSh) {
				const crt = await this.interrogerFournisseur(domaine, "crt.sh");
				certificats.push(...crt.certificats);
				tentatives.push(crt.tentative);
			}
			const spotter = await this.interrogerFournisseur(domaine, "certspotter");
			certificats.push(...spotter.certificats);
			tentatives.push(spotter.tentative);
		}
		return { certificats, tentatives };
	}
}
