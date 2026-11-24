/**
 * Priorisation EPSS × exposition_service : prédicat pur et fonction SQL.
 *
 * Le jeu de test est synthétique et ne contient aucune donnée personnelle :
 * quatre CVE improbables, quatre ports et un service sans citation.
 * La fonction SQL est relue depuis la table matérialisée, pas depuis du texte.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import {
	estConfirme,
	rafraichirEvalEpssExposition,
	SEUIL_EPSS,
	type PaireEpssExposition,
} from "../src/epss/exposure-eval.js";

const SLUG = "test-epss-exposure-eval";
const CVES = ["CVE-2098-7771", "CVE-2098-7772", "CVE-2098-7773", "CVE-2098-7774"] as const;
const MAINTENANT = new Date("2026-11-23T12:00:00Z");
const JOUR = 24 * 60 * 60 * 1000;

const base: PaireEpssExposition = {
	cve: CVES[0],
	sourceService: "shodan-internetdb",
	observeLe: new Date(MAINTENANT.getTime() - 2 * 60 * 60 * 1000),
	epssScore: 0.9,
	epssMajLe: new Date(MAINTENANT.getTime() - JOUR),
	cveDansPreuve: true,
};

after(async () => {
	await query("DELETE FROM exposition_service WHERE org_id = (SELECT id FROM org WHERE slug = $1)", [SLUG]);
	await query("DELETE FROM epss WHERE cve = ANY($1::text[])", [[...CVES]]);
	await query("DELETE FROM org WHERE slug = $1", [SLUG]);
	await rafraichirEvalEpssExposition();
	await closePools();
});

test("le prédicat exige seuil EPSS, preuve, citation et fenêtre de sept jours", () => {
	assert.equal(estConfirme(base, MAINTENANT), true);
	assert.equal(estConfirme({ ...base, epssScore: SEUIL_EPSS - 0.01 }, MAINTENANT), false);
	assert.equal(estConfirme({ ...base, cveDansPreuve: false }, MAINTENANT), false);
	assert.equal(estConfirme({ ...base, sourceService: "" }, MAINTENANT), false);
	assert.equal(estConfirme({ ...base, observeLe: new Date(MAINTENANT.getTime() - 8 * JOUR) }, MAINTENANT), false);
	assert.equal(estConfirme({ ...base, epssMajLe: new Date(MAINTENANT.getTime() - 8 * JOUR) }, MAINTENANT), false);
});

test("la fonction SQL classe et qualifie chaque paire sans recopier d'adresse", async () => {
	await query(
		`INSERT INTO org (name, slug, kind, city, status)
		 VALUES ('Test EPSS exposition', $1, 'entreprise', 'Bordeaux', 'confirme')
		 ON CONFLICT (slug) DO NOTHING`,
		[SLUG],
	);
	const org = await query<{ id: number }>("SELECT id FROM org WHERE slug = $1", [SLUG]);
	const orgId = org.rows[0]!.id;

	const notes = [
		{ cve: CVES[0], score: 0.99, maj: -JOUR, sourceUrl: "https://internetdb.shodan.io/test-7771", consulte: -2 * 60 * 60 * 1000 },
		{ cve: CVES[1], score: 0.9, maj: -8 * JOUR, sourceUrl: "https://internetdb.shodan.io/test-7772", consulte: -2 * 60 * 60 * 1000 },
		{ cve: CVES[2], score: 0.88, maj: -JOUR, sourceUrl: "https://internetdb.shodan.io/test-7773", consulte: -8 * JOUR },
		{ cve: CVES[3], score: 0.87, maj: -JOUR, sourceUrl: "", consulte: -2 * 60 * 60 * 1000 },
	] as const;

	for (const n of notes) {
		await query(
			`INSERT INTO epss (cve, score, updated_at) VALUES ($1, $2, $3)
			 ON CONFLICT (cve) DO UPDATE SET score = EXCLUDED.score, updated_at = EXCLUDED.updated_at`,
			[n.cve, n.score, new Date(MAINTENANT.getTime() + n.maj).toISOString()],
		);
		await query(
			`INSERT INTO exposition_service
			   (org_id, ip, port, category, service, technology, source, source_url, consulted_at, evidence)
			 VALUES ($1, $2, $3, 'web', 'http', 'http_server', 'shodan-internetdb', $4, $5,
			        jsonb_build_object('vulns', jsonb_build_array($6::text)))`,
			[
				orgId,
				`192.0.2.${notes.indexOf(n) + 1}`,
				8000 + notes.indexOf(n),
				n.sourceUrl,
				new Date(MAINTENANT.getTime() + n.consulte).toISOString(),
				n.cve,
			],
		);
	}

	const total = await rafraichirEvalEpssExposition();
	assert.ok(total > 0, "la table doit être remplie");

	const { rows } = await query<{
		rank: number;
		cve: string;
		cited: boolean;
		observed_recent: boolean;
		score_recent: boolean;
		confirmed: boolean;
		nvd_url: string;
	}>("SELECT rank, cve, cited, observed_recent, score_recent, confirmed, nvd_url FROM epss_exposure_eval WHERE cve = ANY($1::text[]) ORDER BY rank", [[...CVES]]);

	assert.equal(rows.length, 4);
	assert.deepEqual(rows.map((r) => r.cve), [...CVES]);
	assert.ok(rows[0]!.rank < rows[1]!.rank && rows[1]!.rank < rows[2]!.rank && rows[2]!.rank < rows[3]!.rank);
	assert.deepEqual(
		rows.map((r) => r.confirmed),
		[true, false, false, false],
	);
	assert.equal(rows[0]!.cited, true);
	assert.equal(rows[0]!.observed_recent, true);
	assert.equal(rows[0]!.score_recent, true);
	assert.equal(rows[1]!.score_recent, false);
	assert.equal(rows[2]!.observed_recent, false);
	assert.equal(rows[3]!.cited, false);
	assert.equal(rows[0]!.nvd_url, `https://nvd.nist.gov/vuln/detail/${CVES[0]}`);
});
