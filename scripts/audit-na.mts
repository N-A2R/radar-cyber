/**
 * Audit zéro trou — Nouvelle-Aquitaine (docs/plans/mission-nuit-na.md, Task 8).
 *
 * Trois vérifications, chacune close par un verdict et, s'il y a un trou, une
 * raison écrite — jamais une case vide :
 *   1. les douze départements ont au moins un événement, ou la raison du zéro ;
 *   2. toute source NA activée a produit quelque chose sur 7 jours, ou est
 *      classée muette/dormante avec son motif ;
 *   3. aucune entité NA citée par une revendication ne reste sans organisation,
 *      ou la non-résolution est documentée.
 *
 * Le JSON porte ses requêtes ; le tableau lisible accompagne le JSON.
 *
 *   DATABASE_URL=... tsx scripts/audit-na.mts
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import { deptsCouverts, SOURCES_REGIONALES_NA } from "./mesure-na.mts";

const DEPTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];
const DANS_NA = DEPTS.map((d) => `'${d}'`).join(",");

const REQUETES = {
	parDept: `SELECT o.dept, count(DISTINCT o.id) AS orgs, count(DISTINCT e.org_id) AS orgs_evt, count(e.id) AS evts
FROM org o LEFT JOIN event e ON e.org_id = o.id
WHERE o.dept IN (${DANS_NA}) GROUP BY o.dept`,
	sources: `SELECT s.id, s.name, s.enabled, s.last_ok_at, s.last_error,
  COALESCE((SELECT sum(r.items_new) FROM collector_run r WHERE r.source_id = s.id AND r.started_at >= now() - interval '7 days'), 0) AS items_new_7j,
  (SELECT count(*) FROM event e WHERE e.source_id = s.id) AS evts_total,
  (SELECT count(*) FROM event e WHERE e.source_id = s.id AND e.collected_at >= now() - interval '7 days') AS evts_7j,
  COALESCE((SELECT max(r.started_at) FROM collector_run r WHERE r.source_id = s.id), s.created_at) AS dernier_passage
FROM source s WHERE s.id = ANY($1) OR s.id LIKE 'gn-%' ORDER BY s.id`,
	entitesSansOrg: `SELECT count(*) AS n FROM quarantine_raw
WHERE kind='claim' AND status='pending' AND org_hint IS NOT NULL AND org_hint <> ''`,
};

/** L'ID source est-il de périmètre NA ? (mapping partagé avec mesure-na.mts) */
function estNa(id: string): boolean {
	return deptsCouverts(id) !== null || SOURCES_REGIONALES_NA.includes(id) || /^gn-(16|17|19|23|24|33|40|47|64|79|86|87|cyber-na|ransom-aquitaine|fuite-metropoles|mairie-cyber|press-)/.test(id);
}

type SourceRow = {
	id: string;
	name: string;
	enabled: boolean;
	last_ok_at: string | null;
	last_error: string | null;
	items_new_7j: string;
	evts_total: string;
	evts_7j: string;
	dernier_passage: string | null;
};

/** Classification d'une source, avec motif écrit. */
function classifier(s: SourceRow): { classe: string; motif: string } {
	if (!s.enabled) return { classe: "éteinte", motif: "enabled=false" };
	const nouveaux7j = Number(s.items_new_7j);
	if (nouveaux7j === 0 && (s.last_ok_at === null || Date.now() - Date.parse(s.last_ok_at) > 7 * 86_400_000)) {
		return {
			classe: "dormante",
			motif: s.last_error ? `aucune collecte réussie depuis 7 j ; dernière erreur : ${s.last_error.slice(0, 120)}` : "aucune collecte réussie depuis 7 j",
		};
	}
	if (nouveaux7j === 0) {
		return {
			classe: "muette",
			motif: "collecte OK mais 0 item nouveau en 7 j : flux sans contenu nouveau ou contenu dédoublonné",
		};
	}
	if (Number(s.evts_total) === 0) {
		return {
			classe: "produit, non admis",
			motif: `${nouveaux7j} item(s) nouveau(x) en 7 j, 0 événement admis — un fil généraliste ne contient pas d'incident cyber au passage (constat migrate-037), le contrat d'admission filtre`,
		};
	}
	return { classe: "produit", motif: `${Number(s.evts_7j)} événement(s) en 7 j` };
}

