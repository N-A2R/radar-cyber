/**
 * Worker d'un shard : une base jetable, un sous-ensemble de fichiers, un verdict.
 *
 * Lancé uniquement par `test/run-sharded.ts`. Le mode classique (`test/run.ts`)
 * reste inchangé. Pas de `--test-force-exit` : un handle ouvert fait échouer le
 * shard via la garde, comme dans le mode classique.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createTestDatabase, dropTestDatabase, type TestDb } from "./helpers/testdb.js";

const API_DIR = fileURLToPath(new URL("../", import.meta.url));
const LOCAL_TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

const shard = Number(process.env.RADAR_SHARD_INDEX ?? "1");
const shardCount = Number(process.env.RADAR_SHARD_COUNT ?? "1");
if (!Number.isInteger(shard) || !Number.isInteger(shardCount) || shard < 1 || shard > shardCount) {
	throw new Error(`index de shard invalide: ${shard}/${shardCount}`);
}

const argv = process.argv.slice(2);
const flags: string[] = [];
const files: string[] = [];
let timeoutMs = DEFAULT_TIMEOUT_MS;
for (let i = 0; i < argv.length; i++) {
	const arg = argv[i]!;
	if (arg === "--timeout-ms" || arg.startsWith("--timeout-ms=")) {
		const value = arg === "--timeout-ms" ? argv[++i] : arg.slice("--timeout-ms=".length);
		timeoutMs = Number(value);
		if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error(`--timeout-ms invalide: ${value}`);
		continue;
	}
	if (arg.startsWith("--test-force-exit") || arg.startsWith("--test-concurrency")) {
		throw new Error(`${arg} n'est pas autorisé : un handle ouvert doit échouer le shard`);
	}
	if (arg.startsWith("-")) flags.push(arg);
	else files.push(arg);
}
if (files.length === 0) throw new Error(`shard ${shard}/${shardCount} sans fichier`);

let db: TestDb | null = null;
let dropping = false;
let runningChild: ChildProcess | null = null;

async function cleanup(): Promise<void> {
	if (!db || dropping) return;
	dropping = true;
	const target = db;
	db = null;
	await dropTestDatabase(target);
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
	const { promise, resolve, reject } = Promise.withResolvers<number>();
	const child = spawn(cmd, args, { cwd: API_DIR, stdio: "inherit", env });
	runningChild = child;
	const garde = setTimeout(() => {
		console.error(`Shard ${shard}/${shardCount} interrompu après ${timeoutMs / 60000} min : un handle est resté ouvert.`);
		child.kill("SIGKILL");
	}, timeoutMs);
	child.on("error", (err) => {
		clearTimeout(garde);
		runningChild = null;
		reject(err);
	});
	child.on("close", (code, signal) => {
		clearTimeout(garde);
		runningChild = null;
		resolve(signal ? 1 : (code ?? 1));
	});
	return promise;
}

function onSignal(signal: "SIGINT" | "SIGTERM"): void {
	runningChild?.kill("SIGTERM");
	void cleanup().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
}
process.on("SIGINT", () => onSignal("SIGINT"));
process.on("SIGTERM", () => onSignal("SIGTERM"));

let exitCode = 1;
try {
	db = await createTestDatabase();
	console.log(`[shard ${shard}/${shardCount}] base ${db.name} — ${files.length} fichier(s)`);
	const cmd = existsSync(LOCAL_TSX) ? LOCAL_TSX : "tsx";
	exitCode = await run(
		cmd,
		["--test", "--test-concurrency=1", "--test-timeout=120000", ...flags, ...files],
		{
			...process.env,
			NODE_ENV: "test",
			DATABASE_URL: db.url,
			RADAR_REVIEW_INDEX_CACHE: "off",
			RADAR_EXPORT_SCELLEMENT: "0",
		}
	);
} catch (err) {
	console.error(err);
	exitCode = 1;
} finally {
	await cleanup();
}
process.exit(exitCode);
