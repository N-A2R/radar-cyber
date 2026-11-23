/**
 * Lanceur de la suite de tests : crée une base `radar_test_<pid>`,
 * fait pointer `DATABASE_URL` dessus, exécute `tsx --test`, puis la détruit.
 *
 * Usage :
 *   tsx test/run.ts                      # tous les test/*.test.ts
 *   tsx test/run.ts test/http.test.ts    # un seul fichier
 *   tsx test/run.ts --experimental-test-coverage
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createTestDatabase, dropTestDatabase, type TestDb } from "./helpers/testdb.js";

const TEST_DIR = fileURLToPath(new URL("./", import.meta.url));
const LOCAL_TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

async function testFiles(): Promise<string[]> {
	const entries = await readdir(TEST_DIR);
	return entries.filter((f) => f.endsWith(".test.ts")).sort().map((f) => `test/${f}`);
}

// Un test peut laisser un handle ouvert : le processus ne sort alors jamais et
// le step de CI reste bloqué indéfiniment. Cette borne tue la suite et échoue.
const GLOBAL_TIMEOUT_MS = 20 * 60 * 1000;

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
	const { promise, resolve, reject } = Promise.withResolvers<number>();
	const child = spawn(cmd, args, { stdio: "inherit", env });
	const garde = setTimeout(() => {
		console.error(`Suite de tests interrompue après ${GLOBAL_TIMEOUT_MS / 60000} min : un handle est resté ouvert.`);
		child.kill("SIGKILL");
	}, GLOBAL_TIMEOUT_MS);
	child.on("error", (err) => { clearTimeout(garde); reject(err); });
	child.on("close", (code, signal) => { clearTimeout(garde); resolve(signal ? 1 : (code ?? 1)); });
	return promise;
}

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith("-"));
const explicitFiles = argv.filter((a) => !a.startsWith("-"));

let db: TestDb | null = null;
let dropping = false;

async function cleanup(): Promise<void> {
	if (!db || dropping) return;
	dropping = true;
	const target = db;
	db = null;
	await dropTestDatabase(target);
}

process.on("SIGINT", () => {
	void cleanup().finally(() => process.exit(130));
});
process.on("SIGTERM", () => {
	void cleanup().finally(() => process.exit(143));
});

let exitCode = 1;
try {
	db = await createTestDatabase();
	const files = explicitFiles.length > 0 ? explicitFiles : await testFiles();
	const cmd = existsSync(LOCAL_TSX) ? LOCAL_TSX : "tsx";
	exitCode = await run(
		cmd,
		// `--test-force-exit` : la suite rend son verdict puis le processus
		// sort, même si une connexion de collecte est restée ouverte. Sans lui,
		// le step de CI attend 20 minutes pour rien (692 tests verts, aucune
		// sortie), et le job est annulé.
		["--test", "--test-concurrency=1", "--test-timeout=120000", "--test-force-exit", ...flags, ...files],
		// Les tests d'intégration ne dépendent pas d'une TSA en ligne : le
		// scellement est couvert par son propre test avec fournisseur injecté.
		{ ...process.env, DATABASE_URL: db.url, RADAR_REVIEW_INDEX_CACHE: "off", RADAR_EXPORT_SCELLEMENT: "0" }
	);
} catch (err) {
	console.error(err);
	exitCode = 1;
} finally {
	await cleanup();
}
process.exit(exitCode);
