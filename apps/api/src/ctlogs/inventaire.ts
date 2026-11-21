/**
 * Inventaire des sous-domaines de Nouvelle-Aquitaine vus dans les CT logs.
 *
 * Toute la logique vérifiable est ici, sans réseau : construction de la liste
 * de domaines à interroger, déduplication des noms vus dans les certificats et
 * détection des noms qui imitent une organisation connue. Le client HTTP et le
 * script `scripts/inventaire-ctlogs.mts` ne font que brancher le réseau, le
 * fichier et la base sur ces fonctions.
 *
 * Doctrine : un sous-domaine n'est inventorié que s'il apparaît explicitement
 * dans un certificat (les `*.` seuls ne sont pas des noms réels), avec le
 * fournisseur et la date de première vue renvoyés par le CT log.
 */
import { domaineRacine } from "../match/domaine.js";

export type Fournisseur = "crt.sh" | "certspotter";

export type Cible = {
	domaine: string;
	organisation: string;
	source: string;
	departement?: string | null;
};

export type CertificatCT = {
	/** Nom DNS complet, tel que publié dans le certificat. */
	nom: string;
	/** crt.sh `first_seen` ou, à défaut, Cert Spotter `not_before`. */
	premiereVue: string;
	source: Fournisseur;
	certificatId: string | null;
	emetteur: string | null;
	/** Domaine interrogé qui a fait remonter ce certificat. */
	requete: string;
};

/** Hôtes agrégateurs ou non institutionnels présents dans les corpus NA. */
const HOTES_EXCLUS: Record<string, true> = {
	"wikipedia.org": true, "sante.fr": true, "service-public.fr": true, "gouv.fr": true,
	"france.fr": true, "youtube.com": true, "facebook.com": true, "instagram.com": true,
	"linkedin.com": true, "twitter.com": true, "x.com": true, "google.com": true,
	"bing.com": true, "wixsite.com": true, "wordpress.com": true, "blogspot.com": true,
	"mailchimp.com": true, "changes.fr": true,
};

const DEPARTEMENTS_NA: Record<string, true> = {
	"16": true, "17": true, "19": true, "23": true, "24": true, "33": true,
	"40": true, "47": true, "64": true, "79": true, "86": true, "87": true,
};

export type Suspect = {
	domaine: string;
	organisation_cible: string;
	distance: number;
	motif: string;
	premiere_vue: string;
	source: Fournisseur;
	certificat_id: string | null;
	sous_domaines_observes: number;
};

export type Tentative = {
	fournisseur: Fournisseur;
	domaine: string;
	statut: number | null;
	ok: boolean;
	erreur: string | null;
	dureeMs: number;
};

export type SousDomaineInventaire = {
	sous_domaine: string;
	domaine: string;
	organisation: string;
	source: Fournisseur;
	premiere_vue: string;
	certificat_id: string | null;
	emetteur: string | null;
};

const HOTE_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const JOUR_MS = 86_400_000;

export type LigneSite = {
	nom?: string;
	organisation?: string;
	url?: string;
	url_finale?: string;
	confirme?: boolean;
	departement?: string;
	source?: string;
	source_candidat?: string;
	population?: number;
	type?: string;
};

/** Domaine enregistrable d'une URL ou d'un nom DNS, sans `www.`. */
export function racine(value: string | null | undefined): string | null {
	if (!value) return null;
	const domaine = domaineRacine(value);
	return domaine && HOTE_RE.test(domaine) && HOTES_EXCLUS[domaine] !== true ? domaine : null;
}

/**
 * Domaines officiels des corpus versionnés (communes vérifiées, santé,
 * enseignement, institutions). Une ligne non confirmée est écartée quand le
 * corpus porte explicitement un champ `confirme`.
 */
export function ciblesDepuisCorpus(lignes: Iterable<LigneSite>, source: string): Cible[] {
	const cibles = new Map<string, Cible>();
	for (const ligne of lignes) {
		if (ligne.confirme === false) continue;
		const domaine = racine(ligne.url_finale ?? ligne.url ?? null);
		if (!domaine) continue;
		if (cibles.has(domaine)) continue;
		cibles.set(domaine, {
			domaine,
			organisation: ligne.organisation ?? ligne.nom ?? domaine,
			source,
			departement: ligne.departement ?? null,
		});
	}
	return [...cibles.values()].sort((a, b) => a.domaine.localeCompare(b.domaine));
}

