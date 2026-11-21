/**
 * Couverture mesurée contre la base, pas rejouée contre le moteur.
 *
 * Le script `scripts/mesure-couverture.mts` interroge `event`, `org` et
 * `org_alias` pour chaque incident du corpus. Ce module ne connaît pas PostgreSQL :
 * il reçoit les événements candidats et décide, de façon rejouable, si l'incident
 * a été vu, et sinon quel est le motif de l'absence.
 *
 * Les trois motifs d'absence sont distincts et ne doivent pas être confondus :
 *
 * - `pas_collecté` : aucun événement ne cite l'organisation à la date ;
 * - `pas_rattaché` : un événement cyber existe, mais il n'est pas lié à
 *   l'organisation attendue ;
 * - `pas_jugé_cyber` : un événement existe, mais le classificateur ne le
 *   reconnaît pas comme cyber.
 *
 * `rattaché_en_retard` n'est pas un motif d'absence : l'incident a été vu, mais
 * le rattachement est postérieur à la détection. On publie les deux dates.
 */
import { isCyberText } from "../collectors/classify.js";
import { mediane } from "./mediane.js";

export type StatutCouverture =
	| "vu"
	| "rattaché_en_retard"
	| "pas_collecté"
	| "pas_rattaché"
	| "pas_jugé_cyber";

export type MotifAbsence = Extract<
	StatutCouverture,
	"pas_collecté" | "pas_rattaché" | "pas_jugé_cyber"
>;

export type IncidentMesure = {
	id: string;
	entite: string;
	datePublique: string;
	commune?: string | null;
	preuve?: { url?: string; titre?: string };
	sourcesAdditionnelles?: { url?: string }[];
};

export type EvenementMesure = {
	id: number;
	dedupKey: string;
	titre: string;
	resume: string | null;
	sourceUrl: string | null;
	observedAt: string | null;
	collectedAt: string | null;
	orgId: number | null;
	family: string;
};

export type RattachementMesure = {
	dedupKey: string;
	date: string;
	orgId: number | null;
};

export type DonneesIncident = {
	evenements: EvenementMesure[];
	/** Organisations dont le nom ou un alias désigne l'entité du corpus. */
	orgIdsAttendus: number[];
	nomsOrg: Map<number, string>;
	rattachements: RattachementMesure[];
};

export type ResultatIncident = {
	id: string;
	entite: string;
	datePublique: string;
	statut: StatutCouverture;
	vu: boolean;
	motif: MotifAbsence | null;
	/** Première date à laquelle l'événement est visible en base. */
	dateDetection: string | null;
	dateRattachement: string | null;
	/** Jours entre publication et première détection. */
	delaiJours: number | null;
	/** Jours entre détection et rattachement, quand il est postérieur. */
	delaiRattachementJours: number | null;
	organisme: string | null;
	evenementId: number | null;
	/** Pourquoi cet événement a été retenu : `url-source`, `organisation`, `texte:…`. */
	raison: string | null;
};

/** Mots qui ne désignent aucune organisation : ils ne prouvent rien. */
const GENERIQUES: Record<string, true> = {
	mairie: true, ville: true, commune: true, conseil: true, general: true,
	departement: true, departemental: true, region: true, regional: true,
	prefecture: true, office: true, national: true, nationale: true,
	federation: true, association: true, groupement: true, societe: true,
	groupe: true, service: true, services: true, etablissement: true,
	magasin: true, magasins: true, supermarche: true, hypermarche: true,
	enseigne: true, centre: true, reseau: true, editeur: true, plateforme: true,
	france: true, francais: true, francaise: true, sante: true, hopital: true,
	ecole: true, university: true, universite: true, direction: true,
	laboratoire: true,
};

