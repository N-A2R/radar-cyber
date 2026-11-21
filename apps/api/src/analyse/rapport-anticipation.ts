/**
 * Rapport d'anticipation — rendu déterministe de l'état du radar à J-21.
 *
 * Ce module est pur : il prend le corpus de référence et l'instantané JSONL
 * (produits et versionnés séparément), vérifie leur cohérence, cherche dans
 * chaque fenêtre ce qui aurait pu annoncer l'incident, puis rend le Markdown.
 * Aucune base, aucun réseau, aucune date murale : le document est reproductible
 * octet pour octet, ce qui est la seule façon de publier un « rien » crédible.
 *
 * Un signal n'est retenu que s'il désigne l'entité : mention nominative,
 * indicateur technique ou revendication recoupée, rattachement d'organisation
 * confirmé par le titre. Un rattachement obtenu par simple similarité de nom
 * est un bruit, jamais un signal. Les cas non calculables sont documentés
 * plutôt que comptés pour zéro.
 */

import { resumerAnticipation, type NatureSignal, type ResumeAnticipation } from "./anticipation.js";

export const JOURS_AVANCE = 21;
const JOUR_MS = 86_400_000;
const LONGUEUR_TITRE_SNAPSHOT = 200;

/** Mots qui ne désignent personne : les retirer évite les « signaux » fantômes. */
const STOPWORDS: Record<string, true> = {
	association: true, cabinet: true, centre: true, commune: true, compagnie: true, departement: true,
	direction: true, dont: true, du: true, des: true, dans: true, les: true, la: true, le: true,
	de: true, d: true, et: true, en: true, etablissement: true, federation: true, groupe: true,
	hopital: true, mairie: true, office: true, sarl: true, sas: true, service: true, societe: true,
	sous: true, sur: true, union: true, ville: true, syndicat: true, region: true, inter: true,
};

/** Termes trop génériques pour prouver quoi que ce soit à eux seuls. */
const COLLISIONS_GENERIQUES: Record<string, true> = {
	police: true, service: true, office: true, source: true, partie: true, son: true, sante: true,
	information: true, presse: true, national: true, francaise: true, francais: true,
	municipal: true, municipale: true, nouvelle: true, aquitaine: true, cyber: true,
	cyberattaque: true, donnees: true, personnelles: true,
};

const ASSERTIONS_CONNUES: Record<string, true> = {
	ambient_signal: true, confirmed_incident: true, technical_indicator: true, third_party_claim: true,
};

export type IncidentCorpus = {
	id: string;
	entite: string;
	entiteType?: string | null;
	departement?: string | null;
	commune?: string | null;
	codeCommune?: string | null;
	dateIncident?: string | null;
	datePublique?: string | null;
	type?: string | null;
	resume?: string | null;
};

export type EvenementInstantane = {
	id: string | number;
	family: string;
	assertion_type: string;
	titre: string;
	valid_at: string;
	source_id: string;
	org_id: number | null;
};

export type SourceInstantane = {
	id: string;
	name?: string | null;
	family?: string | null;
	evenements_fenetre?: number;
};

export type OrganisationInstantane = {
	id: number;
	name: string;
	evenements_fenetre?: number;
};

export type Instantane = {
	incident: { id: string; entite: string; dateReference: string; typeReference: string };
	j21: string;
	fenetre: { debut: string; fin: string; jours: number };
	comptes: {
		evenements_avant_j21: number;
		evenements_fenetre: number;
		sources_actives: number;
		organisations_citees: number;
	};
	evenements: EvenementInstantane[];
	sources_actives: SourceInstantane[];
	organisations_citees: OrganisationInstantane[];
};

export type CodeErreur =
	| "CORPUS_INVALIDE"
	| "LIGNE_INVALIDE"
	| "INCIDENT_INCONNU"
	| "INCIDENT_DUPLIQUE"
	| "INSTANTANE_MANQUANT"
	| "DATE_MANQUANTE"
	| "DATE_INVALIDE"
	| "FENETRE_INVALIDE";

export class ErreurRapportAnticipation extends Error {
	constructor(
		public readonly code: CodeErreur,
		message: string,
	) {
		super(message);
		this.name = "ErreurRapportAnticipation";
	}
}

export type Anomalie = {
	code: string;
	incident: string;
	message: string;
};

export type ForceSignal = "fort" | "faible" | "bruit";

export type Candidat = {
	force: ForceSignal;
	type: "mention" | "indicateur" | "revendication" | "rattachement" | "commune";
	nature: NatureSignal;
	titre: string;
	sourceId: string;
	date: string;
	avanceJours: number;
	raison: string;
};

export type Rupture = {
	detecteur: "rafale" | "changement-nature";
	date: string;
	detail: string;
};

export type Dossier = {
	incident: IncidentCorpus;
	instantane: Instantane;
	jetonsEntite: string[];
	jetonsLieu: string[];
	candidats: Candidat[];
	retenus: Candidat[];
	aExaminer: Candidat[];
	bruits: Candidat[];
	ruptures: Rupture[];
	verdict: "rien" | "candidat à examiner" | "signal";
	familles: Array<[string, number]>;
	assertions: Array<[string, number]>;
	anomalies: Anomalie[];
};

export type Resume = ResumeAnticipation;

export type StatistiquesRapport = {
	incidents: number;
	evenements: number;
	sourcesDistinctes: number;
	sourcesParIncident: [number, number];
	evenementsParIncident: [number, number];
	fenetresVides: number;
	incidentsAvecOrganisation: number;
	rattachementsBruites: number;
	incidentsAvecRupture: number;
	dateMesure: string;
};

export type Rapport = {
	markdown: string;
	dossiers: Dossier[];
	anomalies: Anomalie[];
	resume: Resume;
	stats: StatistiquesRapport;
};

