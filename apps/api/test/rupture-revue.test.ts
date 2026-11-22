/**
 * Chantier 10 — les agents de rupture sont branchés sur la revue.
 *
 * Trois chaînons verrouillés :
 *  1. `maintenant` atteint le SQL : rejouer une date passée regarde la semaine
 *     de cette date, pas celle de l'horloge (c'est le socle du rejeu historique
 *     qui mesure le taux de fausses alertes) ;
 *  2. le troisième détecteur (`changement-nature`) est câblé sur la base ;
 *  3. `capterAlertesRupture` persiste dans la revue sans dupliquer, et
 *     consigne un fait `alert.changed` par écriture.
 *
 * Isolation : enregistrements jetables préfixés, supprimés en fin de test.
 * Le journal est append-only : ses faits de test restent, ils portent
 * l'histoire du test (même choix que bitemporal.test.ts).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { query, closePools } from "../src/db.js";
import { ALERT_SCOPE_RUPTURE_REVUE } from "../src/alert-scope.js";
import { fetchPendingAlerts } from "../src/notify/alert-delivery.js";
import {
	detecterRupturesDepuisBase,
	capterAlertesRupture,
} from "../src/analyse/rupture.js";

const TAG = `rr${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
let seq = 0;
const next = () => `${TAG}-${++seq}`;

const created = {
	orgs: [] as number[],
	events: [] as number[],
	alertes: [] as number[],
};

after(async () => {
	if (created.alertes.length > 0) {
		await query("DELETE FROM alert WHERE id = ANY($1)", [created.alertes]);
	}
	if (created.events.length > 0) {
		await query("DELETE FROM event WHERE id = ANY($1)", [created.events]);
	}
	if (created.orgs.length > 0) {
		await query("DELETE FROM org WHERE id = ANY($1)", [created.orgs]);
	}
	await closePools().catch(() => {});
});

async function sourceId(): Promise<string> {
	const r = await query<{ id: string }>("SELECT id FROM source ORDER BY id LIMIT 1");
	return r.rows[0].id;
}

async function makeOrg(dept: string): Promise<number> {
	const slug = next();
	const r = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, city, dept, status)
		 VALUES ($1, $2, 'entreprise', 'Bordeaux', $3, 'confirme') RETURNING id`,
		[`Org ${slug}`, slug, dept],
	);
	const id = Number(r.rows[0].id);
	created.orgs.push(id);
	return id;
}

async function makeEvent(opts: {
	orgId: number;
	family: string;
	severity: number;
	observedAt: string;
	title?: string;
}): Promise<number> {
	const r = await query<{ id: number }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, severity, source_id, source_url, observed_at, collected_at, org_id, evidence)
		 VALUES ($1, $2, 'narrative', $3, $4, $5, 'https://exemple.test/sonde', $6::timestamptz, now(), $7, '{"run_id":"1"}'::jsonb)
		 RETURNING id`,
		[next(), opts.family, opts.title ?? `Fait de test ${next()}`, opts.severity, await sourceId(), opts.observedAt, opts.orgId],
	);
	const id = Number(r.rows[0].id);
	created.events.push(id);
	return id;
}

test("les fenêtres suivent `maintenant` : une rafale passée se rejoue, elle ne se voit plus aujourd'hui", async () => {
	const org = await makeOrg("33");
	const passe = Date.now() - 60 * 86_400_000;
	// Quatre faits de la même famille sur la même zone dans les 7 j précédant `passe`.
	const rafale = await Promise.all(
		[1, 2, 3, 4].map((i) =>
			makeEvent({
				orgId: org,
				family: "ransomware",
				severity: 2,
				observedAt: new Date(passe - i * 86_400_000).toISOString(),
			}),
		),
	);
	// Historique : deux fenêtres anciennes non vides, la médiane reste basse.
	await makeEvent({ orgId: org, family: "ransomware", severity: 1, observedAt: new Date(passe - 30 * 86_400_000).toISOString() });
	await makeEvent({ orgId: org, family: "ransomware", severity: 1, observedAt: new Date(passe - 50 * 86_400_000).toISOString() });

	const rejoue = await detecterRupturesDepuisBase(passe);
	const rafaleRejouee = rejoue.find(
		(a) => a.agent === "rafale" && a.faits.some((f) => rafale.includes(Number(f))),
	);
	assert.ok(rafaleRejouee, "la rafale datée de 60 j doit partir au rejeu de cette date");

	const aujourdhui = await detecterRupturesDepuisBase();
	const rafaleAujourdhui = aujourdhui.find(
		(a) => a.agent === "rafale" && a.faits.some((f) => rafale.includes(Number(f))),
	);
	assert.equal(rafaleAujourdhui, undefined, "la même rafale ne doit pas partir sur l'horloge courante");
});

test("le troisième détecteur est branché : changement de nature depuis la base", async () => {
	const org = await makeOrg("40");
	const hier = new Date(Date.now() - 86_400_000).toISOString();
	// Historique : du ransomware de gravité 2. Le dernier fait : une fuite,
	// famille jamais vue, gravité 5 — écart de 3 crans.
	await Promise.all(
		[10, 12, 14].map((j) =>
			makeEvent({
				orgId: org,
				family: "ransomware",
				severity: 2,
				observedAt: new Date(Date.now() - j * 86_400_000).toISOString(),
			}),
		),
	);
	const fuite = await makeEvent({ orgId: org, family: "leaks", severity: 5, observedAt: hier });

	const alertes = await detecterRupturesDepuisBase();
	const changement = alertes.find((a) => a.agent === "changement-nature" && a.orgId === org);
	assert.ok(changement, "le saut de famille et de gravité doit alerter");
	// Les ids bigint arrivent du pilote pg en chaînes : on normalise pour comparer.
	assert.deepEqual(changement.faits.map(Number), [fuite]);
});

test("capterAlertesRupture persiste dans la revue, sans dupliquer, avec journal", async () => {
	const org = await makeOrg("64");
	const hier = new Date(Date.now() - 2 * 86_400_000).toISOString();
	await Promise.all(
		[5, 7].map((j) =>
			makeEvent({
				orgId: org,
				family: "ransomware",
				severity: 1,
				observedAt: new Date(Date.now() - j * 86_400_000).toISOString(),
			}),
		),
	);
	await makeEvent({ orgId: org, family: "cti", severity: 4, observedAt: hier });

	const premier = await capterAlertesRupture();
	assert.ok(premier.emises >= 1, "au moins l'alerte semée doit être émise");
	assert.ok(premier.creees >= 1, "la première capture crée la ligne");
	assert.equal(premier.lacunes, 0, "aucune lacune de journal attendue");

	const lignes = await query<{ id: number; rule_id: string; org_id: number; evidence: Record<string, unknown> }>(
		`SELECT a.id, a.rule_id, a.org_id, a.evidence FROM alert a
		  WHERE a.scope = $1 AND a.org_id = ANY($2)`,
		[ALERT_SCOPE_RUPTURE_REVUE, created.orgs],
	);
	for (const l of lignes.rows) created.alertes.push(l.id);
	const laMienne = lignes.rows.find(
		(l) => l.rule_id === "rupture:changement-nature" && l.org_id === org,
	);
	assert.ok(laMienne, "la ligne de revue existe pour le détecteur sur notre organisation");

	assert.equal(String(laMienne.evidence.motif), "nouveau type d'incident plus grave (cti)");
	const diffusion = await fetchPendingAlerts(100_000);
	const diffusees = new Set(diffusion.map((a) => Number(a.id)));
	for (const l of lignes.rows) {
		assert.ok(!diffusees.has(Number(l.id)), `alerte de revue #${l.id} ne doit pas être diffusée`);
	}

	const deuxieme = await capterAlertesRupture();
	const apres = await query<{ n: string }>(
		`SELECT count(*)::text AS n FROM alert WHERE scope = $1 AND org_id = ANY($2)`,
		[ALERT_SCOPE_RUPTURE_REVUE, created.orgs],
	);
	assert.equal(Number(apres.rows[0]?.n ?? 0), lignes.rows.length, "le second passage ne duplique pas");
	assert.ok(deuxieme.journal >= 1, "le second passage consigne une mise à jour");

	const faits = await query<{ n: string }>(
		`SELECT count(*)::text AS n FROM journal
		  WHERE kind = 'alert.changed' AND subject LIKE 'alert:rupture:%'`,
	);
	assert.ok(Number(faits.rows[0]?.n ?? 0) >= 2, "création et mise à jour sont toutes deux consignées");
});
