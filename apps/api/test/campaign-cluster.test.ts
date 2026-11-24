/**
 * Campagnes multi-victimes : seuil de preuve, fermeture transitive, critère SQL.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	CRITERE_CAMPAGNES_MV,
	OBJECTIF_CLUSTERS,
	lireCampagnesClusters,
	lireCritereCampagnesClusters,
	rafraichirCampagnesClusters,
} from "../src/analyse/campaign-cluster.js";
import { query } from "../src/db.js";

type Observation = {
	key: string;
	org: string;
	ioc: string[];
	texte: string[];
};

async function inserer(observations: Observation[]): Promise<void> {
	for (const o of observations) {
		await query(
			`INSERT INTO campaign_cluster_observation
			   (observation_key, org_key, family, observed_at, ioc, text_hash, origin)
			 VALUES ($1, $2, 'ransomware', timestamptz '2026-03-01 00:00:00+00', $3, $4, 'test-campagnes-mv@1')
			ON CONFLICT (observation_key) DO NOTHING`,
			[o.key, o.org, o.ioc, o.texte],
		);
	}
}

async function retirer(observations: Observation[]): Promise<void> {
	for (const o of observations) {
		await query("DELETE FROM campaign_cluster_observation WHERE observation_key = $1", [o.key]);
	}
	await rafraichirCampagnesClusters();
}

test("le corpus de benchmark atteint le critère à partir des seuls signaux partagés", async () => {
	await rafraichirCampagnesClusters();
	const brut = await query<{ count: string }>(CRITERE_CAMPAGNES_MV);
	const count = Number(brut.rows[0]?.count ?? 0);
	assert.ok(
		count >= OBJECTIF_CLUSTERS,
		`critère ${CRITERE_CAMPAGNES_MV} → ${count}/${OBJECTIF_CLUSTERS}`,
	);
	assert.equal(await lireCritereCampagnesClusters(), count);

	const clusters = await lireCampagnesClusters();
	assert.equal(clusters.length, 12);
	assert.ok(
		clusters.every(
			(c) => c.org_count >= 3 && (c.shared_ioc >= 2 || c.shared_text_hash >= 2),
		),
	);
	assert.ok(clusters.every((c) => c.org_count === c.org_keys.length));
	assert.ok(clusters.every((c) => c.shared_ioc === c.iocs.length));
	assert.ok(clusters.every((c) => c.shared_text_hash === c.text_hashes.length));

	// Leurres du benchmark : moins de trois victimes ou un seul signal commun.
	const orgs = clusters.flatMap((c) => c.org_keys);
	for (const leurre of ["org-mv-x1-01", "org-mv-x2-01", "org-mv-x3-01"]) {
		assert.ok(!orgs.includes(leurre), `${leurre} ne doit pas former de campagne`);
	}
	// Une campagne sans acteur ni titre, uniquement détectable par ses IOC.
	const iocSeul = clusters.find((c) => c.cle === "org-mv-07-01");
	assert.ok(iocSeul);
	assert.ok(iocSeul!.shared_ioc >= 2);
	assert.equal(iocSeul!.shared_text_hash, 0);
	// Et une campagne uniquement détectable par ses empreintes textuelles.
	const texteSeul = clusters.find((c) => c.cle === "org-mv-10-01");
	assert.ok(texteSeul);
	assert.equal(texteSeul!.shared_ioc, 0);
	assert.ok(texteSeul!.shared_text_hash >= 2);
});

test("un seul IOC partagé ne relie pas trois organisations", async () => {
	const observations: Observation[] = [1, 2, 3].map((n) => ({
		key: `obs-mv-test-seuil-${n}`,
		org: `org-mv-test-seuil-${n}`,
		ioc: ["ioc-mv-test-unique.example.invalid"],
		texte: [],
	}));
	try {
		await inserer(observations);
		await rafraichirCampagnesClusters();
		const clusters = await lireCampagnesClusters();
		assert.ok(
			!clusters.some((c) => c.org_keys.some((k) => k.startsWith("org-mv-test-seuil"))),
		);
	} finally {
		await retirer(observations);
	}
});

test("deux signaux distincts par paire referment la campagne par transitivité", async () => {
	const observations: Observation[] = [
		{
			key: "obs-mv-test-pont",
			org: "org-mv-test-pont",
			ioc: ["ioc-mv-01-a.example.invalid", "ioc-mv-01-b.example.invalid"],
			texte: ["th-mv-02-a", "th-mv-02-b"],
		},
	];
	try {
		await inserer(observations);
		await rafraichirCampagnesClusters();
		const clusters = await lireCampagnesClusters();
		const fusion = clusters.find((c) => c.org_keys.includes("org-mv-01-01"));
		assert.ok(fusion);
		assert.equal(fusion!.org_count, 9);
		assert.ok(fusion!.org_keys.includes("org-mv-02-01"));
		assert.ok(!clusters.some((c) => c.cle === "org-mv-02-01"));
		assert.ok(fusion!.shared_ioc >= 2);
		assert.ok(fusion!.shared_text_hash >= 2);
	} finally {
		await retirer(observations);
	}
});

test("le recalcul est idempotent", async () => {
	await rafraichirCampagnesClusters();
	const premier = await lireCampagnesClusters();
	await rafraichirCampagnesClusters();
	const second = await lireCampagnesClusters();
	assert.deepEqual(second, premier);
});
