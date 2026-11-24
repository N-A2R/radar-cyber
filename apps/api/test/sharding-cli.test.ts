import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { assertTestFilesExist, parseControllerArgs, shardFiles } from "./sharding.js";

const API_DIR = fileURLToPath(new URL("../", import.meta.url));

test("la répartition est déterministe, sans perte ni doublon", () => {
	assert.deepEqual(shardFiles(["c.test.ts", "a.test.ts", "b.test.ts"], 2), [
		["a.test.ts", "c.test.ts"],
		["b.test.ts"],
	]);
});

test("les drapeaux qui masqueraient un handle ouvert sont refusés", () => {
	assert.throws(() => parseControllerArgs(["--test-force-exit"]), /test-force-exit/);
	assert.throws(() => parseControllerArgs(["--test-concurrency=2"]), /test-concurrency/);
});

test("un fichier de test absent est détecté avant création de base", async () => {
	await assert.doesNotReject(assertTestFilesExist(["test/dates.test.ts"], API_DIR));
	await assert.rejects(
		assertTestFilesExist(["test/dates.test.ts", "test/introuvable.test.ts"], API_DIR),
		/introuvable\.test\.ts/
	);
});
