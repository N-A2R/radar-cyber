/**
 * Régressions du chantier promotion / revue (T3, M1–M5, M7–M9).
 *
 * Aucun appel réseau : le verdict du modèle et l'évaluation d'alertes sont
 * injectés, et les faits sont lus en base ou dans le journal. Isolation par
 * préfixe `TAG` ; les événements, faits et organisations de test sont retirés
 * dans `after`.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import {
	analyserOrgMatch,
	evaluerAlertesPromotion,
	matchOrgInIndex,
	promoteMatches,
	reglesPrecisionActives,
	toIndexEntry,
	type EvalueurAlertes,
} from "../src/quarantine/promote.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";
import { AmbiguousHintError, createOrgFromHint } from "../src/quarantine/from-hint.js";
import { applyReview } from "../src/quarantine/review.js";
import { resetReviewIndexes, reviewSnapshot } from "../src/quarantine/review-index.js";
import { statistiquesIndexSigles } from "../src/match/sigles.js";

const TAG = `rp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE = `${TAG}-source`;
let seq = 0;
function uid(prefix: string): string {
	seq += 1;
	return `${prefix}-${TAG}-${seq}`;
}

const createdOrgs: number[] = [];
const createdFacts: number[] = [];

const createdEvents: number[] = [];
const createdRuns: number[] = [];
 const previousPrecision = process.env.PRECISION_RULES;

after(async () => {
	if (previousPrecision === undefined) delete process.env.PRECISION_RULES;
	else process.env.PRECISION_RULES = previousPrecision;
	if (createdEvents.length) {
		await supprimerEvenementsArchivees("id = ANY($1::bigint[])", [createdEvents]);
	}
	if (createdFacts.length) await query("DELETE FROM quarantine_raw WHERE id = ANY($1::bigint[])", [createdFacts]);
	if (createdOrgs.length) await query("DELETE FROM org WHERE id = ANY($1::int[])", [createdOrgs]);
	if (createdRuns.length) await query("DELETE FROM collector_run WHERE id = ANY($1::bigint[])", [createdRuns]);
	await query("DELETE FROM source WHERE id=$1", [SOURCE]);
	await closePools();
});

async function insertSource(): Promise<void> {
	await query(
		`INSERT INTO source (id, name, family, url) VALUES ($1, $2, 'ransomware', 'https://example.invalid')
		 ON CONFLICT (id) DO NOTHING`,
		[SOURCE, `Source ${TAG}`],
	);
}

async function insertOrg(name: string, opts: { domain?: string | null; slug?: string } = {}): Promise<number> {
	const r = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, domain) VALUES ($1, $2, 'entreprise', $3) RETURNING id`,
		[name, opts.slug ?? uid("slug"), opts.domain ?? null],
	);
	const id = Number(r.rows[0]!.id);
	createdOrgs.push(id);
	return id;
}

async function insertFact(hint: string): Promise<{ id: number; hash: string }> {
	const hash = uid("hash");
	const r = await query<{ id: number }>(
		`INSERT INTO quarantine_raw
		   (source, source_url, groupe, org_hint, claimed_at, extracted, raw_body, content_hash, status)
		 VALUES ($1, $2, 'Groupe Regression', $3, now(), '{}'::jsonb, 'revendication deterministe', $4, 'pending')
		 RETURNING id`,
		[SOURCE, `https://example.invalid/${hash}`, hint, hash],
	);
	const id = Number(r.rows[0]!.id);
	createdFacts.push(id);

	return { id, hash };
}

type Marqueur = { statut: string | null; tentatives: number | null; alertes: number | null; eventId: number | null };
async function marqueur(id: number): Promise<Marqueur | null> {
	const r = await query<Marqueur>(
		`SELECT extracted->'_alertes'->>'statut' AS statut,
		        (extracted->'_alertes'->>'tentatives')::int AS tentatives,
		        (extracted->'_alertes'->>'alertes')::int AS alertes,
		        (extracted->'_alertes'->>'eventId')::bigint AS "eventId"
		   FROM quarantine_raw WHERE id=$1`,
		[id],
	);
	return r.rows[0] ?? null;
}

function compteur(): { vus: Map<number, number>; evaluateur: EvalueurAlertes } {
	const vus = new Map<number, number>();
	return {
		vus,
		evaluateur: async (eventId: number, opts: { force: boolean }) => {
			assert.equal(opts.force, true, "une promotion est un acte humain explicite");
			vus.set(eventId, (vus.get(eventId) ?? 0) + 1);
			return 2;
		},
	};
}

test("M1 — un score fondé sur le nom reste étiqueté name malgré un domaine partiel", () => {
	const domaine = `${TAG}.example`;
	const nom = `sous.${domaine} societe test`;
	const entree = toIndexEntry({
		id: 501,
		name: nom,
		slug: uid("slug"),
		kind: "entreprise",
		city: null,
		// Aucun domaine connu au référentiel : l'indice contient bien une
		// chaîne de forme DNS, mais elle ne doit pas devenir une clé de
		// correspondance. `domainNorm` reste donc vide, lui aussi.
		domain: null,
		website: null,
	});
	const m = matchOrgInIndex(nom, [entree]);
	assert.ok(m);
	assert.equal(m.confidence, 0.9, "l'égalité de nom donne 0,9");
	assert.equal(m.via, "name", "le domaine partiel (0,85) ne doit pas voler le libellé du meilleur score");
});

test("M2 — deux orgs à score égal rendent tied et aucun rattachement", () => {
	const nom = `Homonymes ${TAG}`;
	const index = [1, 2].map((id) => toIndexEntry({
		id,
		name: nom,
		slug: `${uid("slug")}-${id}`,
		kind: "entreprise",
		city: null,
		domain: null,
		website: null,
	}));
	const analyse = analyserOrgMatch(nom, index);
	assert.equal(analyse.match, null, "pas de départage par identifiant");
	assert.deepEqual(analyse.tied, [1, 2]);
	assert.equal(matchOrgInIndex(nom, index), null);
});

test("M3 — les règles de précision sont actives par défaut, off reste un opt-out", () => {
	const initial = process.env.PRECISION_RULES;
	try {
		delete process.env.PRECISION_RULES;
		assert.equal(reglesPrecisionActives(), true);
		process.env.PRECISION_RULES = "off";
		assert.equal(reglesPrecisionActives(), false);
		process.env.PRECISION_RULES = "0";
		assert.equal(reglesPrecisionActives(), false);
	} finally {
		if (initial === undefined) delete process.env.PRECISION_RULES;
		else process.env.PRECISION_RULES = initial;
	}
});

test("T3 — un événement dédupliqué est évalué une seule fois, puis rejouable sans second appel", async () => {
	await insertSource();
	process.env.PRECISION_RULES = "off";
	await insertOrg(`Organisation Dedup ${TAG}`);
	const fait = await insertFact(`Organisation Dedup ${TAG}`);
	const run = await query<{ id: number }>(
		`INSERT INTO collector_run (source_id, started_at, finished_at, status, kind, items_in, items_new)
		 VALUES ($1, now(), now(), 'ok', 'analyst', 1, 0) RETURNING id`,
		[SOURCE],
	);
	const runId = Number(run.rows[0]!.id);
	createdRuns.push(runId);
	const preexistant = await query<{ id: number }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, severity, confidence, source_id, source_url, evidence, geo_type)
		 VALUES ($1, 'ransomware', 'third_party_claim', 'événement déjà publié', 4, 'C3', $2, $3, $4::jsonb, 'unknown')
		 RETURNING id`,
		[
			`quarantine:${fait.hash}`,
			SOURCE,
			`https://example.invalid/${fait.hash}`,
			JSON.stringify({ run_id: String(runId), preexistant: true }),
		],
	);
	createdEvents.push(Number(preexistant.rows[0]!.id));

	const { vus, evaluateur } = compteur();
	const resultat = await promoteMatches(false, {
		ids: [fait.id],
		confirmer: async () => "oui",
		evaluer: evaluateur,
	});
	assert.equal(resultat.promoted, 1);
	assert.equal(resultat.eventsCreated, 0, "l'événement existait déjà : aucun nouvel événement");
	assert.equal(resultat.alertsCreated, 2, "un conflit d'insertion est quand même évalué");
	const events = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM event WHERE dedup_key=$1", [`quarantine:${fait.hash}`],
	);
	assert.equal(events.rows[0]?.n, 1, "aucun événement dupliqué");
	assert.equal((await marqueur(fait.id))?.statut, "evalue");

	const rejeu = await evaluerAlertesPromotion(fait.id, evaluateur);
	assert.equal(rejeu.alerts, 2);
	assert.equal(rejeu.pending, false);
	assert.equal(vus.get(Number(preexistant.rows[0]!.id)), 1, "evaluateEvent n'est appelé qu'une fois par événement promu");
});

test("T3 — retry borné et trace en journal quand l'évaluation d'alertes échoue", async () => {
	await insertSource();
	process.env.PRECISION_RULES = "off";
	await insertOrg(`Organisation Retry ${TAG}`);
	const fait = await insertFact(`Organisation Retry ${TAG}`);
	const appels: number[] = [];
	const evaluateur: EvalueurAlertes = async (eventId) => {
		appels.push(eventId);
		throw new Error("panne deterministe evaluation");
	};
	const premier = await promoteMatches(false, {
		ids: [fait.id],
		confirmer: async () => "oui",
		evaluer: evaluateur,
	});
	assert.equal(premier.promoted, 1, "la promotion reste committée malgré la panne d'évaluation");
	const evenements = await query<{ id: number }>(
		"SELECT id FROM event WHERE dedup_key=$1", [`quarantine:${fait.hash}`],
	);
	createdEvents.push(Number(evenements.rows[0]!.id));
	assert.equal(premier.alertsCreated, 0);
	assert.equal((await marqueur(fait.id))?.statut, "en_attente");
	await evaluerAlertesPromotion(fait.id, evaluateur);
	const dernier = await evaluerAlertesPromotion(fait.id, evaluateur);
	assert.equal(dernier.pending, true);
	assert.equal((await marqueur(fait.id))?.statut, "abandonne");
	assert.equal(appels.length, 3, "au plus trois tentatives");
	const traces = await query<{ reason: string }>(
		`SELECT payload->>'reason' AS reason FROM journal
		  WHERE kind='detection.decision' AND subject=$1 ORDER BY reason`,
		[`quarantine:${fait.hash}`],
	);
	assert.deepEqual(traces.rows.map((row) => row.reason), ["evaluation-en-echec", "tentatives-epuisees"]);
});

test("M4 — une panne du modèle diffère la promotion, un refus la bloque, une hésitation ne promet rien", async () => {
	await insertSource();
	process.env.PRECISION_RULES = "off";
	const cas: Array<{ verdict: "indisponible" | "non" | "indecis"; promu: boolean }> = [
		{ verdict: "indisponible", promu: false },
		{ verdict: "non", promu: false },
		{ verdict: "indecis", promu: true },
	];
	for (const { verdict, promu } of cas) {
		const nom = `Organisation Verdict ${verdict} ${TAG}`;
		const orgId = await insertOrg(nom);
		const fait = await insertFact(nom);
		const { evaluateur } = compteur();
		const resultat = await promoteMatches(false, {
			ids: [fait.id],
			confirmer: async () => verdict,
			evaluer: evaluateur,
		});
		assert.equal(resultat.promoted, promu ? 1 : 0, `verdict ${verdict}`);
		const evenements = await query<{ id: number }>(
			"SELECT id FROM event WHERE dedup_key=$1", [`quarantine:${fait.hash}`],
		);
		if (!promu) {
			assert.equal(evenements.rows.length, 0, `verdict ${verdict} : aucun événement`);
			assert.equal((await marqueur(fait.id))?.statut, null);
		} else {
			assert.equal(evenements.rows.length, 1);
			createdEvents.push(Number(evenements.rows[0]!.id));
		}
		if (verdict === "indisponible") {
			const traces = await query<{ reason: string }>(
				`SELECT payload->>'reason' AS reason FROM journal
				  WHERE kind='detection.decision' AND subject=$1 AND payload->>'stage'='confirmation-organisation'`,
				[`quarantine:${fait.hash}`],
			);
			assert.equal(traces.rows[0]?.reason, "modele-indisponible", "la panne est tracée");
			assert.ok(orgId > 0);
		}
	}
});

test("M7 — review.decided porte le même sujet de hash que l'événement public", async () => {
	const fait = await insertFact(`Sans rattachement ${TAG}`);
	const outcome = await applyReview([fait.id], "reject", "hors périmètre", "analyste@example.invalid");
	assert.equal(outcome.changed, 1);
	const trace = await query<{ subject: string; quarantineId: number }>(
		`SELECT subject, payload->>'quarantineId' AS "quarantineId" FROM journal
		  WHERE kind='review.decided' AND subject=$1`,
		[`quarantine:${fait.hash}`],
	);
	assert.equal(trace.rows.length, 1);
	assert.equal(Number(trace.rows[0]?.quarantineId), fait.id);
});

test("M8 — doublon de nom ou de domaine : ambiguïté explicite, aucune création", async () => {
	const nom = `Homonymes Creation ${TAG}`;
	const a = await insertOrg(nom, { slug: `${uid("slug")}-a` });
	const b = await insertOrg(nom, { slug: `${uid("slug")}-b` });
	await assert.rejects(
		createOrgFromHint({ nom, domaine: null, source: "test", preuve: "doublon de nom" }),
		(error: unknown) =>
			error instanceof AmbiguousHintError &&
			error.critere === "nom" &&
			error.orgIds.includes(a) && error.orgIds.includes(b),
	);

	const domaine = `partage-${TAG}.example`;
	const c = await insertOrg(`Premier ${TAG}`, { domain: domaine });
	const d = await insertOrg(`Second ${TAG}`, { domain: domaine });
	await assert.rejects(
		createOrgFromHint({ nom: uid("nom"), domaine, source: "test", preuve: "domaine partagé" }),
		(error: unknown) =>
			error instanceof AmbiguousHintError &&
			error.critere === "domaine" &&
			error.orgIds.includes(c) && error.orgIds.includes(d),
	);
	const total = await query<{ n: number }>("SELECT count(*)::int AS n FROM org WHERE id = ANY($1::int[])", [[a, b, c, d]]);
	assert.equal(total.rows[0]?.n, 4, "aucune organisation supplémentaire créée");
});

test("M5 — un reset pendant une construction remplace le snapshot périmé", async () => {
	const precedent = process.env.RADAR_REVIEW_INDEX_CACHE;
	process.env.RADAR_REVIEW_INDEX_CACHE = "on";
	try {
		const hint = `Index Revue ${TAG}`;
		const avant = await reviewSnapshot([hint]);
		assert.ok(avant.covered.has(hint));
		const orgId = await insertOrg(hint);
		resetReviewIndexes();
		const apres = await reviewSnapshot([hint]);
		assert.ok(
			apres.orgIndex.some((entree) => entree.id === orgId),
			"le snapshot publié doit contenir l'écriture faite après le début du chargement",
		);
	} finally {
		if (precedent === undefined) delete process.env.RADAR_REVIEW_INDEX_CACHE;
		else process.env.RADAR_REVIEW_INDEX_CACHE = precedent;
	}
});

test("M9 — resetReviewIndexes invalide aussi l'index des sigles", async () => {
	const avant = await statistiquesIndexSigles();
	const orgId = await insertOrg(`Sigles ${TAG}`);
	const sigle = `ZX${Date.now().toString(36).slice(-4).toUpperCase()}`;
	await query(
		`INSERT INTO org_alias (org_id, alias, source, status) VALUES ($1, $2, 'sirene-sigle', 'active')`,
		[orgId, sigle],
	);
	resetReviewIndexes();
	const apres = await statistiquesIndexSigles();
	assert.equal(apres.alias, avant.alias + 1, "le nouveau sigle est visible sans redémarrage");
});
