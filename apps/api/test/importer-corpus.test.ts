/**
 * Intégration de `scripts/importer-corpus.mts` : analyse, journal des rejets et
 * deux imports consécutifs sur la base de test dédiée (jamais la base de prod).
 * La sonde HTTP est injectée : aucun test ne dépend du réseau.
 */
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { Client } from "pg";
import {
	analyserCorpus,
	ecrireJournal,
	importer,
	parseArgs,
	type Sonde,
} from "../../../scripts/importer-corpus.mjs";

const ligne = (o: unknown): string => JSON.stringify(o);

const sonde: Sonde = async (url) => url.includes("morte.invalid")
	? { ok: false, statut: 404, octets: 0, detail: "HTTP 404" }
	: { ok: true, statut: 200, octets: 1024, detail: "HTTP 200 · contenu non vide" };

function corpusTemporaire(): { dir: string; journal: string } {
	const dir = mkdtempSync(join(tmpdir(), "importer-corpus-"));
	const sources = [
		{ nom: "Presse Test", url: "https://exemple.fr/", famille: "presse", departement: "Charente", preuve: { http_status: 200 } },
		{ id: "flux-test", name: "Flux national", url: "https://exemple.fr/feed.xml", family: "cert_fr", format: "rss" },
		{ nom: "Presse Test doublon", url: "https://exemple.fr/", famille: "presse" },
		{ nom: "Source morte", url: "https://morte.invalid/", famille: "presse" },
		{ nom: "Protocole interdit", url: "ftp://exemple.fr/", famille: "presse" },
		`{"nom":`,
	].map((v) => typeof v === "string" ? v : ligne(v)).join("\n");
	const incidents = [
		{
			id: "na-test-001",
			date_publication: "2026-03-12",
			date_incident: "2026-03-01",
			organisation: "Ville de Test",
			departement: "Charente",
			type: "ransomware",
			source: "Presse Test",
			titre: "Cyberattaque à Test",
			url: "https://exemple.fr/article-1",
			extrait: "Un extrait vérifiable de l'article.",
			resume: "Résumé de l'incident de test.",
			confiance: "etabli",
			verifie_le: "2026-11-21",
		},
		{
			organisation: "Hôpital de Test",
			groupe: "LockBit",
			date: "2026-04-02",
			departement: "Vienne",
			url: "https://exemple.fr/article-2",
		},
		{ organisation: "Date impossible", date_publication: "2026-13-99", url: "https://exemple.fr/article-3" },
	].map(ligne).join("\n");
	writeFileSync(join(dir, "sources-test.jsonl"), `${sources}\n`, "utf8");
	writeFileSync(join(dir, "incidents-test.jsonl"), `${incidents}\n`, "utf8");
	return { dir, journal: join(dir, "rejets.md") };
}

async function comptes(): Promise<{ sources: number; evenements: number }> {
	const client = new Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();
	try {
		const [sources, evenements] = await Promise.all([
			client.query<{ n: string }>("SELECT count(*)::text AS n FROM source"),
			client.query<{ n: string }>("SELECT count(*)::text AS n FROM event"),
		]);
		return { sources: Number(sources.rows[0]?.n), evenements: Number(evenements.rows[0]?.n) };
	} finally {
		await client.end();
	}
}

