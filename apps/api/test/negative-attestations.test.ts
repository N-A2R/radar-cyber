/**
 * Registre des absences : sceau vérifiable et critère chiffré.
 *
 * Le test d'échelle crée 1 001 organisations, en attache une à un événement de
 * la fenêtre, puis vérifie que le générateur écrit exactement les 1 000 autres
 * — et que le critère public (signées, >= 3 sources, fenêtre non vide) les
 * compte. Tout est supprimé ensuite, y compris en cas d'échec.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { installAccessControl } from "../src/security/rbac.js";
import { closePools, query } from "../src/db.js";
import {
	canonicalAttestationPayload,
	sealNegativeAttestation,
	sourceScopeDigest,
	verifyNegativeAttestation,
	type NegativeAttestationDraft,
} from "../src/attestations/negative.js";
import { generateNegativeAttestations } from "../src/attestations/registry.js";

const TAG = `att${Date.now().toString(36)}`;
const SLUG_PREFIX = `${TAG}-org-`;
const WINDOW_START = "2020-01-01T00:00:00.000Z";
const WINDOW_END = "2020-02-01T00:00:00.000Z";
const KEY = "cle-de-test-attestations";
const ORGS = 1001;
const EVENT_SLUG = `${SLUG_PREFIX}1`;
const SOURCE_IDS = [`${TAG}-src-a`, `${TAG}-src-b`, `${TAG}-src-c`];

const DRAFT: NegativeAttestationDraft = {
	orgSlug: "commune-exemple",
	orgName: "Commune d'Exemple",
	entitySource: "referentiel-na",
	entityCode: "33063",
	windowStart: WINDOW_START,
	windowEnd: WINDOW_END,
	sourcesChecked: 12,
	sourceDigest: sourceScopeDigest(["b", "a"]),
	eventsFound: 0,
};

let app: FastifyInstance;

before(async () => {
	for (const id of SOURCE_IDS) {
		await query(
			`INSERT INTO source (id, name, family, url, enabled)
			 VALUES ($1, $2, 'cti', 'https://example.invalid/attestations', true)
			 ON CONFLICT (id) DO UPDATE SET enabled = true`,
			[id, `Source test attestations ${id}`],
		);
	}
	await query(
		`INSERT INTO org (name, slug, kind, status)
		 SELECT 'Organisation Attestation ' || n, $1 || n, 'entreprise', 'confirme'
		 FROM generate_series(1, $2) n
		 ON CONFLICT (slug) DO NOTHING`,
		[SLUG_PREFIX, ORGS],
	);
	await query(
		`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, observed_at)
		 VALUES ($1, 'ransomware', 'confirmed_incident', 'Incident de test attestation', $2, $3)
		 ON CONFLICT (dedup_key) DO NOTHING`,
		[`${TAG}-event`, SOURCE_IDS[0], "2020-01-15T12:00:00.000Z"],
	);
	await query(
		`UPDATE event SET org_id = (SELECT id FROM org WHERE slug = $1) WHERE dedup_key = $2`,
		[EVENT_SLUG, `${TAG}-event`],
	);
});

after(async () => {
	if (app) await app.close();
	await query("DELETE FROM negative_attestation WHERE window_start = $1 AND window_end = $2", [
		WINDOW_START,
		WINDOW_END,
	]);
	await query("DELETE FROM event WHERE dedup_key = $1", [`${TAG}-event`]);
	await query("DELETE FROM org WHERE slug LIKE $1", [`${SLUG_PREFIX}%`]);
	await query("DELETE FROM source WHERE id = ANY($1::text[])", [SOURCE_IDS]);
	await closePools();
});

test("le sceau HMAC se vérifie et détecte une altération", () => {
	const signed = sealNegativeAttestation(DRAFT, KEY);
	assert.equal(signed.signed, true);
	assert.equal(signed.signatureMethod, "hmac-sha256");
	assert.equal(verifyNegativeAttestation(signed, KEY), true);

	const altere = { ...signed, orgName: "Commune Détournée" };
	assert.equal(verifyNegativeAttestation(altere, KEY), false);
	assert.equal(verifyNegativeAttestation(signed, "mauvaise-cle"), false);
	assert.equal(verifyNegativeAttestation(signed, null), false);
});

test("sans clé, le sceau reste un digest d'intégrité rejouable", () => {
	const signed = sealNegativeAttestation(DRAFT, null);
	assert.equal(signed.signatureMethod, "sha256-content");
	assert.equal(verifyNegativeAttestation(signed, null), true);
	assert.equal(verifyNegativeAttestation({ ...signed, signature: "0".repeat(64) }, null), false);
});

test("l'empreinte des sources est indépendante de l'ordre et des doublons", () => {
	assert.equal(sourceScopeDigest(["b", "a", "b"]), sourceScopeDigest(["a", "b"]));
	assert.notEqual(sourceScopeDigest(["a", "b"]), sourceScopeDigest(["a", "c"]));
});

test("une absence sous trois sources ou avec événement est refusée", () => {
	assert.throws(() => sealNegativeAttestation({ ...DRAFT, sourcesChecked: 2 }, KEY), /plancher/);
	assert.throws(() => sealNegativeAttestation({ ...DRAFT, eventsFound: 1 }, KEY), /événement/);
	assert.throws(
		() => sealNegativeAttestation({ ...DRAFT, windowStart: WINDOW_END, windowEnd: WINDOW_START }, KEY),
		/fenêtre/,
	);
});

test("le contenu canonique porte tout ce qui est attesté, dans un ordre fixe", () => {
	const payload = JSON.parse(canonicalAttestationPayload(DRAFT)) as Record<string, unknown>;
	assert.deepEqual(Object.keys(payload), [
		"orgSlug",
		"orgName",
		"entitySource",
		"entityCode",
		"windowStart",
		"windowEnd",
		"sourcesChecked",
		"sourceDigest",
		"eventsFound",
		"method",
	]);
	assert.equal(payload.method, "event-store-window-v1");
});

test("1 000 organisations sans événement sont attestées, celle qui en a un est exclue", async () => {
	const report = await generateNegativeAttestations({
		windowStart: WINDOW_START,
		windowEnd: WINDOW_END,
		key: KEY,
	});
	assert.equal(report.signatureMethod, "hmac-sha256");
	assert.ok(report.sourcesChecked >= 3, `${report.sourcesChecked} sources actives`);
	assert.equal(report.written, report.absences);
	assert.ok(report.absences >= 1000, `${report.absences} absences attendues`);

	const exclue = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM negative_attestation WHERE org_slug = $1 AND window_start = $2",
		[EVENT_SLUG, WINDOW_START],
	);
	assert.equal(exclue.rows[0]?.n, "0", "une organisation avec événement ne peut pas être attestée");

	const critere = await query<{ n: string }>(
		`SELECT count(*)::text AS n FROM negative_attestation
		 WHERE sources_checked >= 3 AND signed = true AND window_end > window_start`,
	);
	assert.ok(Number(critere.rows[0]?.n) >= 1000, `critère : ${critere.rows[0]?.n}`);

	const echantillon = await query<{
		org_slug: string;
		org_name: string;
		entity_source: string | null;
		entity_code: string | null;
		window_start: string;
		window_end: string;
		sources_checked: number;
		source_digest: string;
		events_found: number;
		method: string;
		signature: string;
		signature_method: "hmac-sha256" | "sha256-content";
		payload_digest: string;
	}>(
		`SELECT org_slug, org_name, entity_source, entity_code, window_start, window_end,
		        sources_checked, source_digest, events_found, method, signature,
		        signature_method, payload_digest
		 FROM negative_attestation WHERE window_start = $1 ORDER BY id LIMIT 1`,
		[WINDOW_START],
	);
	const row = echantillon.rows[0]!;
	const sceau = sealNegativeAttestation(
		{
			orgSlug: row.org_slug,
			orgName: row.org_name,
			entitySource: row.entity_source,
			entityCode: row.entity_code,
			windowStart: new Date(row.window_start).toISOString(),
			windowEnd: new Date(row.window_end).toISOString(),
			sourcesChecked: Number(row.sources_checked),
			sourceDigest: row.source_digest,
			eventsFound: Number(row.events_found),
			method: row.method,
		},
		KEY,
	);
	assert.equal(sceau.signature, row.signature, "le sceau écrit se recalcule à l'identique");
});

test("le registre est lisible par l'API, avec vérification du sceau", async () => {
	app = await buildApp();
	installAccessControl(app);
	await app.ready();

	const res = await app.inject({ method: "GET", url: "/api/attestations-negatives?limit=5" });
	assert.equal(res.statusCode, 200, res.body);
	const body = res.json<{
		portee: string;
		totalSignees: number;
		count: number;
		attestations: Array<{ sourcesChecked: number; signatureValid: boolean | null; stillAbsent: boolean }>;
	}>();
	assert.match(body.portee, /magasin du radar/);
	assert.ok(body.totalSignees >= 1000);
	assert.equal(body.count, 5);
	for (const attestation of body.attestations) {
		assert.ok(attestation.sourcesChecked >= 3);
		// HMAC sans clé dans le processus de l'API : non vérifiable ici, jamais faux.
		assert.equal(attestation.signatureValid, null);
		// Aucun événement n'a été ajouté après la génération dans ce test.
		assert.equal(attestation.stillAbsent, true);
	}

	const bad = await app.inject({ method: "GET", url: "/api/attestations-negatives?limit=0" });
	assert.equal(bad.statusCode, 400);
	assert.equal(bad.json<{ error: { code: string } }>().error.code, "BAD_REQUEST");
});
