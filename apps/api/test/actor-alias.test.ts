import { readFileSync } from "node:fs";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import {
	UnionFind,
	actorAliasKey,
	clusterActorAliases,
	mesurerObjectifActorAlias,
	normalizeActorAlias,
	verifierDeclarationObjectifActorAlias,
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

test("clé de fusion : APT-C-36 ne récupère pas les autres désignations APT-C", () => {
	// MISP Galaxy `clusters/threat-actor.json` décrit cinq grappes distinctes :
	// APT-C-36 / Blind Eagle (ae1c64ff-5a37-4291-97f8-ea402c63efd0),
	// APT-C-12 / Blue Mushroom (53771ca5-f1cb-47b6-a92a-53a485307cf7),
	// APT-C-27 / GoldMouse (ee7f535d-cc3e-40f3-99f3-c97963cfa250),
	// APT-C-34 / Golden Falcon (feb0cfef-0472-4108-83d7-1a322d8ab86b),
	// APT-C-60 / APT-Q-12 (6a83b2bf-0c51-4c9b-89b0-35df7cab1dd5).
	// Le radical `aptc` n'est pas un nom de famille : les numéros comptent.
	assert.equal(actorAliasKey("APT-C-36"), "aptc36");
	assert.equal(actorAliasKey("APT-C-12"), "aptc12");
	assert.equal(actorAliasKey("APT-C-27"), "aptc27");
	assert.equal(actorAliasKey("APT-C-34"), "aptc34");
	assert.equal(actorAliasKey("APT-C-60"), "aptc60");
	// Les vraies versions restent fusionnées.
	assert.equal(actorAliasKey("LockBit 3.0"), "lockbit");
	assert.equal(actorAliasKey("Sage 2.0 Ransomware"), "sage");
});

test("fusion : APT-C-36 et APT-C-12 restent deux grappes distinctes", () => {
	const source = "misp-galaxy:threat-actor";
	const sourceUrl = (uuid: string) =>
		`https://github.com/MISP/misp-galaxy/blob/main/clusters/threat-actor.json#${uuid}`;
	const components = clusterActorAliases([
		{
			value: "APT-C-36",
			synonyms: ["Blind Eagle"],
			uuid: "ae1c64ff-5a37-4291-97f8-ea402c63efd0",
			source,
			sourceUrl: sourceUrl("ae1c64ff-5a37-4291-97f8-ea402c63efd0"),
		},
		{
			value: "APT-C-12",
			synonyms: ["Blue Mushroom", "NuclearCrisis", "Sapphire Mushroom"],
			uuid: "53771ca5-f1cb-47b6-a92a-53a485307cf7",
			source,
			sourceUrl: sourceUrl("53771ca5-f1cb-47b6-a92a-53a485307cf7"),
		},
	]);

	assert.equal(components.length, 2);
	assert.deepEqual(components.map((component) => component.canonique), ["APT-C-12", "APT-C-36"]);
	assert.deepEqual(
		components.find((component) => component.canonique === "APT-C-36")!.aliases,
		["APT-C-36", "Blind Eagle"],
	);
	assert.deepEqual(
		components.find((component) => component.canonique === "APT-C-12")!.aliases,
		["APT-C-12", "Blue Mushroom", "NuclearCrisis", "Sapphire Mushroom"],
	);
	for (const row of components.flatMap((component) => component.rows)) {
		assert.match(row.sourceUrl, /^https:\/\/github\.com\/MISP\/misp-galaxy\/blob\/main\/clusters\/threat-actor\.json#/);
		assert.ok(row.galaxyUuid);
	}
});

test("migration corrective : purge ciblée, idempotente et sourcée", () => {
	// migrate-211 reste intact ; la correction des bases déjà migrées est
	// rejouable via migrate-252. On vérifie que la trace MISP est conservée.
	const sql = readFileSync(new URL("../../../db/migrate-252-actor-alias-key.sql", import.meta.url), "utf8");
	assert.match(sql, /DELETE FROM actor_alias/);
	assert.match(sql, /ON CONFLICT ON CONSTRAINT actor_alias_alias_source_unique DO NOTHING/);
	for (const uuid of [
		"ae1c64ff-5a37-4291-97f8-ea402c63efd0",
		"53771ca5-f1cb-47b6-a92a-53a485307cf7",
		"ee7f535d-cc3e-40f3-99f3-c97963cfa250",
		"feb0cfef-0472-4108-83d7-1a322d8ab86b",
		"6a83b2bf-0c51-4c9b-89b0-35df7cab1dd5",
	]) {
		assert.ok(sql.includes(uuid), `UUID MISP absent de la migration : ${uuid}`);
	}
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

test("objectif : la mesure sur la table produit la ligne déclarée", async () => {
	const { rows } = await query<{ n: number }>(
		`SELECT count(*)::int AS n
		   FROM (SELECT canonique FROM actor_alias GROUP BY canonique HAVING count(*) >= 2) AS groupes`,
	);
	const objectif = mesurerObjectifActorAlias(rows[0]!.n);
	assert.equal(objectif.atteint, true);
	assert.equal(objectif.ligne, `OBJECTIF : atteint — ${rows[0]!.n} canoniques avec >= 2 alias / cible >= 20`);
});

test("rapport : la ligne OBJECTIF mesurée est déclarée une seule fois", () => {
	const rapport = readFileSync(new URL("../../../docs/actor-alias-misp-galaxy.md", import.meta.url), "utf8");
	const ligne = mesurerObjectifActorAlias(963).ligne;
	assert.equal(verifierDeclarationObjectifActorAlias(rapport, ligne), true);
	assert.equal(verifierDeclarationObjectifActorAlias(rapport, "OBJECTIF : atteint — 1 / 1"), false);
});
