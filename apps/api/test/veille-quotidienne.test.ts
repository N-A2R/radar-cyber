/**
 * Veille quotidienne : un cycle complet sur une base de test jetable.
 *
 * Les collecteurs sont des faux locaux (aucun appel réseau) mais toutes les
 * autres étapes sont réelles : planification, admission, journal, détection,
 * confiance, campagnes, supervision et résumé écrit sur disque. Le test mesure
 * le cycle complet et vérifie les effets dans la base, pas un exit code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Collector, NormalizedEvent } from "@radar/shared";
import { closePools, query } from "../src/db.js";
import {
	executerVeilleQuotidienne,
	LIMITE_CYCLE_MS,
	type ResumeQuotidien,
} from "../src/veille/quotidienne.js";

const TAG = `veille${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const IDS = [`${TAG}-a`, `${TAG}-b`];
const RUN_IDS: number[] = [];

function evenement(id: string, numero: number, runId: number): NormalizedEvent {
	const groupe = "Dark Project";
	const lieu = numero === 1 ? "en Gironde" : "en Charente-Maritime";
	return {
		family: "ransomware",
		assertionType: "third_party_claim",
		dedupKey: `${TAG}-${numero}`,
		title: numero === 1
			? "Rançongiciel : une collectivité girondine paralysée"
			: "Vol de données : un hôpital charentais visé",
		summary: numero === 1
			? "Une attaque par rançongiciel vise une mairie de Gironde."
			: "Des documents médicaux ont été exfiltrés d'un hôpital de Charente-Maritime.",
		observedAt: new Date().toISOString(),
		sourceUrl: `https://${TAG}.fr/${numero}`,
		confidence: "A1",
		severity: 3,
		sourceId: id,
		evidence: { group: groupe, run_id: "1" },
		geoType: "unknown",
	};
}

function fauxCollecteur(id: string, numero: number, runId: number): Collector {
	return {
		id,
		family: "ransomware",
		intervalSec: 3600,
		run: async () => ({ events: [evenement(id, numero, runId)] }),
	};
}

test("cycle complet de veille : collecte, incidents, confiance, campagnes, résumé en moins de 10 minutes", async () => {
	const dossier = await mkdtemp(join(tmpdir(), "radar-veille-"));
	try {
		for (const id of IDS) {
			await query(
				`INSERT INTO source (id, name, family, url, interval_sec)
				 VALUES ($1, $2, 'ransomware', 'https://exemple.test/source', 3600)`,
				[id, `Source ${id}`],
			);
		}
		await query(
			`INSERT INTO org (name, slug, kind, city, domain, status)
			VALUES ($1, $2, 'entreprise', 'Bordeaux', $3, 'confirme')`,
			[`Organisation ${TAG}`, `${TAG}-org`, `${TAG}.fr`],
		);

		const debut = performance.now();
		const maintenant = new Date();
		const collecteurs = IDS.map((id, i) => fauxCollecteur(id, i + 1, 1));
		const resume: ResumeQuotidien = await executerVeilleQuotidienne({
			maintenant,
			collecteurs,
			log: console.log,
			etapesSupplementaires: false,
			rapportDir: dossier,
		});

		const dureeMur = Math.round(performance.now() - debut);

		assert.ok(resume.dureeMs > 0, "la durée du cycle est mesurée");
		assert.ok(dureeMur < LIMITE_CYCLE_MS, `cycle trop long : ${dureeMur} ms`);
		assert.equal(resume.cycle.statut, "ok");
		const collectes = await query<{ dedup_key: string }>(
			`SELECT dedup_key FROM event WHERE dedup_key LIKE $1`, [`${TAG}-%`],
		);
		assert.equal(collectes.rows.length, 2, "les deux sources dues ont été collectées (effet en base)");
		assert.equal(resume.collecte.reussis, 2, "les deux sources dues ont été collectées (compteur)");
		assert.equal(resume.collecte.echecs, 0);
		assert.ok(resume.evenements >= 2, `événements du jour : ${resume.evenements}`);
		assert.ok(resume.nouvellesOrganisations >= 1, "l'organisation créée pour le test est comptée");
		assert.ok(resume.campagnesActives >= 1, "les deux revendications forment une campagne active");
		assert.ok(resume.alertes.duJour >= 2, `alertes du jour : ${resume.alertes.duJour}`);
		assert.ok(resume.detection.alertes >= 2, "les deux incidents détectés créent une alerte chacun");
		assert.ok(resume.incidents.nouveaux >= 1, "un nouvel incident est calculé");
		assert.ok(resume.confiance.evenementsNotes >= 2, "les scores de confiance sont persistés");
		assert.ok(resume.campagnes.ecrites >= 1);
		assert.ok(resume.rapport, "le résumé du jour est écrit sur disque");

		const ecrit = JSON.parse(await readFile(resume.rapport as string, "utf8")) as ResumeQuotidien;
		assert.equal(ecrit.date, resume.date);
		assert.equal(ecrit.evenements, resume.evenements);
		assert.equal(ecrit.campagnesActives, resume.campagnesActives);

		const effets = await query<{ n_events: string; n_scores: string; n_runs: string; n_cycles: string; n_campagnes: string; n_alertes: string }>(
			`SELECT
			   (SELECT count(*) FROM event WHERE source_id = ANY($1::text[]))::text AS n_events,
			   (SELECT count(*) FROM event_confidence ec JOIN event e ON e.id = ec.event_id WHERE e.source_id = ANY($1::text[]))::text AS n_scores,
			   (SELECT count(*) FROM collector_run WHERE source_id = ANY($1::text[]))::text AS n_runs,
			   (SELECT count(*) FROM collecte_cycle)::text AS n_cycles,
			   (SELECT count(*) FROM campaign)::text AS n_campagnes,
			   (SELECT count(*) FROM alert WHERE created_at >= now() - interval '1 hour')::text AS n_alertes`,
			[IDS],
		);
		const ligne = effets.rows[0]!;
		assert.ok(Number(ligne.n_events ?? 0) >= 2, "les événements sont en base");
		assert.ok(Number(ligne.n_scores ?? 0) >= 2, "les scores sont en base");
		assert.ok(Number(ligne.n_runs ?? 0) >= 2, "les runs de collecte sont tracés");
		assert.ok(Number(ligne.n_cycles ?? 0) >= 1, "le cycle est enregistré dans la supervision");
		assert.ok(Number(ligne.n_campagnes ?? 0) >= 1, "la campagne est en base");
		assert.ok(Number(ligne.n_alertes ?? 0) >= 2, "les alertes de détection sont en base");
	} finally {
		await rm(dossier, { recursive: true, force: true });
		await closePools();
	}
});