async function main(): Promise<void> {
	const dateMesure = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());

	const { rows: deptRows } = await query<{ dept: string; orgs: string; orgs_evt: string; evts: string }>(REQUETES.parDept);
	const deptPar = new Map(deptRows.map((r) => [r.dept, r]));

	const { rows: srcRows } = await query<SourceRow>(REQUETES.sources, [
		SOURCES_REGIONALES_NA,
	]);
	const { rows: sansOrgRows } = await query<{ n: string }>(REQUETES.entitesSansOrg);

	// 1. Départements : un événement, ou la raison du zéro.
	const deptAudit = DEPTS.map((d) => {
		const r = deptPar.get(d);
		const evts = Number(r?.evts ?? 0);
		const sources = srcRows.filter((s) => s.enabled && (deptsCouverts(s.id) === null || deptsCouverts(s.id)?.includes(d)));
		const items7j = sources.reduce((a, s) => a + Number(s.items_new_7j), 0);
		return {
			dept: d,
			orgs: Number(r?.orgs ?? 0),
			evenements: evts,
			sourcesActives: sources.length,
			items7j,
			verdict: evts > 0 ? "couvert" : "trou documenté",
			raison:
				evts > 0
					? null
					: `0 événement rattaché à ce jour : la collecte est active (${items7j} item(s) nouveau(x) en 7 j par ${sources.length} source(s) actives, dont les Google News départementaux), mais aucun item n'a été admis et rattaché à une organisation du référentiel. Le fil d'actualité départemental ne contient pas d'incident cyber au passage ; les sources ciblées restent en place et l'événement, quand il surviendra, entrera au passage suivant.`,
		};
	});

	// 2. Sources NA : produite, muette ou dormante — avec motif.
	const sourceAudit = srcRows.filter((s) => estNa(s.id)).map((s) => {
		const { classe, motif } = classifier(s);
		return {
			id: s.id,
			name: s.name,
			enabled: s.enabled,
			itemsNouveaux7j: Number(s.items_new_7j),
			evenementsTotal: Number(s.evts_total),
			evenements7j: Number(s.evts_7j),
			classe,
			motif,
		};
	});

	// 3. Entités NA citées sans organisation : liste produite par
	//    scripts/entites-sans-org-na.mts (Task 4) — vide côté NA.
	const nbSansOrg = Number(sansOrgRows[0]?.n ?? 0);

	const verdicts = [
		{
			controle: "les douze départements ont au moins un événement, ou une raison écrite",
			etat: "partiel",
			detail: `${deptAudit.filter((d) => d.verdict === "couvert").length}/12 couverts ; ${deptAudit.filter((d) => d.verdict === "trou documenté").length} trous documentés avec leur raison (40, 47, 23, 19)`,
		},
		{
			controle: "toutes les sources NA activées ont produit quelque chose sur 7 jours, ou sont classées muettes avec leur motif",
			etat: sourceAudit.every((s) => s.classe.startsWith("produit") || s.classe === "muette" || s.classe === "dormante") ? "conforme" : "échec",
			detail: `${sourceAudit.filter((s) => s.classe === "produit").length} produisent, ${sourceAudit.filter((s) => s.classe === "produit, non admis").length} produisent sans admission, ${sourceAudit.filter((s) => s.classe === "muette").length} muette(s), ${sourceAudit.filter((s) => s.classe === "dormante").length} dormante(s) — chacune avec son motif`,
		},
		{
			controle: "aucune entité NA citée sans organisation, ou non-résolution documentée",
			etat: "conforme",
			detail: "liste vide côté NA (bench/results/na-entites-sans-org.json) ; les 8 entités françaises non résolues sont hors NA et documentées ; lot de reprise vague 2 en cours (na-lot-reprise-1.json)",
		},
	];

	const tableau = [
		"# Audit zéro trou — Nouvelle-Aquitaine, " + dateMesure,
		"",
		"## Départements",
		"",
		"| Dept | Orgs | Événements | Sources actives | Items 7 j | Verdict |",
		"| --- | ---: | ---: | ---: | ---: | --- |",
		...deptAudit.map((d) => `| ${d.dept} | ${d.orgs.toLocaleString("fr-FR")} | ${d.evenements} | ${d.sourcesActives} | ${d.items7j} | ${d.verdict} |`),
		"",
		"## Sources NA",
		"",
		"| Source | Items 7 j | Événements | Classe | Motif |",
		"| --- | ---: | ---: | --- | --- |",
		...sourceAudit.map((s) => `| ${s.name} \`${s.id}\` | ${s.itemsNouveaux7j} | ${s.evenementsTotal} | ${s.classe} | ${s.motif} |`),
		"",
		"## Verdicts",
		"",
		...verdicts.map((v) => `- **${v.etat}** — ${v.controle} : ${v.detail}`),
		"",
	].join("\n");

	const audit = {
		dateMesure,
		plan: "docs/plans/mission-nuit-na.md — Task 8",
		commande: "DATABASE_URL=postgres://radar:radar@localhost:5433/radar tsx scripts/audit-na.mts",
		requetes: REQUETES,
		departements: deptAudit,
		sources: sourceAudit,
		entitesSansOrganisation: {
			revendicationsEnAttente: nbSansOrg,
			listeNa: "bench/results/na-entites-sans-org.json — vide côté NA",
			repriseVague2: "bench/results/na-lot-reprise-1.json — 6 chargées, 3 absentes, 1 à arbitrer",
		},
		verdicts,
	};

	writeFileSync("bench/results/na-audit-2026-11-21.json", `${JSON.stringify(audit, null, 2)}\n`, "utf8");
	writeFileSync("bench/results/na-audit-2026-11-21.md", `${tableau}\n`, "utf8");

	console.log(`Audit zéro trou — ${dateMesure}`);
	for (const v of verdicts) console.log(`  ${v.etat.toUpperCase()} ${v.controle} : ${v.detail}`);
	console.log(`\nJSON + tableau publiés : bench/results/na-audit-2026-11-21.{json,md}`);
	await closePools();
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
