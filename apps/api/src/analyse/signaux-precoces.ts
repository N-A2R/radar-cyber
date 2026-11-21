/**
 * Signaux précoces — mesure avant/après par piste, sur le corpus des 100 incidents.
 *
 * Module pur : ni base, ni réseau, ni date inventée. Un signal n'est accepté
 * que s'il porte un incident du corpus, une date calendaire valide et une
 * nature compatible avec sa piste. Les articles de presse sont la référence
 * « avant » : ils ne peuvent jamais devenir un signal nouveau.
 */
import { calculerBenchmark, type IncidentDatum } from "./benchmark-premier-regard.js";

const JOUR_MS = 86_400_000;

export const PISTES = ["ct", "revendication", "fuites", "dns"] as const;
export type Piste = (typeof PISTES)[number];

export const NATURES = [
	"ct_log",
	"site_revendication",
	"site_fuite",
	"changement_dns",
	"presse",
] as const;
export type Nature = (typeof NATURES)[number];

/** Une nature par piste : empêche qu'un article de presse soit compté deux fois. */
export const NATURE_PAR_PISTE: Readonly<Record<Piste, Nature>> = {
	ct: "ct_log",
	revendication: "site_revendication",
	fuites: "site_fuite",
	dns: "changement_dns",
};

export type SignalPrecoce = {
	incidentId: string | null;
	piste: Piste;
	date: string;
	sourceUrl: string;
	nature: Nature;
	organisation?: string;
	motif?: string;
};

export type BilanPiste = {
	signaux: number;
	incidentsCouverts: number;
	incidentsAvecGain: number;
	joursGagnes: {
		total: number;
		medianeCouverts: number | null;
		medianeTous: number | null;
		max: number;
	};
	delaiApresH: { n: number; mediane: number | null };
};

export type LigneSignaux = {
	id: string;
	entite: string;
	dateRadar: string;
	datePresse: string | null;
	parPiste: Record<Piste, { date: string | null; joursGagnes: number; delaiApresH: number | null }>;
	meilleur: { piste: Piste; date: string; joursGagnes: number } | null;
	delaiApresToutesPistesH: number | null;
};

export type MesureSignaux = {
	total: number;
	avecPresse: number;
	avant: { n: number; medianeH: number | null };
	apres: { n: number; medianeH: number | null };
	parPiste: Record<Piste, BilanPiste>;
	toutesPistes: BilanPiste;
	pisteDominante: Piste | null;
	incidents: LigneSignaux[];
};

function jour(date: string | null | undefined): number | null {
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const ms = Date.parse(`${date}T00:00:00Z`);
	if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) return null;
	return ms / JOUR_MS;
}

function mediane(valeurs: number[]): number | null {
	if (valeurs.length === 0) return null;
	const triees = [...valeurs].sort((a, b) => a - b);
	const milieu = Math.floor(triees.length / 2);
	return triees.length % 2 === 1
		? (triees[milieu] ?? 0)
		: ((triees[milieu - 1] ?? 0) + (triees[milieu] ?? 0)) / 2;
}

function bilan(valeurs: { couvert: boolean; gain: number; delaiH: number | null }[]): BilanPiste {
	const couverts = valeurs.filter((valeur) => valeur.couvert);
	const gains = couverts.map((valeur) => valeur.gain);
	return {
		signaux: couverts.length,
		incidentsCouverts: couverts.length,
		incidentsAvecGain: gains.filter((gain) => gain > 0).length,
		joursGagnes: {
			total: gains.reduce((somme, gain) => somme + gain, 0),
			medianeCouverts: mediane(gains),
			medianeTous: mediane(valeurs.map((valeur) => valeur.gain)),
			max: gains.length === 0 ? 0 : Math.max(...gains),
		},
		delaiApresH: {
			n: valeurs.filter((valeur) => valeur.delaiH !== null).length,
			mediane: mediane(
				valeurs
					.map((valeur) => valeur.delaiH)
					.filter((delai): delai is number => delai !== null),
			),
		},
	};
}