/** Domaines du référentiel dont le siège est en Nouvelle-Aquitaine. */
export function ciblesDepuisOrg(
	rows: Iterable<{ name: string; domain: string | null; dept?: string | null }>,
): Cible[] {
	const cibles = new Map<string, Cible>();
	for (const row of rows) {
		if (!row.dept || DEPARTEMENTS_NA[row.dept.trim()] !== true) continue;
		const domaine = racine(row.domain);
		if (!domaine || cibles.has(domaine)) continue;
		cibles.set(domaine, {
			domaine,
			organisation: row.name,
			source: "org:referentiel",
			departement: row.dept,
		});
	}
	return [...cibles.values()].sort((a, b) => a.domaine.localeCompare(b.domaine));
}

/** Fusion de plusieurs listes, en gardant la première occurrence de chaque domaine. */
export function fusionnerCibles(...listes: Cible[][]): Cible[] {
	const cibles = new Map<string, Cible>();
	for (const liste of listes) {
		for (const cible of liste) {
			if (!cibles.has(cible.domaine)) cibles.set(cible.domaine, cible);
		}
	}
	return [...cibles.values()].sort((a, b) => a.domaine.localeCompare(b.domaine));
}

/** Nom DNS nu : casse, point final, `*.`, schéma et port retirés ; `www.` conservé. */
function nettoyerNom(valeur: string): string {
	let nom = valeur.trim().toLowerCase().replace(/^https?:\/\//, "");
	nom = nom.split(/[/?#:]/, 1)[0] ?? "";
	nom = nom.replace(/^\*+\./, "").replace(/\.+$/, "");
	return HOTE_RE.test(nom) ? nom : "";
}

function dateMs(valeur: string): number {
	const ms = Date.parse(valeur);
	return Number.isFinite(ms) ? ms : 0;
}

/**
 * Sous-domaines explicitement attestés par un certificat, dédupliqués par nom.
 * Les SAN étrangers à la liste de cibles sont ignorés : Cert Spotter renvoie
 * aussi les autres noms des certificats partagés. En cas de doublon, la date
 * de première vue la plus ancienne est conservée.
 */
export function extraireSousDomaines(certs: CertificatCT[], cibles: Cible[]): SousDomaineInventaire[] {
	const parDomaine = new Map<string, Cible>();
	for (const cible of cibles) {
		const domaine = racine(cible.domaine) ?? cible.domaine;
		if (!parDomaine.has(domaine)) parDomaine.set(domaine, cible);
	}
	const trouvees = new Map<string, SousDomaineInventaire>();
	for (const cert of certs) {
		if (cert.nom.startsWith("*.")) continue;
		const nom = nettoyerNom(cert.nom);
		if (!nom) continue;
		let meilleur: Cible | null = null;
		for (const domaine of parDomaine.keys()) {
			if (nom === domaine || !nom.endsWith(`.${domaine}`)) continue;
			if (!meilleur || domaine.length > racine(meilleur.domaine)!.length) meilleur = parDomaine.get(domaine)!;
		}
		if (!meilleur) continue;
		const precedent = trouvees.get(nom);
		if (precedent && dateMs(precedent.premiere_vue) <= dateMs(cert.premiereVue)) continue;
		trouvees.set(nom, {
			sous_domaine: nom,
			domaine: racine(meilleur.domaine) ?? meilleur.domaine,
			organisation: meilleur.organisation,
			source: cert.source,
			premiere_vue: cert.premiereVue,
			certificat_id: cert.certificatId,
			emetteur: cert.emetteur,
		});
	}
	return [...trouvees.values()].sort((a, b) => a.sous_domaine.localeCompare(b.sous_domaine));
}

/** Distance d'édition de Levenshtein (substitution, insertion, suppression). */
export function distanceEdition(a: string, b: string): number {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;
	let precedente = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const courante = [i];
		for (let j = 1; j <= b.length; j++) {
			courante[j] = Math.min(
				(courante[j - 1] ?? 0) + 1,
				(precedente[j] ?? 0) + 1,
				(precedente[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
		precedente = courante;
	}
	return precedente[b.length] ?? 0;
}

/**
 * Noms qui imitent une organisation connue : même suffixe, étiquette proche
 * (distance 1 ou 2) et certificat récent. Une correspondance ambiguë (deux
 * organisations connues à égale distance) n'est pas attribuée.
 */
export function detecterSuspects(
	certs: CertificatCT[],
	cibles: Cible[],
	dateCollecte: string,
	joursRecents = 180,
): Suspect[] {
	const connues = new Map<string, { label: string; organisation: string }[]>();
	for (const cible of cibles) {
		const domaine = racine(cible.domaine);
		if (!domaine) continue;
		const parties = domaine.split(".");
		const label = parties.shift();
		if (!label || label.length < 6) continue;
		const suffixe = parties.join(".");
		const liste = connues.get(suffixe) ?? [];
		liste.push({ label, organisation: cible.organisation });
		connues.set(suffixe, liste);
	}
	const depuis = dateMs(dateCollecte) - joursRecents * JOUR_MS;
	const jusquau = dateMs(dateCollecte) + JOUR_MS;
	const suspects = new Map<string, Suspect>();
	for (const cert of certs) {
		const vue = dateMs(cert.premiereVue);
		if (vue < depuis || vue > jusquau) continue;
		const nom = nettoyerNom(cert.nom.replace(/^\*\./, ""));
		const domaine = racine(nom);
		if (!domaine) continue;
		const parties = domaine.split(".");
		const label = parties.shift();
		if (!label || label.length < 6) continue;
		const candidates = connues.get(parties.join(".")) ?? [];
		if (candidates.some((c) => c.label === label)) continue;
		let meilleur: { distance: number; organisation: string } | null = null;
		let ambiguous = false;
		for (const candidate of candidates) {
			const distance = distanceEdition(label, candidate.label);
			if (distance < 1 || distance > 2) continue;
			if (distance === 2 && label.length < 8) continue;
			if (!meilleur || distance < meilleur.distance) {
				meilleur = { distance, organisation: candidate.organisation };
				ambiguous = false;
			} else if (distance === meilleur.distance && meilleur.organisation !== candidate.organisation) {
				ambiguous = true;
			}
		}
		if (!meilleur || ambiguous) continue;
		const cle = `${domaine}:${cert.certificatId ?? cert.source}`;
		const precedent = suspects.get(cle);
		if (precedent && dateMs(precedent.premiere_vue) <= vue) continue;
		suspects.set(cle, {
			domaine,
			organisation_cible: meilleur.organisation,
			distance: meilleur.distance,
			motif: `lookalike-distance-${meilleur.distance}-recent`,
			premiere_vue: cert.premiereVue,
			source: cert.source,
			certificat_id: cert.certificatId,
			sous_domaines_observes: 0,
		});
	}
	return [...suspects.values()].sort((a, b) => a.domaine.localeCompare(b.domaine));
}

/**
 * Variantes à un caractère d'un domaine connu, pour interroger les CT logs
 * sur des noms qui n'apparaissent pas dans les certificats des cibles. Les
 * suppressions en fin d'étiquette sont essayées en premier (`u-bordeaux.fr`
 * donne `u-bordeau.fr`).
 */
export function variantesTypo(domaine: string, limite = 4): string[] {
	const racineDomaine = racine(domaine);
	if (!racineDomaine) return [];
	const parties = racineDomaine.split(".");
	const label = parties[0]!;
	const suffixe = parties.slice(1).join(".");
	if (label.length < 6) return [];
	const variantes: string[] = [];
	const ajouter = (candidat: string): void => {
		if (candidat === label || candidat.length < 6) return;
		const complet = `${candidat}.${suffixe}`;
		if (HOTE_RE.test(complet) && !variantes.includes(complet)) variantes.push(complet);
	};
	for (let i = label.length - 1; i >= 0; i--) ajouter(label.slice(0, i) + label.slice(i + 1));
	for (let i = 0; i < label.length - 1; i++) {
		ajouter(label.slice(0, i) + label[i + 1] + label[i] + label.slice(i + 2));
	}
	return variantes.slice(0, limite);
}

/** Taux d'échec des appels CT, tous fournisseurs confondus. */
export function tauxEchec(tentatives: Tentative[]): { total: number; echecs: number; taux: number } {
	const echecs = tentatives.filter((t) => !t.ok).length;
	return { total: tentatives.length, echecs, taux: tentatives.length === 0 ? 0 : echecs / tentatives.length };
}
