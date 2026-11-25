/**
 * Régression cisa_kev : la date `dateAdded` du catalogue est un timestamptz,
 * jamais la sévérité smallint. Le chemin d'écriture testé est celui du
 * serveur (collecteur dédié), avec sa chaîne de preuve (migration 206).
 * Aucun appel réseau : le flux KEV est injecté.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { CollectContext } from "@radar/shared";
import { collector as kev } from "../src/collectors/kev.collector.js";
import { admitEvent } from "../src/contract/admit.js";
import { languageVerdict } from "../src/collectors/filter.js";
import { scoreEventPertinence } from "../src/collectors/pertinence.js";
import { porteeRegionale } from "../src/match/territorial.js";
import { ingererEvenementCollecteur } from "../src/collecte/ingestion-collecteur.js";
import { closePools, query } from "../src/db.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

after(async () => closePools().catch(() => {}));

const TAG = `kev${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const CVE = `CVE-2099-${Date.now().toString().slice(-6)}`;
const CLE = `kev:${CVE}`;
const DATE_AJOUT = "2026-11-25T00:00:00.000Z";

test("cisa_kev : dateAdded est observ_at, la sévérité reste numérique à l'insertion", async () => {
	const ctx: CollectContext = {
		fetchJson: async () => ({
			vulnerabilities: [{
				cveID: CVE,
				vulnerabilityName: "Defect in Example Product",
				dateAdded: DATE_AJOUT,
				shortDescription: "Actively exploited defect in Example Product",
				knownRansomwareCampaignUse: "Known",
				vendorProject: "Example",
				product: "Example Product",
			}],
		} as never),
		fetchText: async () => { throw new Error("réseau interdit dans ce test"); },
		cursor: {},
		log: () => {},
		now: () => new Date("2026-11-25T12:00:00.000Z"),
	};
	const résultat = await kev.run(ctx);
	assert.equal(résultat.events.length, 1);
	const brut = résultat.events[0]!;
	assert.equal(brut.observedAt, DATE_AJOUT);
	assert.equal(brut.severity, 5);
	assert.equal(résultat.cursor?.lastDate, DATE_AJOUT, "le curseur garde la date ISO du flux");

	const admission = admitEvent(brut as unknown as Record<string, unknown>);
	assert.equal(admission.ok, true, admission.ok ? "" : admission.rejections.join(", "));
	const event = admission.event;

	const run = await query<{ id: number }>(
		"INSERT INTO collector_run (source_id, kind) VALUES ('cisa_kev', 'live') RETURNING id",
	);
	const runId = Number(run.rows[0]?.id);
	assert.ok(Number.isInteger(runId) && runId > 0, "run de preuve créé");
	const langue = languageVerdict(event.title, event.summary);
	assert.equal(langue.keep, true);
	const pertinence = scoreEventPertinence({
		title: event.title, summary: event.summary, sourceUrl: event.sourceUrl,
	});
	const portee = porteeRegionale(`${event.title} ${event.summary ?? ""}`, null);

	const ecrit = await ingererEvenementCollecteur(event, {
		runId,
		langue: langue.language,
		regional: portee.regional,
		regionalMotif: portee.motif,
		pertinenceScore: pertinence.score,
		pertinenceRule: pertinence.rule,
		sourceUrlParDefaut: `urn:source:cisa_kev`,
	});
	assert.equal(ecrit, 1, "l'événement KEV est inséré, pas refusé par un cast smallint");

	try {
		const { rows } = await query<{
			observed_at: string; valid_at: string; severity: number; confidence: string;
			langue: string; source_url: string; regional_motif: string; run_id: string;
		}>(
			`SELECT observed_at, valid_at, severity, confidence, langue, source_url, regional_motif,
			        evidence->>'run_id' AS run_id
			   FROM event WHERE dedup_key = $1`, [CLE],
		);
		assert.equal(rows.length, 1);
		const ligne = rows[0]!;
		assert.equal(new Date(ligne.observed_at).toISOString(), DATE_AJOUT);
		assert.ok(Date.parse(ligne.valid_at) >= Date.parse(DATE_AJOUT), "valid_at reste un horodatage");
		assert.equal(ligne.severity, 5, "la sévérité n'a pas reçu la date ISO");
		assert.equal(ligne.confidence, "A1");
		assert.equal(ligne.langue, langue.language);
		assert.equal(ligne.regional_motif, portee.motif);
		assert.equal(ligne.run_id, String(runId), "la chaîne de preuve cite le run");
		assert.match(ligne.source_url, /nvd\.nist\.gov/);
	} finally {
		await supprimerEvenementsArchivees("dedup_key = $1", [CLE]);
		await query("DELETE FROM collector_run WHERE id = $1", [runId]);
	}
});