/** Calcule les gains par piste sans jamais remplacer la presse par un signal non vérifié. */
export function mesurerSignauxPrecoces(
	incidents: IncidentDatum[],
	signaux: SignalPrecoce[],
): MesureSignaux {
	const bilanBenchmark = calculerBenchmark(incidents);
	const connus = new Set(bilanBenchmark.lignes.map((ligne) => ligne.id));
	const parPiste = new Map<Piste, Map<string, number>>();
	for (const piste of PISTES) parPiste.set(piste, new Map());

	const signauxRetenus: Record<Piste, number> = { ct: 0, revendication: 0, fuites: 0, dns: 0 };
	for (const signal of signaux) {
		if (!signal.incidentId || !connus.has(signal.incidentId)) continue;
		if (!PISTES.includes(signal.piste)) continue;
		if (signal.nature !== NATURE_PAR_PISTE[signal.piste]) continue;
		if (!signal.sourceUrl) continue;
		const date = jour(signal.date);
		if (date === null) continue;
		const table = parPiste.get(signal.piste);
		if (!table) continue;
		const precedent = table.get(signal.incidentId);
		if (precedent === undefined || date < precedent) table.set(signal.incidentId, date);
		signauxRetenus[signal.piste] += 1;
	}

	const lignes: LigneSignaux[] = bilanBenchmark.lignes.map((ligne) => {
		const radar = jour(ligne.dates.radar);
		const presse = jour(ligne.datePremierMedia);
		const parPisteLigne = {} as LigneSignaux["parPiste"];
		let meilleur: LigneSignaux["meilleur"] = null;
		let traceToutes = radar;

		for (const piste of PISTES) {
			const dateJ = parPiste.get(piste)?.get(ligne.id);
			const date = dateJ === undefined ? null : new Date(dateJ * JOUR_MS).toISOString().slice(0, 10);
			const gain = dateJ !== undefined && radar !== null ? Math.max(0, radar - dateJ) : 0;
			const trace = dateJ !== undefined && (radar === null || dateJ < radar) ? dateJ : radar;
			const delaiH = presse !== null && trace !== null ? (trace - presse) * 24 : null;
			parPisteLigne[piste] = { date, joursGagnes: gain, delaiApresH: delaiH };
			if (traceToutes === null || (trace !== null && trace < traceToutes)) traceToutes = trace;
			if (gain > 0 && (meilleur === null || gain > meilleur.joursGagnes)) {
				meilleur = { piste, date: date as string, joursGagnes: gain };
			}
		}

		return {
			id: ligne.id,
			entite: ligne.entite,
			dateRadar: ligne.dates.radar ?? "",
			datePresse: ligne.datePremierMedia,
			parPiste: parPisteLigne,
			meilleur,
			delaiApresToutesPistesH:
				presse !== null && traceToutes !== null ? (traceToutes - presse) * 24 : null,
		};
	});

	const parPisteBilans = {} as Record<Piste, BilanPiste>;
	for (const piste of PISTES) {
		parPisteBilans[piste] = bilan(
			lignes.map((ligne) => ({
				couvert: ligne.parPiste[piste].date !== null,
				gain: ligne.parPiste[piste].joursGagnes,
				delaiH: ligne.parPiste[piste].delaiApresH,
			})),
		);
		parPisteBilans[piste].signaux = signauxRetenus[piste];
	}

	const toutesPistes = bilan(
		lignes.map((ligne) => ({
			couvert: ligne.meilleur !== null,
			gain: ligne.meilleur?.joursGagnes ?? 0,
			delaiH: ligne.delaiApresToutesPistesH,
		})),
	);
	toutesPistes.signaux = PISTES.reduce((somme, piste) => somme + signauxRetenus[piste], 0);

	const dominant = PISTES.reduce<Piste | null>((meilleur, piste) => {
		if (parPisteBilans[piste].joursGagnes.total === 0) return meilleur;
		if (meilleur === null) return piste;
		return parPisteBilans[piste].joursGagnes.total > parPisteBilans[meilleur].joursGagnes.total
			? piste
			: meilleur;
	}, null);

	return {
		total: lignes.length,
		avecPresse: lignes.filter((ligne) => ligne.datePresse !== null).length,
		avant: { n: bilanBenchmark.delaiHeures.n, medianeH: bilanBenchmark.delaiHeures.mediane },
		apres: { n: toutesPistes.delaiApresH.n, medianeH: toutesPistes.delaiApresH.mediane },
		parPiste: parPisteBilans,
		toutesPistes,
		pisteDominante: dominant,
		incidents: lignes,
	};
}
