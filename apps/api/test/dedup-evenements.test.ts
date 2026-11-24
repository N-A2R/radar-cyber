/**
 * Anti-doublon des événements de flux (migration 045).
 *
 * Un même article peut revenir avec une casse, des accents ou des espaces
 * différents : l'identité retenue est titre normalisé + jour UTC + source.
 * Ce test pilote le vrai collecteur deux fois contre un flux local, avec deux
 * variantes du même titre : c'est l'empreinte calculée côté TypeScript et
 * l'index unique côté SQL qui doivent tomber d'accord, pas une règle recopiée
 * dans le test.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { query, closePools } from "../src/db.js";
import { runGenericSources } from "../src/collectors/generic.js";
import { fetchResilient } from "../src/collectors/http.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

after(async () => { await closePools().catch(() => {}); });

type FluxLocal = { url: string; fermer: () => Promise<void>; setFlux: (xml: string) => void };

/** Serveur local explicite : le client HTTP refuse les hotes prives par defaut. */
const fluxLocal = (url: string): Promise<string> =>
  fetchResilient(url, { allowPrivate: true }).then((res) => res.text);

async function serveurFlux(sourceId: string, fluxInitial: string): Promise<FluxLocal> {
	let flux = fluxInitial;
	const serveur: Server = createServer((_req, res) => {
		res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
		res.end(flux);
	});
	const pret = Promise.withResolvers<void>();
	serveur.listen(0, "127.0.0.1", pret.resolve);
	await pret.promise;
	const adresse = serveur.address();
	assert.ok(adresse && typeof adresse !== "string", "le serveur de test doit écouter");
	const url = `http://127.0.0.1:${adresse.port}/flux.xml`;

	await query(
		`INSERT INTO source (id, name, family, url, kind, format, relevance)
		 VALUES ($1,$2,'ransomware',$3,'narrative','rss','strict')`,
		[sourceId, `Source test ${sourceId}`, url],
	);
	return {
		url,
		setFlux: (xml: string) => { flux = xml; },
		fermer: async () => {
			const ferme = Promise.withResolvers<void>();
			serveur.close((err) => (err ? ferme.reject(err) : ferme.resolve()));
			await ferme.promise;
			await supprimerEvenementsArchivees("source_id=$1", [sourceId]).catch(() => {});
			await query("DELETE FROM collector_run WHERE source_id=$1", [sourceId]).catch(() => {});
			await query("DELETE FROM journal WHERE subject LIKE $1", [`feed:%${sourceId}%`]).catch(() => {});
			await query("DELETE FROM source WHERE id=$1", [sourceId]).catch(() => {});
		},
	};
}

function fluxRss(titre: string, sourceId: string, date: Date): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Flux de test</title><link>http://example.invalid/</link><description>Test</description>
<item><title>${titre}</title><link>http://example.invalid/article-${sourceId}</link>
<description>Une attaque par rançongiciel a été détectée.</description>
<pubDate>${date.toUTCString()}</pubDate></item></channel></rss>`;
}

test("deux insertions du même article, même jour, même source : une seule ligne", async () => {
	const sourceId = `test-dedup-event-${Date.now()}`;
	const date = new Date("2026-11-21T12:34:56Z");
	let serveur: FluxLocal | null = null;
	try {
		serveur = await serveurFlux(
			sourceId,
			fluxRss(`Rançongiciel : entreprise touchée en Nouvelle-Aquitaine ${sourceId}`, sourceId, date),
		);
		await runGenericSources(() => {}, { sourceIds: [sourceId], force: true, fetchTexte: fluxLocal });
		const premier = await query<{ id: number; fingerprint: string }>(
			"SELECT id, fingerprint FROM event WHERE source_id=$1", [sourceId],
		);
		assert.equal(premier.rows.length, 1, "la première collecte crée un événement");
		assert.ok(premier.rows[0]!.fingerprint, "l'événement de flux porte une empreinte");

		// Casse, accents conservés, ponctuation et espaces différents : titre
		// identique après normalisation, donc même empreinte.
		serveur.setFlux(fluxRss(`RANÇONGICIEL:  ENTREPRISE  TOUCHÉE EN  NOUVELLE-AQUITAINE ${sourceId}`, sourceId, date));
		await runGenericSources(() => {}, { sourceIds: [sourceId], force: true, fetchTexte: fluxLocal });
		const apres = await query<{ id: number; fingerprint: string }>(
			"SELECT id, fingerprint FROM event WHERE source_id=$1 ORDER BY id", [sourceId],
		);
		assert.equal(apres.rows.length, 1, "le rejeu du même article ne crée pas de doublon");
		assert.equal(apres.rows[0]!.id, premier.rows[0]!.id, "la ligne d'origine est conservée");
		assert.equal(apres.rows[0]!.fingerprint, premier.rows[0]!.fingerprint);
	} finally {
		if (serveur) await serveur.fermer();
	}
});

test("le même titre un autre jour reste un autre événement", async () => {
	const sourceId = `test-dedup-jour-${Date.now()}`;
	const titre = `Rançongiciel : collectivité touchée en Nouvelle-Aquitaine ${sourceId}`;
	let serveur: FluxLocal | null = null;
	try {
		serveur = await serveurFlux(sourceId, fluxRss(titre, sourceId, new Date("2026-11-20T08:00:00Z")));
		await runGenericSources(() => {}, { sourceIds: [sourceId], force: true, fetchTexte: fluxLocal });
		serveur.setFlux(fluxRss(titre, sourceId, new Date("2026-11-21T08:00:00Z")));
		await runGenericSources(() => {}, { sourceIds: [sourceId], force: true, fetchTexte: fluxLocal });
		const lignes = await query<{ fingerprint: string }>(
			"SELECT fingerprint FROM event WHERE source_id=$1 ORDER BY id", [sourceId],
		);
		assert.equal(lignes.rows.length, 2, "le jour fait partie de l'identité de l'article");
		assert.notEqual(lignes.rows[0]!.fingerprint, lignes.rows[1]!.fingerprint);
	} finally {
		if (serveur) await serveur.fermer();
	}
});
