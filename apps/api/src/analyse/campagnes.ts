/**
 * Regroupement déterministe des incidents en campagnes.
 *
 * Règle de regroupement (documentée ici, appliquée telle quelle ci-dessous) :
 *   1. un lien n'est créé que si les deux incidents partagent une **ancre** :
 *      le même groupe de ransomware (evidence.group, source de groupe dédiée
 *      `onion:ccw:*` ou groupe explicitement nommé dans le titre), la même
 *      infrastructure (domaine/IP/certificat explicite, ou hôte .onion d'une
 *      source de groupe), le même acteur revendiqué dans le même mois civil
 *      (`evidence.claimed_at`, avec au moins deux victimes distinctes), ou la
 *      même organisation **avec** même secteur et même vecteur. Secteur et
 *      vecteur seuls ne suffisent jamais : 23 000 événements de
 *      vulnérabilités partagent un vecteur CVSS sans former une campagne.
 *   2. fenêtre temporelle : 14 jours pour une ancre de groupe ou
 *      d'infrastructure, 30 jours pour une ancre d'organisation, 31 pour le
 *      mois civil de revendication ; durée maximale d'une campagne : 45 jours
 *      (pas de chaînage sans fin). Le mois de revendication est une frontière
 *      dure : deux revendications de mois différents ne sont jamais liées.
 *   3. famille d'événements identique obligatoirement. Deux groupes connus
 *      différents ne sont jamais fusionnés, même sur une infrastructure
 *      partagée.
 *   4. secteur, vecteur et source(s) distincte(s) ne décident pas du lien :
 *      ils la **corroborent**. Le score vaut nombre de signaux partagés par
 *      au moins deux incidents + 1 si plusieurs sources sont représentées ;
 *      confiance `eleve` à partir de 3, `moyen` à 2, `faible` sinon.
 *
 * Chaque campagne emporte la preuve : les signaux partagés avec les identifiants
 * d'événements qui les portent, et pour chaque incident ajouté le voisin de
 * référence, le motif du lien et le délai en heures. Rien n'est appris, rien
 * n'est deviné : une campagne contestée se corrige dans la règle ci-dessus.
 *
 * Scale anchors (2026-11): `./scale-signals.js` adds two deterministic signals
 * on top of the historical anchors - an explicit CVE identifier and an
 * identical advisory headline shared by two or more distinct sources. They
 * obey the same proof, family and time-window rules as every other anchor.
 */
import { withTransaction } from "../db.js";
import { extractScaleSignals } from "./scale-signals.js";

const JOUR_MS = 86_400_000;
/** Hors du même mois civil de revendication, 14 jours maximum pour une ancre de groupe. */
export const FENETRE_ANCRE_MS = 14 * JOUR_MS;
/** Une campagne visant la même organisation peut s'étaler sur un mois. */
export const FENETRE_ORG_MS = 30 * JOUR_MS;
/** Garde-fou contre le chaînage : aucune campagne ne couvre plus de 45 jours. */
export const DUREE_MAX_CAMPAGNE_MS = 45 * JOUR_MS;
/** Shared vulnerability identifiers and syndicated advisories use the wider window. */
export const FENETRE_SIGNALE_MS = 30 * JOUR_MS;
/** Deux revendications du même acteur dans le même mois civil peuvent être éloignées de 31 jours. */
export const FENETRE_MOIS_MS = 31 * JOUR_MS;

export type TypeSignal =
	| "groupe"
	| "groupe-mois"
	| "infrastructure"
	| "organisation"
	| "secteur"
	| "vecteur"
	| "cve"
	| "headline";

export type Signal = { type: TypeSignal; valeur: string };

export type EvenementCampagne = {
	id: number;
	family: string;
	title: string;
	observedAt: string | null;
	sourceId: string;
	sourceUrl: string | null;
	orgId: number | null;
	sector: string | null;
	evidence: Record<string, unknown>;
};

export type PreuveSignal = { type: TypeSignal; valeur: string; evenements: number[] };

export type LienCampagne = {
	evenement: number;
	reference: number;
	motif: string;
	delaiHeures: number;
};

