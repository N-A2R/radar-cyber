/**
 * Preuve de rejeu consumer-visible : on casse une projection, le script lit le
 * journal et la répare, puis un second passage ne touché rien.
 *
 * Le jeu de données est volontairement bi-temporel à l'envers : le fait connu
 * en dernier porte la date de validité la plus ancienne. Si le rejeu triait sur
 * `valid_at`, il choisirait la décision périmée ; il doit choisir la dernière
 * *connue* (`recorded_at`), comme le documente docs/journal.md.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Client } from "pg";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { racineJournal, type LigneJournal } from "../src/journal/merkle.js";
import { createTestDatabase, dropTestDatabase, type TestDb } from "./helpers/testdb.js";

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const SUJET = "dedup:rejeu-bi-temporel";
const CONNU_AVANT = "2026-11-20T10:00:00.000Z";
const CONNU_APRES = "2026-11-21T10:00:00.000Z";
const COUPURE = "2026-11-20T12:00:00.000Z";

let db: TestDb;
let client: Client;
let orgAncienne: number;
let orgNouvelle: number;
let racineAvant: string;

async function orgProjete(): Promise<number | null> {
	const { rows } = await client.query<{ org_id: number | null }>(
		"SELECT org_id FROM event WHERE dedup_key = $1",
		[SUJET],
	);
	return rows[0]?.org_id ?? null;
}

function rejouer(args: readonly string[]): Promise<{ code: number | null; sortie: string }> {
	const { promise, resolve, reject } = Promise.withResolvers<{ code: number | null; sortie: string }>();
	const enfant = spawn(TSX, ["scripts/replay-journal.mts", ...args], {
		cwd: RACINE,
		env: { ...process.env, DATABASE_URL: db.url },
	});
	let sortie = "";
	enfant.stdout.on("data", (morceau: Buffer) => { sortie += morceau.toString(); });
	enfant.stderr.on("data", (morceau: Buffer) => { sortie += morceau.toString(); });
	enfant.on("error", reject);
	enfant.on("close", (code) => resolve({ code, sortie }));
	return promise;
}

before(async () => {
	db = await createTestDatabase();
	client = new Client({ connectionString: db.url });
	await client.connect();
	const cree = await client.query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, status)
		 VALUES ('Organisation B du test de rejeu', 'org-rejeu-b', 'entreprise', 'confirme')
		 RETURNING id`,
	);
	orgNouvelle = cree.rows[0]!.id;
	const reference = await client.query<{ id: number }>(
		"SELECT id FROM org WHERE slug = 'org-reference-tests'",
	);
	orgAncienne = reference.rows[0]!.id;

	await client.query(
		`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, source_url, evidence, valid_at, org_id)
		 VALUES ($1, 'ransomware', 'confirmed_incident', 'Incident du test de rejeu',
		         'ransomlook', 'https://example.invalid/rejeu',
		         '{"run_id":"1"}'::jsonb, '2026-11-19T00:00:00Z', $2)`,
		[SUJET, orgAncienne],
	);
	// Deux décisions connues dans un ordre inverse de leur validité : la plus
	// récente dans le monde est connue en premier, la plus ancienne en second.
	await client.query(
		`INSERT INTO journal (kind, subject, summary, payload, actor, valid_at, recorded_at)
		 VALUES ('event.rattachement', $1, 'décision connue avant',
		         jsonb_build_object('orgId', $2::int), 'moteur:gazetteer@4',
		         '2026-11-19T00:00:00Z', $3::timestamptz),
		        ('event.rattachement', $1, 'décision connue après',
		         jsonb_build_object('orgId', $4::int), 'moteur:gazetteer@4',
		         '2026-11-01T00:00:00Z', $5::timestamptz)`,
		[SUJET, orgAncienne, CONNU_AVANT, orgNouvelle, CONNU_APRES],
	);
	const { rows } = await client.query<LigneJournal>(
		`SELECT id::text AS id, kind, subject, summary, payload, actor, valid_at, recorded_at
		   FROM journal WHERE subject = $1 ORDER BY id`,
		[SUJET],
	);
	racineAvant = racineJournal(rows);
});

after(async () => {
	if (client) await client.end();
	if (db) await dropTestDatabase(db);
});

test("rejeu : la divergence est nommée, l'état antérieur ne l'est pas", async () => {
	const chronologie = await client.query<{ valid_at: Date; recorded_at: Date }>(
		"SELECT valid_at, recorded_at FROM journal WHERE subject = $1 ORDER BY recorded_at",
		[SUJET],
	);
	assert.equal(chronologie.rows.length, 2);
	assert.ok(
		Date.parse(String(chronologie.rows[1]!.valid_at)) < Date.parse(String(chronologie.rows[0]!.valid_at)),
		"le fait connu en dernier doit avoir la validité la plus ancienne",
	);
	assert.equal(Date.parse(String(chronologie.rows[1]!.recorded_at)), Date.parse(CONNU_APRES));

	const actuel = await rejouer([]);
	assert.equal(actuel.code, 0, actuel.sortie);
	assert.match(actuel.sortie, /1 divergence\(s\)/);
	assert.match(actuel.sortie, new RegExp(`${SUJET} : org_id=${orgAncienne} → ${orgNouvelle}`));
	assert.match(actuel.sortie, /relancer avec --apply/);
	assert.equal(await orgProjete(), orgAncienne, "le dry-run n'écrit rien");

	const avant = await rejouer([`--as-of=${COUPURE}`]);
	assert.equal(avant.code, 0, avant.sortie);
	assert.match(avant.sortie, /0 divergence\(s\)/);
	assert.match(avant.sortie, /rien à rejouer/);
});

test("rejeu : réparation prouvée, idempotente, sans réécrire le journal", async () => {
	const applique = await rejouer(["--apply"]);
	assert.equal(applique.code, 0, applique.sortie);
	assert.match(applique.sortie, /projection reconstruite : 1 ligne\(s\)/);
	assert.equal(await orgProjete(), orgNouvelle);

	const second = await rejouer(["--apply"]);
	assert.equal(second.code, 0, second.sortie);
	assert.match(second.sortie, /rien à rejouer/);
	assert.equal(await orgProjete(), orgNouvelle);

	await assert.rejects(
		() => client.query("UPDATE journal SET summary = 'réécrit' WHERE subject = $1", [SUJET]),
		/append-only/,
	);
	await assert.rejects(
		() => client.query("DELETE FROM journal WHERE subject = $1", [SUJET]),
		/append-only/,
	);
	const { rows } = await client.query<LigneJournal>(
		`SELECT id::text AS id, kind, subject, summary, payload, actor, valid_at, recorded_at
		   FROM journal WHERE subject = $1 ORDER BY id`,
		[SUJET],
	);
	assert.equal(rows.length, 2);
	assert.equal(racineJournal(rows), racineAvant, "les preuves et leurs horodatages sont inchangés");
});
