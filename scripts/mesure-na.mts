/**
 * Mesure NA — socle de la mission « Nuit Nouvelle-Aquitaine »
 * (docs/plans/mission-nuit-na.md, Task 0).
 *
 * Publie, en un JSON committable :
 *   - par département (les 12 de NA) : organisations du référentiel,
 *     organisations avec au moins un événement rattaché, événements rattachés,
 *     sources actives couvrant ce département ;
 *   - les sources de périmètre NA : actives, muettes (aucun item nouveau en
 *     7 jours), avec leur dernier état d'exécution ;
 *   - les événements régionaux sans rattachement (non comptés comme couverts).
 *
 * Doctrine : un chiffre sans requête n'est pas écrit. Chaque bloc du JSON porte
 * la requête SQL qui l'a produit (champ `sql`), et la sortie est comparée,
 * compteur par compteur, à la table de baseline du plan (`concordance`,
 * `ecartVsPlan`). La table du plan sert de repère de contrôle ; le JSON ne
 * recopie AUCUN de ses chiffres — tout compteur sort d'une requête ci-dessous.
 *
 * La mesure se rejoue telle quelle :
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     tsx scripts/mesure-na.mts
 *   DATABASE_URL=... tsx scripts/mesure-na.mts --json=bench/results/na-xxx.json
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";

const argv = process.argv.slice(2);
const SORTIE_JSON =
	argv.find((a) => a.startsWith("--json="))?.split("=")[1] ??
	`bench/results/na-baseline-${new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date())}.json`;

/** Les douze départements de Nouvelle-Aquitaine, ordre INSEE. */
const DEPTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

const DANS_NA = DEPTS.map((d) => `'${d}'`).join(",");

/**
 * Les requêtes, une par bloc du JSON. Elles sont exécutées ici et publiées
 * telles quelles dans le résultat : c'est la preuve du chiffre.
 */
const REQUETES = {
	orgsParDept: `SELECT dept, count(*)::text AS n FROM org WHERE dept IN (${DANS_NA}) GROUP BY dept`,
	evtParDept: `SELECT o.dept, count(*)::text AS evts, count(DISTINCT e.org_id)::text AS orgs FROM event e JOIN org o ON e.org_id = o.id WHERE o.dept IN (${DANS_NA}) GROUP BY o.dept`,
	sources: `SELECT s.id, s.name, s.enabled, s.last_ok_at, s.last_error_at, s.last_error, COALESCE((SELECT sum(r.items_new) FROM collector_run r WHERE r.source_id = s.id AND r.started_at >= now() - interval '7 days'), 0) AS nouveaux7j FROM source s WHERE s.id = ANY($1) ORDER BY s.id`,
	orgsNa: `SELECT count(*)::text AS n FROM org WHERE dept IN (${DANS_NA})`,
	evtNa: `SELECT count(*)::text AS evts, count(DISTINCT e.org_id)::text AS orgs FROM event e JOIN org o ON e.org_id = o.id WHERE o.dept IN (${DANS_NA})`,
	evtRegionalSansOrg: `SELECT count(*)::text AS n FROM event WHERE regional = true AND org_id IS NULL`,
	sourcesTotalesActives: `SELECT count(*)::text AS actives FROM source WHERE enabled = true`,
};

/**
 * Sources de périmètre NA : le Google News départemental (`gn-XX`), les flux
 * Google News régionaux et la presse/institutions de la région. Une source
 * nationale (Le Monde, CERT-FR…) n'est PAS régionale même si elle cite la
 * région un jour : elle ne compte pas dans ces compteurs.
 */
export const SOURCES_REGIONALES_NA = [
	"presse-sudouest",
	"presse-sudouest-rss",
	"presse-sudouest-gironde",
	"presse-sudouest-pyrenees",
	"presse-sudouest-charente",
	"presse-sudouest-charente-maritime",
	"presse-sudouest-dordogne",
	"presse-sudouest-landes",
	"presse-sudouest-lot-et-garonne",
	"presse-sudouest-deux-sevres",
	"presse-lnr-vienne",
	"presse-lnr-deuxsevres",
	"presse-charentelibre",
	"presse-france3-na",
	"presse-mediacites",
	"presse-rue89bordeaux",
	"presse-ouestfrance-rss",
	"eco-jde-na",
	"univ-limoges",
	"univ-larochelle",
	"chu-poitiers",
	"gn-press-lamontagne",
	"gn-press-lepopulaire",
];

