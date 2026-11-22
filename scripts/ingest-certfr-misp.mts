#!/usr/bin/env -S npx tsx
/**
 * Ingestion reproductible du flux MISP public du CERT-FR.
 *
 * Prérequis : migrations appliquées (200 enregistre la source et l'index de
 * preuve, 202 crée le corpus durable `certfr_misp_event`).
 *
 *   DATABASE_URL=postgres://radar:radar@127.0.0.1:5432/radar \
 *     apps/api/node_modules/.bin/tsx scripts/ingest-certfr-misp.mts
 *
 * `MISP_DAYS` (défaut 7) fixe le nombre de jours consécutifs rejoués par la
 * corrélation ; les jours déjà écrits ne sont pas réécrits.
 *
 * Le script imprime les deux mesures du critère de sortie : fraîcheur de la
 * source et jours corrélés, UUID MISP compris.
 */
import type { CollectContext } from "@radar/shared";
import { closePools, ingestQuery, query } from "../apps/api/src/db.js";
import { closeRun, openRun, withRunId } from "../apps/api/src/collecte/runs.js";
import { admitEvent } from "../apps/api/src/contract/admit.js";
import {
	collector, CERTFR_MISP_SOURCE_ID, CERTFR_MISP_MANIFEST_URL,
} from "../apps/api/src/collectors/certfr-misp.collector.js";
import { correlaterIndicateursCertfrMisp } from "../apps/api/src/collectors/certfr-misp-correlate.js";

async function fetchJson<T>(url: string): Promise<T> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(30_000),
		headers: { accept: "application/json", "user-agent": "RadarCyber/1.0 (CERT-FR public MISP feed)" },
	});
	if (!response.ok) throw new Error(`HTTP ${response.status} sur ${url}`);
	return await response.json() as T;
}

async function main(): Promise<void> {
	const ctx: CollectContext = {
		fetchJson,
		fetchText: async () => { throw new Error("le collecteur MISP ne lit que du JSON"); },
		cursor: {},
		log: (msg) => console.log(msg),
		now: () => new Date(),
	};
	const { events, cursor } = await collector.run(ctx);
	let inscrits = 0;
	let refuses = 0;
	// Le run est ouvert avant le premier événement : chaque ligne le cite dans
	// `evidence.run_id` (migration 206).
	const runId = await openRun(CERTFR_MISP_SOURCE_ID, "live");
	for (const candidat of events) {
		const admission = admitEvent(candidat as unknown as Record<string, unknown>);
		if (!admission.ok) {
			refuses++;
			console.warn(`refus ${admission.hint} : ${admission.rejections.join(", ")}`);
			continue;
		}
		const evenement = admission.event;
		const mispDate = typeof evenement.evidence.mispDate === "string" ? evenement.evidence.mispDate : null;
		const { rowCount } = await ingestQuery(
			`INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at,
			                    valid_at, at, collected_at, severity, confidence, source_id,
			                    source_url, evidence, geo_type, regional, regional_motif,
			                    date_source, tlp, tlp_source)
			 VALUES ($1,$2,$3,$4,$5,$6,$6,$6,$6,$7,$8,$9,$10,$11::jsonb,$12,false,'aucun',$13,'clear','CERT-FR MISP')
			 ON CONFLICT (dedup_key) DO UPDATE SET
			   evidence = EXCLUDED.evidence, summary = EXCLUDED.summary,
			   tlp = EXCLUDED.tlp, tlp_source = EXCLUDED.tlp_source`,
			[evenement.dedupKey, evenement.family, evenement.assertionType, evenement.title,
			 evenement.summary ?? null, evenement.observedAt ?? null, evenement.severity,
			 evenement.confidence ?? null, evenement.sourceId,
			 evenement.sourceUrl ?? `urn:source:${evenement.sourceId}`,
			 JSON.stringify(withRunId(evenement.evidence, runId)), evenement.geoType, mispDate],
		);
		inscrits += rowCount ?? 0;
	}
	await closeRun(runId, { itemsIn: events.length, itemsNew: inscrits });

	const jours = Number(process.env.MISP_DAYS ?? "7");
	const correlation = await correlaterIndicateursCertfrMisp({
		days: Number.isFinite(jours) ? jours : 7,
		log: (msg) => console.log(msg),
	});

	const corpus = await query<{ evenements: number; indicateurs: number; jours_misp: string }>(
		`SELECT count(*)::int AS evenements,
		        coalesce(sum(jsonb_array_length(indicators)), 0)::int AS indicateurs,
		        count(DISTINCT misp_date)::text AS jours_misp
		   FROM certfr_misp_event`,
	);
	const critere = await query<Record<string, unknown>>(
		`SELECT count(*) FROM source WHERE id='certfr_misp'
		  AND (last_ok_at IS NULL OR last_ok_at < now()-interval '48 hours')`,
	);
	const perimees = Number(Object.values(critere.rows[0] ?? { count: Number.NaN })[0]);
	const quotidien = await query<{ jour: string; evenements: number }>(
		`SELECT date(observed_at)::text AS jour, count(*)::int AS evenements
		   FROM event
		  WHERE source_id = $1 AND assertion_type = 'suggested_relation'
		    AND evidence ->> 'mispUuid' IS NOT NULL
		    AND observed_at >= now() - interval '8 days'
		  GROUP BY 1 ORDER BY 1`,
		[CERTFR_MISP_SOURCE_ID],
	);

	console.log(JSON.stringify({
		feed: CERTFR_MISP_MANIFEST_URL,
		collecte: cursor,
		eventsInserted: inscrits,
		eventsRejected: refuses,
		correlation,
		corpus: corpus.rows[0] ?? null,
		critereFraicheur: Number.isFinite(perimees) ? perimees : null,
	}, null, 2));
	console.log("critère de sortie — count(*) source périmée :", Number.isFinite(perimees) ? perimees : "illisible");
	for (const ligne of quotidien.rows) {
		console.log(`  ${ligne.jour} : ${ligne.evenements} corrélation(s)`);
	}
	if (quotidien.rows.length < 7) {
		console.warn(`attention : ${quotidien.rows.length} jour(s) corrélé(s) sur les 8 derniers, attendu 7`);
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
}).finally(async () => {
	await closePools();
});