/** Mots d'au moins quatre lettres, hors termes génériques. */
export function motsDiscriminants(texte: string): string[] {
	const principal = texte.split(/[(—–]/)[0] ?? texte;
	return [...new Set(
		normaliser(principal)
			.split(" ")
			.filter((mot) => mot.length >= 4 && !GENERIQUES[mot]),
	)];
}

function dateJour(valeur: string | null): string | null {
	if (!valeur) return null;
	const temps = Date.parse(valeur.includes("T") ? valeur : `${valeur}T00:00:00Z`);
	return Number.isNaN(temps) ? null : new Date(temps).toISOString().slice(0, 10);
}

function enJours(date: string | null): number | null {
	if (!date) return null;
	return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

/**
 * Une collecte peut précéder la publication de quelques jours, ou n'arriver
 * que longtemps après : on garde une fenêtre large, le score de correspondance
 * et le rattachement à l'organisation font le tri.
 */
function dansLaFenetre(date: string | null, publication: string): boolean {
	const pub = enJours(publication);
	const jour = enJours(date);
	if (pub === null || jour === null) return false;
	return jour >= pub - 45 && jour <= pub + 365;
}

type Candidat = {
	evenement: EvenementMesure;
	score: number;
	raison: string;
	dateDetection: string | null;
};

function correspondance(
	incident: IncidentMesure,
	evenement: EvenementMesure,
	orgIds: ReadonlySet<number>,
): Candidat | null {
	const observe = dateJour(evenement.observedAt);
	const collecte = dateJour(evenement.collectedAt);
	if (!dansLaFenetre(observe, incident.datePublique) && !dansLaFenetre(collecte, incident.datePublique)) {
		return null;
	}
	const dateDetection = [observe, collecte]
		.filter((d): d is string => d !== null)
		.sort()[0] ?? null;

	const urls = [
		incident.preuve?.url,
		...(incident.sourcesAdditionnelles ?? []).map((source) => source.url),
	].filter((url): url is string => Boolean(url));
	if (evenement.sourceUrl && urls.includes(evenement.sourceUrl)) {
		return { evenement, score: 100, raison: "url-source", dateDetection };
	}
	if (evenement.orgId !== null && orgIds.has(evenement.orgId)) {
		return { evenement, score: 60, raison: "organisation", dateDetection };
	}

	const cherches = [
		...motsDiscriminants(incident.entite),
		...motsDiscriminants(incident.commune ?? ""),
	];
	if (cherches.length === 0) return null;
	const motsTexte = new Set(
		normaliser(`${evenement.titre} ${evenement.resume ?? ""}`).split(" ").filter(Boolean),
	);
	const presents = cherches.filter((mot) => motsTexte.has(mot));
	if (presents.length === 0) return null;
	// Un seul mot de quatre lettres (« Ymed ») suffit si c'est le seul mot
	// distinctif du nom ; sinon on exige au moins deux mots pour ne pas
	// rattacher tout ce qui contient « Gironde » à chaque incident girondin.
	if (presents.length === 1 && cherches.length > 1 && (presents[0]?.length ?? 0) < 7) return null;
	return {
		evenement,
		score: 10 + presents.length * 4,
		raison: `texte:${presents.join(",")}`,
		dateDetection,
	};
}

function trier(a: Candidat, b: Candidat): number {
	const dates = (a.dateDetection ?? "9999-99-99").localeCompare(b.dateDetection ?? "9999-99-99");
	return dates !== 0 ? dates : b.score - a.score;
}

const base = (incident: IncidentMesure) => ({
	id: incident.id,
	entite: incident.entite,
	datePublique: incident.datePublique,
});

/** Classifie un incident ; fonction pure, sans accès à la base. */
export function analyserIncident(incident: IncidentMesure, donnees: DonneesIncident): ResultatIncident {
	const orgIds = new Set(donnees.orgIdsAttendus);
	const candidats = donnees.evenements
		.map((evenement) => correspondance(incident, evenement, orgIds))
		.filter((candidat): candidat is Candidat => candidat !== null)
		.sort(trier);

	if (candidats.length === 0) {
		return {
			...base(incident),
			statut: "pas_collecté",
			vu: false,
			motif: "pas_collecté",
			dateDetection: null,
			dateRattachement: null,
			delaiJours: null,
			delaiRattachementJours: null,
			organisme: null,
			evenementId: null,
			raison: null,
		};
	}

	const cyber = candidats.filter(
		(c) => c.evenement.family !== "presse" && isCyberText(c.evenement.titre, c.evenement.resume),
	);
	if (cyber.length === 0) {
		return {
			...base(incident),
			statut: "pas_jugé_cyber",
			vu: false,
			motif: "pas_jugé_cyber",
			dateDetection: candidats[0]?.dateDetection ?? null,
			dateRattachement: null,
			delaiJours: null,
			delaiRattachementJours: null,
			organisme: null,
			evenementId: candidats[0]?.evenement.id ?? null,
			raison: candidats[0]?.raison ?? null,
		};
	}

	const rattaches = cyber.filter(
		(c) => c.evenement.orgId !== null && orgIds.has(c.evenement.orgId),
	);
	if (rattaches.length === 0) {
		const premier = cyber[0]!;
		return {
			...base(incident),
			statut: "pas_rattaché",
			vu: false,
			motif: "pas_rattaché",
			dateDetection: premier.dateDetection,
			dateRattachement: null,
			delaiJours: null,
			delaiRattachementJours: null,
			organisme: null,
			evenementId: premier.evenement.id,
			raison: premier.raison,
		};
	}

	const retenu = rattaches[0]!;
	const dateDetection = retenu.dateDetection;
	const dateRattachement = donnees.rattachements
		.filter((r) => r.dedupKey === retenu.evenement.dedupKey && (r.orgId === null || r.orgId === retenu.evenement.orgId))
		.map((r) => dateJour(r.date))
		.filter((d): d is string => d !== null)
		.sort()[0] ?? null;
	const detection = enJours(dateDetection);
	const rattachement = enJours(dateRattachement);
	const retard = detection !== null && rattachement !== null && rattachement > detection
		? rattachement - detection
		: 0;
	const orgId = retenu.evenement.orgId;

	return {
		...base(incident),
		statut: retard > 0 ? "rattaché_en_retard" : "vu",
		vu: true,
		motif: null,
		dateDetection,
		dateRattachement,
		delaiJours: detection !== null ? detection - enJours(incident.datePublique)! : null,
		delaiRattachementJours: retard > 0 ? retard : null,
		organisme: orgId !== null ? (donnees.nomsOrg.get(orgId) ?? null) : null,
		evenementId: retenu.evenement.id,
		raison: retenu.raison,
	};
}

/** Chiffres publiés à côté du tableau nominatif. */
export function synthetiser(resultats: readonly ResultatIncident[]) {
	const vus = resultats.filter((r) => r.vu);
	const statuts: Record<StatutCouverture, number> = {
		vu: 0,
		rattaché_en_retard: 0,
		pas_collecté: 0,
		pas_rattaché: 0,
		pas_jugé_cyber: 0,
	};
	for (const resultat of resultats) statuts[resultat.statut]++;
	return {
		incidents: resultats.length,
		vus: vus.length,
		rattachesEnRetard: statuts.rattaché_en_retard,
		taux: resultats.length === 0 ? 0 : Math.round((vus.length / resultats.length) * 1000) / 10,
		statuts,
		motifs: {
			pas_collecté: statuts.pas_collecté,
			pas_rattaché: statuts.pas_rattaché,
			pas_jugé_cyber: statuts.pas_jugé_cyber,
		},
		delaiMedianJours: mediane(vus.map((r) => r.delaiJours).filter((d): d is number => d !== null)),
	};
}
