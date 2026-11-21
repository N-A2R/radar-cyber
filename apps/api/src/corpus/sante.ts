/**
 * Extension du corpus santé/enseignement de Nouvelle-Aquitaine.
 *
 * Toute la logique vérifiable est ici, sans réseau : lecture des réponses de
 * l'annuaire public Santé.fr, sélection des établissements, contrôle de
 * cohérence des pages et forme des lignes du corpus. Le script
 * `scripts/corpus-sante-extension.mts` ne fait que brancher le réseau et le
 * fichier sur ces fonctions.
 *
 * Doctrine : une fiche n'est retenue que si Santé.fr la publie (URL d'origine)
 * ET si le serveur répond 200 avec une page qui mentionne l'établissement.
 * Aucun site n'est deviné, aucune donnée personnelle n'est stockée.
 */

export const DEPARTEMENTS_NA = [
	"Charente",
	"Charente-Maritime",
	"Corrèze",
	"Creuse",
	"Deux-Sèvres",
	"Dordogne",
	"Gironde",
	"Haute-Vienne",
	"Landes",
	"Lot-et-Garonne",
	"Pyrénées-Atlantiques",
	"Vienne",
] as const;

export const TERMES_SANTE = [
	"hôpital",
	"centre hospitalier",
	"clinique",
	"EHPAD",
	"polyclinique",
	"maison de retraite",
] as const;

export type TypeEtablissementSante = "chu" | "ch" | "clinique" | "ehpad";

export type CandidatSante = {
	nom: string;
	commune: string;
	departement: string;
	url: string;
	types: string[];
	nid: number | null;
};

export type VerificationSante = {
	confirme: boolean;
	raison: string | null;
	statut: number | null;
	urlFinale: string | null;
	jetonsTrouves: string[];
	extrait: string | null;
};

const GENERIQUES = new Set(
	`de des du de la le les la un une et au aux sur dans par pour en via avec dont ce cette ces
	son ses leur leurs qui que quoi ou mais car si ne pas plus moins
	centre service services direction office agence etablissement etablissements
	etablissement d hebergement pour personnes agees dependantes hospitalier
	hospitaliere hopital hopitaux clinique polyclinique maison retraite
	nouvelle aquitaine france sante sante fr recherche trouver annuaire`
		.trim()
		.split(/\s+/),
);

