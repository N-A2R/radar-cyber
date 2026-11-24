/**
 * Les trois agents CPU vus du côté base et de la file de revue.
 *
 * Ce que les tests purs ne peuvent pas vérifier : que `maintenant` atteint le
 * SQL, que les fenêtres se lisent dans les bonnes tables, qu'une bascule
 * sectorielle et une source muette (sans organisation) se dédupliquent tout de
 * même, que le statut d'une alerte traitée n'est jamais rouvert, et que rien
 * ne part vers la diffusion.
 *
 * Isolation : enregistrements jetables préfixés, supprimés en fin de fichier.
 * Le journal est append-only : les faits de test restent, ils portent l'histoire.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { query, closePools } from "../src/db.js";
import { ALERT_SCOPE_AGENTS_CPU } from "../src/alert-scope.js";
import { fetchPendingAlerts } from "../src/notify/alert-delivery.js";
import {
	capterAgentsCpu,
	detecterAgentsCpuDepuisBase,
	severiteDeScore,
} from "../src/analyse/agents-cpu.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const JOUR_MS = 86_400_000;
const TAG = `cpu${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
let seq = 0;
const next = () => `${TAG}-${++seq}`;

const created = {
	orgs: [] as number[],
	events: [] as number[],
	sources: [] as string[],
	alertes: [] as number[],
};

after(async () => {
	if (created.alertes.length > 0) {
		await query("DELETE FROM alert WHERE id = ANY($1)", [created.alertes]);
	}
	if (created.events.length > 0) {
		await supprimerEvenementsArchivees("id = ANY($1::bigint[])", [created.events]);
	}
	if (created.orgs.length > 0) {
		await query("DELETE FROM org WHERE id = ANY($1)", [created.orgs]);
	}
	if (created.sources.length > 0) {
		await query("DELETE FROM source WHERE id = ANY($1)", [created.sources]);
	}
	await closePools().catch(() => {});
});

async function makeOrg(opts: { secteur?: string; kind?: string } = {}): Promise<number> {
	const slug = next();
	const r = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, sector, city, dept, status)
		 VALUES ($1, $2, $3, $4, 'Bordeaux', '33', 'confirme') RETURNING id`,
		[`Org ${slug}`, slug, opts.kind ?? "entreprise", opts.secteur ?? null],
	);
	const id = Number(r.rows[0].id);
	created.orgs.push(id);
	return id;
}

async function makeSource(enabled: boolean): Promise<string> {
	const id = `${TAG}-source-${++seq}`;
	await query(
		`INSERT INTO source (id, name, family, url, enabled)
		 VALUES ($1, $2, 'ransomware', 'https://exemple.test/source', $3)`,
		[id, `Source test ${id}`, enabled],
	);
	created.sources.push(id);
	return id;
}

async function makeEvent(opts: {
	sourceId: string;
	orgId?: number;
	joursAvant: number;
	maintenant: number;
	family?: string;
}): Promise<number> {
	const r = await query<{ id: number }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, severity, source_id,
		                    observed_at, collected_at, org_id, source_url, evidence)
		 VALUES ($1, $2, 'narrative', $3, 2, $4, $5::timestamptz, now(), $6, 'https://example.invalid/event', '{"run_id":"1"}'::jsonb)
		 RETURNING id`,
		[
			next(),
			opts.family ?? "ransomware",
			`Fait de test ${next()}`,
			opts.sourceId,
			new Date(opts.maintenant - opts.joursAvant * JOUR_MS).toISOString(),
			opts.orgId ?? null,
		],
	);
	const id = Number(r.rows[0].id);
	created.events.push(id);
	return id;
}

test("l'organisation surgissante se lit en base avec son histoire et deux sources", async () => {
	const maintenant = Date.now();
	const sourceA = await makeSource(true);
	const sourceB = await makeSource(true);
	const org = await makeOrg();
	const control = await makeOrg();
	const faits = [
		await makeEvent({ sourceId: sourceA, orgId: org, joursAvant: 1, maintenant }),
		await makeEvent({ sourceId: sourceB, orgId: org, joursAvant: 3, maintenant }),
		await makeEvent({ sourceId: sourceA, orgId: org, joursAvant: 6, maintenant }),
	];
	// Un fait ancien prouve que l'organisation était déjà suivie avant le silence.
	await makeEvent({ sourceId: sourceB, orgId: org, joursAvant: 120, maintenant });
	await Promise.all([2, 5].map((j) => makeEvent({ sourceId: sourceA, orgId: control, joursAvant: j, maintenant })));

	const alertes = await detecterAgentsCpuDepuisBase(maintenant);
	const trouvee = alertes.find((a) => a.agent === "organisation-surgissante" && a.orgId === org);
	assert.ok(trouvee, "l'organisation déjà vue et corroborée doit alerter");
	assert.deepEqual(trouvee.faits.sort((a, b) => a - b), faits.sort((a, b) => a - b));
	assert.equal(trouvee.severity, severiteDeScore(trouvee.score));
	assert.equal(trouvee.evidence.sourcesDistinctes, 2);
	assert.equal(trouvee.evidence.evenementsAnciens, 1);
	assert.ok(!alertes.some((a) => a.orgId === control), "deux faits ne suffisent pas");
});

test("une organisation nouvelle au référentiel ne déclenche pas d'alerte CPU", async () => {
	const maintenant = Date.now();
	const sourceA = await makeSource(true);
	const sourceB = await makeSource(true);
	const org = await makeOrg();
	// Quatre faits récents sur deux sources, mais aucun fait antérieur : c'est
	// une arrivée dans le référentiel, pas une rupture.
	for (const [j, source] of [[1, sourceA], [3, sourceB], [5, sourceA], [6, sourceB]] as const) {
		await makeEvent({ sourceId: source, orgId: org, joursAvant: j, maintenant });
	}

	const alertes = await detecterAgentsCpuDepuisBase(maintenant);
	assert.ok(!alertes.some((a) => a.agent === "organisation-surgissante" && a.orgId === org));
});

test("la bascule sectorielle se lit en base, même sans organisation sur l'alerte", async () => {
	// Un instant passé isole ce test des événements semés par les précédents :
	// les leurs sont alors dans le futur du rejeu et simplement ignorés.
	const maintenant = Date.now() - 30 * JOUR_MS;
	const source = await makeSource(true);
	const sante = await makeOrg({ secteur: "sante-social" });
	const commerce = await makeOrg({ secteur: "commerce" });
	// 16 faits récents : 15 santé, 1 commerce ; 20 de référence : 12 commerce, 8 santé.
	for (let i = 0; i < 15; i++) {
		await makeEvent({ sourceId: source, orgId: sante, joursAvant: 1 + (i % 5), maintenant });
	}
	await makeEvent({ sourceId: source, orgId: commerce, joursAvant: 2, maintenant });
	for (let i = 0; i < 12; i++) {
		await makeEvent({ sourceId: source, orgId: commerce, joursAvant: 20 + i, maintenant });
	}
	for (let i = 0; i < 8; i++) {
		await makeEvent({ sourceId: source, orgId: sante, joursAvant: 20 + i, maintenant });
	}

	const alertes = await detecterAgentsCpuDepuisBase(maintenant);
	const bascule = alertes.find((a) => a.agent === "bascule-secteur");
	assert.ok(bascule, "la distribution sectorielle doit rompre");
	assert.equal(bascule.orgId, null, "une bascule n'a pas d'organisation à désigner");
	assert.equal(bascule.evidence.secteur, "sante-social");
	assert.ok(Number(bascule.evidence.z) > 3);
});

test("la source muette se lit en base ; une source désactivée est exclue", async () => {
	const maintenant = Date.now();
	const active = await makeSource(true);
	const desactivee = await makeSource(false);
	for (const j of [4, 5, 6, 7, 8, 9, 10]) {
		await makeEvent({ sourceId: active, joursAvant: j, maintenant, family: "cti" });
		await makeEvent({ sourceId: desactivee, joursAvant: j, maintenant, family: "cti" });
	}

	const alertes = await detecterAgentsCpuDepuisBase(maintenant);
	const muettes = alertes.filter((a) => a.agent === "source-muette");
	assert.deepEqual(muettes.map((a) => a.evidence.sourceId), [active]);
	assert.equal(muettes[0]?.severity, severiteDeScore(muettes[0]?.score ?? 0));
	assert.equal(muettes[0]?.faits.length, 7);
});

test("la revue persiste les trois agents, déduplique et ne rouvre pas une alerte traitée", async () => {
	const maintenant = Date.now();
	const source = await makeSource(true);
	const sourceOrgA = await makeSource(true);
	const sourceOrgB = await makeSource(true);
	const org = await makeOrg();
	for (const [j, source] of [[1, sourceOrgA], [3, sourceOrgB], [6, sourceOrgA]] as const) {
		await makeEvent({ sourceId: source, orgId: org, joursAvant: j, maintenant });
	}
	await makeEvent({ sourceId: sourceOrgB, orgId: org, joursAvant: 120, maintenant });
	for (const j of [4, 5, 6, 7, 8, 9, 10]) {
		await makeEvent({ sourceId: source, joursAvant: j, maintenant, family: "cti" });
	}
	// Un secteur sur-représenté, avec une référence distincte : garantit que la
	// bascule est alimentée elle aussi, indépendamment des autres tests.
	// Source séparée : un fait récent ici détruirait le silence de l'autre.
	const sourceSecteur = await makeSource(true);
	const numerique = await makeOrg({ secteur: "numerique" });
	const reference = await makeOrg({ secteur: "commerce" });
	for (let i = 0; i < 12; i++) {
		await makeEvent({ sourceId: sourceSecteur, orgId: numerique, joursAvant: 1 + (i % 5), maintenant });
	}
	for (let i = 0; i < 20; i++) {
		await makeEvent({ sourceId: sourceSecteur, orgId: reference, joursAvant: 20 + i, maintenant });
	}

	const premier = await capterAgentsCpu(maintenant);
	assert.ok(premier.emises >= 3, "les trois agents doivent être alimentés");
	assert.ok(premier.creees >= 3, "chaque situation crée sa ligne");
	assert.equal(premier.lacunes, 0);

	const lignes = await query<{ id: number; rule_id: string; org_id: number | null; evidence: Record<string, unknown>; status: string }>(
		`SELECT id, rule_id, org_id, evidence, status FROM alert WHERE scope = $1`,
		[ALERT_SCOPE_AGENTS_CPU],
	);
	for (const l of lignes.rows) created.alertes.push(l.id);
	const regles = new Set(lignes.rows.map((l) => l.rule_id));
	assert.ok(regles.has("agents-cpu:organisation-surgissante"));
	assert.ok(regles.has("agents-cpu:source-muette"), `règles vues : ${[...regles].join(", ")}`);
	assert.ok(regles.has("agents-cpu:bascule-secteur"));
	assert.ok(lignes.rows.some((l) => l.org_id === org), "l'alerte d'organisation porte son org_id");
	assert.ok(lignes.rows.some((l) => l.org_id === null), "les deux autres alertes n'ont pas d'org_id");

	// Un analyste a traité une ligne : un tick suivant met l'evidence à jour
	// sans réouvrir l'alerte.
	const cible = lignes.rows.find((l) => l.rule_id === "agents-cpu:source-muette");
	assert.ok(cible);
	const cle = String(cible.evidence.cle);
	await query("UPDATE alert SET status = 'ack' WHERE id = $1", [cible.id]);

	const second = await capterAgentsCpu(maintenant);
	assert.ok(second.misesAJour >= 3, "les lignes existantes sont mises à jour, pas dupliquées");
	const apres = await query<{ n: string; statut: string }>(
		`SELECT count(*)::text AS n, min(status) AS statut FROM alert
		  WHERE scope = $1 AND evidence->>'cle' = $2`,
		[ALERT_SCOPE_AGENTS_CPU, cle],
	);
	assert.equal(Number(apres.rows[0]?.n ?? 0), 1, "une seule ligne par clé stable");
	assert.equal(apres.rows[0]?.statut, "ack", "le statut décidé par l'analyste est préservé");
	assert.ok(second.journal >= 3, "chaque écriture est consignée");

	const diffusion = await fetchPendingAlerts(100_000);
	const diffusees = new Set(diffusion.map((a) => a.id));
	for (const l of lignes.rows) {
		assert.ok(!diffusees.has(Number(l.id)), `l'alerte de revue #${l.id} ne doit pas être diffusée`);
	}
});

test("état vide et instant invalide : aucun bruit, erreur explicite", async () => {
	const lointain = Date.parse("2000-01-01T00:00:00Z");
	assert.deepEqual(await detecterAgentsCpuDepuisBase(lointain), []);
	const resultat = await capterAgentsCpu(lointain);
	assert.deepEqual(
		{ emises: resultat.emises, creees: resultat.creees, journal: resultat.journal },
		{ emises: 0, creees: 0, journal: 0 },
	);
	await assert.rejects(() => detecterAgentsCpuDepuisBase(Number.NaN), RangeError);
});
