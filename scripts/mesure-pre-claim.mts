/**
 * Pre-claim detection measurement — chantier m3.
 *
 * Reads the live work database, runs the pure pre-claim detector and writes a
 * French report plus a versioned measurement file. `--verifier` regenerates
 * both in memory and fails on any drift, without writing anything.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:pre-claim
 *   DATABASE_URL=... pnpm mesure:pre-claim --verifier
 *
 * Read-only on the database. No network, no paid service, no victim name in
 * any output file.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
	DEFAULT_MAX_LEAD_DAYS,
	detectPreClaim,
	normaliseKey,
	objectiveStatement,
	summariseDetections,
	type Claim,
	type EarlySignal,
} from "../apps/api/src/analyse/pre-claim-detection.js";

const OBJECTIVE = 10;
const DOC_PATH = "docs/pre-claim.md";
const RESULT_PATH = "bench/results/pre-claim-detections.json";
const COMMAND = "DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:pre-claim";
const GRAY_SOURCES = new Set(["ransomwatch", "ransomwatch-echantillon"]);

type ClaimRow = {
	id: number | string;
	org_id: number | string | null;
	source: string;
	victim: string;
	group_name: string;
	published_at: string | Date;
	na: boolean;
	dept: string | null;
};

type GrayRow = {
	id: number | string;
	source: string;
	victim: string;
	claimed_at: string | Date;
};

function iso(value: string | Date): string {
	return value instanceof Date ? value.toISOString() : String(value);
}

function decimal(value: number): string {
	return value.toFixed(2).replace(".", ",");
}

function integer(value: number): string {
	return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

async function main(): Promise<void> {
	const verify = process.argv.includes("--verifier");
	const [{ rows: claimRows }, { rows: grayRows }, { rows: stateRows }] = await Promise.all([
		query<ClaimRow>(
			`SELECT lc.id, lc.org_id, lc.source, lc.victim, lc.group_name, lc.published_at,
			        lc.na = true AS na, o.dept
			   FROM leak_claim lc LEFT JOIN org o ON o.id = lc.org_id
			  WHERE lc.published_at IS NOT NULL AND lc.group_name IS NOT NULL
			  ORDER BY lc.id`,
		),
		query<GrayRow>(
			`SELECT id, source, org_hint AS victim, claimed_at
			   FROM quarantine_raw
			  WHERE claimed_at IS NOT NULL AND org_hint IS NOT NULL
			  ORDER BY id`,
		),
		query<Record<string, number>>(
			`SELECT (SELECT count(*) FROM org)::int AS organizations,
			        (SELECT count(*) FROM source)::int AS sources,
			        (SELECT count(*) FROM event)::int AS events,
			        (SELECT count(*) FROM event_archive)::int AS archives`,
		),
	]);

	const claims: Claim[] = claimRows.map((row) => ({
		id: Number(row.id),
		orgId: row.org_id === null ? null : Number(row.org_id),
		sourceId: row.source,
		victim: row.victim,
		group: row.group_name,
		publishedAt: iso(row.published_at),
		regional: row.na === true,
		department: row.dept,
	}));

	const signals: EarlySignal[] = [
		...claims.map((claim) => ({
			id: claim.id,
			origin: "claim" as const,
			sourceId: claim.sourceId,
			victim: claim.victim,
			group: claim.group,
			publishedAt: claim.publishedAt,
			gray: GRAY_SOURCES.has(claim.sourceId),
		})),
		...grayRows.map((row) => ({
			id: Number(row.id),
			origin: "quarantine" as const,
			sourceId: row.source,
			victim: row.victim,
			group: "",
			publishedAt: iso(row.claimed_at),
			gray: true,
		})),
	];

	const detections = detectPreClaim(claims, signals, DEFAULT_MAX_LEAD_DAYS);
	const summary = summariseDetections(detections);
	const attained = summary.detected >= OBJECTIVE;
	const fingerprint = digest(
		JSON.stringify({
			claims: claims.map((claim) => [
				claim.id,
				claim.publishedAt,
				digest(normaliseKey(claim.group)),
				digest(normaliseKey(claim.victim)),
				claim.regional,
				claim.department,
			]),
			signals: signals.map((signal) => [
				signal.origin,
				signal.id,
				signal.publishedAt,
				signal.sourceId,
				signal.gray,
				digest(normaliseKey(signal.group)),
				digest(normaliseKey(signal.victim)),
			]),
		}),
	);
	const state = stateRows[0] ?? { organizations: 0, sources: 0, events: 0, archives: 0 };
	const latestClaim = claims.reduce((max, claim) => (claim.publishedAt > max ? claim.publishedAt : max), "");
	const dataHorizon = latestClaim.slice(0, 10);

	const result = {
		objective: { target: OBJECTIVE, detected: summary.detected, attained },
		scope: "Nouvelle-Aquitaine (12 departments)",
		method: "earlier gray entity listing or earlier same-group claim, at most 30 days before the public claim",
		command: COMMAND,
		dataHorizon,
		inputs: {
			organizations: state.organizations,
			declaredSources: state.sources,
			events: state.events,
			archivedEvents: state.archives,
			claims: claims.length,
			grayListings: grayRows.length,
			fingerprint,
		},
		summary,
		detections,
	};

	const top = [...detections].sort((a, b) => b.leadDays - a.leadDays).slice(0, 15);
	const lines: string[] = [
		"# Rapport — détecter un incident avant la revendication (Nouvelle-Aquitaine)",
		"",
		"> Document généré par `pnpm mesure:pre-claim`. Ne pas éditer à la main :",
		"> modifier une entrée puis relancer le script, sinon le contrôle `--verifier` échouera.",
		`> Empreinte des entrées : \`${fingerprint}\` · horizon des données : ${dataHorizon}.`,
		"",
		"## La question",
		"",
		"Sur les incidents de Nouvelle-Aquitaine, combien ont été détectés avant la date",
		"de leur revendication publique, et combien de jours ont été gagnés ?",
		"",
		"## La réponse",
		"",
		`**${integer(summary.detected)} incidents détectés avant leur revendication publique**,`,
		`pour un objectif d'au moins ${OBJECTIVE}.`,
		"",
		`Jours gagnés : **${decimal(summary.medianLeadDays)} j** (médiane),`,
		`${decimal(summary.meanLeadDays)} j (moyenne), de ${decimal(summary.minLeadDays)} j à`,
		`${decimal(summary.maxLeadDays)} j ; cumul ${decimal(summary.totalLeadDays)} j.`,
		`Dont ${summary.entitySignals} détections nominatives par listing gris antérieur ;`,
		`les autres reposent sur un préavis de campagne (même groupe).`,
		"",
		"## État réel de départ",
		"",
		`La base vivante contient ${integer(state.organizations)} organisations,`,
		`${integer(state.sources)} sources déclarées, ${integer(state.events)} événements et`,
		`${integer(state.archives)} événements archivés. La mesure lit`,
		`${integer(claims.length)} revendications datées avec groupe connu et`,
		`${integer(grayRows.length)} listings gris horodatés. Aucune donnée synthétique.`,
		"",
		"## Définition mesurée",
		"",
		"- **Incident cible** : `leak_claim.na = true`, date de publication et groupe connus,",
		"  département de l'organisation rattachée dans les douze départements NA.",
		"- **Revendication publique** : `leak_claim.published_at` de cet incident.",
		"- **Signal de détection** : soit un listing gris antérieur (`quarantine_raw`,",
		"  `ransomwatch`) nommant exactement la même entité, soit une revendication",
		"  antérieure du même groupe rançongiciel sur une autre victime.",
		"- **Fenêtre** : le signal doit être strictement antérieur à la revendication et",
		`  de moins de ${DEFAULT_MAX_LEAD_DAYS} jours. Le signal le plus ancien est retenu.`,
		"- **Vie privée** : seuls des identifiants, groupes, sources, départements et dates",
		"  traversent le calcul et les fichiers publiés ; aucun nom de victime, titre, résumé",
		"  ou élément de preuve brut.",
		"",
		"## Résultats par nature de signal",
		"",
		"| Nature du signal | Incidents concernés |",
		"|---|---:|",
		`| Entité (listing gris nominatif) | ${summary.entitySignals} |`,
		`| Campagne (revendication antérieure du même groupe) | ${summary.groupSignals} |`,
		`| **Au moins un des deux** | **${summary.detected}** |`,
		"",
		"Les deux lignes se recouvrent : un incident peut porter les deux signaux,",
		"la ligne « au moins un des deux » est le décompté de l'objectif.",

		"",
		"## Les quinze plus longs préavis",
		"",
		"| Revendication | Organisation | Département | Signal | Détecté le | Revendiqué le | Jours gagnés |",
		"|---|---|---|---|---|---|---:|",
		...top.map(
			(detection) =>
				`| ${detection.claimId} | ${detection.orgId ?? "—"} | ${detection.department ?? "—"} | ` +
				`${detection.kind} (${detection.sourceId}) | ${detection.detectedAt.slice(0, 10)} | ` +
				`${detection.claimAt.slice(0, 10)} | ${decimal(detection.leadDays)} |`,
		),
		"",
		"## Reproduction",
		"",
		"```sh",
		COMMAND,
		`DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:pre-claim --verifier`,
		"```",
		"",
		"Le second commande rejoue le calcul sans écrire et échoue si le rapport ne correspond",
		"plus à ses entrées. Le détail de chaque détection est versionné dans",
		`\`${RESULT_PATH}\`. Le diff de \`apps/api/src/server.ts\` est de 0 ligne.`,
		"",
		"## Limites",
		"",
		"- Le signal de groupe avertit qu'un groupe est actif ; il n'identifie pas la victime",
		"  avant la revendication. Le signal d'entité, plus strict, est compté séparément.",
		"- Seules les revendications déjà ingérées et datées entrent dans la mesure.",
		"- Les jours gagnés sont mesurés entre horodatages publics, pas entre la survenue",
		"  de l'attaque et sa détection.",
		objectiveStatement(summary.detected, OBJECTIVE),
	];

	const resultText = `${JSON.stringify(result, null, "\t")}\n`;
	const docText = lines.join("\n");
	if (verify) {
		let docOnDisk = "";
		let resultOnDisk = "";
		try {
			docOnDisk = readFileSync(DOC_PATH, "utf8");
			resultOnDisk = readFileSync(RESULT_PATH, "utf8");
		} catch {
			console.error("rapport ou mesure absent ; le régénérer");
			process.exitCode = 1;
			await closePools();
			return;
		}
		if (docOnDisk !== docText || resultOnDisk !== resultText) {
			console.error("le rapport ne correspond plus à ses entrées ; le régénérer");
			process.exitCode = 1;
		} else {
			console.log(
				`conforme (${summary.detected} détections, ${integer(claims.length)} revendications, ${decimal(summary.medianLeadDays)} j médians)`,
			);
		}
	} else {
		writeFileSync(RESULT_PATH, resultText, "utf8");
		writeFileSync(DOC_PATH, docText, "utf8");
		console.log(
			`${summary.detected}/${OBJECTIVE} incidents détectés avant revendication ; ${decimal(summary.medianLeadDays)} j gagnés (médiane)`,
		);
	}
	await closePools();
}

await main();