describe("importer-corpus", () => {
	it("ne touche pas à la base sans --appliquer", () => {
		assert.equal(parseArgs([]).apply, false);
		assert.equal(parseArgs(["--appliquer"]).apply, true);
		assert.equal(parseArgs(["--apply"]).apply, true);
		assert.equal(parseArgs(["--dir", "/tmp/x"]).dir, "/tmp/x");
	});

	it("valide, rejette avec motif et journalise lisiblement", async () => {
		const { dir, journal } = corpusTemporaire();
		try {
			const analyse = await analyserCorpus({ dir, probe: sonde });
			assert.deepEqual(analyse.fichiers, ["incidents-test.jsonl", "sources-test.jsonl"]);
			assert.equal(analyse.compteurs.total, 9);
			assert.equal(analyse.compteurs.sources, 5); // la ligne JSON invalide n'a pas de type
			assert.equal(analyse.compteurs.incidents, 3);
			assert.equal(analyse.compteurs.valides, 4);
			assert.equal(analyse.compteurs.rejetes, 5);
			assert.deepEqual(
				analyse.rejets.map((r) => r.motif),
				["champ_invalide", "doublon", "url_morte", "url_invalide", "json_invalide"],
			);
			assert.match(analyse.rejets.find((r) => r.motif === "doublon")?.detail ?? "", /sources-test\.jsonl:1/);

			await ecrireJournal(analyse, journal);
			const rapport = readFileSync(journal, "utf8");
			assert.match(rapport, /# Rejets — import du corpus/);
			// Chaque motif est explicite, avec son fichier, sa ligne et sa raison.
			for (const motif of ["champ_invalide", "doublon", "url_morte", "url_invalide", "json_invalide"]) {
				assert.match(rapport, new RegExp(`\\| \`${motif}\` \\|`));
			}
			assert.match(rapport, /incidents-test\.jsonl \| 3/);
			assert.match(rapport, /Lignes lues : 9/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("deux imports consécutifs laissent le même nombre de lignes", async () => {
		const { dir, journal } = corpusTemporaire();
		try {
			const analyse = await analyserCorpus({ dir, probe: sonde });
			const avant = await comptes();

			const premier = await importer(analyse);
			assert.equal(premier.sourcesInserees, 4); // 2 sources + 2 éditeurs d'incidents
			assert.equal(premier.incidentsInserees, 2);
			const apresPremier = await comptes();
			assert.equal(apresPremier.sources, avant.sources + 4);
			assert.equal(apresPremier.evenements, avant.evenements + 2);

			const second = await importer(analyse);
			assert.equal(second.sourcesInserees, 0);
			assert.equal(second.incidentsInserees, 0);
			const apresSecond = await comptes();
			assert.deepEqual(apresSecond, apresPremier);

			const client = new Client({ connectionString: process.env.DATABASE_URL });
			await client.connect();
			try {
				// Les migrations 053 et 132 introduisent des sources `corpus:landes-40-*` et `corpus:i64-*`, étrangères à cet import.
				const ids = await client.query<{ id: string }>("SELECT id FROM source WHERE id LIKE 'corpus:%' AND id NOT LIKE 'corpus:landes-40-%' AND id NOT LIKE 'corpus:i64-%' ORDER BY id");
				assert.deepEqual(ids.rows.map((r) => r.id), [
					"corpus:editeur:exemple-fr",
					"corpus:editeur:presse-test",
					"corpus:flux-test",
					"corpus:presse-test",
				]);
				const evenements = await client.query<{ dedup_key: string; confidence: string; source_id: string }>(
					"SELECT dedup_key, confidence, source_id FROM event WHERE dedup_key LIKE 'corpus:incident:%' ORDER BY dedup_key",
				);
				assert.deepEqual(evenements.rows.map((r) => r.dedup_key), [expectHash(), "corpus:incident:na-test-001"]);
				assert.deepEqual(evenements.rows.map((r) => r.confidence), ["B2", "A1"]);
				for (const row of evenements.rows) assert.match(row.source_id, /^corpus:editeur:/);
			} finally {
				await client.end();
			}

			await ecrireJournal(analyse, journal);
			assert.match(readFileSync(journal, "utf8"), /Rejetées : 5/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("la CLI n'écrit qu'avec --appliquer et reste idempotente", async () => {
		const dir = mkdtempSync(join(tmpdir(), "importer-corpus-cli-"));
		const journal = join(dir, "rejets.md");
		const tsx = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
		const script = fileURLToPath(new URL("../../../scripts/importer-corpus.mts", import.meta.url));
		writeFileSync(join(dir, "sources-cli.jsonl"), `${ligne({
			nom: "CLI Source",
			url: "https://cli.exemple.fr/",
			famille: "presse",
		})}\n`, "utf8");
		writeFileSync(join(dir, "incidents-cli.jsonl"), `${ligne({
			id: "na-cli-001",
			date_publication: "2026-05-01",
			organisation: "CLI Org",
			type: "ransomware",
			source: "CLI Source",
			titre: "Incident CLI",
			url: "https://cli.exemple.fr/article",
			confiance: "etabli",
		})}\n`, "utf8");
		const lancer = (...args: string[]): string => execFileSync(
			tsx,
			[script, "--dir", dir, "--journal", journal, "--no-probe", ...args],
			{ encoding: "utf8", env: { ...process.env } },
		);
		try {
			const avant = await comptes();
			assert.match(lancer(), /RAPPORT \(aucune écriture\)/);
			assert.deepEqual(await comptes(), avant);

			const sortie = lancer("--appliquer");
			assert.match(sortie, /APPLICATION/);
			assert.match(readFileSync(journal, "utf8"), /Aucun rejet/);
			const apres = await comptes();
			assert.equal(apres.sources, avant.sources + 2);
			assert.equal(apres.evenements, avant.evenements + 1);

			lancer("--appliquer");
			assert.deepEqual(await comptes(), apres);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

/** Clé stable de la ligne ransomware sans `id` : empreinte des champs déclarés. */
function expectHash(): string {
	return `corpus:incident:${createHash("sha256").update("Hôpital de Test|https://exemple.fr/article-2|2026-04-02", "utf8").digest("hex").slice(0, 16)}`;
}