/** Source → départements couverts. `null` = couvre toute la région (les 12). */
export function deptsCouverts(id: string): string[] | null {
	const gnDept = /^gn-(\d{2})$/.exec(id);
	if (gnDept) return DEPTS.includes(gnDept[1]) ? [gnDept[1]] : null;
	switch (id) {
		case "presse-sudouest-gironde":
			return ["33"];
		case "presse-sudouest-pyrenees":
			return ["64"];
		case "presse-sudouest-charente":
			return ["16"];
		case "presse-sudouest-charente-maritime":
			return ["17"];
		case "presse-sudouest-dordogne":
			return ["24"];
		case "presse-sudouest-landes":
			return ["40"];
		case "presse-sudouest-lot-et-garonne":
			return ["47"];
		case "presse-sudouest-deux-sevres":
			return ["79"];
		case "presse-lnr-vienne":
			return ["86"];
		case "presse-lnr-deuxsevres":
			return ["79"];
		case "univ-limoges":
			return ["87"];
		case "univ-larochelle":
			return ["17"];
		case "chu-poitiers":
			return ["86"];
		case "gn-press-lamontagne":
			return ["19", "23"];
		case "gn-press-lepopulaire":
			return ["87"];
		default:
			// Tout le reste de la liste est de portée régionale : France 3 NA,
			// Sud Ouest national, Médiacités, Google News régionaux… ils couvrent
			// les douze départements à la fois.
			return null;
	}
}

type CompteurDept = {
	orgs: number;
	orgsAvecEvenement: number;
	evenements: number;
	sourcesActives: number;
};

type SourceMute = {
	id: string;
	name: string;
	lastOkAt: string | null;
	lastError: string | null;
	itemsNouveaux7j: number;
	/** Départements couverts, `null` = toute la région. */
	depts: string[] | null;
};

type LigneConcordance = {
	compteur: string;
	attendu: number | string[];
	mesure: number | string[];
	conforme: boolean;
};

/**
 * Valeurs de la table « Baseline mesurée au départ » du plan (relevées à la
 * main en psql, 2026-11-21). Elles ne remplissent RIEN : elles servent
 * uniquement au contrôle de concordance exigé par Task 0.
 */
const ATTENDU_PLAN = {
	orgsNa: 1242882,
	rattachesNa: 31,
	orgsNaAvecEvenement: 25,
	girondeEvenements: 20,
	deptsSansEvenement: ["40", "47", "23", "19"],
	sourcesTotalesActives: 181,
};

function conforme(attendu: number | string[], mesure: number | string[]): boolean {
	if (Array.isArray(attendu) && Array.isArray(mesure)) {
		const a = [...attendu].sort();
		const m = [...mesure].sort();
		return a.length === m.length && a.every((v, i) => v === m[i]);
	}
	if (typeof attendu === "number" && typeof mesure === "number") return attendu === mesure;
	return false;
}

