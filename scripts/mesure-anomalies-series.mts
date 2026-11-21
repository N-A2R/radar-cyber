/**
 * Mesure du détecteur d'anomalies de séries sur l'historique réel.
 *
 * Rejeu pur : les faits sont lus dans la base, aucune écriture, aucune
 * invocation de l'horloge dans le détecteur. Les alertes sont classées à la
 * main sur la totalité de la liste (7 alertes), puis le fichier de verdicts
 * est relu ici pour publier un taux reproductible.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     tsx scripts/mesure-anomalies-series.mts \
 *     --json=bench/results/anomalies-series-2026-11-21.json \
 *     --verdicts=bench/results/anomalies-series-verdicts.json --echantillon=20
 */
import { readFileSync, writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
	detecterAnomaliesSeries,
	FENETRE_REFERENCE_JOURS,
	OBSERVATIONS_MIN,
	SEUIL_Z,
	ECART_MIN,
	type AlerteSerie,
	type PointSerie,
} from "../apps/api/src/analyse/anomalies-series.js";

const argv = process.argv.slice(2);
const option = (nom: string): string | null =>
	argv.find((a) => a.startsWith(`--${nom}=`))?.split("=")[1] ?? null;
const SORTIE_JSON = option("json");
const VERDICTS = option("verdicts");
const ECHANTILLON = Number(option("echantillon") ?? 20);
if (!Number.isInteger(ECHANTILLON) || ECHANTILLON < 1) {
	throw new RangeError("echantillon doit être un entier positif");
}

export type ClassementManuel = "vraie" | "fausse" | "non_classable";
export type VerdictManuel = { classement: ClassementManuel; raison: string };

/** Échantillon déterministe, réparti sur toute la liste triée par clé. */
export function echantillonner<T>(elements: readonly T[], taille: number): T[] {
	if (elements.length <= taille) return [...elements];
	const pas = elements.length / taille;
	return Array.from({ length: taille }, (_, i) => elements[Math.floor(i * pas)]!)
		.filter((e): e is T => e !== undefined);
}

/** Taux sur les seules alertes classées ; jamais 0/0. */
export function tauxFausses(verdicts: readonly VerdictManuel[]): number | null {
	const classes = verdicts.filter((v) => v.classement !== "non_classable");
	if (classes.length === 0) return null;
	return Math.round((classes.filter((v) => v.classement === "fausse").length / classes.length) * 1000) / 10;
}

type Fait = { id: string; titre: string; famille: string; url: string | null };

