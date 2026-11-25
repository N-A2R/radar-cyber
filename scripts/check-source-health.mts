/**
 * Verdict du contrôle nocturne des sources muettes / santé du radar.
 *
 *   check-source-health.mts fixture /tmp/source-health.json
 *   check-source-health.mts live /tmp/health-detail.json
 *
 * `fixture` vérifie le rapport de `scripts/source-health.mts --json` sur le jeu
 * déterministe `db/fixtures/source-health-ci.sql` : quatre catégories, la
 * dormance qui prime, et des totaux cohérents. `live` vérifie le contrat de
 * `GET /api/health/detail` de l'instance publiée (variable RADAR_PUBLIC_API_URL
 * du dépôt) et échoue si plus aucune source n'est active sur 7 jours.
 *
 * Lecture seule, aucune dépendance autre que Node.
 */
import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";

type Categorie = "muettes" | "faibles" | "saines" | "dormantes";
const CATEGORIES: Categorie[] = ["muettes", "faibles", "saines", "dormantes"];

interface SourceSante {
	id: string;
	category: Categorie;
	events_total: number;
	events_30d: number;
	last_collect: string | null;
}

interface RapportSante {
	windowDays: number;
	dormantDays: number;
	counts: Record<Categorie, number>;
	sources: SourceSante[];
}

const ATTENDU: Record<string, Categorie> = {
	"ci-health-muette": "muettes",
	"ci-health-faible": "faibles",
	"ci-health-saine": "saines",
	"ci-health-dormante": "dormantes",
};

function objet(valeur: unknown, nom: string): Record<string, unknown> {
	assert.ok(valeur !== null && typeof valeur === "object" && !Array.isArray(valeur), `${nom} doit être un objet`);
	return valeur as Record<string, unknown>;
}

function nombre(valeur: unknown, nom: string): number {
	assert.ok(typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0, `${nom} doit être un nombre positif`);
	return valeur;
}

function verifierFixture(doc: unknown): string[] {
	const rapport = objet(doc, "rapport") as unknown as RapportSante;
	assert.equal(rapport.windowDays, 30, "fenêtre de rendement attendue : 30 j");
	assert.equal(rapport.dormantDays, 7, "seuil de dormance attendu : 7 j");
	assert.ok(Array.isArray(rapport.sources), "sources doit être une liste");
	const totaux = objet(rapport.counts, "counts") as unknown as Record<Categorie, number>;
	assert.deepEqual(Object.keys(totaux).sort(), [...CATEGORIES].sort());

	const recomptes: Record<Categorie, number> = { muettes: 0, faibles: 0, saines: 0, dormantes: 0 };
	const vus = new Set<string>();
	for (const source of rapport.sources) {
		objet(source, "source");
		assert.ok(typeof source.id === "string" && source.id.length > 0, "id de source absent");
		assert.ok(!vus.has(source.id), `id de source dupliqué : ${source.id}`);
		vus.add(source.id);
		assert.ok(CATEGORIES.includes(source.category), `catégorie inconnue pour ${source.id}`);
		nombre(source.events_30d, `events_30d de ${source.id}`);
		nombre(source.events_total, `events_total de ${source.id}`);
		recomptes[source.category]++;
	}
	assert.deepEqual(totaux, recomptes, "les totaux du rapport ne correspondent pas aux sources");

	for (const [id, categorie] of Object.entries(ATTENDU)) {
		const source = rapport.sources.find((s) => s.id === id);
		assert.ok(source, `source de fixture absente du rapport : ${id}`);
		assert.equal(source.category, categorie, `mauvaise catégorie pour ${id}`);
	}

	const muette = rapport.sources.find((s) => s.id === "ci-health-muette")!;
	assert.equal(muette.events_30d, 0, "la muette ne doit avoir aucun événement sur 30 j");
	assert.ok(muette.events_total > 0, "les événements de la muette doivent être hors fenêtre");
	assert.ok(typeof muette.last_collect === "string", "la muette doit avoir une collecte récente");

	const dormante = rapport.sources.find((s) => s.id === "ci-health-dormante")!;
	nombre(dormante.events_total, "events_total de la dormante");
	assert.ok(dormante.events_total > 0, "la dormante doit porter des événements anciens");
	assert.equal(dormante.events_30d, 0, "la dormante est aussi silencieuse sur 30 j");
	assert.equal(dormante.category, "dormantes", "la dormance doit primer sur le silence");

	return [
		`classification source-health : ${rapport.sources.length} sources, ${recomptes.muettes} muettes, ${recomptes.faibles} faibles, ${recomptes.saines} saines, ${recomptes.dormantes} dormantes`,
		"fixture : muette / faible / saine / dormante classées comme prévu",
	];
}

function verifierLive(doc: unknown): string[] {
	const detail = objet(doc, "health/detail");
	assert.equal(detail.ok, true, "l'instance ne répond pas ok");
	assert.equal(detail.windowDays, 7, "fenêtre de santé attendue : 7 j");
	assert.ok(!Number.isNaN(Date.parse(String(detail.generatedAt))), "generatedAt invalide");

	const sources = objet(detail.sources, "sources");
	const declared = nombre(sources.declared, "sources.declared");
	const enabled = nombre(sources.enabled, "sources.enabled");
	const actives = nombre(sources.actives7j, "sources.actives7j");
	const muettes = nombre(sources.muettes7j, "sources.muettes7j");
	assert.ok(declared >= enabled, "declared < enabled");
	assert.ok(enabled >= actives, "enabled < actives7j");
	assert.equal(muettes, enabled - actives, "muettes7j doit compléter actives7j");
	assert.ok(actives > 0, "aucune source active sur 7 j : la collecte est arrêtée");

	const db = objet(detail.db, "db");
	nombre(db.events, "db.events");
	nombre(db.latencyMs, "db.latencyMs");
	nombre(detail.events24h, "events24h");

	return [
		`santé live : ${declared} sources déclarées, ${enabled} activées, ${actives} actives sur 7 j, ${muettes} muettes`,
		`événements 24 h : ${detail.events24h}`,
	];
}

const [mode, fichier] = process.argv.slice(2);
if ((mode !== "fixture" && mode !== "live") || !fichier) {
	console.error("usage : check-source-health.mts <fixture|live> <fichier.json>");
	process.exit(2);
}

const doc: unknown = JSON.parse(readFileSync(fichier, "utf8"));
const lignes = mode === "fixture" ? verifierFixture(doc) : verifierLive(doc);
lignes.push(`contrôle ${mode} : OK`);
const resume = `${lignes.join("\n")}\n`;
process.stdout.write(resume);
if (process.env.GITHUB_STEP_SUMMARY) {
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Contrôle ${mode}\n\n${resume}\n`, "utf8");
}
