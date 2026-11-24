/**
 * Régressions ingestion (T1/T2) : un fait déjà admis n'est plus compté comme
 * nouveau, les champs corrigés sont rafraîchis, les refus du contrat sont
 * consignés. Collecteurs locaux : aucun appel réseau.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { Collector, NormalizedEvent } from "@radar/shared";
import { closePools, query } from "../src/db.js";
import { runCollectors } from "../src/collecte/cycle.js";

after(async () => closePools());

const TAG = `ingest${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SOURCE = `test-${TAG}-source`;

/** Une preuve résolvable : le trigger 206 exige un run réellement enregistré. */
async function nouveauRun(): Promise<string> {
	await query(
		"INSERT INTO source (id, name, family, url) VALUES ($1,$2,'ransomware','https://exemple.test/flux') ON CONFLICT (id) DO NOTHING",
		[SOURCE, `Source ${TAG}`],
	);
	const run = await query<{ id: number }>(
		"INSERT INTO collector_run (source_id, started_at, finished_at, status, items_in, items_new, kind) VALUES ($1, now() - interval '1 day', now() - interval '1 day', 'ok', 0, 0, 'ingest') RETURNING id",
		[SOURCE],
	);
	return String(run.rows[0]?.id);
}

function evenement(dedupKey: string, title: string, severity: number, runId: string): NormalizedEvent {
	return {
		dedupKey,
		family: "ransomware",
		assertionType: "confirmed_incident",
		title,
		summary: "Incident confirmé dans un hôpital de Nouvelle-Aquitaine.",
		observedAt: "2026-01-15T10:00:00.000Z",
		severity,
		confidence: "B2",
		sourceId: SOURCE,
		sourceUrl: "https://exemple.test/incident",
		evidence: { run_id: runId },
		geoType: "unknown",
	};
}

function collecteur(id: string, events: NormalizedEvent[]): Collector {
	return {
		id,
		family: "ransomware",
		intervalSec: 60,
		run: async () => ({ events }),
	};
}

async function cycle(id: string, events: NormalizedEvent[]): Promise<void> {
	await runCollectors({
		collecteurs: [collecteur(id, events)],
		onlyId: id,
		force: true,
		etapesSupplementaires: false,
	});
}

test("doublons d'admission : seul le premier passage compte un fait nouveau", async () => {
	const runId = await nouveauRun();
	const cle = `${TAG}-dedup-1`;
	const titre = "Ransomware : attaque contre un hôpital en Nouvelle-Aquitaine";
	await cycle(SOURCE, [evenement(cle, titre, 3, runId)]);

	const apresPremier = await query<{ id: number; title: string }>(
		"SELECT id, title FROM event WHERE dedup_key=$1", [cle],
	);
	assert.equal(apresPremier.rows.length, 1);
	const admis = await query(
		"SELECT subject FROM journal WHERE kind='event.admitted' AND subject=$1", [cle],
	);
	assert.equal(admis.rows.length, 1, "un seul fait admis pour une seule insertion");

	const titreCorrige = "Ransomware : attaque confirmée contre un hôpital en Nouvelle-Aquitaine";
	await cycle(SOURCE, [evenement(cle, titreCorrige, 5, runId)]);

	const apresCorrection = await query<{ id: number; title: string; severity: number }>(
		"SELECT id, title, severity FROM event WHERE dedup_key=$1", [cle],
	);
	assert.equal(apresCorrection.rows.length, 1, "aucune insertion en doublon");
	assert.equal(apresCorrection.rows[0]?.id, apresPremier.rows[0]?.id);
	assert.equal(apresCorrection.rows[0]?.title, titreCorrige, "le titre corrigé est appliqué");
	assert.equal(apresCorrection.rows[0]?.severity, 5, "la sévérité corrigée est appliquée");
	const admisApres = await query(
		"SELECT subject FROM journal WHERE kind='event.admitted' AND subject=$1", [cle],
	);
	assert.equal(admisApres.rows.length, 1, "le second passage ne journalise pas un nouvel admis");
	const maj = await query<{ payload: { champs: string[] } }>(
		"SELECT payload FROM journal WHERE kind='event.updated' AND subject=$1", [cle],
	);
	assert.equal(maj.rows.length, 1, "la correction est tracée séparément");
	assert.ok(maj.rows[0]?.payload.champs.includes("title"));
	assert.ok(maj.rows[0]?.payload.champs.includes("severity"));
	const runs = await query<{ items_new: number }>(
		"SELECT items_new FROM collector_run WHERE source_id=$1 ORDER BY finished_at DESC LIMIT 2", [SOURCE],
	);
	assert.deepEqual(runs.rows.map((r) => r.items_new).sort(), [0, 1], "items_new mesure les insertions");

	await cycle(SOURCE, [evenement(cle, titreCorrige, 5, runId)]);
	const sansChangement = await query(
		"SELECT subject FROM journal WHERE subject=$1 AND kind IN ('event.admitted','event.updated')", [cle],
	);
	assert.equal(sansChangement.rows.length, 2, "un passage identique n'écrit aucun fait");
});

