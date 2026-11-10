/**
 * Collecteur EPSS — scores uniquement, pas d'événements.
 *
 * EPSS (Exploit Prediction Scoring System, FIRST) est un référentiel de
 * probabilités d'exploitation, pas un flux d'actualité. Ce collecteur
 * n'insère plus aucun événement dans `event` (source_id='epss') : auparavant
 * 2 834 lignes factices (« CVE-… — EPSS x », sans observed_at/org_id/geo)
 * nourrissaient une boucle auto-référente où le collecteur alimentait la
 * règle d'admission qui le justifiait.
 *
 * Les scores sont désormais matérialisés dans la table dédiée `epss`
 * (migration 021) par UPSERT (cve PK, score, percentile, updated_at).
 * `loadCoverageContext()` / `admitByEpss()` lisent cette table.
 *
 * Contrat `Collector.run` : `{ events: NormalizedEvent[] }`. Aucun événement
 * produit → tableau vide, documenté ici pour éviter toute régression.
 */
import type { Collector } from "@radar/shared";
import { ingestQuery } from "../db.js";

type EpssRow = {
	cve?: unknown;
	epss?: unknown;
	percentile?: unknown;
};

type EpssResponse = { data?: unknown[] };

export const collector: Collector = {
	id: "epss",
	family: "vuln",
	intervalSec: 86400,
	async run(ctx) {
		const raw = await ctx.fetchJson<EpssResponse>(
			"https://api.first.org/data/v1/epss?order=!epss&limit=100"
		);
		const rows = Array.isArray(raw?.data) ? (raw.data as EpssRow[]) : [];

		const cves: string[] = [];
		const scores: number[] = [];
		const percentiles: (number | null)[] = [];
		for (const row of rows) {
			const cve = String(row.cve ?? "").trim().toUpperCase();
			const score = Number(row.epss);
			if (!cve || !Number.isFinite(score)) continue;
			const p =
				row.percentile === undefined || row.percentile === null
					? null
					: Number(row.percentile);
			cves.push(cve);
			scores.push(score);
			percentiles.push(Number.isFinite(p) ? p : null);
		}

		if (cves.length > 0) {
			await ingestQuery(
				`INSERT INTO epss (cve, score, percentile, updated_at)
				 SELECT cve, score, percentile, now()
				   FROM unnest($1::text[], $2::double precision[], $3::double precision[])
				        AS t(cve, score, percentile)
				 ON CONFLICT (cve) DO UPDATE SET
				   score = EXCLUDED.score,
				   percentile = EXCLUDED.percentile,
				   updated_at = EXCLUDED.updated_at`,
				[cves, scores, percentiles]
			);
			ctx.log(`epss: ${cves.length} score(s) upsertés dans epss (0 événement)`);
		} else {
			ctx.log("epss: aucun score valide, 0 événement");
		}

		// Pas d'événement `event` : les scores vivent dans la table `epss`.
		return { events: [] };
	},
};