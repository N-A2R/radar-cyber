/**
 * Base PostgreSQL dédiée aux tests : `radar_test_<pid>_<timestamp>`.
 *
 * Créée au démarrage de la suite depuis `db/init.sql`, les migrations
 * `db/migrate-*.sql` puis `db/detection-rules.sql`, et détruite à la fin
 * (même en cas d'échec). La base de production `radar` n'est jamais touchée.
 */
import { Client } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DB_DIR = fileURLToPath(new URL("../../../../db/", import.meta.url));
const DEFAULT_ADMIN_URL = "postgres://radar:radar@localhost:5432/postgres";
const SAFE_NAME = /^radar_test_[a-z0-9_]+$/;

export type TestDb = { name: string; url: string };

/** Connexion d'administration : jamais la base applicative. */
function adminUrl(): string {
	const explicit = process.env.RADAR_TEST_ADMIN_URL;
	if (explicit) return explicit;
	const base = process.env.DATABASE_URL;
	if (base) {
		const url = new URL(base);
		url.pathname = "/postgres";
		url.searchParams.delete("options");
		return url.toString();
	}
	return DEFAULT_ADMIN_URL;
}

function databaseUrlFor(name: string): string {
	const url = new URL(adminUrl());
	url.pathname = `/${name}`;
	return url.toString();
}

function assertSafeName(name: string): void {
	if (!SAFE_NAME.test(name)) throw new Error(`nom de base de test invalide: ${name}`);
}

function pidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function withAdmin<T>(fn: (client: Client) => Promise<T>): Promise<T> {
	const client = new Client({ connectionString: adminUrl(), application_name: "radar-test-admin" });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end();
	}
}

/** Supprime les bases de tests orphelines (processus créateur disparu). */
async function dropStale(admin: Client): Promise<void> {
	const stale = await admin.query<{ datname: string }>(
		"SELECT datname FROM pg_database WHERE datname LIKE 'radar_test_%'"
	);
	for (const { datname } of stale.rows) {
		if (!SAFE_NAME.test(datname)) continue;
		const pid = Number(datname.split("_")[2]);
		if (Number.isInteger(pid) && pid > 0 && pidAlive(pid)) continue;
		await admin.query(`DROP DATABASE IF EXISTS ${datname}`);
	}
}

/** Jeu de données minimal explicite (aucune donnée de production). */
const SEED_SQL = `
INSERT INTO source (id, name, family, url, license, retain_raw)
VALUES ('ransomlook', 'RansomLook (jeu de test)', 'ransomware', 'https://example.invalid/ransomlook', NULL, false);

INSERT INTO org (name, slug, kind, city, domain, status)
VALUES ('Organisation Référence Tests', 'org-reference-tests', 'entreprise',
        'Bordeaux', 'org-reference.example', 'confirme');

INSERT INTO alert (rule_id, title, severity, status)
VALUES ('ransomware-revendication', 'Alerte de référence (jeu de test)', 3, 'open');
`;

async function schemaFiles(): Promise<string[]> {
	const migrations = (await readdir(DB_DIR)).filter((f) => /^migrate-.*\.sql$/.test(f)).sort();
	return ["init.sql", ...migrations, "detection-rules.sql"];
}

export async function createTestDatabase(): Promise<TestDb> {
	const name = `radar_test_${process.pid}_${Date.now().toString(36)}`;
	assertSafeName(name);

	await withAdmin(async (admin) => {
		await dropStale(admin);
		try {
			await admin.query(`CREATE DATABASE ${name}`);
		} catch (err) {
			// Deux exécutions simultanées : on retente avec un suffixe distinct.
			if (err instanceof Error && "code" in err && err.code === "42P04") {
				throw new Error(`base de test déjà existante: ${name}`);
			}
			throw err;
		}
	});

	const client = new Client({ connectionString: databaseUrlFor(name), application_name: "radar-test-setup" });
	await client.connect();
	try {
		for (const file of await schemaFiles()) {
			const sql = await readFile(join(DB_DIR, file), "utf8");
			await client.query(sql);
		}
		await client.query(SEED_SQL);
	} catch (err) {
		await client.end();
		await dropTestDatabase({ name, url: databaseUrlFor(name) });
		throw err;
	}
	await client.end();
	return { name, url: databaseUrlFor(name) };
}

export async function dropTestDatabase(db: TestDb): Promise<void> {
	assertSafeName(db.name);
	await withAdmin(async (admin) => {
		await admin.query(
			"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
			[db.name]
		);
		await admin.query(`DROP DATABASE IF EXISTS ${db.name}`);
	});
}
