#!/usr/bin/env -S npx tsx
/**
 * Peuple le registre des absences : une attestation signée par organisation
 * confirmée n'ayant subi aucun événement rattaché sur la fenêtre demandée.
 *
 *   DATABASE_URL=... tsx scripts/attestations-negatives.mts                 # dry-run
 *   DATABASE_URL=... tsx scripts/attestations-negatives.mts --apply
 *     --window-start=2026-10-23 --window-end=2026-11-22     # dates UTC, fin exclue
 *     --limit=5000 --json=bench/results/attestations-negatives.json
 *
 * Le sceau utilise `RADAR_ATTESTATION_KEY` (HMAC-SHA256) quand elle est
 * fournie ; sinon un SHA-256 de contenu, vérifiable sans secret. Dans les deux
 * cas `signed=true` et `signature_method` disent ce qui est prouvé.
 *
 * Aucune donnée personnelle : nom public d'organisation, code officiel,
 * fenêtre, compteurs, empreintes.
 */
import { writeFileSync } from "node:fs";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5432/radar";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const jsonPath = argv.find((a) => a.startsWith("--json="))?.slice(7) ?? null;
const limitArg = argv.find((a) => a.startsWith("--limit="))?.slice(8);
const startArg = argv.find((a) => a.startsWith("--window-start="))?.slice(15);
const endArg = argv.find((a) => a.startsWith("--window-end="))?.slice(13);

const { query, closePools } = await import("../apps/api/src/db.js");
const { generateNegativeAttestations } = await import("../apps/api/src/attestations/registry.js");

/** Fenêtre par défaut : 30 jours pleins, arrêtés à hier 00:00 UTC. */
function defaultWindow(): { start: string; end: string } {
	const now = new Date();
	const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	const start = new Date(end.getTime() - 30 * 86_400_000);
	return { start: start.toISOString(), end: end.toISOString() };
}

const fallback = defaultWindow();
const windowStart = startArg ? `${startArg}T00:00:00.000Z` : fallback.start;
const windowEnd = endArg ? `${endArg}T00:00:00.000Z` : fallback.end;

const report = await generateNegativeAttestations({
	windowStart,
	windowEnd,
	dryRun: !APPLY,
	limit: limitArg ? Number(limitArg) : null,
});

console.log(
	`fenêtre ${report.windowStart} → ${report.windowEnd}` +
		` · ${report.sourcesChecked} sources actives · digest ${report.sourceDigest.slice(0, 16)}…`,
);
console.log(
	`${report.organizations} organisation(s) examinée(s), ` +
		`${report.absences} absence(s), ${report.written} ligne(s) ${report.dryRun ? "à écrire (dry-run)" : "écrite(s)"}` +
		(report.signatureMethod ? ` · sceau ${report.signatureMethod}` : ""),
);
for (const sample of report.sample) {
	console.log(`  · ${sample.orgSlug} — ${sample.orgName} (${sample.sourcesChecked} sources)`);
}

if (APPLY) {
	const critere = await query<{ n: string }>(
		`SELECT count(*)::text AS n FROM negative_attestation
		 WHERE sources_checked >= 3 AND signed = true AND window_end > window_start`,
	);
	console.log(`critère du registre : ${critere.rows[0]?.n ?? "0"} attestation(s) signée(s) multi-sources`);
}

if (jsonPath) {
	writeFileSync(jsonPath, `${JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2)}\n`);
	console.log(`rapport écrit : ${jsonPath}`);
}

await closePools();
