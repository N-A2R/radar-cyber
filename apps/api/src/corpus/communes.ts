/**
 * Corpus des sites officiels des communes de Nouvelle-Aquitaine.
 *
 * Toute la logique vérifiable est ici, sans réseau : sélection des communes,
 * lecture de la réponse Wikidata, contrôle de cohérence du contenu, forme des
 * lignes du corpus et plan d'écriture en base. Le script `scripts/corpus-communes.mts`
 * ne fait que brancher le réseau, le fichier et la base sur ces fonctions.
 *
 * Doctrine : une URL n'est retenue que si Wikidata la déclare (propriété P856
 * sur l'item portant le code INSEE) ET si le serveur répond 200 avec une page
 * qui mentionne la commune. Aucune URL n'est devinée depuis le nom.
 */
import { withTransaction } from "../db.js";
import { normalizeDomainValue } from "../match/domaine.js";
import type { ReferentielCommune, ReferentielNA } from "../referentiel/model.js";

/** Plus de 10 000 habitants : seuil strict, population manquante exclue. */
export const SEUIL_POPULATION = 10_000;
export const SOURCE_CANDIDAT = "wikidata:P856";

export type CommuneCible = {
	code: string;
	nom: string;
	departement: string;
	population: number;
	siren: string | null;
};

export type CandidatSite = { url: string; qid: string | null; source: string };

export type Tentative = { url: string; statut: number | null; issue: string | null };

export type Verification = {
	confirme: boolean;
	raison: string | null;
	statut: number | null;
	urlFinale: string | null;
	extrait: string | null;
	correspondance: "exacte" | "partielle" | null;
};

export type LigneCorpus = Omit<CommuneCible, "code"> & {
	code_insee: string;
	id: string;
	url_candidate: string;
	source_candidat: string;
	qid: string | null;
	url_finale: string | null;
	statut_http: number | null;
	confirme: boolean;
	raison: string | null;
	preuve: string | null;
	correspondance: "exacte" | "partielle" | null;
	tentatives: Tentative[];
	verifie_le: string;
};

export type MiseAJour = { code: string; siren: string | null; website: string; domain: string | null };

/** Communes actuelles (pas les communes déléguées) dont la population dépasse le seuil. */
export function communesCibles(ref: ReferentielNA, seuil = SEUIL_POPULATION): CommuneCible[] {
	const cibles: CommuneCible[] = [];
	for (const c of ref.communes) {
		if (c.type !== "commune-actuelle" || c.population === null || c.population <= seuil) continue;
		cibles.push({
			code: c.code,
			nom: c.nom,
			departement: c.departement,
			population: c.population,
			siren: c.siren,
		});
	}
	return cibles.sort((a, b) => a.code.localeCompare(b.code));
}

/** Garde de forme sur une réponse SPARQL : jamais de cast sur une entrée externe. */
export function estReponseSparql(payload: unknown): payload is {
	results: { bindings: Array<Record<string, { value?: unknown } | undefined>> };
} {
	if (payload === null || typeof payload !== "object" || !("results" in payload)) return false;
	const results = payload.results;
	if (results === null || typeof results !== "object" || !("bindings" in results)) return false;
	return Array.isArray(results.bindings);
}

