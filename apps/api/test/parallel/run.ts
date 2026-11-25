/**
 * Prototype : deux workers de tests en parallèle pour un même shard.
 *
 * Chaque worker est le lanceur existant `test/run.ts` : il crée sa propre base
 * `radar_test_<pid>_<timestamp>`, y applique le schéma, exécute `tsx --test`
 * sur sa moitié des fichiers, puis détruit sa base. Les assertions ne sont pas
 * modifiées ; seul le découpage du shard change.
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
const groups = [files.filter((_, i) => i % 2 === 0), files.filter((_, i) => i % 2 === 1)];

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
	const codes = await Promise.all([worker(0), worker(1)]);
	console.log(`workers parallèles : #1=${codes[0]} #2=${codes[1]}`);
	process.exit(codes.every((code) => code === 0) ? 0 : 1);
} catch (err) {
	console.error(err);
	process.exit(1);
}