export function normaliserSante(texte: string): string {
	return texte
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Les villes de l'annuaire portent souvent un suffixe « cedex » ou un code. */
export function nettoyerCommune(ville: string): string {
	return ville
		.replace(/[\u2019']/g, " ")
		.replace(/\bcedex\b.*$/i, "")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Types publics de l'annuaire → types du corpus. Les centres de jour, CMP et
 * autres services ne sont pas des établissements au sens de la mission.
 */
export function typeSante(types: string[], nom: string): TypeEtablissementSante | null {
	const t = normaliserSante(types.join(" "));
	const n = normaliserSante(nom);
	if (/hebergement pour personnes agees dependantes|\behpad\b/.test(t) || /\behpad\b/.test(n)) return "ehpad";
	if (/centre hospitalier universitaire|\bchu\b/.test(`${t} ${n}`)) return "chu";
	// « Hôpitaux & cliniques » est une catégorie générique : le nom tranche.
	if (/clinique|soins pluridisciplinaire|sante prive/.test(n)
		|| /soins pluridisciplinaire|sante prive/.test(t)) return "clinique";
	if (/centre hospitalier|\bhospitalier\b|\bhopital\b|\bhopitaux\b/.test(`${t} ${n}`)) return "ch";
	return null;
}

const SERVICE_PREFIX =
	/^(foyer|hopital de jour|hop jour|hdj|antenne|ssr|services psychiatriques|cmp|atelier|consultation|accueil de jour|centre medico psychologique|equipe mobile)/;

/** Écarte les services internes : un « foyer » n'est pas un établissement. */
export function estEtablissementSante(candidat: CandidatSante): boolean {
	const n = normaliserSante(candidat.nom);
	if (SERVICE_PREFIX.test(n)) return false;
	const t = normaliserSante(candidat.types.join(" "));
	if (/hebergement pour personnes agees dependantes|\behpad\b|maison de retraite/.test(`${t} ${n}`)) return true;
	return /centre hospitalier|\bchu\b|\bhopital\b|\bhopitaux\b|\bhospitalier\b|clinique|polyclinique|centre de sante/.test(n);
}

function chaine(tableau: unknown): string | null {
	if (!Array.isArray(tableau)) return null;
	const valeur = tableau.find((v): v is string => typeof v === "string" && v.trim().length > 0);
	return valeur ? valeur.trim() : null;
}

/** Garde de forme sur une réponse externe : jamais de cast non vérifié. */
export function extraireCandidatsSante(payload: unknown, departement: string): CandidatSante[] {
	if (payload === null || typeof payload !== "object" || !("datas" in payload)) return [];
	const datas = payload.datas;
	if (datas === null || typeof datas !== "object" || !("grouped" in datas)) return [];
	const grouped = datas.grouped;
	if (grouped === null || typeof grouped !== "object" || !("ss_field_custom_group" in grouped)) return [];
	const groupe = grouped.ss_field_custom_group;
	if (groupe === null || typeof groupe !== "object" || !("groups" in groupe) || !Array.isArray(groupe.groups)) return [];

	const candidats: CandidatSante[] = [];
	const vus = new Set<string>();
	for (const g of groupe.groups) {
		if (g === null || typeof g !== "object" || !("doclist" in g)) continue;
		const doclist = g.doclist;
		if (doclist === null || typeof doclist !== "object" || !("docs" in doclist) || !Array.isArray(doclist.docs)) continue;
		for (const doc of doclist.docs) {
			if (doc === null || typeof doc !== "object" || doc.ss_type !== "health_institution") continue;
			const nom = chaine(doc.tm_X3b_und_title);
			const ville = chaine(doc.tm_X3b_und_field_ville);
			const alias = typeof doc.ss_field_node_path_alias === "string" ? doc.ss_field_node_path_alias : "";
			if (!nom || !ville || !alias.startsWith("/")) continue;
			const url = `https://www.sante.fr${alias}`;
			const cle = `${normaliserSante(nom)}|${normaliserSante(ville)}`;
			if (vus.has(cle) || candidats.some((c) => c.url === url)) continue;
			vus.add(cle);
			const types = Array.isArray(doc.tm_X3b_und_establishment_type_names)
				? doc.tm_X3b_und_establishment_type_names.filter((t: unknown): t is string => typeof t === "string")
				: [];
			candidats.push({
				nom,
				commune: nettoyerCommune(ville),
				departement,
				url,
				types,
				nid: typeof doc.its_nid === "number" ? doc.its_nid : null,
			});
		}
	}
	return candidats;
}

/** Écarte ce qui figure déjà dans le corpus, par identité et par URL. */
export function nouveauxCandidats(
	candidats: CandidatSante[],
	existants: Array<{ nom: string; url: string }>,
): CandidatSante[] {
	const noms = new Set(existants.map((e) => normaliserSante(e.nom)));
	const urls = new Set(existants.map((e) => e.url.replace(/\/+$/, "").toLowerCase()));
	const nouveaux: CandidatSante[] = [];
	for (const c of candidats) {
		const nom = normaliserSante(c.nom);
		const url = c.url.replace(/\/+$/, "").toLowerCase();
		if (noms.has(nom) || urls.has(url)) continue;
		noms.add(nom);
		urls.add(url);
		nouveaux.push(c);
	}
	return nouveaux;
}

export function jetonsSante(nom: string): string[] {
	return [...new Set(
		normaliserSante(nom)
			.split(" ")
			.filter((j) => j.length >= 3 && !GENERIQUES.has(j) && !/^\d+$/.test(j)),
	)];
}

/**
 * Page exploitable : HTTP 200, texte visible substantiel, et au moins deux
 * jetons distincts du nom (ou un seul jeton long quand le nom n'en a qu'un).
 */
export function evaluerPageSante(
	html: string,
	statut: number | null,
	urlFinale: string | null,
	nom: string,
): VerificationSante {
	const base = { statut, urlFinale, jetonsTrouves: [], extrait: null };
	if (statut !== 200) return { ...base, confirme: false, raison: `HTTP ${statut ?? "réseau"}` };
	const texte = normaliserSante(
		html
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
			.replace(/<!--[\s\S]*?-->/g, " ")
			.replace(/<[^>]+>/g, " "),
	);
	if (texte.length < 100) return { ...base, confirme: false, raison: "page sans texte exploitable" };
	const attendus = jetonsSante(nom);
	const trouves = attendus.filter((j) => ` ${texte} `.includes(` ${j} `));
	const seuil = attendus.length === 1 ? 1 : 2;
	if (trouves.length < seuil) {
		return { ...base, confirme: false, raison: `jetons ${trouves.join(",") || "aucun"}/${attendus.join(",")}` };
	}
	const pos = texte.indexOf(trouves[0]!);
	return {
		...base,
		confirme: true,
		raison: null,
		jetonsTrouves: trouves,
		extrait: texte.slice(Math.max(0, pos - 80), pos + 160),
	};
}

export function ligneCorpusSante(
	candidat: CandidatSante,
	type: TypeEtablissementSante,
	id: string,
	verification: VerificationSante,
	date: string,
): Record<string, unknown> {
	return {
		id,
		nom: candidat.nom,
		organisation: candidat.nom,
		type,
		commune: candidat.commune,
		département: candidat.departement,
		url: candidat.url,
		siren: "",
		source: "sante.fr fiche établissement",
		verifie_le: date,
		statut_http: verification.statut,
		url_finale: verification.urlFinale,
		jetons_trouves: verification.jetonsTrouves,
		extrait: verification.extrait,
	};
}

/** URL de l'API publique utilisée par le moteur de recherche de Santé.fr. */
export function urlRechercheSante(terme: string, departement: string, page = 1): string {
	const params = new URLSearchParams({
		what: terme,
		where: departement,
		index: "health_offer",
		page: String(page),
		etb: "treat",
		rand_id: "17952943235011598",
	});
	return `https://www.sante.fr/solr/request/ajax/?${params.toString()}`;
}
