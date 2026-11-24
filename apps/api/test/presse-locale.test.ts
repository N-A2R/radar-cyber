/**
 * Veille de presse locale — la famille est admise de bout en bout.
 *
 * Un titre de la vie locale n'a aucun terme cyber : la porte de pertinence le
 * rétrograderait en `presse` puis le refuserait. Pour une source
 * `presse_locale`, la provenance départementale est le signal : le fait entre
 * en `ambient_signal`, porte son département, et n'est jamais compté comme un
 * incident (`confirmed_incident`/`third_party_claim`).
 *
 * Le test est autonome : lancé seul contre une base de développement, il crée
 * sa propre base `radar_test_*` depuis `db/init.sql` + migrations, puis la
 * détruit. Lancé par `test/run.ts`, il réutilise la base jetable déjà en place.
 * Il ne dépend donc ni du schéma ni des données de l'instance courante.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { FAMILIES } from "@radar/shared";
import { createTestDatabase, dropTestDatabase, type TestDb } from "./helpers/testdb.js";
// Imports de types uniquement : effacés à la compilation, ils ne chargent pas
// `db.ts` avant que le test ait choisi sa base.
type DbModule = typeof import("../src/db.js");
type GenericModule = typeof import("../src/collectors/generic.js");
type ClassifyModule = typeof import("../src/collectors/classify.js");
type CorpusModule = typeof import("../src/routes/corpus-stats.js");

let db: DbModule;
let generic: GenericModule;
let classify: ClassifyModule;
let corpus: CorpusModule;
let baseJetable: TestDb | null = null;

before(async () => {
	const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
	const nom = new URL(url).pathname.replace(/^\//, "");
	if (!/^radar_test_/.test(nom)) {
		baseJetable = await createTestDatabase();
		process.env.DATABASE_URL = baseJetable.url;
	}
	// Import dynamique obligatoire : `db.ts` lit DATABASE_URL au chargement, il
	// faut donc créer la base jetable et changer l'environnement avant.
	db = await import("../src/db.js");
	generic = await import("../src/collectors/generic.js");
	classify = await import("../src/collectors/classify.js");
	corpus = await import("../src/routes/corpus-stats.js");
});

after(async () => {
	await db?.closePools().catch(() => {});
	if (baseJetable) await dropTestDatabase(baseJetable).catch(() => {});
});

test("le contrat partagé porte la famille presse_locale", () => {
	assert.ok((FAMILIES as readonly string[]).includes("presse_locale"));
});

test("un titre local sans terme cyber garde sa famille au classement", () => {
	const got = classify.classifyFamily({
		title: "Le marché de Noël ouvre ses portes ce samedi",
		summary: "Programme des festivités et stationnement.",
		sourceFamily: "presse_locale",
		sourceName: "Presse locale de test",
	});
	assert.equal(got, "presse_locale", "le titre ne doit pas être rétrogradé en presse");
});

test("le collecteur écrit presse_locale, son département, et une assertion non incidente", async () => {
	const sourceId = `test-presse-locale-${Date.now()}`;
	const titre = `Le marché de Noël ouvre ses portes ce samedi ${sourceId}`;
	let serveur: Server | null = null;
	try {
		const flux = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Presse locale de test</title><link>http://example.invalid/</link><description>Test</description>
<item><title>${titre}</title><link>http://example.invalid/article-${sourceId}</link>
<description>Programme des festivités et stationnement.</description>
<pubDate>${new Date("2026-11-20T08:00:00Z").toUTCString()}</pubDate></item></channel></rss>`;

		serveur = createServer((_req, res) => {
			res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
			res.end(flux);
		});
		const pret = Promise.withResolvers<void>();
		serveur.listen(0, "127.0.0.1", pret.resolve);
		await pret.promise;
		const adresse = serveur.address();
		assert.ok(adresse && typeof adresse !== "string", "le serveur de test doit écouter");

		await db.query(
			`INSERT INTO source (id, name, family, url, kind, format, relevance, department)
			 VALUES ($1,$2,'presse_locale',$3,'narrative','rss','context','16')`,
			[sourceId, `Presse locale de test ${sourceId}`, `http://127.0.0.1:${adresse.port}/flux.xml`],
		);

		await generic.runGenericSources(() => {}, { sourceIds: [sourceId], force: true });

		const { rows } = await db.query<{
			dedup_key: string;
			family: string;
			assertion_type: string;
			dept: string | null;
			regional: boolean;
			regional_motif: string | null;
			admission_rule: string | null;
			pertinence_rule: string | null;
			presse_locale: string | null;
			source_url: string | null;
			observed_at: Date;
		}>(
			`SELECT dedup_key, family, assertion_type, dept, regional, regional_motif,
			        admission_rule, pertinence_rule,
			        evidence->>'presseLocale' AS presse_locale,
			        source_url, observed_at
			   FROM event WHERE source_id=$1`,
			[sourceId],
		);
		assert.equal(rows.length, 1, "le titre local doit créer exactement un événement");
		const evenement = rows[0]!;
		assert.equal(evenement.family, "presse_locale", "le titre n'est pas rétrogradé en presse");
		assert.equal(evenement.dept, "16", "le département vient de la source, pas du texte");
		assert.equal(evenement.regional, true, "une veille locale est régionale par sa source");
		assert.equal(evenement.regional_motif, "departement");
		assert.equal(evenement.admission_rule, "dept");
		assert.equal(evenement.pertinence_rule, "dept");
		assert.equal(evenement.presse_locale, "true");
		assert.equal(evenement.source_url, `http://example.invalid/article-${sourceId}`);
		assert.equal(
			evenement.observed_at.toISOString(),
			"2026-11-20T08:00:00.000Z",
			"observed_at reste la date de publication",
		);

		// La définition même de l'incident dans `/api/corpus/stats` : une
		// assertion confirmée ou revendiquée. Un signal ambiant n'en est pas un.
		assert.equal(evenement.assertion_type, "ambient_signal");
		assert.ok(
			!(corpus.INCIDENT_ASSERTIONS as readonly string[]).includes(evenement.assertion_type),
			"presse_locale ne doit jamais entrer dans le compteur incidents",
		);

		await db.query("DELETE FROM journal WHERE subject=$1", [evenement.dedup_key]).catch(() => {});
	} finally {
		if (serveur) {
			const ferme = Promise.withResolvers<void>();
			serveur.close((err) => (err ? ferme.reject(err) : ferme.resolve()));
			await ferme.promise;
		}
		await db.query("DELETE FROM event WHERE source_id=$1", [sourceId]).catch(() => {});
		await db.query("DELETE FROM collector_run WHERE source_id=$1", [sourceId]).catch(() => {});
		await db.query("DELETE FROM source WHERE id=$1", [sourceId]).catch(() => {});
	}
});