export type Campagne = {
	cle: string;
	label: string;
	family: string;
	debut: string;
	fin: string;
	incidents: number[];
	sourceIds: string[];
	taille: number;
	confiance: "eleve" | "moyen" | "faible";
	score: number;
	preuve: { signaux: PreuveSignal[]; liens: LienCampagne[] };
};

export type RaisonIsole =
	| "date_invalide"
	| "sans_ancre"
	| "famille_incompatible"
	| "sans_voisin";

export type IncidentIsole = { id: number; raison: RaisonIsole };

export type RapportCampagnes = {
	evenements: number;
	campagnes: number;
	incidentsGroupes: number;
	tailleMediane: number;
	isoles: number;
	raisons: Record<RaisonIsole, number>;
};

export type AnalyseCampagnes = {
	campagnes: Campagne[];
	isoles: IncidentIsole[];
	rapport: RapportCampagnes;
};

const CLES_INFRA = [
	"infrastructure",
	"infra",
	"c2_domain",
	"c2",
	"ip",
	"cert",
	"certificate",
	"leak_site",
];

function texte(valeur: unknown): string | null {
	return typeof valeur === "string" && valeur.trim().length > 0 ? valeur.trim() : null;
}

/** Étiquette d'acteur : « Dark Project », `dark-project` et `dark project` → `darkproject`. */
function normaliserGroupe(valeur: unknown): string | null {
	const brut = texte(valeur);
	if (brut === null) return null;
	const nettoye = brut
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
	if (nettoye.length < 3 || ["unknown", "aucun", "none", "false", "inconnu", "inconnue"].includes(nettoye)) return null;
	return nettoye.replace(/(ransomware|group)$/, "").length >= 3
		? nettoye.replace(/(ransomware|group)$/, "")
		: nettoye;
}

function groupeDepuisTitre(titre: string): string | null {
	const motif = /(?:revendiqu[ée] par|claimed by|attacker:)\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 _.-]{1,60})/i;
	const capture = motif.exec(titre)?.[1];
	if (!capture) return null;
	return normaliserGroupe(capture.replace(/^ransomware group\s+/i, ""));
}

/** Seules les sources dédiées à un groupe portent une infrastructure d'attaquant. */
function groupeDepuisSource(sourceId: string): string | null {
	if (!sourceId.startsWith("onion:ccw:")) return null;
	return normaliserGroupe(sourceId.slice("onion:ccw:".length).replace(/-(leaks|ransomware)$/, ""));
}

export function groupeDe(evenement: EvenementCampagne): string | null {
	return (
		normaliserGroupe(evenement.evidence?.group) ??
		groupeDepuisSource(evenement.sourceId) ??
		groupeDepuisTitre(evenement.title)
	);
}

/** Victime normalisée : une campagne multi-organismes porte sur des organisations distinctes. */
export function victimeDe(evenement: EvenementCampagne): string | null {
	if (evenement.orgId !== null && Number.isFinite(evenement.orgId)) return `org:${evenement.orgId}`;
	for (const cle of ["victim", "victime", "organisation", "organization"] as const) {
		const brut = texte(evenement.evidence?.[cle]);
		if (brut !== null) return `nom:${brut.toLowerCase().replace(/\s+/g, " ")}`;
	}
	return null;
}

/** Mois civil de la revendication : jamais le mois de collecte de l'événement. */
export function moisRevendication(evenement: EvenementCampagne): string | null {
	const brut =
		texte(evenement.evidence?.claimed_at) ??
		texte(evenement.evidence?.claimedAt) ??
		texte(evenement.evidence?.claim_date);
	if (brut === null) return null;
	const date = new Date(brut);
	return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 7) : null;
}

function ajouterInfra(cible: Set<string>, brut: string): void {
	const valeur = brut.trim().toLowerCase();
	if (valeur.length < 6 || ["unknown", "aucun"].includes(valeur)) return;
	try {
		const hote = new URL(valeur.includes("://") ? valeur : `https://${valeur}`).hostname.toLowerCase();
		if (hote.includes(".")) cible.add(hote);
		return;
	} catch {
		// Une valeur d'infrastructure peut être un empreinte de certificat : on la garde telle quelle.
	}
	if (/^[a-f0-9]{40,}$/.test(valeur)) cible.add(valeur);
}