// ---------------------------------------------------------------------------
// Lecture et contrôle des entrées
// ---------------------------------------------------------------------------

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
	return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function chaine(valeur: unknown): string {
	return typeof valeur === "string" ? valeur : "";
}

function nombre(valeur: unknown): number {
	return typeof valeur === "number" && Number.isFinite(valeur) ? valeur : 0;
}

/** Corpus JSON : un objet avec un tableau `incidents`. */
export function lireCorpus(texte: string): IncidentCorpus[] {
	let brut: unknown;
	try {
		brut = JSON.parse(texte);
	} catch (erreur) {
		throw new ErreurRapportAnticipation("CORPUS_INVALIDE", `corpus JSON illisible : ${String(erreur)}`);
	}
	if (!estObjet(brut) || !Array.isArray(brut.incidents)) {
		throw new ErreurRapportAnticipation(
			"CORPUS_INVALIDE",
			"le corpus doit être un objet avec une clé `incidents` (tableau)",
		);
	}
	const vus = new Set<string>();
	return brut.incidents.map((entree, index) => {
		if (!estObjet(entree) || !chaine(entree.id) || !chaine(entree.entite)) {
			throw new ErreurRapportAnticipation(
				"CORPUS_INVALIDE",
				`incident ${index + 1} : ` +
					`${estObjet(entree) ? "`id` et `entite` sont obligatoires" : "entrée non objet"}`,
			);
		}
		const id = chaine(entree.id);
		if (vus.has(id)) {
			throw new ErreurRapportAnticipation("INCIDENT_DUPLIQUE", `id d'incident dupliqué : ${id}`);
		}
		vus.add(id);
		return {
			id,
			entite: chaine(entree.entite),
			entiteType: typeof entree.entiteType === "string" ? entree.entiteType : null,
			departement: typeof entree.departement === "string" ? entree.departement : null,
			commune: typeof entree.commune === "string" ? entree.commune : null,
			codeCommune: typeof entree.codeCommune === "string" ? entree.codeCommune : null,
			dateIncident: typeof entree.dateIncident === "string" ? entree.dateIncident : null,
			datePublique: typeof entree.datePublique === "string" ? entree.datePublique : null,
			type: typeof entree.type === "string" ? entree.type : null,
			resume: typeof entree.resume === "string" ? entree.resume : null,
		};
	});
}

/** Instantané JSONL : une ligne = un incident, ou rien pour un corpus vide. */
export function lireInstantanes(texte: string): Instantane[] {
	const lignes = texte.split("\n").filter((ligne) => ligne.trim().length > 0);
	const vus = new Set<string>();
	return lignes.map((ligne, index) => {
		let brut: unknown;
		try {
			brut = JSON.parse(ligne);
		} catch (erreur) {
			throw new ErreurRapportAnticipation(
				"LIGNE_INVALIDE",
				`instantané ligne ${index + 1} : JSON illisible (${String(erreur)})`,
			);
		}
		if (!estObjet(brut) || !estObjet(brut.incident) || !estObjet(brut.fenetre) || !estObjet(brut.comptes)) {
			throw new ErreurRapportAnticipation(
				"LIGNE_INVALIDE",
				`instantané ligne ${index + 1} : clés ` +
					"`incident`, `fenetre` et `comptes` obligatoires",
			);
		}
		const id = chaine(brut.incident.id);
		if (!id) {
			throw new ErreurRapportAnticipation("LIGNE_INVALIDE", `instantané ligne ${index + 1} : id manquant`);
		}
		if (vus.has(id)) {
			throw new ErreurRapportAnticipation("INCIDENT_DUPLIQUE", `id d'instantané dupliqué : ${id}`);
		}
		vus.add(id);
		return {
			incident: {
				id,
				entite: chaine(brut.incident.entite),
				dateReference: chaine(brut.incident.dateReference),
				typeReference: chaine(brut.incident.typeReference),
			},
			j21: chaine(brut.j21),
			fenetre: {
				debut: chaine(brut.fenetre.debut),
				fin: chaine(brut.fenetre.fin),
				jours: nombre(brut.fenetre.jours),
			},
			comptes: {
				evenements_avant_j21: nombre(brut.comptes.evenements_avant_j21),
				evenements_fenetre: nombre(brut.comptes.evenements_fenetre),
				sources_actives: nombre(brut.comptes.sources_actives),
				organisations_citees: nombre(brut.comptes.organisations_citees),
			},
			evenements: Array.isArray(brut.evenements) ? (brut.evenements as EvenementInstantane[]) : [],
			sources_actives: Array.isArray(brut.sources_actives)
				? (brut.sources_actives as SourceInstantane[])
				: [],
			organisations_citees: Array.isArray(brut.organisations_citees)
				? (brut.organisations_citees as OrganisationInstantane[])
				: [],
		};
	});
}

function dateIso(valeur: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(valeur)) return null;
	const date = new Date(`${valeur.slice(0, 10)}T00:00:00.000Z`);
	return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== valeur.slice(0, 10)
		? null
		: date;
}

function joursEntre(a: string, b: string): number {
	const debut = dateIso(a);
	const fin = dateIso(b);
	return debut && fin ? Math.round((fin.getTime() - debut.getTime()) / JOUR_MS) : 0;
}

// ---------------------------------------------------------------------------
// Recherche de signaux et de ruptures
// ---------------------------------------------------------------------------

/** Jetons normalisés, sans accents ni mots-outils. */
export function extraireJetons(texte: string): string[] {
	return texte
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((jeton) => jeton.length >= 3 && !STOPWORDS[jeton]);
}

function natureDe(assertion: string): NatureSignal {
	if (assertion === "technical_indicator") return "indicateur";
	if (assertion === "third_party_claim") return "revendication";
	return "ambiance";
}

