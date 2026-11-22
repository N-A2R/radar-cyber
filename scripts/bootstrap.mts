/**
 * Socle reproductible — une commande pour partir d'un dépôt neuf.
 *
 * Pourquoi ce script : le sandbox a été réinitialisé en cours de route, et
 * remonter l'environnement a demandé une dizaine d'étapes manuelles retrouvées
 * de mémoire (cluster PG, schéma, migrations, sources, règles, référentiel,
 * fixtures, compte). Aucune ne serait retrouvée par quelqu'un d'autre.
 *
 * Tout est **hors réseau** : le jeu NA et l'échantillon de revendications sont
 * versionnés. Pas de Python, pas d'API gouv, pas de dump à télécharger.
 *
 *   tsx scripts/bootstrap.mts              # applique ce qui manque
 *   tsx scripts/bootstrap.mts --check      # diagnose sans rien écrire
 *   tsx scripts/bootstrap.mts --with-sample # + 500 revendications de démo
 *
 * Idempotent : chaque étape vérifie l'état avant d'agir, et un rejeu ne
 * duplique rien. Le script ne démarre PAS PostgreSQL : il faut un serveur
 * joignable (`tsx db/dev-pg.mts` en local, ou DATABASE_URL vers un existant).
 * Il refuse de créer un cluster implicite — un socle ne devine pas où vivent
 * les données.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// pnpm cloisonne les dépendances : `pg` vit dans apps/api, pas à la racine.
// Même idiome que scripts/import-entreprises-na.mts.
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DB_DIR = `${ROOT}db/`;
const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const WITH_SAMPLE = argv.includes("--with-sample");
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";

/**
 * Catalogues de sources, découverts sur le disque plutôt que tenus à la main :
 * une liste en dur dérive dès qu'on ajoute un fichier (elle annonçait 17
 * catalogues là où il y en a 16). `sources.sql` passe en premier — c'est le
 * socle, les autres sont des extensions qui peuvent le référencer.
 */
function sourceFiles(): string[] {
  const files = readdirSync(DB_DIR)
    .filter((f) => /^sources.*\.sql$/.test(f) || f === "darkweb-sources.sql")
    .sort((a, b) => a.localeCompare(b, "en"));
  return ["sources.sql", ...files.filter((f) => f !== "sources.sql")];
}

const SOURCE_FILES = sourceFiles();

type Step = { label: string; done: boolean; detail: string };
const steps: Step[] = [];

function report(label: string, done: boolean, detail: string): void {
	steps.push({ label, done, detail });
	console.log(`${done ? "✓" : "→"} ${label.padEnd(28)} ${detail}`);
}

