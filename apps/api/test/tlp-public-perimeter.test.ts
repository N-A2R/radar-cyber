/**
 * Périmètre public TLP:CLEAR — 20 indicateurs TLP:AMBER injectés.
 *
 * Le contrôle porte sur les sorties sans filtrage d'accès : recherche, écran
 * public, fiches départementales, flux géographiques, inspecteur, chaîne de
 * garde, flux d'alertes / livraison, et les deux exports (liste blanche
 * `export_public_event` et objets STIX). Aucune valeur AMBER ne doit
 * apparaître, et la jointure d'audit doit rester à zéro.
 *
 * Rejouer :
 *   pnpm -F @radar/api test -- test/tlp-public-perimeter.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { closePools, query } from "../src/db.js";
import { fetchPendingAlerts } from "../src/notify/alert-delivery.js";
import { selectNewAlerts } from "../src/notify/alert-feed.js";
import {
	buildStixObject,
	listPublicEvents,
	persistStixObjects,
	type StixEventRow,
} from "../src/export/stix.js";

const TAG = `tlp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const AMBER = Array.from({ length: 20 }, (_, i) => `${TAG}-amber-${String(i).padStart(2, "0")}.example`);
const CLEAR = `${TAG}-clear.example`;
const AUDIT_SQL = `SELECT count(*) FROM event e JOIN export_public_event x ON x.event_id=e.id WHERE coalesce(e.evidence->>'tlp','CLEAR')<>'CLEAR';`;

let app: FastifyInstance;
let sourceId: string;
let orgId: number;
const amberIds: number[] = [];
const amberEventIds: number[] = [];
let clearId: number;
let clearEventId: number;
let aliasEventId: number;
let alertId: number;

before(async () => {
	app = await buildApp();
	await app.ready();
	sourceId = String((await query<{ id: string }>("SELECT id FROM source ORDER BY id LIMIT 1")).rows[0]!.id);

	// Organisation de test dans un département de la région, positionnée à
	// Bordeaux : /na/events et /flows ont besoin d'une géographie réelle.
	const org = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, city, dept, lat, lon, status)
		 VALUES ($1, $2, 'entreprise', 'Bordeaux', '33', 44.8378, -0.5792, 'confirme') RETURNING id`,
		[`Organisation périmètre ${TAG}`, `${TAG}-org`],
	);
	orgId = Number(org.rows[0]!.id);

	for (const value of AMBER) {
		const ind = await query<{ id: number }>(
			`INSERT INTO indicator (type, value, tlp, source_id)
			 VALUES ('domain', $1, 'TLP:AMBER', $2) RETURNING id`,
			[value, sourceId],
		);
		const indicatorId = Number(ind.rows[0]!.id);
		amberIds.push(indicatorId);
		const ev = await query<{ id: number }>(
			`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, org_id,
			                    evidence, lat, lon, geo_type, observed_at, source_url)
			 VALUES ($1, 'ransomware', 'technical_indicator', $2, $3, $4, $5::jsonb || '{"run_id":"1"}'::jsonb,
			         48.8566, 2.3522, 'hosting_estimate', now(), 'https://example.invalid/event') RETURNING id`,
			[
				`${TAG}-event-${value}`,
				`Indicateur restreint ${value}`,
				sourceId,
				orgId,
				JSON.stringify({ tlp: "TLP:AMBER", indicator_ids: [indicatorId] }),
			],
		);
		amberEventIds.push(Number(ev.rows[0]!.id));
	}

	const clear = await query<{ id: number }>(
		`INSERT INTO indicator (type, value, tlp, source_id)
		 VALUES ('domain', $1, 'CLEAR', $2) RETURNING id`,
		[CLEAR, sourceId],
	);
	clearId = Number(clear.rows[0]!.id);
	const clearEvent = await query<{ id: number }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, org_id,
		                    evidence, lat, lon, geo_type, observed_at, source_url)
		 VALUES ($1, 'ransomware', 'technical_indicator', $2, $3, $4, $5::jsonb || '{"run_id":"1"}'::jsonb,
		         48.8566, 2.3522, 'hosting_estimate', now(), 'https://example.invalid/event')
		 RETURNING id`,
		[
			`${TAG}-event-clear`,
			`Indicateur public ${CLEAR}`,
			sourceId,
			orgId,
			JSON.stringify({ tlp: "CLEAR", indicator_ids: [clearId] }),
		],
	);
	clearEventId = Number(clearEvent.rows[0]!.id);

	// Alias historique : une déclaration TLP:CLEAR doit rester publique, et
	// être ramenée à CLEAR pour que le contrôle exact du critère reste à 0.
	const aliasEvent = await query<{ id: number }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, org_id,
		                    evidence, observed_at, source_url)
		 VALUES ($1, 'cti', 'confirmed_incident', $2, $3, $4, $5::jsonb || '{"run_id":"1"}'::jsonb, now(), 'https://example.invalid/event')
		 RETURNING id`,
		[`${TAG}-event-alias-clear`, `Fait public alias ${TAG}`, sourceId, orgId, JSON.stringify({ tlp: "TLP:CLEAR" })],
	);
	aliasEventId = Number(aliasEvent.rows[0]!.id);

	const alert = await query<{ id: number }>(
		`INSERT INTO alert (rule_id, title, severity, event_id, indicator_id, scope)
		 VALUES ($1, $2, 3, $3, $4, 'organization_incident') RETURNING id`,
		[`${TAG}-rule`, `Alerte restreinte ${TAG}`, amberEventIds[0], amberIds[0]],
	);
	alertId = Number(alert.rows[0]!.id);
});

after(async () => {
	if (app) await app.close();
	await query("DELETE FROM alert WHERE id=$1", [alertId]);
	await query("DELETE FROM event WHERE id=ANY($1::bigint[])", [[...amberEventIds, clearEventId, aliasEventId]]);
	await query("DELETE FROM indicator WHERE id=ANY($1::bigint[])", [[...amberIds, clearId]]);
	await query("DELETE FROM org WHERE id=$1", [orgId]);
	await closePools();
});

test("API publique : 0 apparition des 20 indicateurs TLP:AMBER", async () => {
	let appearances = 0;
	for (let i = 0; i < AMBER.length; i++) {
		const valeur = AMBER[i]!;
		const search = await app.inject({ method: "GET", url: `/api/v1/search?q=${encodeURIComponent(valeur)}` });
		assert.equal(search.statusCode, 200, search.body);
		const body = search.json<{ indicators: { value: string }[]; events: { title: string }[] }>();
		appearances += body.indicators.filter((x) => x.value === valeur).length;
		appearances += body.events.filter((x) => x.title.includes(valeur)).length;

		const detail = await app.inject({ method: "GET", url: `/api/v1/enrich/indicator/${amberIds[i]}` });
		assert.equal(detail.statusCode, 404, detail.body);
		const event = await app.inject({ method: "GET", url: `/api/v1/enrich/events/${amberEventIds[i]}` });
		assert.equal(event.statusCode, 404, event.body);
	}

	// Contrôle non vacue : la valeur CLEAR reste visible dans la même API.
	const clear = await app.inject({ method: "GET", url: `/api/v1/search?q=${encodeURIComponent(CLEAR)}` });
	assert.equal(clear.statusCode, 200, clear.body);
	const clair = clear.json<{ indicators: { value: string }[]; events: { title: string }[] }>();
	assert.ok(clair.indicators.some((x) => x.value === CLEAR), "l'indicateur CLEAR témoin doit rester visible");
	assert.ok(clair.events.some((x) => x.title.includes(CLEAR)), "l'événement CLEAR témoin doit rester visible");

	console.log(`API PUBLIQUE : ${appearances} apparition(s) / 20 indicateurs AMBER injectés (cible 0)`);
	assert.equal(appearances, 0);
});

test("écrans publics : today, département et flux ne portent aucune valeur AMBER", async () => {
	const urls = [
		"/api/v1/today",
		"/api/v1/na/events?dept=33",
		"/api/v1/flows?days=7",
	];
	for (const url of urls) {
		const res = await app.inject({ method: "GET", url });
		assert.equal(res.statusCode, 200, `${url}: ${res.body.slice(0, 300)}`);
		const fuites = AMBER.filter((valeur) => res.body.includes(valeur));
		console.log(`${url} : ${fuites.length} valeur(s) AMBER visible(s) sur 20 (cible 0)`);
		assert.deepEqual(fuites, [], `${url} laisse fuiter ${fuites.join(", ")}`);
	}

	// Les mêmes écrans rendent bien le témoin public : le filtre n'est pas vide.
	const today = await app.inject({ method: "GET", url: "/api/v1/today" });
	assert.ok(today.body.includes("Indicateur public"), "l'événement CLEAR témoin doit rester visible dans /today");
	const na = await app.inject({ method: "GET", url: "/api/v1/na/events?dept=33" });
	assert.ok(na.body.includes("Indicateur public"), "l'événement CLEAR témoin doit rester visible dans /na/events");
	const flows = await app.inject({ method: "GET", url: "/api/v1/flows?days=7" });
	assert.ok(flows.body.includes(`${TAG}-event-clear`), "l'arc CLEAR témoin doit rester visible dans /flows");

	// La chaîne de garde est publique : un sujet restreint ne doit pas répondre.
	const custody = await app.inject({
		method: "GET",
		url: `/api/v1/custody?subject=${encodeURIComponent(`${TAG}-event-${AMBER[0]}`)}`,
	});
	assert.equal(custody.statusCode, 404, custody.body);
});

test("flux et livraison : alerte restreinte absente des sorties", async () => {
	const feed = await selectNewAlerts(0, 1000);
	const pending = await fetchPendingAlerts(1000);
	const feedHits = feed.filter((a) => a.id === alertId).length;
	const pendingHits = pending.filter((a) => a.id === alertId).length;
	console.log(`FLUX/EXPORT : ${feedHits + pendingHits} apparition(s) de l'alerte AMBER (cible 0)`);
	assert.equal(feedHits + pendingHits, 0);
});

test("exports : 0 événement restreint dans export_public_event", async () => {
	let refused = 0;
	for (const eventId of amberEventIds) {
		await assert.rejects(
			() => query("INSERT INTO export_public_event (event_id) VALUES ($1)", [eventId]),
			/export public refus|check_violation/i,
			"une insertion directe d'un événement AMBER doit être refusée",
		);
		refused++;
	}
	const audit = await query<{ count: string }>(AUDIT_SQL);
	const count = Number(audit.rows[0]!.count);
	const publicRows = await listPublicEvents();
	const amberEnExport = publicRows.filter((row) => amberEventIds.includes(Number(row.id)));
	const clearEnExport = publicRows.some((row) => Number(row.id) === clearEventId);
	console.log(
		`SQL AUDIT : count(*) = ${count} (cible 0) ; insertions AMBER refusées : ${refused}/20 ; AMBER dans la liste blanche : ${amberEnExport.length} (cible 0)`,
	);
	assert.equal(refused, 20);
	assert.equal(count, 0);
	assert.equal(amberEnExport.length, 0);
	assert.ok(clearEnExport, "l'événement CLEAR témoin doit figurer dans la liste blanche");

	// L'alias TLP:CLEAR est canonisé en CLEAR : il entre dans la liste blanche
	// sans faire échouer la comparaison exacte du contrôle de sortie.
	const alias = await query<{ evidence: { tlp?: string }; exported: boolean }>(
		`SELECT e.evidence,
		        EXISTS (SELECT 1 FROM export_public_event x WHERE x.event_id=e.id) AS exported
		   FROM event e WHERE e.id=$1`,
		[aliasEventId],
	);
	console.log(
		`ALIAS TLP:CLEAR : evidence.tlp=${alias.rows[0]!.evidence.tlp}, exporté=${alias.rows[0]!.exported} (cible CLEAR/true)`,
	);
	assert.equal(alias.rows[0]!.evidence.tlp, "CLEAR");
	assert.equal(alias.rows[0]!.exported, true);

	// L'export STIX est une autre porte de sortie : aucun objet AMBER ne doit
	// pouvoir y entrer, même si l'appelant lui passe les lignes directement.
	const lignes = await query<StixEventRow>(
		"SELECT id, dedup_key, family, assertion_type, tlp, confidence, evidence, created_at FROM event WHERE id=ANY($1::bigint[])",
		[amberEventIds],
	);
	for (const ligne of lignes.rows) {
		assert.equal(buildStixObject(ligne), null, "un événement AMBER ne produit aucun objet STIX");
	}
	const stix = await persistStixObjects(lignes.rows);
	const stixEcrits = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM stix_object WHERE source_event_id = ANY($1::bigint[])",
		[amberEventIds],
	);
	console.log(`EXPORT STIX : ${stix.exported} exporté(s), ${stix.skipped} ignoré(s), ${stixEcrits.rows[0]!.n} ligne(s) en base (cible 0)`);
	assert.deepEqual(stix, { exported: 0, skipped: 20, rejected: 0 });
	assert.equal(stixEcrits.rows[0]!.n, "0");
});

test("révocation : un événement promu AMBER quitte la liste blanche", async () => {
	const avant = await query("SELECT 1 FROM export_public_event WHERE event_id=$1", [clearEventId]);
	assert.equal(avant.rows.length, 1, "l'événement CLEAR témoin doit être exporté");
	await query("UPDATE event SET evidence=$2::jsonb || '{\"run_id\":\"1\"}'::jsonb WHERE id=$1", [clearEventId, JSON.stringify({ tlp: "TLP:AMBER" })]);
	const colonne = await query<{ tlp: string }>("SELECT tlp FROM event WHERE id=$1", [clearEventId]);
	const apres = await query("SELECT 1 FROM export_public_event WHERE event_id=$1", [clearEventId]);
	const audit = await query<{ count: string }>(AUDIT_SQL);
	console.log(
		`REVOCATION : colonne=${colonne.rows[0]!.tlp}, ${apres.rows.length} ligne(s) restante(s), audit=${audit.rows[0]!.count} (cible 0/0)`,
	);
	assert.equal(colonne.rows[0]!.tlp, "AMBER", "la déclaration JSON doit durcir la colonne");
	assert.equal(apres.rows.length, 0);
	assert.equal(Number(audit.rows[0]!.count), 0);
});