function typeDe(assertion: string): Candidat["type"] {
	if (assertion === "technical_indicator") return "indicateur";
	if (assertion === "third_party_claim") return "revendication";
	return "mention";
}

function avanceDe(instantane: Instantane, validAt: string): number {
	const jour = dateIso(validAt);
	return jour ? joursEntre(jour.toISOString(), instantane.incident.dateReference) : 0;
}

/** Un événement peut-il désigner l'entité ? Un mot générique ne suffit jamais. */
export function evaluerEvenement(
	evenement: EvenementInstantane,
	jetonsEntite: readonly string[],
	jetonsLieu: readonly string[],
	organisation: OrganisationInstantane | undefined,
	instantane: Instantane,
): Candidat {
	const titres = new Set(extraireJetons(evenement.titre));
	const mentions = jetonsEntite.filter((jeton) => titres.has(jeton));
	const lieux = jetonsLieu.filter((jeton) => titres.has(jeton));
	const nomOrg = organisation ? extraireJetons(organisation.name) : [];
	const recoupementOrg = jetonsEntite.filter((jeton) => nomOrg.includes(jeton) && !COLLISIONS_GENERIQUES[jeton]);
	const base = {
		type: typeDe(evenement.assertion_type),
		nature: natureDe(evenement.assertion_type),
		titre: evenement.titre,
		sourceId: evenement.source_id,
		date: evenement.valid_at,
		avanceJours: avanceDe(instantane, evenement.valid_at),
	};
	const estIntrinseque =
		evenement.assertion_type === "technical_indicator" || evenement.assertion_type === "third_party_claim";

	if (estIntrinseque && (mentions.length > 0 || recoupementOrg.length > 0)) {
		return {
			...base,
			force: "fort",
			raison: `${evenement.assertion_type} nommant l'entité (${[...mentions, ...recoupementOrg].join(", ")})`,
		};
	}
	if (mentions.length >= 2) {
		return {
			...base,
			force: "fort",
			raison: `mention nominative (${mentions.join(", ")})`,
		};
	}
	if (mentions.length === 1 && recoupementOrg.length > 0) {
		return {
			...base,
			force: "fort",
			raison: `mention et organisation recoupées (${mentions[0]})`,
		};
	}
	if (estIntrinseque) {
		return {
			...base,
			force: "faible",
			raison: `${evenement.assertion_type} sans cible nominative explicite`,
		};
	}
	if (mentions.length === 1 && !COLLISIONS_GENERIQUES[mentions[0] ?? ""]) {
		return {
			...base,
			force: "faible",
			raison: `un seul jeton d'entité (${mentions[0]}), à confirmer`,
		};
	}
	if (recoupementOrg.length > 0) {
		return {
			...base,
			type: "rattachement",
			force: "faible",
			raison: `nom d'organisation recoupé (${recoupementOrg.join(", ")}), sans mention dans le titre`,
		};
	}
	if (evenement.org_id !== null) {
		return {
			...base,
			type: "rattachement",
			force: "bruit",
			raison: `rattachement à « ${organisation?.name ?? evenement.org_id} » sans recoupement avec l'entité`,
		};
	}
	if (lieux.length > 0) {
		return {
			...base,
			type: "commune",
			force: "faible",
			raison: `commune seulement (${lieux.join(", ")}), sans mention de l'entité`,
		};
	}
	return { ...base, force: "bruit", raison: "aucun recoupement avec l'entité" };
}

/**
 * Détecteurs de rupture, limités à ce que l'instantané permet de voir.
 * `nouvelle-organisation` est volontairement absent : sans date de première
 * apparition, le décider reviendrait à inventer un historique.
 */
export function detecterRuptures(
	instantane: Instantane,
	evenementsLies: readonly EvenementInstantane[],
): Rupture[] {
	const ruptures: Rupture[] = [];
	const tranches = new Map<string, EvenementInstantane[]>();
	for (const evenement of evenementsLies) {
		const cle = evenement.family;
		const liste = tranches.get(cle) ?? [];
		liste.push(evenement);
		tranches.set(cle, liste);
	}
	for (const [famille, liste] of tranches) {
		const tries = [...liste].sort((a, b) => a.valid_at.localeCompare(b.valid_at));
		for (let i = 0; i < tries.length; i++) {
			const fenetre = tries.filter(
				(e) => Math.abs(joursEntre(e.valid_at, tries[i]?.valid_at ?? e.valid_at)) <= 7,
			);
			if (fenetre.length >= 3) {
				ruptures.push({
					detecteur: "rafale",
					date: fenetre[0]?.valid_at ?? instantane.j21,
					detail: `${fenetre.length} événements « ${famille} » sur 7 jours pour l'entité`,
				});
				break;
			}
		}
	}
	const familles = new Set(evenementsLies.map((e) => e.family));
	if (familles.size >= 2) {
		ruptures.push({
			detecteur: "changement-nature",
			date: evenementsLies[0]?.valid_at ?? instantane.j21,
			detail: `${familles.size} familles différentes sur l'entité : ${[...familles].sort().join(", ")}`,
		});
	}
	return ruptures;
}


