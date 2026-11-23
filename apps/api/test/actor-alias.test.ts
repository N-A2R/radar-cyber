import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import {
	UnionFind,
	actorAliasKey,
	clusterActorAliases,
	normalizeActorAlias,
} from "../src/ransomware/actor-alias.js";

after(async () => {
	await closePools().catch(() => {});
});

test("normalisation : LockBit et .LockBit désignent la même graphie", () => {
	assert.equal(normalizeActorAlias("LockBit"), "lockbit");
	assert.equal(normalizeActorAlias(".LockBit"), "lockbit");
	assert.equal(normalizeActorAlias("LockBit 3.0"), "lockbit 3 0");
});

test("clé de fusion : LockBit, LockBit 3.0 et Lockbit3 se rejoignent", () => {
	assert.equal(actorAliasKey("LockBit"), "lockbit");
	assert.equal(actorAliasKey("LockBit 3.0"), "lockbit");
	assert.equal(actorAliasKey("Lockbit3"), "lockbit");
});

test("clé de fusion : les identifiants numériques restent distincts", () => {
	assert.equal(actorAliasKey("APT1"), "apt1");
	assert.equal(actorAliasKey("APT2"), "apt2");
	assert.notEqual(actorAliasKey("Storm-0558"), actorAliasKey("Storm-0569"));
	assert.notEqual(actorAliasKey("GTG-1002"), actorAliasKey("GTG-1007"));
});

test("union-find : 4 alias donnent 2 composantes", () => {
	const uf = new UnionFind<string>();
	for (const alias of ["LockBit", "Lockbit3", ".LockBit", "Conti"]) uf.add(alias);

	uf.union("LockBit", "Lockbit3");
	uf.union("Lockbit3", ".LockBit");

	const groups = [...uf.groups().values()];
	assert.equal(groups.length, 2);
	const lockbit = groups.find((group) => group.includes("LockBit"));
	const conti = groups.find((group) => group.includes("Conti"));
	assert.deepEqual(lockbit, [".LockBit", "LockBit", "Lockbit3"]);
	assert.deepEqual(conti, ["Conti"]);
});

test("fusion : 4 graphies, 2 composantes, LockBit canonique", () => {
	const components = clusterActorAliases([
		{
			value: "LockBit",
			synonyms: ["LockBit 3.0"],
			extensions: [".lockbit"],
			refs: 10,
			uuid: "11111111-1111-4111-8111-111111111111",
			source: "misp-galaxy:ransomware",
			sourceUrl: "https://example.test/ransomware.json#11111111-1111-4111-8111-111111111111",
		},
		{
			value: "Conti",
			refs: 1,
			uuid: "22222222-2222-4222-8222-222222222222",
			source: "misp-galaxy:ransomware",
			sourceUrl: "https://example.test/ransomware.json#22222222-2222-4222-8222-222222222222",
		},
	]);

	assert.equal(components.length, 2);
	const lockbit = components.find((component) => component.canonique === "LockBit");
	assert.ok(lockbit, "LockBit doit être la forme canonique");
	assert.deepEqual(lockbit!.aliases, [".lockbit", "LockBit", "LockBit 3.0"]);
	assert.equal(lockbit!.rows.length, 3);
	for (const row of lockbit!.rows) {
		assert.equal(row.canonique, "LockBit");
		assert.ok(row.source.startsWith("misp-galaxy:"));
		assert.match(row.sourceUrl, /^https:\/\//);
	}
});

test("aucune fusion sans source", () => {
	assert.throws(
		() =>
			clusterActorAliases([
				{ value: "LockBit", synonyms: ["Lockbit3"], source: "", sourceUrl: "https://example.test/x" },
			]),
		/alias sans source/,
	);
	assert.throws(
		() => clusterActorAliases([{ value: "LockBit", source: "misp-galaxy:ransomware", sourceUrl: "" }]),
		/alias sans URL de source/,
	);
});

test("un synonyme partagé ne fusionne pas deux grappes", () => {
	// MISP Galaxy réutilise des extensions génériques : `.locked` est déclaré
	// par des dizaines de familles. Les fusionner créerait un acteur fictif.
	const components = clusterActorAliases([
		{
			value: "Mespinoza",
			extensions: [".locked"],
			source: "misp-galaxy:ransomware",
			sourceUrl: "https://example.test/ransomware.json#aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		},
		{
			value: "Dharma Ransomware",
			extensions: [".locked"],
			source: "misp-galaxy:ransomware",
			sourceUrl: "https://example.test/ransomware.json#bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		},
	]);

	assert.equal(components.length, 2);
	assert.deepEqual(components.map((component) => component.canonique).sort(), ["Dharma Ransomware", "Mespinoza"]);
});

test("table actor_alias : le critère de sortie est atteint", async () => {
	const { rows } = await query<{ n: number }>(
		`SELECT count(*)::int AS n
		   FROM (SELECT canonique FROM actor_alias GROUP BY canonique HAVING count(*) >= 2) AS groupes`,
	);
	assert.ok(rows[0]!.n >= 20, `canoniques avec >= 2 alias : ${rows[0]!.n}, attendu >= 20`);
});

test("table actor_alias : chaque ligne porte une source non vide", async () => {
	const { rows } = await query<{ n: number }>(
		`SELECT count(*)::int AS n FROM actor_alias
		  WHERE source IS NULL OR btrim(source) = ''
		     OR source_url IS NULL OR btrim(source_url) = ''`,
	);
	assert.equal(rows[0]!.n, 0);
});

test("table actor_alias : LockBit, Lockbit3 et .LockBit partagent un canonique", async () => {
	const { rows } = await query<{ canonique: string; n: number }>(
		`SELECT canonique, count(DISTINCT alias)::int AS n
		   FROM actor_alias
		  WHERE alias_norm = 'lockbit'
		  GROUP BY canonique`,
	);
	assert.equal(rows.length, 1, `un seul canonique attendu, obtenu : ${rows.map((r) => r.canonique).join(", ")}`);
	assert.equal(rows[0]!.canonique, "LockBit");
	assert.ok(rows[0]!.n >= 3, `graphies LockBit : ${rows[0]!.n}, attendu >= 3`);
});