export function infrastructuresDe(evenement: EvenementCampagne): string[] {
	const valeurs = new Set<string>();
	for (const cle of CLES_INFRA) {
		const brut = evenement.evidence?.[cle];
		if (typeof brut === "string") ajouterInfra(valeurs, brut);
		if (Array.isArray(brut)) {
			for (const item of brut) if (typeof item === "string") ajouterInfra(valeurs, item);
		}
	}
	if (evenement.sourceId.startsWith("onion:ccw:")) {
		try {
			const hote = new URL(evenement.sourceUrl ?? "").hostname.toLowerCase();
			if (hote.endsWith(".onion")) valeurs.add(hote);
		} catch {
			// Source de groupe sans URL exploitable : le groupe reste l'ancre.
		}
	}
	return [...valeurs].sort();
}

export function secteurDe(evenement: EvenementCampagne): string | null {
	const brut =
		texte(evenement.sector) ??
		texte(evenement.evidence?.sector) ??
		texte(evenement.evidence?.industry);
	return brut === null ? null : brut.toLowerCase().replace(/\s+/g, " ");
}

export function vecteurDe(evenement: EvenementCampagne): string | null {
	const brut = texte(evenement.evidence?.vectorString);
	return brut === null ? null : `cvss:${brut.toLowerCase()}`;
}

export function signauxDe(evenement: EvenementCampagne): Signal[] {
	const signaux: Signal[] = [];
	const groupe = groupeDe(evenement);
	if (groupe !== null) signaux.push({ type: "groupe", valeur: groupe });
	const mois = moisRevendication(evenement);
	if (groupe !== null && mois !== null) {
		signaux.push({ type: "groupe-mois", valeur: `${groupe}:${mois}` });
	}
	for (const valeur of infrastructuresDe(evenement)) {
		signaux.push({ type: "infrastructure", valeur });
	}
	if (evenement.orgId !== null) {
		signaux.push({ type: "organisation", valeur: `org:${evenement.orgId}` });
	}
	const secteur = secteurDe(evenement);
	if (secteur !== null) signaux.push({ type: "secteur", valeur: secteur });
	const vecteur = vecteurDe(evenement);
	if (vecteur !== null) signaux.push({ type: "vecteur", valeur: vecteur });
	for (const signal of extractScaleSignals(evenement)) {
		signaux.push({ type: signal.type, valeur: signal.value });
	}
	return signaux;
}

const cleSignal = (signal: Signal): string => `${signal.type}:${signal.valeur}`;

type Graphe = Map<TypeSignal, Map<string, { signal: Signal; evenements: Set<number> }>>;

function ajouterSignaux(graphe: Graphe, signaux: readonly Signal[], id: number): void {
	for (const signal of signaux) {
		let parValeur = graphe.get(signal.type);
		if (!parValeur) {
			parValeur = new Map();
			graphe.set(signal.type, parValeur);
		}
		let entree = parValeur.get(signal.valeur);
		if (!entree) {
			entree = { signal, evenements: new Set<number>() };
			parValeur.set(signal.valeur, entree);
		}
		entree.evenements.add(id);
	}
}

function signauxPartages(graphe: Graphe): PreuveSignal[] {
	const partages: PreuveSignal[] = [];
	for (const parValeur of graphe.values()) {
		for (const { signal, evenements } of parValeur.values()) {
			if (evenements.size >= 2) {
				partages.push({ ...signal, evenements: [...evenements].sort((a, b) => a - b) });
			}
		}
	}
	return partages.sort(
		(a, b) => a.type.localeCompare(b.type) || a.valeur.localeCompare(b.valeur),
	);
}

/** Anchor priority: group > infrastructure > CVE > syndicated headline > organisation triple. */
function ancreDe(communs: readonly Signal[], sourceCount: number): Signal | null {
	return (
		communs.find((s) => s.type === "groupe") ??
		communs.find((s) => s.type === "infrastructure") ??
		communs.find((s) => s.type === "cve") ??
		(sourceCount >= 2 ? (communs.find((s) => s.type === "headline") ?? null) : null) ??
		(communs.some((s) => s.type === "organisation") &&
		communs.some((s) => s.type === "secteur") &&
		communs.some((s) => s.type === "vecteur")
			? (communs.find((s) => s.type === "organisation") ?? null)
			: null)
	);
}

