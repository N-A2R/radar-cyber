/**
 * Mode opt-in : lance la suite API en shards déterministes, chacun sur sa base.
 *
 * `pnpm test` (test/run.ts) reste le mode sûr par défaut : une base, séquential.
 * Ici chaque worker a sa propre base jetable ; les sorties sont toutes
 * affichées et un échec de worker ne masque jamais les autres verdicts.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	discoverTestFiles,
	parseControllerArgs,
	shardFiles,
	USAGE,
	type ControllerArgs,
} from "./sharding.js";
import { dropTestDatabasesForPid } from "./helpers/testdb.js";

const API_DIR = fileURLToPath(new URL("../", import.meta.url));
const LOCAL_TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

type ShardResult = {
	index: number;
	files: string[];
	code: number;
	signal: NodeJS.Signals | null;
	output: string;
	pid?: number;
	error?: unknown;
	cleanupError?: unknown;
};

const children = new Set<ChildProcess>();
let interrupt: NodeJS.Signals | null = null;
function onSignal(signal: "SIGINT" | "SIGTERM"): void {
	if (!interrupt) {
		interrupt = signal;
		console.error(`Signal ${signal} reçu : arrêt des workers, puis nettoyage des bases.`);
	}
	for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", () => onSignal("SIGINT"));
process.on("SIGTERM", () => onSignal("SIGTERM"));

function runShard(
	index: number,
	files: string[],
	args: ControllerArgs,
	cmd: string
): Promise<ShardResult> {
	const { promise, resolve } = Promise.withResolvers<ShardResult>();
	const child = spawn(
		cmd,
		["test/run-shard.ts", `--timeout-ms=${args.timeoutMs}`, ...args.flags, ...files],
		{
			cwd: API_DIR,
			env: {
				...process.env,
				RADAR_SHARD_INDEX: String(index + 1),
				RADAR_SHARD_COUNT: String(args.shards),
			},
			stdio: ["ignore", "pipe", "pipe"],
		}
	);
	if (child.pid) children.add(child);

	let output = "";
	child.stdout?.setEncoding("utf8");
	child.stderr?.setEncoding("utf8");
	child.stdout?.on("data", (chunk: string) => { output += chunk; });
	child.stderr?.on("data", (chunk: string) => { output += chunk; });

	const garde = setTimeout(() => {
		console.error(`Shard ${index + 1}/${args.shards} interrompu après ${args.timeoutMs / 60000} min.`);
		child.kill("SIGTERM");
	}, args.timeoutMs);
	const force = setTimeout(() => {
		console.error(`Shard ${index + 1}/${args.shards} : SIGKILL après grâce dépassée.`);
		child.kill("SIGKILL");
	}, args.timeoutMs + 5000);

	const finish = (extra: Partial<ShardResult> = {}): void => {
		clearTimeout(garde);
		clearTimeout(force);
		children.delete(child);
		resolve({
			index: index + 1,
			files,
			code: 1,
			signal: null,
			output,
			pid: child.pid,
			...extra,
		});
	};

	child.on("error", (err) => finish({ error: err }));
	child.on("close", (code, signal) => finish({ code: signal ? 1 : (code ?? 1), signal }));
	return promise;
}

async function main(): Promise<number> {
	const args = parseControllerArgs(process.argv.slice(2));
	if (args.help) {
		console.log(USAGE);
		return 0;
	}
	const files = args.files.length > 0 ? args.files : await discoverTestFiles();
	const assignments = shardFiles(files, args.shards);
	if (args.listShards) {
		for (const [i, group] of assignments.entries()) {
			if (group.length) console.log(`shard ${i + 1}/${args.shards} (${group.length}) : ${group.join(" ")}`);
		}
		console.log(`total : ${files.length} fichiers, ${assignments.flat().length} assignés`);
		return 0;
	}

	const active = assignments
		.map((group, index) => ({ index, group }))
		.filter(({ group }) => group.length > 0);
	console.log(
		`${files.length} fichiers, ${active.length} shards actifs, ` +
		`${Math.min(args.concurrency, active.length)} workers max, garde ${args.timeoutMs / 60000} min`
	);
	const cmd = existsSync(LOCAL_TSX) ? LOCAL_TSX : "tsx";
	const results: ShardResult[] = [];
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(args.concurrency, active.length) }, async () => {
			while (next < active.length) {
				const { index, group } = active[next++]!;
				console.log(`[shard ${index + 1}/${args.shards}] démarrage (${group.length} fichier(s))`);
				const result = await runShard(index, group, args, cmd);
				results.push(result);
				console.log(
					`[shard ${result.index}/${args.shards}] terminé : ` +
					`${result.code === 0 ? "OK" : `ÉCHEC (code ${result.code}${result.signal ? `, ${result.signal}` : ""})`}`
				);
			}
		})
	);

	results.sort((a, b) => a.index - b.index);
	for (const result of results) {
		console.log(`\n===== sortie shard ${result.index}/${args.shards} =====`);
		if (result.error) console.error(result.error);
		if (result.output.trim()) process.stdout.write(`${result.output.replace(/\s+$/, "")}\n`);
		else console.log("(aucune sortie)");
	}

	// Filet de sécurité : si un worker a été tué avant son `finally`, on retire
	// par pid les bases `radar_test_<pid>_*` qu'il aurait laissées.
	for (const result of results) {
		if (!result.pid) continue;
		try {
			const dropped = await dropTestDatabasesForPid(result.pid);
			if (dropped.length) {
				console.error(`[shard ${result.index}] base(s) résiduelle(s) supprimée(s) : ${dropped.join(", ")}`);
			}
		} catch (err) {
			result.cleanupError = err;
			console.error(`[shard ${result.index}] ÉCHEC du nettoyage de base :`, err);
		}
	}

	const failed = results.filter((r) => r.code !== 0 || r.error || r.cleanupError);
	console.log(
		`\nRésumé : ${results.length - failed.length}/${results.length} shards réussis` +
		`${failed.length ? ` — échecs : ${failed.map((r) => r.index).join(", ")}` : ""}`
	);
	if (interrupt) return interrupt === "SIGINT" ? 130 : 143;
	return failed.length === 0 ? 0 : 1;
}

try {
	process.exit(await main());
} catch (err) {
	console.error(err);
	process.exit(1);
}
