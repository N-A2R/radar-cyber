import { test, after } from "node:test";
import assert from "node:assert/strict";
import { query, closePools } from "../src/db.js";
import { runGenericSources } from "../src/collectors/generic.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

after(async () => { await closePools().catch(() => {}); });

test("un article daté d'hier inséré aujourd'hui a valid_at hier et at aujourd'hui", async () => {
	// Date de publication sans millisecondes : le flux RSS ne porte que la seconde.
	const hier = new Date(Date.now() - 24 * 60 * 60 * 1000);
	hier.setUTCMilliseconds(0);
	const sourceId = `test-event-bitemp-${Date.now()}`;
	const titre = `Rançongiciel : entreprise touchée en Nouvelle-Aquitaine ${sourceId}`;
	const flux = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Flux de test</title><link>http://example.invalid/</link><description>Test</description>
<item><title>${titre}</title><link>http://example.invalid/article-${sourceId}</link>
<description>Une attaque par rançongiciel a été détectée.</description>
<pubDate>${hier.toUTCString()}</pubDate></item></channel></rss>`;

	try {
		await query(
			`INSERT INTO source (id, name, family, url, kind, format, relevance)
			 VALUES ($1,$2,'ransomware','https://example.invalid/flux.xml','narrative','rss','strict')`,
			[sourceId, `Source test ${sourceId}`],
		);

		const avant = new Date();
		await runGenericSources(() => {}, { sourceIds: [sourceId], fetchTexte: async () => flux });
		const apres = new Date();

		const { rows } = await query<{
			dedup_key: string;
			observed_at: Date;
			valid_at: Date;
			at: Date;
		}>(
			"SELECT dedup_key, observed_at, valid_at, at FROM event WHERE source_id=$1",
			[sourceId],
		);
		assert.equal(rows.length, 1, "l'article du flux doit créer exactement un événement");
		const evenement = rows[0]!;
		assert.equal(evenement.observed_at.toISOString(), hier.toISOString(), "observed_at reste la date de l'article");
		assert.equal(evenement.valid_at.toISOString(), hier.toISOString(), "valid_at est la date de l'article");
		assert.ok(
			evenement.at >= avant && evenement.at <= apres,
			`at doit être l'instant de la collecte (${evenement.at.toISOString()} hors [${avant.toISOString()}, ${apres.toISOString()}])`,
		);
		await query("DELETE FROM journal WHERE subject=$1", [evenement.dedup_key]).catch(() => {});
	} finally {
		await supprimerEvenementsArchivees("source_id=$1", [sourceId]).catch(() => {});
		await query("DELETE FROM collector_run WHERE source_id=$1", [sourceId]).catch(() => {});
		await query("DELETE FROM source WHERE id=$1", [sourceId]).catch(() => {});
	}
});