function instant(evenement: EvenementCampagne): number {
	return new Date(evenement.observedAt as string).getTime();
}

type Cluster = {
	membres: EvenementCampagne[];
	signaux: Graphe;
	sources: Set<string>;
	liens: LienCampagne[];
	debut: number;
	fin: number;
};

function finaliser(cluster: Cluster, famille: string): Campagne {
	const premier = cluster.membres[0] as EvenementCampagne;
	const partages = signauxPartages(cluster.signaux);
	const score = partages.length + (cluster.sources.size >= 2 ? 1 : 0);
	const groupes = cluster.signaux.get("groupe");
	const cves = cluster.signaux.get("cve");
	const titres = cluster.signaux.get("headline");
	// Label priority: actor, infrastructure, CVE, syndicated headline, organisation.
	const label =
		(groupes && [...groupes.keys()][0]) ||
		(cluster.signaux.get("infrastructure") && [...(cluster.signaux.get("infrastructure") as Map<string, unknown>).keys()][0]) ||
		(cves && [...cves.keys()][0]) ||
		(titres && ([...titres.keys()][0] ?? "").slice(0, 80)) ||
		(cluster.signaux.get("organisation") && [...(cluster.signaux.get("organisation") as Map<string, unknown>).keys()][0]) ||
		famille;
	return {
		cle: `cmp:${famille}:${label}:${new Date(cluster.debut).toISOString().slice(0, 10)}:${premier.id}`,
		label,
		family: famille,
		debut: new Date(cluster.debut).toISOString(),
		fin: new Date(cluster.fin).toISOString(),
		incidents: cluster.membres.map((m) => m.id).sort((a, b) => a - b),
		sourceIds: [...cluster.sources].sort(),
		taille: cluster.membres.length,
		confiance: score >= 3 ? "eleve" : score === 2 ? "moyen" : "faible",
		score,
		preuve: { signaux: partages, liens: cluster.liens },
	};
}

function raisonIsolement(
	evenement: EvenementCampagne,
	indexAncrage: Map<string, { id: number; family: string }[]>,
): RaisonIsole {
	if (!Number.isFinite(new Date(evenement.observedAt ?? "").getTime())) return "date_invalide";
	const ancres = signauxDe(evenement).filter((s) =>
		["groupe", "groupe-mois", "infrastructure", "organisation", "cve"].includes(s.type),
	);
	if (ancres.length === 0) return "sans_ancre";
	for (const ancre of ancres) {
		const voisins = indexAncrage.get(cleSignal(ancre)) ?? [];
		if (voisins.some((v) => v.family !== evenement.family && v.id !== evenement.id)) {
			return "famille_incompatible";
		}
	}
	return "sans_voisin";
}

