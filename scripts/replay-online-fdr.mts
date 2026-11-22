/**
 * Rejeu FDR en ligne sur un flux d'événements annoté.
 *
 * Entrée (stdin, JSON) : { jours, evenements: [{ id, jour, groupe, valeur,
 * annotation }] }. L'annotation sert uniquement au score : le détecteur ne
 * reçoit que (axe, groupe, date, valeur) et n'a donc aucun accès aux étiquettes.
 *
 * Sortie (stdout, JSON) : bilan TP/FP, rappel, FDR globale et sur 7 jours,
 * plus les points (seuil, tp, fp) à insérer dans `eval_fdr`.
 */
import {
	detecterAnomaliesSeries,
	JOUR_MS,
	type PointSerie,
} from "../apps/api/src/analyse/anomalies-series.js";
import { FDR_CIBLE } from "../apps/api/src/analyse/online-fdr.js";

const DEBUT = Date.parse("2026-01-01T00:00:00Z");

type Evenement = {
	id: string | number;
	jour: number;
	groupe: string;
	valeur: number;
	annotation: "anomalie" | "bruit";
};

function dateIso(jour: number): string {
	return new Date(DEBUT + jour * JOUR_MS).toISOString().slice(0, 10);
}

const brut = await new Promise<string>((resolve, reject) => {
	let texte = "";
	process.stdin.setEncoding("utf8");
	process.stdin.on("data", (morceau) => { texte += morceau; });
	process.stdin.on("end", () => resolve(texte));
	process.stdin.on("error", reject);
});

const entree = JSON.parse(brut) as { jours: number; evenements: Evenement[] };
if (!Number.isInteger(entree.jours) || entree.jours < 8) throw new RangeError("jours doit être >= 8");
if (!Array.isArray(entree.evenements) || entree.evenements.length === 0) throw new RangeError("evenements vide");

const points: PointSerie[] = entree.evenements.map((e) => ({
	axe: "source",
	groupe: e.groupe,
	date: new Date(DEBUT + e.jour * JOUR_MS).toISOString(),
	valeur: e.valeur,
	faits: [e.id],
}));

const resultat = detecterAnomaliesSeries(points, {
	fdrCible: FDR_CIBLE,
	maintenant: DEBUT + (entree.jours - 1) * JOUR_MS,
});

const anomalies = new Set(
	entree.evenements.filter((e) => e.annotation === "anomalie").map((e) => `${e.groupe}:${dateIso(e.jour)}`),
);
const alertes = [...resultat.alertes].sort((a, b) => a.date.localeCompare(b.date) || a.cle.localeCompare(b.cle));

let tp = 0;
let fp = 0;
let tp7 = 0;
let fp7 = 0;
const premierJour7 = dateIso(entree.jours - 7);
const evalFdr: { seuil: number; tp: number; fp: number }[] = [];
for (const alerte of alertes) {
	const vraie = anomalies.has(`${alerte.groupe}:${alerte.date}`);
	if (vraie) tp++;
	else fp++;
	if (alerte.date >= premierJour7) {
		if (vraie) tp7++;
		else fp7++;
	}
	evalFdr.push({ seuil: alerte.fdr.seuil, tp, fp });
}

/** Taux de fausses découvertes ; `null` sur 0/0, jamais un faux zéro rassurant. */
const taux = (faux: number, vrais: number): number | null =>
	faux + vrais === 0 ? null : faux / (faux + vrais);
console.log(JSON.stringify({
	jours: entree.jours,
	evenements: entree.evenements.length,
	anomalies_annotees: anomalies.size,
	alertes: alertes.length,
	tp,
	fp,
	fdr: taux(fp, tp),
	rappel: anomalies.size === 0 ? null : tp / anomalies.size,
	tp_7j: tp7,
	fp_7j: fp7,
	fdr_7j: taux(fp7, tp7),
	eval_fdr: evalFdr,
}));