/** Réponse SPARQL Wikidata : un code INSEE peut porter plusieurs items et plusieurs P856. */
export function candidatsDepuisWikidata(payload: unknown): Map<string, CandidatSite[]> {
	const parCode = new Map<string, CandidatSite[]>();
	if (!estReponseSparql(payload)) return parCode;
	const bindings = payload.results.bindings;
	for (const raw of bindings) {
		const b = raw as Record<string, { value?: unknown } | undefined>;
		const code = String(b.insee?.value ?? "");
		const url = String(b.site?.value ?? "");
		if (!/^\d{5}$/.test(code) || !/^https?:\/\//i.test(url)) continue;
		let valide = true;
		try {
			const parsed = new URL(url);
			valide = parsed.protocol === "http:" || parsed.protocol === "https:";
		} catch {
			valide = false;
		}
		if (!valide) continue;
		const qidValue = String(b.item?.value ?? "");
		const qid = /Q\d+$/.test(qidValue) ? qidValue.match(/Q\d+$/)![0] : null;
		const liste = parCode.get(code) ?? [];
		if (!liste.some((c) => c.url === url)) liste.push({ url, qid, source: SOURCE_CANDIDAT });
		parCode.set(code, liste);
	}
	return parCode;
}

/**
 * Ordre de tentative : HTTPS d'abord, puis un hôte qui porte le nom de la
 * commune, puis l'URL la plus courte. Cela écarte les anciens sites d'une
 * commune fusionnée quand Wikidata conserve plusieurs P856.
 */
export function trierCandidats(candidats: CandidatSite[], nom: string): CandidatSite[] {
	const nomNorm = normaliser(nom);
	return [...candidats].sort((a, b) => {
		const score = (c: CandidatSite) => {
			let s = 0;
			try {
				const hote = normaliser(new URL(c.url).hostname);
				if (c.url.startsWith("https:")) s += 4;
				if (hote.includes(nomNorm) || (nomNorm.length >= 5 && hote.includes(nomNorm.split(" ")[0]!))) s += 2;
			} catch {
				/* URL déjà filtrée en amont */
			}
			return s * 1000 - c.url.length;
		};
		return score(b) - score(a) || a.url.localeCompare(b.url);
	});
}

/** Comparaison sans accents, ni casse, ni ponctuation. */
export function normaliser(texte: string): string {
	return texte
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

const MOTS_GENERIQUES: Record<string, true> = {
	saint: true, sainte: true, ville: true, mairie: true, commune: true,
	district: true, arrondissement: true, les: true, des: true, le: true,
	la: true, de: true, du: true, sur: true, sous: true, en: true,
	et: true, au: true, aux: true,
};
const MARQUEUR_INSTITUTIONNEL = /\b(ville|mairie|commune|site officiel|conseil municipal|hotel de ville)\b/;

function extrait(texte: string, index: number): string {
	return texte.slice(Math.max(0, index - 40), index + 90).trim();
}

/**
 * Cohérence : mention exacte du nom, ou — pour les noms composés — un mot
 * distinctif accompagné d'un marqueur institutionnel (« site officiel de la
 * ville de Brive » pour Brive-la-Gaillarde). Un simple domaine ressemblant au
 * nom ne suffit pas : c'est le contenu rendu qui fait preuve.
 */
export function verifierCoherence(html: string, nom: string): {
	coherent: boolean;
	extrait: string | null;
	correspondance: "exacte" | "partielle" | null;
} {
	const texte = normaliser(html);
	const nomNorm = normaliser(nom);
	const exacte = texte.indexOf(nomNorm);
	if (nomNorm && exacte >= 0) {
		return { coherent: true, extrait: extrait(texte, exacte), correspondance: "exacte" };
	}
	if (MARQUEUR_INSTITUTIONNEL.test(texte)) {
		for (const mot of nomNorm.split(" ")) {
			if (mot.length < 4 || MOTS_GENERIQUES[mot]) continue;
			const partielle = texte.indexOf(mot);
			if (partielle >= 0) {
				return { coherent: true, extrait: extrait(texte, partielle), correspondance: "partielle" };
			}
		}
	}
	return { coherent: false, extrait: null, correspondance: null };
}

/** Hôtes qui hébergent une page sur une commune, pas le site de la commune. */
const HOTES_NON_OFFICIELS: Record<string, true> = {
	"facebook.com": true, "instagram.com": true, "twitter.com": true, "x.com": true,
	"linkedin.com": true, "youtube.com": true, "wikipedia.org": true, "wikidata.org": true,
	"annuaire-mairie.fr": true, "pagesjaunes.fr": true, "google.com": true,
	"google.fr": true, "over-blog.com": true, "wixsite.com": true,
};

export function evaluerReponse(entree: {
	statut: number;
	urlFinale: string;
	html: string;
	nom: string;
}): Verification {
	const base: Verification = {
		confirme: false,
		raison: null,
		statut: entree.statut,
		urlFinale: entree.urlFinale,
		extrait: null,
		correspondance: null,
	};
	if (entree.statut !== 200) return { ...base, raison: `HTTP ${entree.statut}` };
	let hote = "";
	try {
		hote = new URL(entree.urlFinale).hostname.toLowerCase();
	} catch {
		return { ...base, raison: "URL finale illisible" };
	}
	const domaine = hote.replace(/^www\./, "");
	const nonOfficiel = Object.keys(HOTES_NON_OFFICIELS).some(
		(h) => domaine === h || domaine.endsWith(`.${h}`),
	);
	if (nonOfficiel) {
		return { ...base, raison: `redirection vers ${domaine} (hôte non officiel)` };
	}
	const coherence = verifierCoherence(entree.html, entree.nom);
	if (!coherence.coherent) return { ...base, raison: "page 200 sans mention de la commune" };
	return {
		...base,
		confirme: true,
		extrait: coherence.extrait,
		correspondance: coherence.correspondance,
	};
}

export function ligneCorpus(
	commune: CommuneCible,
	candidat: CandidatSite | null,
	verification: Verification,
	tentatives: Tentative[],
	verifieLe: string,
): LigneCorpus {
	const { code, ...communeSansCode } = commune;
	return {
		id: `na-commune-${code}`,
		code_insee: code,
		...communeSansCode,
		url_candidate: candidat?.url ?? "",
		source_candidat: candidat?.source ?? "aucune",
		qid: candidat?.qid ?? null,
		url_finale: verification.urlFinale,
		statut_http: verification.statut,
		confirme: verification.confirme,
		raison: verification.raison,
		preuve: verification.extrait,
		correspondance: verification.correspondance,
		tentatives,
		verifie_le: verifieLe,
	};
}

/** Seules les communes confirmées alimentent la base, avec un domaine issu de l'URL vérifiée. */
export function planApplication(lignes: LigneCorpus[]): MiseAJour[] {
	return lignes
		.filter((l) => l.confirme)
		.map((l) => {
			const website = l.url_finale ?? l.url_candidate;
			return {
				code: l.code_insee,
				siren: l.siren,
				website,
				domain: normalizeDomainValue(website),
			};
		})
		.filter((m) => m.domain !== null);
}

/**
 * Écrit website/domain sur les organisations du référentiel déjà en base.
 * Les deux champs sont écrits ensemble, uniquement si les deux sont vides :
 * remplir le domaine alors qu'un site différent est déjà saisi créerait une
 * paire incohérente. Ce corpus complète, il ne corrige pas une saisie humaine.
 */
export async function appliquerPlan(plan: MiseAJour[]): Promise<{ organisations: number }> {
	return withTransaction(async (client) => {
		let organisations = 0;
		for (const m of plan) {
			const res = await client.query(
				`UPDATE org SET website = $1, domain = $2
				 WHERE kind = 'collectivite' AND entity_code = $3
				   AND ($4::text IS NULL OR siren = $4)
				   AND (website IS NULL OR btrim(website) = '')
				   AND (domain IS NULL OR btrim(domain) = '')`,
				[m.website, m.domain, m.code, m.siren],
			);
			organisations += res.rowCount ?? 0;
		}
		return { organisations };
	});
}