export function analyserCampagnes(evenements: readonly EvenementCampagne[]): AnalyseCampagnes {
	const tries = evenements
		.filter((e) => Number.isFinite(new Date(e.observedAt ?? "").getTime()))
		.sort((a, b) => instant(a) - instant(b) || a.id - b.id);

	const groupes = new Map<string, number[]>();
	const groupesMois = new Map<string, number[]>();
	const infrastructures = new Map<string, number[]>();
	const organisations = new Map<string, number[]>();
	const cves = new Map<string, number[]>();
	const titres = new Map<string, number[]>();
	const indexAncrage = new Map<string, { id: number; family: string }[]>();
	const indexer = (index: Map<string, number[]>, cle: string, position: number): void => {
		const liste = index.get(cle) ?? [];
		liste.push(position);
		index.set(cle, liste);
	};

	for (const e of evenements) {
		for (const signal of signauxDe(e)) {
			if (!["groupe", "groupe-mois", "infrastructure", "organisation", "cve"].includes(signal.type)) continue;
			const cle = cleSignal(signal);
			const liste = indexAncrage.get(cle) ?? [];
			liste.push({ id: e.id, family: e.family });
			indexAncrage.set(cle, liste);
		}
	}

	const clusters: Cluster[] = [];
	const affectes = new Set<number>();

	for (const evenement of tries) {
		const signaux = signauxDe(evenement);
		const mois = moisRevendication(evenement);
		const candidats = new Set<number>();
		for (const signal of signaux) {
			if (signal.type === "groupe") for (const i of groupes.get(signal.valeur) ?? []) candidats.add(i);
			if (signal.type === "groupe-mois") {
				for (const i of groupesMois.get(signal.valeur) ?? []) candidats.add(i);
			}
			if (signal.type === "infrastructure") {
				for (const i of infrastructures.get(signal.valeur) ?? []) candidats.add(i);
			}
			if (signal.type === "organisation") {
				for (const i of organisations.get(signal.valeur) ?? []) candidats.add(i);
			}
			if (signal.type === "cve") {
				for (const i of cves.get(signal.valeur) ?? []) candidats.add(i);
			}
			if (signal.type === "headline") {
				for (const i of titres.get(signal.valeur) ?? []) candidats.add(i);
			}
		}

		let rejoint = false;
		for (const position of [...candidats].sort((a, b) => a - b)) {
			const cluster = clusters[position];
			if (!cluster || cluster.membres[0]?.family !== evenement.family) continue;
			// Le mois de revendication est une frontière dure entre deux campagnes du même acteur.
			if (mois !== null && cluster.membres.some((m) => {
				const moisMembre = moisRevendication(m);
				return moisMembre !== null && moisMembre !== mois;
			})) continue;
			const communs = signaux.filter((signal) => cluster.signaux.get(signal.type)?.has(signal.valeur));
			const t = instant(evenement);
			let reference: EvenementCampagne | null = null;
			let delta = Infinity;
			for (const membre of cluster.membres) {
				const ecart = Math.abs(t - instant(membre));
				if (ecart < delta) {
					delta = ecart;
					reference = membre;
				}
			}
			let ancre = ancreDe(communs, cluster.sources.size + (cluster.sources.has(evenement.sourceId) ? 0 : 1));
			if (ancre === null) continue;
			// Au-delà de la fenêtre courte, le mois civil de revendication prend le relais.
			const moisAncre = communs.find((s) => s.type === "groupe-mois");
			if (delta > FENETRE_ANCRE_MS && moisAncre !== undefined) ancre = moisAncre;
			if (ancre.type === "groupe-mois") {
				const victime = victimeDe(evenement);
				const distinctes = new Set(
					cluster.membres.map((m) => victimeDe(m)).filter((v): v is string => v !== null),
				);
				if (victime === null || (distinctes.size < 2 && distinctes.has(victime))) continue;
			}

			// Un même domaine ne transforme pas deux acteurs connus différents en une campagne.
			const groupe = signaux.find((s) => s.type === "groupe");
			const groupesConnus = cluster.signaux.get("groupe");
			if (groupe && groupesConnus && [...groupesConnus.keys()].some((g) => g !== groupe.valeur)) {
				continue;
			}

			const fenetre =
				ancre.type === "organisation" || ancre.type === "cve" || ancre.type === "headline"
					? FENETRE_SIGNALE_MS
					: ancre.type === "groupe-mois"
						? FENETRE_MOIS_MS
						: FENETRE_ANCRE_MS;
			if (reference === null || delta > fenetre) continue;
			if (Math.max(cluster.fin, t) - Math.min(cluster.debut, t) > DUREE_MAX_CAMPAGNE_MS) continue;

			cluster.membres.push(evenement);
			cluster.debut = Math.min(cluster.debut, t);
			cluster.fin = Math.max(cluster.fin, t);
			cluster.sources.add(evenement.sourceId);
			ajouterSignaux(cluster.signaux, signaux, evenement.id);
			for (const signal of signaux) {
				if (signal.type === "groupe") indexer(groupes, signal.valeur, position);
				if (signal.type === "groupe-mois") indexer(groupesMois, signal.valeur, position);
				if (signal.type === "infrastructure") indexer(infrastructures, signal.valeur, position);
				if (signal.type === "organisation") indexer(organisations, signal.valeur, position);
				if (signal.type === "cve") indexer(cves, signal.valeur, position);
				if (signal.type === "headline") indexer(titres, signal.valeur, position);
			}
			cluster.liens.push({
				evenement: evenement.id,
				reference: reference.id,
				motif: `${ancre.type}:${ancre.valeur}`,
				delaiHeures: Math.round((delta / 3_600_000) * 10) / 10,
			});
			affectes.add(evenement.id);
			rejoint = true;
			break;
		}

		if (!rejoint) {
			const signauxGraphe: Graphe = new Map();
			ajouterSignaux(signauxGraphe, signaux, evenement.id);
			const position = clusters.length;
			clusters.push({
				membres: [evenement],
				signaux: signauxGraphe,
				sources: new Set([evenement.sourceId]),
				liens: [],
				debut: instant(evenement),
				fin: instant(evenement),
			});
			for (const signal of signaux) {
				if (signal.type === "groupe") indexer(groupes, signal.valeur, position);
				if (signal.type === "groupe-mois") indexer(groupesMois, signal.valeur, position);
				if (signal.type === "infrastructure") indexer(infrastructures, signal.valeur, position);
				if (signal.type === "organisation") indexer(organisations, signal.valeur, position);
				if (signal.type === "cve") indexer(cves, signal.valeur, position);
				if (signal.type === "headline") indexer(titres, signal.valeur, position);
			}
		}
	}

	const campagnes = clusters
		.filter((c) => c.membres.length >= 2)
		.map((c) => finaliser(c, (c.membres[0] as EvenementCampagne).family))
		.sort((a, b) => b.debut.localeCompare(a.debut) || a.cle.localeCompare(b.cle));
	for (const campagne of campagnes) for (const id of campagne.incidents) affectes.add(id);
	const isoles: IncidentIsole[] = evenements
		.filter((e) => !affectes.has(e.id))
		.map((e) => ({ id: e.id, raison: raisonIsolement(e, indexAncrage) }));

	const raisons: Record<RaisonIsole, number> = {
		date_invalide: 0,
		sans_ancre: 0,
		famille_incompatible: 0,
		sans_voisin: 0,
	};
	for (const isole of isoles) raisons[isole.raison] += 1;

	const tailles = campagnes.map((c) => c.taille).sort((a, b) => a - b);
	const milieu = Math.floor(tailles.length / 2);
	const tailleMediane =
		tailles.length === 0
			? 0
			: tailles.length % 2 === 1
				? (tailles[milieu] as number)
				: ((tailles[milieu - 1] as number) + (tailles[milieu] as number)) / 2;

	return {
		campagnes,
		isoles,
		rapport: {
			evenements: evenements.length,
			campagnes: campagnes.length,
			incidentsGroupes: campagnes.reduce((total, c) => total + c.taille, 0),
			tailleMediane,
			isoles: isoles.length,
			raisons,
		},
	};
}