test("rafraîchissement : les décisions enrichies en aval ne sont pas écrasées", async () => {
	const runId = await nouveauRun();
	const cle = `${TAG}-dedup-2`;
	const titre = "Campagne phishing visant une commune de Nouvelle-Aquitaine";
	const original = evenement(cle, titre, 2, runId);
	original.family = "phishing";
	await cycle(SOURCE, [original]);
	const org = await query<{ id: number }>(
		"INSERT INTO org (name, slug, kind, city, sector) VALUES ($1,$2,'commune','Bordeaux','administration') RETURNING id",
		[`Org ${TAG}`, `org-${TAG}`],
	);
	const orgId = Number(org.rows[0]?.id);
	await query(
		"UPDATE event SET org_id=$1, evidence=$2::jsonb, tlp='AMBER' WHERE dedup_key=$3",
		[orgId, JSON.stringify({ run_id: runId, enrichi: true }), cle],
	);

	const corrige = evenement(cle, `${titre} — mise à jour`, 3, runId);
	corrige.family = "phishing";
	await cycle(SOURCE, [corrige]);
	const ligne = await query<{ org_id: number | null; evidence: { enrichi?: boolean }; tlp: string; title: string }>(
		"SELECT org_id, evidence, tlp, title FROM event WHERE dedup_key=$1", [cle],
	);
	assert.equal(ligne.rows[0]?.org_id, orgId, "le rattachement est préservé");
	assert.equal(ligne.rows[0]?.evidence.enrichi, true, "la preuve enrichie est préservée");
	assert.equal(ligne.rows[0]?.tlp, "AMBER", "le marquage TLP est préservé");
	assert.equal(ligne.rows[0]?.title, `${titre} — mise à jour`, "le champ source est bien rafraîchi");
});

test("rejet du contrat : le motif, la source et l'extrait restent auditables", async () => {
	await nouveauRun();
	const brut = {
		dedupKey: `${TAG}-dedup-rejete`,
		family: "famille-inexistante",
		assertionType: "confirmed_incident",
		title: "Ransomware : incident rejeté pour famille inconnue",
		sourceId: SOURCE,
	} as unknown as NormalizedEvent;
	await cycle(SOURCE, [brut]);

	const rejets = await query<{ subject: string; payload: { reason: string[]; sourceId: string; hint: string } }>(
		"SELECT subject, payload FROM journal WHERE kind='event.rejected' AND subject=$1",
		[`event:${TAG}-dedup-rejete`],
	);
	assert.equal(rejets.rows.length, 1, "le refus est consigné dans le journal");
	assert.deepEqual(rejets.rows[0]?.payload.reason, ["famille-inconnue"]);
	assert.equal(rejets.rows[0]?.payload.sourceId, SOURCE);
	assert.match(rejets.rows[0]?.payload.hint ?? "", /Ransomware/);
	const evenement = await query("SELECT id FROM event WHERE dedup_key=$1", [`${TAG}-dedup-rejete`]);
	assert.equal(evenement.rows.length, 0, "aucun événement n'est écrit pour un refus");
});
