/**
 * Sélectionne les tests API réellement affectés par une pull request.
 *
 * Sur `main`, `merge_group` ou un run manuel, tous les tests des shards sont
 * rendus. Le label `full-ci` sur une PR force en plus `test/objectifs/`.
 * Sur une PR ordinaire, on part des fichiers modifiés et on remonte le graphe
 * d'imports locaux des tests : un test est retenu s'il importe, directement ou
 * transitivement, un fichier modifié.
 *
 * Les fixtures lues par `new URL(...)` (snapshots golden notamment) font aussi
 * partie du graphe : un fichier modifié ou supprimé retient son test, sans
 * contournement dans le workflow.
 *
 * `test/objectifs/*` est bien découvert, mais exclu des shards, du canari et de
 * la sélection PR ordinaire : la nightly les exécute dans le job `objectives`
 * dédié. Les jouer sur chaque PR doublerait cette porte et ralentirait la
 * merge queue. Seul le label `full-ci` les ajoute explicitement.
 *
 * Les changements limités à `.github/workflows/` et `.github/actions/` utilisent
 * un canari de six tests : la merge queue et la nightly reprennent la suite
 * complète des shards, sans le job nightly dédié.
 *
 * Les autres chemins critiques forcent la suite complète : une erreur dans le
 * schéma, le serveur, l'authentification ou les helpers de test ne doit jamais
 * être masquée par une sélection trop fine.
 *
 * Sortie : un fichier `test/....test.ts` par ligne. Aucun log sur stdout.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverTestFiles, isObjectifTest, shardFiles } from "./shard-files.js";

const TEST_DIR = fileURLToPath(new URL("./", import.meta.url));
const API_ROOT = resolve(TEST_DIR, "..");
const REPO_ROOT = resolve(API_ROOT, "../..");

/** Tests toujours exécutés quand aucun test n'est rattaché au diff. */
const ALWAYS = ["test/contract-admit.test.ts", "test/securite-headers.test.ts"];

/** Changements de CI seuls : validation rapide avant la merge queue. */
const CI_ONLY = [".github/workflows/", ".github/actions/"];

/** Couvre le pool PostgreSQL, les routes, l'ingestion et les rapports. */
const CANARY = [
	"test/rate-limit.test.ts",
	"test/forums.test.ts",
	"test/fuites.test.ts",
	"test/dns-historique.test.ts",
	"test/org-report.test.ts",
	"test/api-composition-securite.test.ts",
];

/** Un changement ici peut affecter n'importe quel test. */
const CRITICAL = [
	"db/",
	"packages/shared/",
	"pnpm-lock.yaml",
	"package.json",
	"apps/api/package.json",
	"apps/api/tsconfig.json",
	"apps/api/src/db.ts",
	"apps/api/src/server.ts",
	"apps/api/src/auth.ts",
	"apps/api/src/middleware/auth.ts",
	"apps/api/src/security/",
	"apps/api/test/helpers/",
	"apps/api/test/run.ts",
	".github/workflows/",
	"apps/api/test/parallel/",
	"apps/api/test/shard-files.ts",
	"apps/api/test/affected-tests.ts",
];

function option(name: string): string | undefined {
	for (let at = 0; at < process.argv.length; at++) {
		const arg = process.argv[at]!;
		if (arg === name) return process.argv[at + 1];
		if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
	}
	return undefined;
}