function compter(valeurs: readonly string[]): Array<[string, number]> {
	const compte = new Map<string, number>();
	for (const valeur of valeurs) compte.set(valeur, (compte.get(valeur) ?? 0) + 1);
	return [...compte].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// ---------------------------------------------------------------------------
// Analyse d'un incident
// ---------------------------------------------------------------------------

export function analyserIncident(
	incident: IncidentCorpus,
	instantane: Instantane,
	anomaliesGlobales: readonly Anomalie[] = [],
): Dossier {
	const anomalies: Anomalie[] = [...anomaliesGlobales];
	const ajouter = (code: string, message: string) => anomalies.push({ code, incident: incident.id, message });

	const dateReference = incident.dateIncident ?? incident.datePublique;
	if (!dateReference) {
		throw new ErreurRapportAnticipation("DATE_MANQUANTE", `${incident.id} : aucune date exploitable`);
	}
	if (!dateIso(dateReference)) {
		throw new ErreurRapportAnticipation("DATE_INVALIDE", `${incident.id} : date de référence invalide`);
	}
	if (!dateIso(instantane.j21) || !dateIso(instantane.fenetre.debut)) {
		throw new ErreurRapportAnticipation("FENETRE_INVALIDE", `${incident.id} : J-21 ou début de fenêtre invalide`);
	}
	if (joursEntre(instantane.fenetre.debut, instantane.j21) !== JOURS_AVANCE - 1) {
		ajouter("FENETRE_INCOHERENTE", "la fenêtre ne couvre pas exactement 21 jours");
	}
	if (instantane.incident.dateReference !== dateReference) {
		ajouter("REFERENCE_INCOHERENTE", "la date de référence de l'instantané diffère du corpus");
	}
	if (instantane.comptes.evenements_fenetre !== instantane.evenements.length) {
		ajouter("COMPTE_EVENEMENTS", "le compte d'événements ne correspond pas à la liste");
	}
	if (instantane.comptes.sources_actives !== instantane.sources_actives.length) {
		ajouter("COMPTE_SOURCES", "le compte de sources ne correspond pas à la liste");
	}
	if (instantane.comptes.organisations_citees !== instantane.organisations_citees.length) {
		ajouter("COMPTE_ORGANISATIONS", "le compte d'organisations ne correspond pas à la liste");
	}
	if (!Number.isInteger(instantane.comptes.evenements_avant_j21) || instantane.comptes.evenements_avant_j21 < 0) {
		ajouter("COMPTE_AVANT", "le compte d'événements antérieurs est invalide");
	}
	if (instantane.incident.typeReference === "datePublique") {
		ajouter("DATE_PUBLIQUE", "aucune date d'incident : J-21 calculé depuis la date de publication");
	}

	const orgParId = new Map(instantane.organisations_citees.map((o) => [o.id, o]));
	const sourceIds = new Set(instantane.sources_actives.map((s) => s.id));
	for (const evenement of instantane.evenements) {
		const jour = dateIso(evenement.valid_at);
		if (!jour) ajouter("DATE_EVENEMENT", `événement ${evenement.id} : date invalide`);
		else if (jour.toISOString().slice(0, 10) < instantane.fenetre.debut ||
			jour.toISOString().slice(0, 10) > instantane.fenetre.fin) {
			ajouter("HORS_FENETRE", `événement ${evenement.id} : date hors fenêtre`);
		}
		if (!sourceIds.has(evenement.source_id)) {
			ajouter("SOURCE_INCONNUE", `événement ${evenement.id} : source absente des sources actives`);
		}
		if (evenement.org_id !== null && !orgParId.has(evenement.org_id)) {
			ajouter("ORGANISATION_INCONNUE", `événement ${evenement.id} : organisation absente de la liste`);
		}
		if (!ASSERTIONS_CONNUES[evenement.assertion_type]) {
			ajouter("ASSERTION_INCONNUE", `événement ${evenement.id} : nature « ${evenement.assertion_type} » inconnue`);
		}
		if (evenement.titre.length >= LONGUEUR_TITRE_SNAPSHOT) {
			ajouter("TITRE_TRONQUE", `événement ${evenement.id} : titre tronqué à ${LONGUEUR_TITRE_SNAPSHOT} caractères`);
		}
	}

	const jetonsEntite = extraireJetons(incident.entite);
	const jetonsLieu = extraireJetons(incident.commune ?? "");
	const candidats = instantane.evenements.map((evenement) =>
		evaluerEvenement(
			evenement,
			jetonsEntite,
			jetonsLieu,
			evenement.org_id === null ? undefined : orgParId.get(evenement.org_id),
			instantane,
		),
	);
	const retenus = candidats.filter((c) => c.force === "fort");
	const aExaminer = candidats.filter((c) => c.force === "faible");
	const bruits = candidats.filter((c) => c.force === "bruit" && c.type === "rattachement");
	const evenementsLies = instantane.evenements.filter((_, index) =>
		candidats[index]?.force !== "bruit",
	);
	const ruptures = detecterRuptures(instantane, evenementsLies);

	return {
		incident,
		instantane,
		jetonsEntite,
		jetonsLieu,
		candidats,
		retenus,
		aExaminer,
		bruits,
		ruptures,
		verdict: retenus.length > 0 ? "signal" : aExaminer.length > 0 ? "candidat à examiner" : "rien",
		familles: compter(instantane.evenements.map((e) => e.family)),
		assertions: compter(instantane.evenements.map((e) => e.assertion_type)),
		anomalies,
	};
}

// ---------------------------------------------------------------------------
// Rendu Markdown
// ---------------------------------------------------------------------------

function cellule(texte: string): string {
	return texte.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function liste(valeurs: readonly string[], max: number = 12): string {
	if (valeurs.length === 0) return "aucune";
	const extra = valeurs.length > max ? ` … (+${valeurs.length - max})` : "";
	return `${valeurs.slice(0, max).join(", ")}${extra}`;
}

function compteFamilles(dossier: Dossier): string {
	return dossier.familles.length === 0
		? "0 (fenêtre vide)"
		: dossier.familles.map(([f, n]) => `${f} ${n}`).join(" · ");
}

function compteAssertions(dossier: Dossier): string {
	return dossier.assertions.length === 0
		? "0"
		: dossier.assertions.map(([a, n]) => `${a} ${n}`).join(" · ");
}

function verdictPhrase(dossier: Dossier): string {
	if (dossier.verdict === "signal") {
		return `**signal retenu** — ${dossier.retenus.length} élément(s) antérieur(s) désignant l'entité`;
	}
	if (dossier.verdict === "candidat à examiner") {
		return `**candidat à examiner** — ${dossier.aExaminer.length} élément(s) ambigu(s), aucun recoupement suffisant`;
	}
	if (dossier.instantane.evenements.length === 0) {
		return "**rien** — fenêtre vide, aucun événement enregistré à J-21";
	}
	if (dossier.bruits.length > 0) {
		return `**rien** — ${dossier.bruits.length} rattachement(s) bruité(s) écarté(s), aucun autre recoupement`;
	}
	return "**rien** — aucun élément antérieur ne désigne l'entité";
}

function rapportVide(empreintes: { corpus: string; instantane: string }): string {
	return [
		"# Anticipation — état des données à J-21 et recherche de signes précurseurs",
		"",
		"> Document généré par `scripts/rapport-anticipation.mts`. Ne pas éditer à la main.",
		"> Corpus : aucun incident. La mesure est **vide**, pas nulle : il n'y a rien à anticiper.",
		`> Empreintes sha256 — corpus \`${empreintes.corpus}\` · instantané \`${empreintes.instantane}\`.`,
		"",
		"## Verdict",
		"",
		"0 incident examiné, 0 signal, 0 « rien » : un corpus vide ne mesure aucune capacité.",
		"",
	].join("\n");
}

export function genererRapport(entrees: {
	corpus: readonly IncidentCorpus[];
	instantanes: readonly Instantane[];
	empreintes?: { corpus: string; instantane: string };
}): Rapport {
	const empreintes = entrees.empreintes ?? { corpus: "non fournie", instantane: "non fournie" };
	if (entrees.corpus.length === 0) {
		const rapport: Rapport = {
			markdown: rapportVide(empreintes),
			dossiers: [],
			anomalies: [],
			resume: resumerAnticipation([]),
			stats: {
				incidents: 0,
				evenements: 0,
				sourcesDistinctes: 0,
				sourcesParIncident: [0, 0],
				evenementsParIncident: [0, 0],
				fenetresVides: 0,
				incidentsAvecOrganisation: 0,
				rattachementsBruites: 0,
				incidentsAvecRupture: 0,
				dateMesure: "—",
			},
		};
		return rapport;
	}

	const parId = new Map(entrees.instantanes.map((i) => [i.incident.id, i]));
	const anomaliesInitiales: Anomalie[] = [];
	const orphelins = entrees.instantanes.filter((i) => !entrees.corpus.some((c) => c.id === i.incident.id));
	for (const orphelin of orphelins) {
		anomaliesInitiales.push({
			code: "INSTANTANE_ORPHELIN",
			incident: orphelin.incident.id,
			message: "instantané sans incident correspondant dans le corpus — ignoré",
		});
	}

	const dossiers = entrees.corpus.map((incident) => {
		const instantane = parId.get(incident.id);
		if (!instantane) {
			throw new ErreurRapportAnticipation(
				"INSTANTANE_MANQUANT",
				`${incident.id} : aucun instantané J-21 dans le fichier fourni`,
			);
		}
		return analyserIncident(incident, instantane, anomaliesInitiales);
	});
	const anomalies = dossiers.flatMap((d) => d.anomalies);
	const resume = resumerAnticipation(
		dossiers.map((d) => ({
			signaux: d.retenus.map((s) => ({
				nature: s.nature,
				family: "",
				sourceId: s.sourceId,
				avanceJours: s.avanceJours,
				resume: s.titre,
			})),
		})),
	);
	const dates = entrees.corpus
		.map((c) => c.dateIncident ?? c.datePublique ?? "")
		.filter(Boolean)
		.sort();
	const sources = new Set(dossiers.flatMap((d) => d.instantane.sources_actives.map((s) => s.id)));
	const nbSources = dossiers.map((d) => d.instantane.sources_actives.length);
	const nbEvenements = dossiers.map((d) => d.instantane.evenements.length);
	const stats: StatistiquesRapport = {
		incidents: dossiers.length,
		evenements: dossiers.reduce((n, d) => n + d.instantane.evenements.length, 0),
		sourcesDistinctes: sources.size,
		sourcesParIncident: [Math.min(...nbSources), Math.max(...nbSources)],
		evenementsParIncident: [Math.min(...nbEvenements), Math.max(...nbEvenements)],
		fenetresVides: dossiers.filter((d) => d.instantane.evenements.length === 0).length,
		incidentsAvecOrganisation: dossiers.filter((d) => d.instantane.organisations_citees.length > 0).length,
		rattachementsBruites: dossiers.reduce((n, d) => n + d.bruits.length, 0),
		incidentsAvecRupture: dossiers.filter((d) => d.ruptures.length > 0).length,
		dateMesure: dates.at(-1) ?? "—",
	};

	return { markdown: rendreMarkdown(dossiers, anomalies, resume, stats, empreintes), dossiers, anomalies, resume, stats };
}

function rendreMarkdown(
	dossiers: readonly Dossier[],
	anomalies: readonly Anomalie[],
	resume: Resume,
	stats: ReturnType<typeof genererRapport>["stats"],
	empreintes: { corpus: string; instantane: string },
): string {
	const lignes: string[] = [];
	const p = (...textes: string[]) => {
		lignes.push(...textes);
		if (textes.at(-1) !== "") lignes.push("");
	};
	const avecSignal = dossiers.filter((d) => d.retenus.length > 0).length;
	const avecCandidat = dossiers.filter((d) => d.retenus.length === 0 && d.aExaminer.length > 0).length;
	const sansSignal = dossiers.length - avecSignal - avecCandidat;
	const partages = new Map<string, string[]>();
	for (const d of dossiers) {
		const cle = d.instantane.j21;
		partages.set(cle, [...(partages.get(cle) ?? []), d.incident.id]);
	}
	const groupesPartages = [...partages].filter(([, ids]) => ids.length > 1);

	p(
		"# Anticipation — état des données à J-21 et recherche de signes précurseurs",
		"> Document généré par `scripts/rapport-anticipation.mts` à partir du corpus de référence et de",
		"> l'instantané `bench/anticipation/J-21.jsonl`. **Ne pas éditer à la main** : modifier une entrée",
		"> puis relancer le script, sinon le contrôle `--verifier` échouera.",
		`> Empreintes sha256 des entrées : corpus \`${empreintes.corpus}\` · instantané \`${empreintes.instantane}\`.`,
		`> Dernière date d'incident du corpus : ${stats.dateMesure}. Aucune donnée postérieure à chaque J-21 n'entre dans l'analyse.`,
		"",
		"## 1. La question posée",
		"",
		"Pour chaque incident : **qu'est-ce qui, dans les données dont le radar disposait 21 jours avant,",
		"aurait pu l'annoncer ?** La réponse « rien » est un résultat à part entière, publié tel quel.",
		"Ce document ne mesure pas une capacité prédictive hypothétique ; il décrit un état de fait.",
		"",
		"## 2. Méthode et définitions",
		"",
		`- **Instantané** : pour chaque incident, la fenêtre [J-21 − 20 j, J-21] incluse, construite sur la`,
		`  date d'incident (ou la date de publication quand la première manque, signalé dans le dossier).`,
		`- **Événements** : tous ceux de la fenêtre, avec leur nature (` +
			"`ambient_signal`, `confirmed_incident`, `technical_indicator`, `third_party_claim`).",
		"- **Sources actives** : sources ayant produit au moins un événement avant J-21, et encore activées.",
		"  Une source qui répond mais ne produit rien n'est pas une source active au sens de cette mesure.",
		"- **Organisations citées** : organisations rattachées à un événement de la fenêtre. Un rattachement",
		"  n'est un signal que si son nom ou le titre de l'événement recoupe l'entité ; sinon c'est un bruit.",
		"- **Ruptures détectées** : dérives calculées sur les seuls événements qui concernent l'entité",
		"  (`rafale` : 3 événements d'une même famille en 7 jours ; `changement-nature` : 2 familles au moins).",
		"  Le détecteur `nouvelle-organisation` n'est pas calculable ici : l'instantané ne porte pas la date",
		"  de première apparition de l'organisation. Il n'est pas compté pour zéro, il est signalé",
		"  comme non calculable. Aucune alerte n'est présente dans l'instantané ; une alerte créée après",
		"  J-21 ne peut en aucun cas compter comme signe antérieur.",
		"- **Signal retenu** : mention nominative (au moins deux jetons distincts, ou un jeton et un",
		"  rattachement recoupé), indicateur technique ou revendication désignant l'entité.",
		"- **Candidat à examiner** : jeton unique, commune seule, ou élément intrinsèquement intéressant",
		"  sans cible nominative. Un candidat n'est jamais publié comme une anticipation avérée.",
		"- **Exclusions** : CVE génériques, veille internationale, fuites concernant d'autres victimes,",
		"  mots partagés (« police », « service », « source », …) et rattachements approximatifs.",
		"",
		"## 3. Ce qui était effectivement disponible à J-21",
		"",
		"| Mesure | Valeur |",
		"|---|---|",
		`| Incidents examinés | ${stats.incidents} |`,
		`| Événements dans les fenêtres | ${stats.evenements} (de ${stats.evenementsParIncident[0]} à ${stats.evenementsParIncident[1]} par incident) |`,
		`| Sources actives distinctes | ${stats.sourcesDistinctes} (de ${stats.sourcesParIncident[0]} à ${stats.sourcesParIncident[1]} par incident) |`,
		`| Incidents avec organisation citée | ${stats.incidentsAvecOrganisation} |`,
		`| Rattachements bruités écartés | ${stats.rattachementsBruites} |`,
		`| Incidents avec rupture détectée sur l'entité | ${stats.incidentsAvecRupture} |`,
		`| Fenêtres vides | ${stats.fenetresVides} |`,
		`| Incidents avec signal retenu | ${avecSignal} / ${dossiers.length} |`,
		`| Incidents sans signal | ${sansSignal} / ${dossiers.length} |`,
		"",
		"Répartition des natures d'événements (chaque événement compte une fois) :",
		"",
	);
	const assertions = new Map<string, number>();
	const families = new Map<string, number>();
	for (const d of dossiers) {
		for (const [nom, n] of d.assertions) assertions.set(nom, (assertions.get(nom) ?? 0) + n);
		for (const [nom, n] of d.familles) families.set(nom, (families.get(nom) ?? 0) + n);
	}
	p(
		`| Nature | Nombre |`,
		`|---|---:|`,
		...[...assertions].sort((a, b) => b[1] - a[1]).map(([n, v]) => `| \`${n}\` | ${v} |`),
		"",
		`| Famille | Nombre |`,
		`|---|---:|`,
		...[...families].sort((a, b) => b[1] - a[1]).map(([n, v]) => `| \`${n}\` | ${v} |`),
		"",
		"Synthèse agrégée au sens du module `analyse/anticipation.ts` (signaux retenus seulement) :",
		"",
		`- faits : ${resume.faits} ; avec signal : ${resume.avecSignal} (${resume.partPct} %) ;`,
		`- avance médiane : ${resume.avanceMedianeJours === null ? "non calculable (aucun signal)" : `${resume.avanceMedianeJours} jour(s)`} ;`,
		`- par nature : ${Object.entries(resume.parNature).map(([n, v]) => `${n} ${v}`).join(" · ")} ;`,
		`- mesure indicative (moins de 10 faits) : ${resume.indicative ? "oui" : "non"}.`,
		"",
		"## 4. Verdict par incident",
		"",
		"| Incident | Entité | J-21 | Événements | Sources | Organisations | Ruptures | Signal à J-21 |",
		"|---|---|---|---:|---:|---:|---:|---|",
	);
	for (const d of dossiers) {
		lignes.push(
			`| \`${d.incident.id}\` | ${cellule(d.incident.entite)} | ${d.instantane.j21} | ` +
				`${d.instantane.evenements.length} | ${d.instantane.sources_actives.length} | ` +
				`${d.instantane.organisations_citees.length} | ${d.ruptures.length} | ${verdictPhrase(d)} |`,
		);
	}
	lignes.push("");

	p(
		"## 5. Dossiers détaillés",
		"",
		"Chaque dossier donne l'état brut à J-21 puis la recherche effectuée. Quand la réponse est « rien »,",
		"le dossier dit ce qui a été cherché et pourquoi aucun élément n'a été retenu.",
		"",
	);
	for (const d of dossiers) {
		const i = d.incident;
		p(
			`### \`${i.id}\` — ${i.entite}`,
			`- **Fait** : ${i.type ?? "type inconnu"}, ${i.dateIncident ?? i.datePublique ?? "date inconnue"}` +
				`${i.commune ? ` · ${i.commune}` : ""}${i.departement ? ` (${i.departement})` : ""}.`,
			`- **Instantané** : J-21 = ${d.instantane.j21} ; fenêtre [${d.instantane.fenetre.debut}, ${d.instantane.fenetre.fin}]` +
				` (${d.instantane.fenetre.jours} j) ; référence = ${d.instantane.incident.typeReference}.`,
			`- **Événements à J-21** : ${d.instantane.evenements.length} ` +
				`(${d.instantane.comptes.evenements_avant_j21} événements plus anciens comptés, non détaillés).`,
			`  - Familles : ${compteFamilles(d)}.`,
			`  - Natures : ${compteAssertions(d)}.`,
			`- **Sources actives** (${d.instantane.sources_actives.length}) : ` +
				liste(d.instantane.sources_actives.map((s) => s.id)) + ".",
			`- **Organisations citées** (${d.instantane.organisations_citees.length}) : ` +
				liste(d.instantane.organisations_citees.map((o) => `${o.name} (#${o.id})`)) + ".",
			`- **Ruptures détectées** (${d.ruptures.length}) : ` +
				(d.ruptures.length === 0
					? "aucune sur l'entité ; `nouvelle-organisation` non calculable faute d'historique"
					: d.ruptures.map((r) => `${r.detecteur} (${r.date}) : ${r.detail}`).join(" ; ")) + ".",
			`- **Recherche** : jetons d'entité ${liste(d.jetonsEntite)} ; jetons de lieu ${liste(d.jetonsLieu)} ; ` +
				`${d.candidats.length} événements passés au crible, ` +
				`${d.retenus.length} signal(aux) retenu(s), ${d.aExaminer.length} candidat(s), ${d.bruits.length} rattachement(s) bruité(s).`,
		);
		if (d.retenus.length > 0) {
			lignes.push("  - **Signaux retenus** :");
			for (const s of d.retenus) {
				lignes.push(`    - ${s.nature}, ${s.avanceJours} j avant : ${cellule(s.titre)} — ${s.raison}.`);
			}
		}
		if (d.aExaminer.length > 0) {
			lignes.push("  - **Candidats non retenus** :");
			for (const s of d.aExaminer.slice(0, 8)) {
				lignes.push(`    - ${cellule(s.titre)} — ${s.raison}.`);
			}
		}
		if (d.bruits.length > 0) {
			lignes.push("  - **Rattachements écartés** :");
			for (const s of d.bruits) {
				lignes.push(`    - ${cellule(s.titre)} — ${s.raison}.`);
			}
		}
		if (d.anomalies.length > 0) {
			p(`- **Anomalies** : ${[...new Set(d.anomalies.map((a) => a.code))].join(", ")} (voir §7).`);
		}
		p(`- **Verdict** : ${verdictPhrase(d)}.`, "");
	}

	p(
		"## 6. Presque-signaux et faux positifs",
		"",
		"Les rattachements d'organisation sont le seul endroit où un signal aurait pu apparaître par erreur.",
		"Ils sont listés ici avec le motif exact du rejet.",
		"",
	);
	const bruites = dossiers.filter((d) => d.bruits.length > 0);
	if (bruites.length === 0) {
		p("Aucun rattachement d'organisation dans les fenêtres.", "");
	} else {
		lignes.push("| Incident | Organisation(s) | Titre de l'événement | Motif du rejet |", "|---|---|---|---|");
		for (const d of bruites) {
			for (const s of d.bruits) {
				lignes.push(
					`| \`${d.incident.id}\` | ${cellule(d.instantane.organisations_citees.map((o) => o.name).join(", "))} ` +
						`| ${cellule(s.titre)} | ${cellule(s.raison)} |`,
				);
			}
		}
		lignes.push("");
	}
	const parMotif = new Map<string, number>();
	for (const d of dossiers) {
		for (const s of d.bruits) parMotif.set(s.raison, (parMotif.get(s.raison) ?? 0) + 1);
	}
	if (parMotif.size > 0) {
		p("Motifs, agrégés :", "");
		for (const [motif, n] of [...parMotif].sort((a, b) => b[1] - a[1])) lignes.push(`- ${n} × ${cellule(motif)}`);
		lignes.push("");
	}

	p(
		"## 7. Cas d'erreur, états vides et anomalies détectées",
		"",
		"Le script distingue les erreurs bloquantes (le document serait faux) des anomalies signalées",
		"(le document reste publiable mais sa limite est explicite).",
		"",
		"**Erreurs bloquantes** : corpus illisible ou sans tableau `incidents` ; ligne JSONL illisible ;",
		"identifiant manquant, dupliqué ou inconnu ; instantané manquant pour un incident du corpus ;",
		"date de référence absente ou invalide ; fenêtre J-21 mal formée. Le script s'arrête avec un code",
		"d'erreur explicite au lieu de publier un chiffre partiel.",
		"",
		"**États vides pris en charge** : corpus vide (document « mesure vide », pas « 0 % ») ; fenêtre",
		"sans événement (dossier « rien — fenêtre vide ») ; aucune source active ; aucune organisation citée ;",
		"aucun signal, aucun candidat et aucune rupture (listes vides affichées comme telles). Aucune division",
		"par zéro : médiane et pourcentage passent par `resumerAnticipation`, qui les rend `null`/`0`.",
		"",
		"**Contrôles appliqués aux entrées** : cohérence des comptes, dates dans la fenêtre, source et",
		"organisation présentes dans les listes, nature d'assertion connue, titre complet ou tronqué.",
		"",
	);
	if (anomalies.length === 0) {
		p("Aucune anomalie détectée dans les entrées fournies.", "");
	} else {
		const parCode = new Map<string, Anomalie[]>();
		for (const a of anomalies) parCode.set(a.code, [...(parCode.get(a.code) ?? []), a]);
		p(`**${anomalies.length} anomalie(s) signalée(s)** :`, "");
		lignes.push("| Code | Nombre | Exemples |", "|---|---:|---|");
		for (const [code, listeAnomalies] of [...parCode].sort((a, b) => b[1].length - a[1].length)) {
			lignes.push(
				`| \`${code}\` | ${listeAnomalies.length} | ` +
					`${cellule(listeAnomalies.slice(0, 3).map((a) => `${a.incident} : ${a.message}`).join(" ; "))} |`,
			);
		}
		lignes.push("");
	}
	if (groupesPartages.length > 0) {
		p(
			"Fenêtres partagées : plusieurs incidents peuvent avoir le même J-21, donc exactement la même",
			"fenêtre d'observation. Leurs verdicts ne sont pas indépendants et ne doivent pas être comptés",
			"comme des confirmations mutuelles.",
			"",
		);
		lignes.push("| J-21 | Incidents |", "|---|---|");
		for (const [jour, ids] of groupesPartages.sort((a, b) => b[1].length - a[1].length)) {
			lignes.push(`| ${jour} | ${ids.map((id) => `\`${id}\``).join(", ")} |`);
		}
		lignes.push("");
	}
	p(
		"## 8. Pourquoi ce zéro",
		"",
		"1. **Couverture.** Les incidents du corpus sont révélés par la presse locale et régionale",
		"   (Sud Ouest, France 3 Nouvelle-Aquitaine, Charente Libre, La Nouvelle République) puis par des",
		"   communiqués d'établissements. Les sources actives des fenêtres sont : " +
			[...new Set(dossiers.flatMap((d) => d.instantane.sources_actives.map((s) => s.id)))].sort().join(", ") +
			". Aucune n'est un média local de Nouvelle-Aquitaine : l'information qui aurait pu alerter",
		"   n'était pas dans le système à J-21.",
		`2. **Nature des données.** Sur ${stats.evenements} événements examinés : ` +
			`technical_indicator ${assertions.get("technical_indicator") ?? 0}, ` +
			`third_party_claim ${assertions.get("third_party_claim") ?? 0}, alerte 0. ` +
			"Les natures les plus proches d'un avertissement sont absentes de l'instantané.",
		`3. **Le rattachement automatique ne compense pas.** ${stats.rattachementsBruites} rattachements`,
		`   sur ${stats.incidentsAvecOrganisation} incidents viennent de trois motifs : « OPEN SOURCE »` +
			" (avis CERT-NL sur GeoTools), « lyon.co.uk » (publication HIBP sur Questel) et « PARTIE SON »",
		"   (avis CERT-FR sur SonicWall). Aucun ne désigne une entité du corpus. Les compter comme des",
		`   signaux ferait passer le taux de 0/${dossiers.length} à ${stats.incidentsAvecOrganisation}/${dossiers.length} avec du bruit pur.`,
		"",
		"## 9. Limites et conditions de changement",
		"",
		"- Les titres de l'instantané sont tronqués à 200 caractères : une mention en fin de titre",
		"  pourrait échapper au crible.",
		"- Les événements antérieurs à la fenêtre sont comptés mais non détaillés : un signal très ancien",
		"  ne peut pas être retrouvé par ce document.",
		"- L'instantané ne contient ni indicateur technique, ni revendication tierce, ni alerte, ni historique",
		"  de première apparition d'organisation : trois des quatre pistes de détection sont donc vides par",
		"  construction, et la quatrième est partielle.",
		"- Une fenêtre partagée réduit le nombre d'observations réellement indépendantes.",
		"- Le défaut est de couverture, pas de modèle : classer du bruit avec un score ne créerait pas de signal.",
		"- Pour faire changer le verdict : brancher des sources locales et régionales, extraire les entités",
		"  et alias, capter indicateurs et revendications, puis régénérer l'instantané et relancer ce script.",
		"",
		"## 10. Reproduction",
		"",
		"```bash",
		"# régénérer l'instantané depuis PostgreSQL (schéma avec event.valid_at requis) :",
		"apps/api/node_modules/.bin/tsx scripts/anticipation.mts",
		"# produire / vérifier ce document sans base :",
		"apps/api/node_modules/.bin/tsx scripts/rapport-anticipation.mts",
		"apps/api/node_modules/.bin/tsx scripts/rapport-anticipation.mts --verifier",
		"```",
		"",
		"Le résultat est déterministe : mêmes entrées (empreintes ci-dessus), même octets en sortie.",
		"",
	);
	return lignes.join("\n");
}
