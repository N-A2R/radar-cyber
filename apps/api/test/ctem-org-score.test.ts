/**
 * Priorité CTEM : le score d'organisation classe les expositions mesurées.
 *
 * Jeu synthétique (TEST-NET) : 52 organisations avec une exposition citée et
 * fraîche, deux avec une exposition non validée, une avec une base de données
 * exposée. Aucune donnée personnelle, aucune source nationale présentée
 * comme locale.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import {
	CRITERE_EXPOSITIONS,
	lireCritereCtem,
	rafraichirOrgScore,
	SEUIL_VALIDATION,
} from "../src/ctem/org-score.js";

const PREFIX = "test-ctem-org-score-";
const VALIDES = 52;
const CVE = "CVE-2098-6688";

async function creeOrganisation(suffixe: string): Promise<number> {
	await query(
		`INSERT INTO org (name, slug, kind, city, status)
		 VALUES ($1, $2, 'entreprise', 'Bordeaux', 'confirme')
		 ON CONFLICT (slug) DO NOTHING`,
		[`Organisation ${suffixe}`, `${PREFIX}${suffixe}`],
	);
	const { rows } = await query<{ id: number }>("SELECT id FROM org WHERE slug = $1", [`${PREFIX}${suffixe}`]);
	return rows[0]!.id;
}

async function creeExposition(
	orgId: number,
	index: number,
	options: { category?: string; sourceUrl?: string; jours?: number; cve?: string } = {},
): Promise<void> {
	await query(
		`INSERT INTO exposition_service
		   (org_id, ip, port, category, service, technology, source, source_url, consulted_at, evidence)
		 VALUES ($1, $2, $3, $4, 'http', 'http_server', 'shodan-internetdb', $5,
		         now() - ($6::int || ' days')::interval,
		         CASE WHEN $7::text IS NULL THEN '{}'::jsonb
		              ELSE jsonb_build_object('vulns', jsonb_build_array($7::text)) END)`,
		[
			orgId,
			`198.51.100.${index}`,
			8000 + index,
			options.category ?? "web",
			options.sourceUrl ?? `https://internetdb.shodan.io/test-ctem-${index}`,
			options.jours ?? 0,
			options.cve ?? null,
		],
	);
}

after(async () => {
	await query(
		"DELETE FROM exposition_service WHERE org_id = ANY(SELECT id FROM org WHERE slug LIKE $1)",
		[`${PREFIX}%`],
	);
	await query("DELETE FROM org WHERE slug LIKE $1", [`${PREFIX}%`]);
	await query("DELETE FROM epss WHERE cve = $1", [CVE]);
	await rafraichirOrgScore();
	await closePools();
});

test("le score valide les expositions citées et distingue la criticité", async () => {
	const ids: number[] = [];
	for (let index = 0; index < VALIDES; index += 1) {
		const id = await creeOrganisation(`valide-${index}`);
		ids.push(id);
		await creeExposition(id, index);
	}
	const critique = await creeOrganisation("critique");
	ids.push(critique);
	await query(
		"INSERT INTO epss (cve, score, updated_at) VALUES ($1, 0.95, now()) ON CONFLICT (cve) DO UPDATE SET score = EXCLUDED.score",
		[CVE],
	);
	await creeExposition(critique, 100, { category: "base_de_donnees", cve: CVE });

	const perpime = await creeOrganisation("perimee");
	ids.push(perpime);
	await creeExposition(perpime, 101, { jours: 8 });
	const nonCitee = await creeOrganisation("non-citee");
	ids.push(nonCitee);
	await creeExposition(nonCitee, 102, { sourceUrl: "" });

	const total = await rafraichirOrgScore();
	assert.ok(total >= VALIDES + 2, `organisations classées : ${total}`);

	const { rows } = await query<{
		org_id: number;
		score: number;
		services: number;
		confirmees: number;
	}>("SELECT org_id, score, services, confirmees FROM org_score WHERE org_id = ANY($1::int[])", [ids]);
	assert.equal(rows.length, ids.length);
	const parOrg = new Map(rows.map((row) => [row.org_id, row]));

	for (const id of ids.slice(0, VALIDES + 1)) {
		const row = parOrg.get(id)!;
		assert.ok(row.score > SEUIL_VALIDATION, `score ${row.score} doit dépasser 0,9`);
		assert.equal(row.confirmees, row.services);
	}
	for (const id of [perpime, nonCitee]) {
		const row = parOrg.get(id)!;
		assert.ok(row.score < SEUIL_VALIDATION, `score ${row.score} doit rester sous 0,9`);
		assert.equal(row.confirmees, 0);
	}
	assert.ok(
		parOrg.get(critique)!.score > parOrg.get(ids[0]!)!.score,
		"la base de données exposée doit devancer un simple service web",
	);

	const critere = await lireCritereCtem();
	assert.ok(critere.partExpositions >= 0.5, `part=${critere.partExpositions}`);
	assert.ok(critere.precisionTop >= 0.6, `precision=${critere.precisionTop}`);
	const brut = await query<Record<string, number | null>>(CRITERE_EXPOSITIONS);
	assert.ok(Number(brut.rows[0]?.["?column?"]) >= 0.5);

	const avant = await query<{ org_id: number; score: number }>(
		"SELECT org_id, score FROM org_score WHERE org_id = ANY($1::int[]) ORDER BY org_id",
		[ids],
	);
	await rafraichirOrgScore();
	const apres = await query<{ org_id: number; score: number }>(
		"SELECT org_id, score FROM org_score WHERE org_id = ANY($1::int[]) ORDER BY org_id",
		[ids],
	);
	assert.deepEqual(apres.rows, avant.rows, "deux rejeux doivent donner le même score");
});

test("org_score ne stocke que des identifiants et des agrégats", async () => {
	const { rows } = await query<{ column_name: string }>(
		`SELECT column_name FROM information_schema.columns
		  WHERE table_schema = 'public' AND table_name = 'org_score' ORDER BY column_name`,
	);
	assert.deepEqual(
		rows.map((row) => row.column_name),
		["calcule_le", "confirmees", "criticite", "org_id", "regle", "score", "services"],
	);
});
