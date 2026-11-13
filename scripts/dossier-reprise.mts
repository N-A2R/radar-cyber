#!/usr/bin/env tsx
/**
 * Dossier de reprise — génère le document qu'un successeur lit le premier jour.
 *
 * Chaque chiffre vient d'une requête ; ce qui n'est pas mesuré est écrit
 * « non mesuré ». Le markdown est archivé dans bench/results/ et peut
 * servir de rapport hebdo transmettable.
 *
 *   tsx scripts/dossier-reprise.mts                      # stdout + bench/results/dossier-YYYY-MM-DD.md
 *   tsx scripts/dossier-reprise.mts --json               # + JSON structuré
 *   tsx scripts/dossier-reprise.mts --check               # vérifie que le dossier est cohérent (pour CI)
 *   tsx scripts/dossier-reprise.mts --out docs/dossier-reprise.md  # écrit à un endroit précis
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

import { construireDossier, dossierEnMarkdown, type EtatSysteme } from "../apps/api/src/analyse/dossier-reprise.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const WANT_JSON = argv.includes("--json");
const OUT_IDX = argv.findIndex((a) => a === "--out");
const OUT_PATH = OUT_IDX >= 0 ? argv[OUT_IDX + 1] : null;

async function collectEtat(client: InstanceType<typeof Client>): Promise<EtatSysteme> {
	// pg Client ne supporte pas les queries concurrentes — séquentiel obligatoire.
	async function count(table: string, where = ""): Promise<number> {
		try {
			const r = await client.query(`SELECT count(*)::int AS n FROM ${table} ${where}`);
			return r.rows[0]?.n ?? 0;
		} catch {
			return 0;
		}
	}
	async function single<T>(sql: string, fallback: T): Promise<T> {
		try {
			const r = await client.query(sql);
			return r.rows[0] ?? fallback;
		} catch {
			return fallback;
		}
	}

	const organisations = await count("org");
	const domainesConnus = await count("org", "WHERE domain IS NOT NULL");
	const sources = await count("source");
	const sourcesActives = await count("source", "WHERE enabled IS NOT DISTINCT FROM true");
	const evenements = await count("event");
	const evenements30j = await count("event", "WHERE created_at >= now() - interval '30 days'");
	const indicateurs = await count("indicator");
	const alertes = await count("alert");
	const journalEvenements = await count("journal");
	const archives = await count("event_archive");
	const regles = await count("detection_rule");

	const sourcesMuettes = await (async () => {
		try {
			const r = await client.query(`
				SELECT count(*)::int AS n FROM source s
				WHERE NOT EXISTS (
					SELECT 1 FROM event e WHERE e.source_id = s.id AND e.created_at >= now() - interval '24 hours'
				)
				AND s.enabled IS NOT DISTINCT FROM true
			`);
			return r.rows[0]?.n ?? 0;
		} catch {
			return 0;
		}
	})();

	const mig = await single<{ n: number; derniere: string | null }>(
		`SELECT (SELECT count(*)::int FROM schema_migrations) AS n,
		        (SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1) AS derniere`,
		{ n: 0, derniere: null },
	);

	return {
		organisations,
		sources,
		sourcesActives,
		sourcesMuettes,
		evenements,
		evenements30j,
		indicateurs,
		alertes,
		journalEvenements,
		archives,
		regles,
		migrations: mig.n,
		derniereMigration: mig.derniere,
		domainesConnus,
	};
}

async function main() {
	const client = new Client({ connectionString: DATABASE_URL });
	try {
		await client.connect();
	} catch (e) {
		console.error(`PostgreSQL injoignable: ${DATABASE_URL.replace(/:[^:@]*@/, ":***@")}`);
		console.error(String((e as Error).message).slice(0, 300));
		process.exitCode = 1;
		return;
	}

	try {
		const etat = await collectEtat(client);
		const maintenant = new Date().toISOString();
		const dossier = construireDossier(etat, maintenant);
		const md = dossierEnMarkdown(dossier);

		if (CHECK) {
			// Vérifie la cohérence sans écrire : les 5 sections sont présentes et non vides
			const cles = dossier.sections.map((s) => s.cle);
			const attendues = ["etat", "verite", "regles", "gestes", "pieges"];
			const manquantes = attendues.filter((c) => !cles.includes(c));
			if (manquantes.length) {
				console.error(`Dossier incomplet : sections manquantes ${manquantes.join(", ")}`);
				process.exitCode = 1;
			}
			const vides = dossier.sections.filter((s) => s.points.length === 0).map((s) => s.cle);
			if (vides.length) {
				console.error(`Sections vides : ${vides.join(", ")}`);
				process.exitCode = 1;
			}
			console.log(`✓ dossier cohérent (${dossier.sections.length} sections, ${etat.organisations} orgs, ${etat.sources} sources)`);
			return;
		}

		// Écriture
		const outPath =
			OUT_PATH ??
			`bench/results/dossier-${maintenant.slice(0, 10)}.md`;
		mkdirSync(outPath.replace(/\/[^/]+$/, ""), { recursive: true });
		writeFileSync(outPath, md, "utf8");
		console.log(md);
		console.error(`→ ${outPath}`);

		if (WANT_JSON) {
			const jsonPath = outPath.replace(/\.md$/, ".json");
			writeFileSync(jsonPath, JSON.stringify({ etat, dossier }, null, 2), "utf8");
			console.error(`→ ${jsonPath}`);
		}
	} finally {
		await client.end();
	}
}

main();