async function main(): Promise<void> {
	const client = new Client({ connectionString: DATABASE_URL });
	try {
		await client.connect();
	} catch (error) {
		console.error(`\nPostgreSQL injoignable sur ${DATABASE_URL.replace(/:[^:@]*@/, ":***@")}`);
		console.error("Démarrez-le d'abord :  tsx db/dev-pg.mts");
		console.error(`Détail : ${String((error as Error).message).slice(0, 160)}`);
		process.exitCode = 1;
		return;
	}

	try {
		const version = await client.query<{ v: string }>("SELECT version() AS v");
		report("connexion", true, version.rows[0].v.split(" ").slice(0, 2).join(" "));

		// --- Schéma ---------------------------------------------------------
		const hasEvent = await client.query<{ present: boolean }>(
			"SELECT to_regclass('public.event') IS NOT NULL AS present",
		);
		if (hasEvent.rows[0].present) {
			report("schéma", true, "déjà présent");
		} else if (CHECK) {
			report("schéma", false, "absent — à appliquer (db/init.sql)");
		} else {
			await client.query(readFileSync(`${DB_DIR}init.sql`, "utf8"));
			report("schéma", true, "db/init.sql appliqué");
		}

		// --- Migrations -----------------------------------------------------
		// Le runner maison (scripts/migrate.mts) garde la table de suivi ; on
		// l'appelle plutôt que de réimplémenter l'ordre et l'amorçage ici.
		const migrations = readdirSync(DB_DIR).filter((f) => /^migrate-.*\.sql$/.test(f)).sort();
		const tracking = await client.query<{ present: boolean }>(
			"SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present",
		);
		let applied = 0;
		if (tracking.rows[0].present) {
			const r = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM schema_migrations");
			applied = Number(r.rows[0].n);
		}
		if (applied >= migrations.length) {
			report("migrations", true, `${applied}/${migrations.length} appliquées`);
		} else if (CHECK) {
			report("migrations", false, `${applied}/${migrations.length} — lancez scripts/migrate.mts`);
		} else {
			await runScript("scripts/migrate.mts");
			const r = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM schema_migrations");
			report("migrations", true, `${r.rows[0].n}/${migrations.length} appliquées`);
		}

		// --- Catalogue de sources -------------------------------------------
		const sourceCount = async () => {
			const r = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM source");
			return Number(r.rows[0].n);
		};
		const before = await sourceCount();
		if (CHECK) {
			report("sources", before > 2, `${before} en base (${SOURCE_FILES.length} catalogues versionnés)`);
		} else {
			for (const file of SOURCE_FILES) {
				await client.query(readFileSync(`${DB_DIR}${file}`, "utf8"));
			}
			const after = await sourceCount();
			report("sources", true, `${after} en base (+${after - before})`);
		}

		// --- Règles de détection --------------------------------------------
		const rulesBefore = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM detection_rule");
		if (CHECK) {
			report("règles de détection", Number(rulesBefore.rows[0].n) > 0, `${rulesBefore.rows[0].n} règle(s)`);
		} else {
			await client.query(readFileSync(`${DB_DIR}detection-rules.sql`, "utf8"));
			const r = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM detection_rule");
			report("règles de détection", true, `${r.rows[0].n} règle(s)`);
		}

		// --- Référentiel NA --------------------------------------------------
		const orgs = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM org");
		const aliases = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM org_alias");
		if (Number(orgs.rows[0].n) >= 4000) {
			report("référentiel NA", true, `${orgs.rows[0].n} orgs / ${aliases.rows[0].n} alias`);
		} else if (CHECK) {
			report("référentiel NA", false, `${orgs.rows[0].n} orgs — lancez scripts/load-referentiel-na.mts --apply`);
		} else {
			await runScript("scripts/load-referentiel-na.mts", ["--apply"]);
			const o = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM org");
			const a = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM org_alias");
			report("référentiel NA", true, `${o.rows[0].n} orgs / ${a.rows[0].n} alias`);
		}

		// --- Registre des absences (attestations négatives signées) ------------
		// Une organisation sans événement n'apparaît nulle part : sans ce
		// registre, son absence est indistinguable d'une non-couverture.
		const attTable = await client.query<{ present: boolean }>(
			"SELECT to_regclass('public.negative_attestation') IS NOT NULL AS present",
		);
		const attCount = async () => {
			const r = await client.query<{ n: string }>(
				`SELECT count(*)::text AS n FROM negative_attestation
				 WHERE sources_checked >= 3 AND signed = true AND window_end > window_start`,
			);
			return Number(r.rows[0].n);
		};
		if (!attTable.rows[0]?.present) {
			report("absences attestées", false, "table absente — appliquez la migration 201");
		} else {
			const avant = await attCount();
			if (avant >= 1000) {
				report("absences attestées", true, `${avant} attestation(s) signée(s)`);
			} else if (CHECK) {
				report("absences attestées", false, `${avant}/1000 — lancez scripts/attestations-negatives.mts --apply`);
			} else {
				await runScript("scripts/attestations-negatives.mts", ["--apply"]);
				const apres = await attCount();
				report("absences attestées", apres >= 1000, `${apres} attestation(s) signée(s)`);
			}
		}

		// --- Échantillon de démonstration (optionnel) -------------------------
		if (WITH_SAMPLE) {
			const q = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM quarantine_raw");
			if (Number(q.rows[0].n) > 0 && !CHECK) {
				report("échantillon quarantaine", true, `${q.rows[0].n} fait(s) déjà présents — non mélangés`);
			} else if (CHECK) {
				report("échantillon quarantaine", Number(q.rows[0].n) > 0, `${q.rows[0].n} fait(s)`);
			} else {
				await runScript("scripts/load-claims-sample.mts");
				const r = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM quarantine_raw");
				report("échantillon quarantaine", true, `${r.rows[0].n} faits`);
			}
		}

		// --- Journal de vérité -----------------------------------------------
		// La doctrine « aucune écriture destructive » n'est une propriété du
		// dépôt que si elle est vérifiée dans le socle. Une base sans journal
		// n'est pas un socle valide : le contrôle échoue, il ne prévient pas.
		{
			const j = await client.query<{ existe: boolean }>(
				"SELECT to_regclass('public.journal') IS NOT NULL AS existe",
			);
			if (j.rows[0]?.existe === true) {
				// La vérification tourne aussi en diagnostic : c'est là qu'on veut
				// savoir qu'une projection a divergé, pas après coup.
				await runScript("scripts/verify-journal.mts");
				report("journal de vérité", true, "table présente, append-only et projections vérifiés");
			} else {
				report("journal de vérité", false, "table absente — migration 027 non appliquée");
			}
		}

		// --- Compte administrateur -------------------------------------------
		const users = await client.query<{ n: string }>("SELECT count(*)::text AS n FROM app_user");
		if (Number(users.rows[0].n) > 0) {
			report("compte", true, `${users.rows[0].n} utilisateur(s)`);
		} else if (CHECK) {
			report("compte", false, "aucun — voir scripts/create-admin.mts");
		} else {
			const password = process.env.RADAR_ADMIN_PASSWORD;
			if (!password) {
				report("compte", false, "aucun — définissez RADAR_ADMIN_PASSWORD puis relancez");
			} else {
				await runScript("scripts/create-admin.mts", [process.env.RADAR_ADMIN_EMAIL ?? "admin@radar.local"]);
				report("compte", true, process.env.RADAR_ADMIN_EMAIL ?? "admin@radar.local");
			}
		}

		const missing = steps.filter((s) => !s.done);
		console.log(`\n${CHECK ? "Diagnostic" : "Socle"} : ${steps.length - missing.length}/${steps.length} étapes en place.`);
		if (missing.length > 0) {
			console.log(`À faire : ${missing.map((s) => s.label).join(", ")}`);
			if (CHECK) process.exitCode = 1;
		} else {
			console.log("Prêt.  pnpm dev:api  puis  pnpm dev:web");
		}
	} finally {
		await client.end();
	}
}

/** Exécute un script du dépôt avec le tsx de l'API, depuis la racine. */
async function runScript(relative: string, args: string[] = []): Promise<void> {
	const { spawn } = await import("node:child_process");
	const tsx = `${ROOT}apps/api/node_modules/.bin/tsx`;
	await new Promise<void>((resolve, reject) => {
		const child = spawn(tsx, [`${ROOT}${relative}`, ...args], {
			cwd: ROOT,
			env: { ...process.env, DATABASE_URL },
			stdio: "inherit",
		});
		child.on("error", reject);
		child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${relative} a échoué (code ${code})`))));
	});
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
