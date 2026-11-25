/**
 * Non-régression NVD : la réponse d'une page doit rester sous la limite HTTP
 * de 2 Mo partagée par tous les collecteurs. Le fetch injecté reproduit cette
 * limite : si la taille de page revenait à 2000 CVE, le test échouerait avant
 * même de parler réseau.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { CollectContext } from "@radar/shared";
import { collector } from "../src/collectors/nvd.collector.js";
import { closePools } from "../src/db.js";

after(async () => {
	await closePools().catch(() => {});
});

const BODY_CAP = 2 * 1024 * 1024;

test("nvd_cve pagine par blocs assez petits pour le plafond de 2 Mo", async () => {
	const maintenant = new Date("2026-11-25T12:00:00.000Z");
	const fenetreDebut = new Date(maintenant.getTime() - 30 * 60_000).toISOString();
	const envAvant = {
		backfill: process.env.NVD_BACKFILL,
		debut: process.env.NVD_BACKFILL_START,
	};
	process.env.NVD_BACKFILL_START = fenetreDebut;
	delete process.env.NVD_BACKFILL;

	const total = 2100;
	const description = "x".repeat(1200);
	const cves = Array.from({ length: total }, (_, i) => ({
		id: `CVE-2026-${String(i).padStart(6, "0")}`,
		published: "2026-11-25T11:45:00.000Z",
		descriptions: [{ lang: "en", value: description }],
	}));
	const appels: { startIndex: number; resultsPerPage: number; bytes: number }[] = [];

	const ctx: CollectContext = {
		fetchJson: async <T = unknown>(url: string): Promise<T> => {
			const u = new URL(url);
			const startIndex = Number(u.searchParams.get("startIndex"));
			const resultsPerPage = Number(u.searchParams.get("resultsPerPage"));
			const page = {
				totalResults: total,
				vulnerabilities: cves
					.slice(startIndex, startIndex + resultsPerPage)
					.map((cve) => ({ cve })),
			};
			const body = JSON.stringify(page);
			const bytes = Buffer.byteLength(body, "utf8");
			appels.push({ startIndex, resultsPerPage, bytes });
			// Miroir de `readBoundedBody` : aucune page ne doit dépasser le plafond.
			if (bytes > BODY_CAP) throw new Error(`corps trop volumineux (> ${BODY_CAP} octets)`);
			return JSON.parse(body) as T;
		},
		fetchText: async () => {
			throw new Error("réseau interdit dans ce test");
		},
		cursor: {},
		log: () => {},
		now: () => maintenant,
	};

	// La pause de 6 s entre deux pages NVD est neutralisée uniquement ici.
	const vraiSetTimeout = globalThis.setTimeout;
	globalThis.setTimeout = ((callback: () => void, delay?: number) =>
		vraiSetTimeout(callback, delay === 6000 ? 0 : delay)) as unknown as typeof setTimeout;

	try {
		const resultat = await collector.run(ctx);
		assert.deepEqual(
			appels.map((a) => a.startIndex),
			[0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800],
			"la fenêtre est parcourue par pages de 200, jusqu'au plafond NVD de 2000",
		);
		assert.ok(appels.every((a) => a.resultsPerPage === 200));
		assert.ok(appels.every((a) => a.bytes <= BODY_CAP));
		assert.equal(resultat.events.length, 2000, "les 2000 résultats accessibles sont émis");
	} finally {
		globalThis.setTimeout = vraiSetTimeout;
		if (envAvant.backfill === undefined) delete process.env.NVD_BACKFILL;
		else process.env.NVD_BACKFILL = envAvant.backfill;
		if (envAvant.debut === undefined) delete process.env.NVD_BACKFILL_START;
		else process.env.NVD_BACKFILL_START = envAvant.debut;
	}
});