async function main(): Promise<void> {
	const faits = await query<{
		id: string;
		date: string;
		orgId: number | null;
		secteur: string;
		sourceId: string;
		titre: string;
		famille: string;
		url: string | null;
	}>(
		`SELECT e.id::text AS id, e.observed_at::text AS date, e.org_id AS "orgId",
		        COALESCE(NULLIF(btrim(o.sector), ''), NULLIF(btrim(o.kind), ''), 'inconnu') AS secteur,
		        e.source_id AS "sourceId", e.title AS titre, e.family AS famille, e.source_url AS url
		   FROM event e LEFT JOIN org o ON o.id = e.org_id`,
	);
	const parFait = new Map<string, Fait>();
	const points: PointSerie[] = [];
	for (const f of faits.rows) {
		const id = String(f.id);
		parFait.set(id, { id, titre: f.titre, famille: f.famille, url: f.url });
		// Un fait sans organisation ni secteur connu ne porte pas de série :
		// les 21 000 avis NVD non rattachés écraseraient les deux autres axes.
		if (f.orgId !== null) {
			points.push({ axe: "organisation", groupe: `org-${f.orgId}`, date: f.date, valeur: 1, faits: [id] });
		}
		if (f.secteur !== "inconnu") {
			points.push({ axe: "secteur", groupe: f.secteur, date: f.date, valeur: 1, faits: [id] });
		}
		points.push({ axe: "source", groupe: f.sourceId, date: f.date, valeur: 1, faits: [id] });
	}

	const dates = faits.rows.map((f) => Date.parse(f.date)).filter(Number.isFinite);
	const maintenant = Math.max(...dates);
	const resultat = detecterAnomaliesSeries(points, { maintenant });

	const jugements = VERDICTS === null ? {} : JSON.parse(readFileSync(VERDICTS, "utf8")) as Record<string, VerdictManuel>;
	const alertesTrieesParCle = [...resultat.alertes].sort((a, b) => a.cle.localeCompare(b.cle));
	const sample = echantillonner(alertesTrieesParCle, ECHANTILLON).map((a) => ({
		cle: a.cle,
		axe: a.axe,
		groupe: a.groupe,
		date: a.date,
		valeur: a.valeur,
		ecart: a.ecart,
		z: Math.round(a.z * 100) / 100,
		explication: a.explication,
		faits: a.faits.slice(0, 6).map((id) => parFait.get(String(id)) ?? null),
		verdict: jugements[a.cle] ?? null,
	}));
	const verdicts = sample.flatMap((a) => (a.verdict === null ? [] : [a.verdict]));

	const compteParAxe = Object.fromEntries(
		resultat.diagnostics.map((d) => [d.axe, {
			alertes: resultat.alertes.filter((a) => a.axe === d.axe).length,
			groupes: d.groupes,
			groupesEligibles: d.groupesEligibles,
			maxJoursObserves: d.maxJoursObserves,
			pointsJours: d.points,
		}]),
	);
	const rapport = {
		dateMesure: new Date(maintenant).toISOString().slice(0, 10),
		commande: `DATABASE_URL=$DATABASE_URL tsx scripts/mesure-anomalies-series.mts --json=${SORTIE_JSON ?? "-"} --verdicts=${VERDICTS ?? "-"} --echantillon=${ECHANTILLON}`,
		base: {
			evenements: faits.rows.length,
			organisations: new Set(faits.rows.map((f) => f.orgId)).size,
			sources: new Set(faits.rows.map((f) => f.sourceId)).size,
			premierFait: new Date(Math.min(...dates)).toISOString().slice(0, 10),
			dernierFait: new Date(maintenant).toISOString().slice(0, 10),
			joursDistincts: new Set(dates.map((d) => Math.floor(d / 86_400_000))).size,
		},
		seuils: {
			fenetreJours: FENETRE_REFERENCE_JOURS,
			observationsMin: OBSERVATIONS_MIN,
			seuilZ: SEUIL_Z,
			ecartMin: ECART_MIN,
		},
		total: {
			alertes: resultat.alertes.length,
			parAxe: compteParAxe,
		},
		echantillon: {
			taille: sample.length,
			classes: verdicts.length,
			vraies: verdicts.filter((v) => v.classement === "vraie").length,
			fausses: verdicts.filter((v) => v.classement === "fausse").length,
			nonClassables: verdicts.filter((v) => v.classement === "non_classable").length,
			tauxFaussesAlertes: tauxFausses(verdicts),
		},
		top5: resultat.alertes.slice(0, 5).map((a: AlerteSerie) => ({
			cle: a.cle,
			explication: a.explication,
			z: Math.round(a.z * 100) / 100,
			faits: a.faits.slice(0, 3).map((id) => parFait.get(String(id)) ?? null),
		})),
		alertes: resultat.alertes.map((a) => ({
			cle: a.cle,
			axe: a.axe,
			groupe: a.groupe,
			date: a.date,
			valeur: a.valeur,
			z: Math.round(a.z * 100) / 100,
			explication: a.explication,
		})),
		echantillonDetail: sample,
	};
	if (SORTIE_JSON !== null) writeFileSync(SORTIE_JSON, `${JSON.stringify(rapport, null, 2)}\n`);
	console.log(JSON.stringify({
		base: rapport.base,
		total: rapport.total,
		echantillon: rapport.echantillon,
		top5: rapport.top5.map((a) => `${a.explication} [z=${a.z}]`),
	}, null, 2));
}

if (import.meta.main) {
	main()
		.catch((err) => {
			console.error(err);
			process.exitCode = 1;
		})
		.finally(() => {
			void closePools();
		});
}