async function main(): Promise<void> {
	// Date locale (Europe/Paris) : la mesure de nuit est datée du jour français,
	// pas du jour UTC qui a déjà basculé.
	const dateMesure = new Intl.DateTimeFormat("fr-CA", {
		timeZone: "Europe/Paris",
	}).format(new Date());

	// 1. Organisations par département.
	const { rows: orgsDept } = await query<{ dept: string; n: string }>(REQUETES.orgsParDept);
	const orgsParDept = new Map(orgsDept.map((r) => [r.dept, Number(r.n)]));

	// 2. Événements rattachés et organisations touchées, par département.
	const { rows: evtDept } = await query<{ dept: string; evts: string; orgs: string }>(
		REQUETES.evtParDept,
	);
	const evtsParDept = new Map(evtDept.map((r) => [r.dept, Number(r.evts)]));
	const orgsEvtParDept = new Map(evtDept.map((r) => [r.dept, Number(r.orgs)]));

	// 3. Sources : toutes les sources de périmètre NA (actives ou non), leur
	//    rendement sur 7 jours (collector_run) et leur dernier état.
	const ids = [
		...SOURCES_REGIONALES_NA,
		...DEPTS.map((d) => `gn-${d}`),
		"gn-cyber-na",
		"gn-ransom-aquitaine",
		"gn-fuite-metropoles",
		"gn-mairie-cyber",
	];
	const { rows: srcRows } = await query<{
		id: string;
		name: string;
		enabled: boolean;
		lastOkAt: string | null;
		lastErrorAt: string | null;
		lastError: string | null;
		nouveaux7j: string;
	}>(REQUETES.sources, [ids]);

	const parDept: Record<string, CompteurDept> = {};
	for (const dept of DEPTS) {
		const sourcesActives = srcRows.filter((s) => {
			if (!s.enabled) return false;
			const couverts = deptsCouverts(s.id);
			return couverts === null || couverts.includes(dept);
		}).length;
		parDept[dept] = {
			orgs: orgsParDept.get(dept) ?? 0,
			orgsAvecEvenement: orgsEvtParDept.get(dept) ?? 0,
			evenements: evtsParDept.get(dept) ?? 0,
			sourcesActives,
		};
	}

	// 4. Sources muettes : actives, périmètre NA, zéro item nouveau en 7 jours.
	//    Une source muette se documente ; elle ne se maquille pas avec du vide.
	const muettes: SourceMute[] = srcRows
		.filter((s) => s.enabled && Number(s.nouveaux7j) === 0)
		.map((s) => ({
			id: s.id,
			name: s.name,
			lastOkAt: s.lastOkAt,
			lastError: s.lastError,
			itemsNouveaux7j: Number(s.nouveaux7j),
			depts: deptsCouverts(s.id),
		}));

	// 5. Totaux régionaux.
	const { rows: totOrgs } = await query<{ n: string }>(REQUETES.orgsNa);
	const { rows: totEvt } = await query<{ evts: string; orgs: string }>(REQUETES.evtNa);
	const { rows: evtRegionalSansOrg } = await query<{ n: string }>(REQUETES.evtRegionalSansOrg);
	const { rows: sourcesTotales } = await query<{ actives: string }>(
		REQUETES.sourcesTotalesActives,
	);

	const regionalesActives = srcRows.filter((s) => s.enabled).length;
	const deptsSansEvenement = DEPTS.filter((d) => (parDept[d]?.evenements ?? 0) === 0);

	// 6. Concordance contre la table du plan : chaque écart est écrit, jamais
	//    ni lissé ni corrigé à la main.
	const concordance: LigneConcordance[] = [
		{
			compteur: "referentiel.orgsNa",
			attendu: ATTENDU_PLAN.orgsNa,
			mesure: Number(totOrgs[0]?.n ?? 0),
			conforme: conforme(ATTENDU_PLAN.orgsNa, Number(totOrgs[0]?.n ?? 0)),
		},
		{
			compteur: "evenements.rattachesNa",
			attendu: ATTENDU_PLAN.rattachesNa,
			mesure: Number(totEvt[0]?.evts ?? 0),
			conforme: conforme(ATTENDU_PLAN.rattachesNa, Number(totEvt[0]?.evts ?? 0)),
		},
		{
			compteur: "evenements.orgsNaAvecEvenement",
			attendu: ATTENDU_PLAN.orgsNaAvecEvenement,
			mesure: Number(totEvt[0]?.orgs ?? 0),
			conforme: conforme(ATTENDU_PLAN.orgsNaAvecEvenement, Number(totEvt[0]?.orgs ?? 0)),
		},
		{
			compteur: "referentiel.parDepartement.33.evenements",
			attendu: ATTENDU_PLAN.girondeEvenements,
			mesure: parDept["33"]?.evenements ?? 0,
			conforme: conforme(ATTENDU_PLAN.girondeEvenements, parDept["33"]?.evenements ?? 0),
		},
		{
			compteur: "evenements.deptsSansEvenement",
			attendu: ATTENDU_PLAN.deptsSansEvenement,
			mesure: deptsSansEvenement,
			conforme: conforme(ATTENDU_PLAN.deptsSansEvenement, deptsSansEvenement),
		},
		{
			compteur: "sources.sourcesTotalesActives",
			attendu: ATTENDU_PLAN.sourcesTotalesActives,
			mesure: Number(sourcesTotales[0]?.actives ?? 0),
			conforme: conforme(ATTENDU_PLAN.sourcesTotalesActives, Number(sourcesTotales[0]?.actives ?? 0)),
		},
	];
	const ecartVsPlan = concordance
		.filter((c) => !c.conforme)
		.map((c) => ({
			compteur: c.compteur,
			attendu: c.attendu,
			mesure: c.mesure,
			// Motif par défaut d'un écart entre la table du plan (relevée à la main
			// plus tôt) et la mesure du script : les données ont bougé depuis.
			commentaire:
				"écart entre la table de baseline du plan (relevée à la main) et la mesure SQL du script : données qui ont bougé entre les deux relevés, ou périmètre de comptage différent",
		}));

	const mesure = {
		dateMesure,
		commande: "DATABASE_URL=postgres://radar:radar@localhost:5433/radar tsx scripts/mesure-na.mts",
		plan: "docs/plans/mission-nuit-na.md — Task 0",
		perimetre: {
			depts: DEPTS,
			joinOrg: "event.org_id = org.id, org.dept",
		},
		referentiel: {
			sql: REQUETES.orgsNa,
			orgsNa: Number(totOrgs[0]?.n ?? 0),
			parDepartement: {
				sql: `${REQUETES.orgsParDept} + ${REQUETES.evtParDept}`,
				depts: parDept,
			},
		},
		evenements: {
			sql: REQUETES.evtNa,
			rattachesNa: Number(totEvt[0]?.evts ?? 0),
			orgsNaAvecEvenement: Number(totEvt[0]?.orgs ?? 0),
			regionauxSansRattachement: {
				sql: REQUETES.evtRegionalSansOrg,
				total: Number(evtRegionalSansOrg[0]?.n ?? 0),
			},
			deptsSansEvenement,
		},
		sources: {
			sql: REQUETES.sources,
			regionalesNa: srcRows.length,
			regionalesActives,
			sourcesTotalesActives: {
				sql: REQUETES.sourcesTotalesActives,
				total: Number(sourcesTotales[0]?.actives ?? 0),
			},
			muettes,
		},
		concordance,
		ecartVsPlan,
	};

	console.log(`Mesure NA — ${dateMesure}`);
	console.log(
		`Référentiel : ${mesure.referentiel.orgsNa.toLocaleString("fr-FR")} orgs NA · ` +
			`${mesure.evenements.rattachesNa} événements rattachés · ` +
			`${mesure.evenements.orgsNaAvecEvenement} orgs touchées`,
	);
	console.log(`Départements à zéro : ${deptsSansEvenement.join(", ") || "aucun"}`);
	console.log(
		`Sources NA : ${regionalesActives}/${srcRows.length} actives · ` +
			`${muettes.length} muette(s) sur 7 jours`,
	);
	for (const [dept, c] of Object.entries(parDept)) {
		console.log(
			`  ${dept} : ${c.orgs.toLocaleString("fr-FR").padStart(9)} orgs · ` +
				`${c.evenements} evt · ${c.orgsAvecEvenement} orgs touchées · ${c.sourcesActives} sources`,
		);
	}
	console.log("Concordance vs plan :");
	for (const c of concordance) {
		console.log(
			`  ${c.conforme ? "OK " : "ÉCART"} ${c.compteur} : mesure ${JSON.stringify(c.mesure)} / plan ${JSON.stringify(c.attendu)}`,
		);
	}

	writeFileSync(SORTIE_JSON, `${JSON.stringify(mesure, null, 2)}\n`, "utf8");
	console.log(`\nmesure publiée : ${SORTIE_JSON}`);
	await closePools();
}

// Exécuté seulement quand le script est invoqué directement : mesure-na.mts
// exporte son mapping de sources pour scripts/audit-na.mts, et un import ne
// doit pas relancer la mesure ni fermer les pools.
const estDirect = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (estDirect) {
	main().catch(async (error: unknown) => {
		console.error(error);
		await closePools().catch(() => {});
		process.exitCode = 1;
	});
}
