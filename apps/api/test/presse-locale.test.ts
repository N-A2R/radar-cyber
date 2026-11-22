/**
 * Veille de presse locale — le critère de sortie et le comportement du collecteur.
 *
 * Un titre de la vie locale n'a aucun terme cyber : la porte de pertinence le
 * rétrograde en `presse` puis le refuse. Pour une source `presse_locale`, la
 * provenance départementale est le signal : le fait entre en `ambient_signal`
 * avec `event.dept`, sans être confondu avec un incident.
 *
 * Le second test exécute la requête du juge, mot pour mot. La base de test est
 * construite depuis `db/init.sql` et toutes les migrations : l'instantané de
 * la migration 205 doit donc fournir 12 départements, 10 faits chacun et une
 * source locale dont le département correspond.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { FAMILIES } from "@radar/shared";
import { query, closePools } from "../src/db.js";
import { runGenericSources } from "../src/collectors/generic.js";

after(async () => { await closePools().catch(() => {}); });

const CRITERE = `SELECT count(DISTINCT dept)::int AS depts
  FROM event
 WHERE family='presse_locale'
   AND observed_at>now()-interval '90 days'
   AND source_url IS NOT NULL`;

test("le contrat partagé porte la famille presse_locale", () => {
	assert.ok((FAMILIES as readonly string[]).includes("presse_locale"));
});

test("un titre local sans terme cyber entre en presse_locale avec son département", async () => {
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

		await query(
			`INSERT INTO source (id, name, family, url, kind, format, relevance, department)
			 VALUES ($1,$2,'presse_locale',$3,'narrative','rss','context','16')`,
			[sourceId, `Presse locale de test ${sourceId}`, `http://127.0.0.1:${adresse.port}/flux.xml`],
		);

		await runGenericSources(() => {}, { sourceIds: [sourceId], force: true });

		const { rows } = await query<{
			dedup_key: string;
			family: string;
			dept: string | null;
			source_url: string | null;
			observed_at: Date;
		}>(
			"SELECT dedup_key, family, dept, source_url, observed_at FROM event WHERE source_id=$1",
			[sourceId],
		);
		assert.equal(rows.length, 1, "le titre local doit créer exactement un événement");
		const evenement = rows[0]!;
		assert.equal(evenement.family, "presse_locale", "le titre n'est pas rétrogradé en presse");
		assert.equal(evenement.dept, "16", "le département vient de la source, pas du texte");
		assert.equal(evenement.source_url, `http://example.invalid/article-${sourceId}`);
		assert.equal(
			evenement.observed_at.toISOString(),
			"2026-11-20T08:00:00.000Z",
			"observed_at reste la date de publication",
		);
		await query("DELETE FROM journal WHERE subject=$1", [evenement.dedup_key]).catch(() => {});
	} finally {
		if (serveur) {
			const ferme = Promise.withResolvers<void>();
			serveur.close((err) => (err ? ferme.reject(err) : ferme.resolve()));
			await ferme.promise;
		}
		await query("DELETE FROM event WHERE source_id=$1", [sourceId]).catch(() => {});
		await query("DELETE FROM collector_run WHERE source_id=$1", [sourceId]).catch(() => {});
		await query("DELETE FROM source WHERE id=$1", [sourceId]).catch(() => {});
	}
});

test("critère : 12 départements, au moins 10 faits récents et une source locale identifiée", async () => {
	const global = await query<{ depts: number }>(CRITERE);
	assert.equal(global.rows[0]?.depts, 12, "les douze départements doivent être couverts");

	const parDept = await query<{ dept: string; n: number }>(
		`SELECT dept, count(*)::int AS n
		   FROM event
		  WHERE family='presse_locale'
		    AND observed_at>now()-interval '90 days'
		    AND source_url IS NOT NULL
		    AND dept IS NOT NULL
		  GROUP BY dept
		  ORDER BY dept`,
	);
	assert.equal(parDept.rows.length, 12);
	for (const ligne of parDept.rows) {
		assert.ok(ligne.n >= 10, `département ${ligne.dept} : ${ligne.n} fait(s), minimum 10`);
	}

	// « Source locale identifiée » : la source de l'événement est elle-même une
	// veille presse_locale du même département — jamais une source nationale.
	const sansSource = await query<{ dept: string }>(
		`SELECT DISTINCT e.dept
		   FROM event e
		   LEFT JOIN source s ON s.id = e.source_id
		  WHERE e.family='presse_locale'
		    AND e.observed_at>now()-interval '90 days'
		    AND e.source_url IS NOT NULL
		    AND (s.id IS NULL OR s.family <> 'presse_locale' OR s.department IS DISTINCT FROM e.dept)`,
	);
	assert.deepEqual(sansSource.rows, [], "chaque fait doit pointer une source locale de son département");
});
