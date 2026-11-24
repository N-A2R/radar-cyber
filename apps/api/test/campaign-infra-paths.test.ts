/**
 * Le graphe campagne → actif → victime est vérifié sur un jeu explicite de
 * trois campagnes partageant un seul domaine. Chaque arête doit porter sa
 * source et ses deux preuves. Aucune donnée de production n'est utilisée.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import {
	campaignInfraPaths,
	refreshCampaignInfraPaths,
} from "../src/analyse/campaign-infra-paths.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `cip${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const DOMAINE = `${TAG}.example.invalid`;
const cles: string[] = [];
const evenements: number[] = [];
let assetId: number | null = null;

after(async () => {
	if (cles.length > 0) await query("DELETE FROM campaign WHERE cle = ANY($1)", [cles]);
	if (evenements.length > 0) await supprimerEvenementsArchivees("id = ANY($1::bigint[])", [evenements]);
	if (assetId !== null) await query("DELETE FROM asset WHERE id = $1", [assetId]);
	await query("REFRESH MATERIALIZED VIEW CONCURRENTLY campaign_infra_paths");
	await closePools().catch(() => {});
});

test("trois campagnes partageant un domaine donnent trois arêtes sourcées", async () => {
	const organisations = await query<{ id: number }>(
		"SELECT id FROM org WHERE slug = 'org-reference-tests'",
	);
	const orgId = organisations.rows[0]?.id;
	assert.ok(orgId, "l'organisation de référence du jeu de test doit exister");

	const actif = await query<{ id: number }>(
		`INSERT INTO asset (org_id, kind, value, status)
		 VALUES ($1, 'domain', $2, 'candidat') RETURNING id`,
		[orgId, DOMAINE],
	);
	assetId = Number(actif.rows[0]?.id);
	assert.ok(Number.isInteger(assetId));

	const dates = ["2026-11-20T10:00:00Z", "2026-11-21T10:00:00Z", "2026-11-22T10:00:00Z"];
	for (const [i, date] of dates.entries()) {
		const cle = `cmp:test:${TAG}:${i}`;
		const incidents: number[] = [];
		for (const [j, decalage] of [0, 1].entries()) {
			const observed = new Date(Date.parse(date) + decalage * 3_600_000).toISOString();
			const evenement = await query<{ id: number }>(
				`INSERT INTO event
				  (dedup_key, family, assertion_type, title, observed_at, valid_at,
				   source_id, evidence, source_url, org_id)
				 VALUES ($1, 'ransomware', 'third_party_claim', $2, $3, $3,
				         'ransomlook', '{"run_id":"1"}'::jsonb,
				         'https://example.invalid/campaign-infra', $4)
				 RETURNING id`,
				[`${TAG}-${i}-${j}`, `campagne ${i} incident ${j}`, observed, orgId],
			);
			const id = Number(evenement.rows[0]?.id);
			assert.ok(Number.isInteger(id));
			incidents.push(id);
			evenements.push(id);
		}
		await query(
			`INSERT INTO campaign
			  (cle, label, family, debut, fin, incidents, taille, confiance, score, preuve)
			 VALUES ($1, $2, 'ransomware', $3, $3, $4::bigint[], 2, 'faible', 1, '{}'::jsonb)`,
			[cle, `${TAG}-${i}`, date, incidents],
		);
		cles.push(cle);
	}

	await refreshCampaignInfraPaths();

	const aretes = await campaignInfraPaths({ domaine: DOMAINE });
	assert.equal(aretes.length, 6, "deux incidents par campagne partageant le domaine");
	assert.deepEqual(
		[...new Set(aretes.map((arete) => arete.campaign_cle))].sort(),
		[...cles].sort(),
	);
	for (const arete of aretes) {
		assert.equal(arete.asset_value, DOMAINE);
		assert.equal(arete.victim_org_id, orgId);
		assert.ok(arete.source && arete.source.length > 0, "chaque arête porte sa source");
		assert.ok(arete.asset_source && arete.asset_source.length > 0);
		assert.ok(arete.observed_at instanceof Date);
		assert.equal(arete.evidence_campaign?.["source"], "ransomlook");
		assert.equal(arete.evidence_asset?.["domain"], DOMAINE);
	}

	const brutal = await query<{ n: string }>(
		`SELECT count(*)::text AS n FROM campaign_infra_paths
		  WHERE evidence_campaign IS NOT NULL AND evidence_asset IS NOT NULL`,
	);
	assert.equal(Number(brutal.rows[0]?.n), 6);
});