/** Écriture atomique : la table reflète exactement le dernier passage. */
export async function enregistrerCampagnes(
	campagnes: readonly Campagne[],
): Promise<{ ecrites: number; retirees: number }> {
	const cles = campagnes.map((c) => c.cle);
	return withTransaction(async (client) => {
		const supprimes = await client.query("DELETE FROM campaign WHERE NOT (cle = ANY($1))", [cles]);
		for (const campagne of campagnes) {
			await client.query(
				`INSERT INTO campaign
					(cle, label, family, debut, fin, incidents, taille, confiance, score, preuve)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
				 ON CONFLICT (cle) DO UPDATE SET
					label = EXCLUDED.label, fin = EXCLUDED.fin, incidents = EXCLUDED.incidents,
					taille = EXCLUDED.taille, confiance = EXCLUDED.confiance,
					score = EXCLUDED.score, preuve = EXCLUDED.preuve, updated_at = now()`,
				[
					campagne.cle,
					campagne.label,
					campagne.family,
					campagne.debut,
					campagne.fin,
					campagne.incidents,
					campagne.taille,
					campagne.confiance,
					campagne.score,
					JSON.stringify(campagne.preuve),
				],
			);
		}
		return { ecrites: campagnes.length, retirees: supprimes.rowCount ?? 0 };
	});
}
