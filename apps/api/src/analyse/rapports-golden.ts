/**
 * Quatre rapports de référence pour la suite golden.
 *
 * `hebdo` et `vide` utilisent le renderer du rapport hebdomadaire partagé avec
 * `scripts/weekly-report.mts` : une régression du rendu réellement produit est
 * donc détectée par le snapshot, pas seulement par un test de forme.
 * `video` et `org` sont des spécimens déterministes — le dépôt n'a pas encore
 * de producteur pour ces deux formats — écrits sans donnée personnelle et
 * sans source locale prétendue ; ils épinglent la forme et les chiffres du
 * format à tenir quand un producteur arrivera.
 *
 * Les dates sont normalisées avant comparaison : la suite compare ensuite les
 * octets du rapport normalisé. N'importe quelle différence de chiffre (ou de
 * libellé) fait échouer le snapshot.
 */
import { createHash } from "node:crypto";
import { isoDay, renderMarkdown as renderHebdo, type ReportData } from "./rapport-hebdo.js";

export type GoldenCode = "video" | "org" | "hebdo" | "vide";

export interface GoldenReport {
	code: GoldenCode;
	titre: string;
	rapport: string;
}

export const GOLDEN_CODES: readonly GoldenCode[] = ["video", "org", "hebdo", "vide"] as const;

export const GOLDEN_TITRES: Record<GoldenCode, string> = {
	video: "Rapport de veille audiovisuelle",
	org: "Rapport organisation",
	hebdo: "Rapport hebdomadaire",
	vide: "Rapport sans données",
};

const UNTIL = new Date("2026-11-22T00:00:00Z");
const SINCE = new Date("2026-11-15T00:00:00Z");

function rapportVideo(): string {
	return [
		`# Rapport de veille audiovisuelle — ${isoDay(UNTIL)}`,
		"",
		`Période : ${isoDay(SINCE)} → ${isoDay(UNTIL)} (7 jours).`,
		"",
		"## Synthèse",
		"",
		"- 3 flux audiovisuels de démonstration surveillés, 12 vidéos analysées, 2 signalements publiés.",
		"- 48 210 vues cumulées, dont 12 904 sur la dernière journée.",
		"",
		"## Flux suivis",
		"",
		"| Flux | Vidéos | Signalements | Vues | Dernière publication |",
		"| --- | ---: | ---: | ---: | --- |",
		`| flux-demo-a | 6 | 1 | 27 540 | ${isoDay(UNTIL)} |`,
		`| flux-demo-b | 4 | 1 | 14 860 | ${isoDay(new Date("2026-11-21T00:00:00Z"))} |`,
		`| flux-demo-c | 2 | 0 | 5 810 | ${isoDay(new Date("2026-11-19T00:00:00Z"))} |`,
		"",
		"## Chiffres publiés",
		"",
		"- Couverture des flux : 3/3.",
		"- Signalements publics : 2 sur 12 vidéos (16,7 %).",
	].join("\n");
}

function rapportOrg(): string {
	return [
		`# Rapport organisation — ${isoDay(UNTIL)}`,
		"",
		`Période : ${isoDay(SINCE)} → ${isoDay(UNTIL)} (7 jours).`,
		"",
		"## Synthèse",
		"",
		"- 4 organisations de démonstration suivies, 3 couvertes par au moins une source (75 %).",
		"- 9 événements publics rattachés, dont 2 de sévérité élevée ou critique.",
		"",
		"## Organisations",
		"",
		"| Organisation | Département | Événements | Sources | Couverture |",
		"| --- | --- | ---: | ---: | --- |",
		"| Organisation A | 33 | 4 | 2 | couverte |",
		"| Organisation B | 17 | 3 | 1 | couverte |",
		"| Organisation C | 86 | 2 | 1 | couverte |",
		"| Organisation D | 40 | 0 | 0 | non couverte |",
		"",
		"## Chiffres publiés",
		"",
		"- Taux de couverture : 75 % (3/4).",
		"- Volume public : 9 événements sur 7 jours.",
	].join("\n");
}

const HEBDO_SINCE = SINCE;
const HEBDO_UNTIL = UNTIL;
const HEBDO_STATS: ReportData["stats"] = {
	events: 9,
	high: 2,
	orgsCovered: 3,
	orgsTotal: 4,
	alerts: 2,
	alertsOpen: 1,
};

function rapportHebdo(vide: boolean): string {
	const data: ReportData = vide
		? {
				since: HEBDO_SINCE,
				until: HEBDO_UNTIL,
				days: 7,
				stats: { events: 0, high: 0, orgsCovered: 0, orgsTotal: 0, alerts: 0, alertsOpen: 0 },
				families: [],
				depts: [],
				events: [],
				quarantine: [],
				sourcesMuettes: [],
			}
		: {
				since: HEBDO_SINCE,
				until: HEBDO_UNTIL,
				days: 7,
				stats: HEBDO_STATS,
				families: [
					{ family: "ransomware", events: 5, maxSeverity: 5 },
					{ family: "phishing", events: 3, maxSeverity: 3 },
					{ family: "vuln", events: 1, maxSeverity: 2 },
				],
				depts: [
					{ dept: "33", events: 4, orgs: 1 },
					{ dept: "17", events: 3, orgs: 1 },
					{ dept: "86", events: 2, orgs: 1 },
				],
				events: [
					{
						title: "Incident de démonstration A",
						family: "ransomware",
						severity: 5,
						org: "Organisation A",
						sourceUrl: null,
						at: new Date("2026-11-21T12:00:00Z"),
					},
					{
						title: "Incident de démonstration B",
						family: "phishing",
						severity: 3,
						org: "Organisation B",
						sourceUrl: null,
						at: new Date("2026-11-20T12:00:00Z"),
					},
				],
				quarantine: [{ status: "review", n: 2 }],
				sourcesMuettes: [],
			};
	return renderHebdo(data);
}

/** Les quatre rapports figés, dans l'ordre attendu par le registre `report_run`. */
export function genererRapportsGolden(): GoldenReport[] {
	return [
		{ code: "video", titre: GOLDEN_TITRES.video, rapport: rapportVideo() },
		{ code: "org", titre: GOLDEN_TITRES.org, rapport: rapportOrg() },
		{ code: "hebdo", titre: GOLDEN_TITRES.hebdo, rapport: rapportHebdo(false) },
		{ code: "vide", titre: GOLDEN_TITRES.vide, rapport: rapportHebdo(true) },
	];
}

/** Remplace toute date par un jeton fixe : le diff ne porte que sur le fond. */
export function normaliserDates(texte: string): string {
	return texte
		.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g, "<DATE>")
		.replace(/\d{4}-\d{2}-\d{2}/g, "<DATE>")
		.replace(/\d{2}\/\d{2}\/\d{4}/g, "<DATE>");
}

/** Empreinte des octets normalisés : elle change si un chiffre public change. */
export function empreinteGolden(texte: string): string {
	return createHash("sha256").update(Buffer.from(normaliserDates(texte), "utf8")).digest("hex");
}
