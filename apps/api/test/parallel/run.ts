/**
 * Plusieurs workers de tests en parallèle pour un même shard.
 *
 * Chaque worker est le lanceur existant `test/run.ts` : il crée sa propre base
 * `radar_test_<pid>_<timestamp>`, y applique le schéma, exécute `tsx --test`
 * sur sa part des fichiers, puis détruit sa base. Les assertions ne sont pas
 * modifiées ; seul le découpage du shard change.
 *
 * Deux workers par défaut. `RADAR_TEST_WORKERS` permet d'augmenter le parallélisme
 * quand le runner dispose de plusieurs cœurs.
 *
 *   tsx test/parallel/run.ts test/a.test.ts test/b.test.ts ...
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const API_DIR = fileURLToPath(new URL("../../", import.meta.url));
const RUNNER = fileURLToPath(new URL("../run.ts", import.meta.url));
const LOCAL_TSX = fileURLToPath(new URL("../../node_modules/.bin/tsx", import.meta.url));
const TSX = existsSync(LOCAL_TSX) ? LOCAL_TSX : "tsx";

const files = process.argv.slice(2);
if (files.length === 0) {
	console.error("Usage : tsx test/parallel/run.ts <fichiers de test...>");
	process.exit(2);
}

// Alternance déterministe : chaque fichier du shard va à un seul worker, sans
// duplication ; l'ordre décroissant des poids du shard est préservé.
const requestedWorkers = Number(process.env.RADAR_TEST_WORKERS ?? 2);
if (!Number.isInteger(requestedWorkers) || requestedWorkers < 1 || requestedWorkers > 16) {
	console.error("RADAR_TEST_WORKERS doit être un entier entre 1 et 16");
	process.exit(2);
}
const workerCount = Math.min(requestedWorkers, files.length);
const groups = Array.from({ length: workerCount }, (_, worker) =>
	files.filter((_, index) => index % workerCount === worker),
);

const workers: ChildProcess[] = [];

function worker(index: number): Promise<number> {
	const group = groups[index];
	if (group.length === 0) return Promise.resolve(0);
	const { promise, resolve, reject } = Promise.withResolvers<number>();
	const child = spawn(TSX, [RUNNER, ...group], {
		cwd: API_DIR,
		env: process.env,
		stdio: "inherit",
		detached: process.platform !== "win32",
	});
	workers.push(child);
	child.on("error", reject);
	child.on("close", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
	return promise;
}

// Un worker ne doit jamais survivre au wrapper et continuer à écrire dans sa base.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		for (const child of workers) {
			if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) continue;
			try {
				if (process.platform !== "win32") process.kill(-child.pid, signal);
				else child.kill(signal);
			} catch {
				// Le worker est déjà sorti entre-temps.
			}
		}
	});
}

try {
	const codes = await Promise.all(groups.map((_, index) => worker(index)));
	console.log(`workers parallèles : ${codes.map((code, index) => `#${index + 1}=${code}`).join(" ")}`);
	process.exit(codes.every((code) => code === 0) ? 0 : 1);
} catch (err) {
	console.error(err);
	process.exit(1);
}