function imports(source: string): string[] {
	const found: string[] = [];
	const re = /(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
	for (const match of source.matchAll(re)) {
		const value = match[1];
		if (value) found.push(value);
	}
	return found;
}

function resolveImport(fromFile: string, specifier: string): string | null {
	if (!specifier.startsWith(".")) return null;
	const withoutExtension = specifier.replace(/\.(?:js|mjs|cjs)$/, "");
	const base = resolve(dirname(fromFile), withoutExtension);
	for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

/** Références relatives passées à `new URL("...")` ; on ignore les URLs web et les chemins calculés. */
function staticUrlSpecifiers(source: string): string[] {
	const found: string[] = [];
	const re = /\bnew\s+URL\(\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)\s*(?:,|\))/g;
	for (const match of source.matchAll(re)) {
		const specifier = match[1] ?? match[2] ?? match[3];
		if (!specifier || !specifier.startsWith(".") || specifier.includes("${")) continue;
		found.push(specifier);
	}
	return found;
}

function isFixturePath(path: string): boolean {
	const rel = relative(REPO_ROOT, path);
	if (rel.startsWith("..") || rel.startsWith(sep)) return false;
	return rel.split(sep).some((part) => part === "fixtures" || part === "golden");
}

/**
 * Dépendances de données non importées : le slash final marque un dossier dont
 * les fichiers sont lus par nom dynamique (`SNAPSHOT_DIR${code}.md`, etc.).
 */
function fixtureRefs(fromFile: string, source: string): string[] {
	const found: string[] = [];
	for (const specifier of staticUrlSpecifiers(source)) {
		const target = resolve(dirname(fromFile), specifier);
		if (!isFixturePath(target)) continue;
		found.push(specifier.endsWith("/") ? `${target}${sep}` : target);
	}
	return found;
}

async function main(): Promise<void> {
	const base = option("--base") ?? process.env.GITHUB_BASE_SHA ?? "";
	const shards = Number(option("--shards") ?? process.env.API_SHARDS ?? 0);
	const index = Number(option("--index") ?? 0);
	const full = process.env.FULL_CI === "1" || process.env.FULL_CI === "true";
	const fullLabelOnPr = full && process.env.GITHUB_EVENT_NAME === "pull_request";
	const all = await discoverTestFiles();
	const ciTests = all.filter((file) => !isObjectifTest(file));

	const emit = (files: readonly string[]) => {
		const selected = shards > 0 && index > 0 ? shardFiles(files, shards, index) : files;
		if (selected.length > 0) console.log(selected.join("\n"));
	};

	// main, merge queue, manuel ou base absente : suite des shards.
	// `full-ci` est le seul chemin de PR qui ajoute les tests d'objectifs.
	if (full || !base || process.env.GITHUB_EVENT_NAME !== "pull_request") {
		emit(fullLabelOnPr ? all : ciTests);
		return;
	}

	let changed: string[];
	try {
		changed = execFileSync(
			"git",
			["diff", "--name-only", "--diff-filter=ACDMR", `${base}...HEAD`],
			{ cwd: REPO_ROOT, encoding: "utf8" },
		).split("\n").filter(Boolean);
	} catch (error) {
		console.error(`affected-tests : diff indisponible, suite complète — ${String(error)}`);
		emit(ciTests);
		return;
	}

	const ciOnly = changed.length > 0 && changed.every((file) =>
		CI_ONLY.some((prefix) => file === prefix || file.startsWith(prefix)),
	);
	if (ciOnly) {
		const canary = CANARY.filter((file) => ciTests.includes(file));
		if (canary.length !== CANARY.length) {
			console.error("affected-tests : canari incomplet, suite complète");
			emit(ciTests);
			return;
		}
		console.error(`affected-tests : CI-only, ${canary.length} test(s) canari`);
		emit(canary);
		return;
	}

	if (changed.some((file) => CRITICAL.some((prefix) => file === prefix || file.startsWith(prefix)))) {
		emit(ciTests);
		return;
	}

	const changedPaths = new Set(changed.map((file) => resolve(REPO_ROOT, file)));
	const selected = new Set<string>();
	const closures = new Map<string, Promise<Set<string>>>();
	const dependsOn = (dependencies: ReadonlySet<string>, changedFile: string): boolean =>
		dependencies.has(changedFile)
		|| [...dependencies].some((dependency) =>
			dependency.endsWith(sep) && changedFile.startsWith(dependency));

	const closure = (file: string, stack = new Set<string>()): Promise<Set<string>> => {
		// Un cycle ne doit jamais attendre sa propre promesse : sinon `main`
		// se termine sans écrire et la CI croit qu'aucun test n'est affecté.
		if (stack.has(file)) return Promise.resolve(new Set());
		const cached = closures.get(file);
		if (cached) return cached;
		stack.add(file);
		const pending = (async () => {
			const source = await readFile(file, "utf8").catch(() => "");
			const result = new Set<string>([file]);
			for (const specifier of imports(source)) {
				const imported = resolveImport(file, specifier);
				if (!imported) continue;
				result.add(imported);
				for (const dependency of await closure(imported, stack)) result.add(dependency);
			}
			for (const fixture of fixtureRefs(file, source)) result.add(fixture);
			return result;
		})();
		closures.set(file, pending);
		return pending;
	};

	for (const file of ciTests) {
		const testFile = resolve(API_ROOT, file);
		if (changedPaths.has(testFile)) {
			selected.add(file);
			continue;
		}
		const dependencies = await closure(testFile);
		if ([...changedPaths].some((changedFile) => dependsOn(dependencies, changedFile))) {
			selected.add(file);
		}
	}

	// Un diff sans test rattaché ne doit pas rendre la CI muette.
	if (selected.size === 0) {
		for (const file of ALWAYS) if (all.includes(file)) selected.add(file);
	}

	console.error(
		`affected-tests : ${changed.length} fichier(s) modifié(s), ${selected.size} test(s) sélectionné(s), shards=${shards}, index=${index}`,
	);
	emit([...selected].sort());
}

main().catch((error: unknown) => {
	console.error(`affected-tests : erreur, suite complète — ${String(error)}`);
	process.exitCode = 1;
});
