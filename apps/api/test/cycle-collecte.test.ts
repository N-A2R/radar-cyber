/**
 * Cycle de collecte borné : chaque comportement a son test.
 *
 * Les collecteurs sont des faux locaux : aucun appel réseau. Les effets sont
 * lus dans la base de test (états, journal, runs), pas déduits d'un exit code.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { CollectContext, Collector } from "@radar/shared";
import { closePools, query } from "../src/db.js";
import {
	collectors, delaiBackoffMs, doitCollecter, executerCollecteur, executerPlan,
	lireSanteSource, planifierCycle, ratisserSourcesJamaisCollectees, sourcesJamaisCollectees,
} from "../src/collectors/index.js";
import { getGazetteer, resetGazetteer } from "../src/collectors/org-gazetteer.js";

const TAG = `cycle${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const IDS = [`test-${TAG}-a`, `test-${TAG}-b`, `test-${TAG}-c`, `test-${TAG}-jamais`, `test-${TAG}-ancien`, `test-${TAG}-priorite`];

function contexte(): CollectContext {
	return {
		fetchJson: async () => { throw new Error("réseau interdit dans ce test"); },
		fetchText: async () => { throw new Error("réseau interdit dans ce test"); },
		cursor: {},
		log: () => {},
		now: () => new Date(),
	};
}

function fauxCollecteur(id: string, echec = false): Collector {
	return {
		id,
		family: "ransomware",
		intervalSec: 60,
		run: async () => {
			if (echec) throw new Error(`échec simulé ${id}`);
			return { events: [] };
		},
	};
}

async function creerSource(id: string, options: { lastOk?: string; run?: "ok" | "error" } = {}): Promise<void> {
	await query(
		`INSERT INTO source (id, name, family, url, last_ok_at)
		 VALUES ($1, $2, 'ransomware', 'https://exemple.test/source', $3)`,
		[id, `Source ${id}`, options.lastOk ?? null],
	);
	if (options.run) {
		await query(
			"INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new) VALUES ($1, now(), $2, 0, 0)",
			[id, options.run],
		);
	}
}

test("backoff par source : la série d'échecs ouvre des fenêtres croissantes", () => {
	assert.equal(delaiBackoffMs(0), 0);
	assert.equal(delaiBackoffMs(1), 60_000);
	assert.equal(delaiBackoffMs(2), 5 * 60_000);
	assert.equal(delaiBackoffMs(3), 30 * 60_000);
	assert.ok(delaiBackoffMs(9) <= 6 * 3_600_000, "le délai reste borné");

	const sante = {
		id: IDS[0] as string, etat: "degradee" as const, statut: "active", enabled: true,
		echecsConsecutifs: 2, dernierOk: new Date("2026-01-01T00:00:00Z"),
		dernierEchec: new Date("2026-01-02T00:00:00Z"), dernierMessage: "HTTP 500",
		dernierStatutRun: "error",
	};
	const maintenant = new Date("2026-01-02T00:04:00Z").getTime();
	assert.equal(doitCollecter(sante, 60, {}, maintenant).raison, "backoff", "4 min après 2 échecs : on attend");
	assert.equal(doitCollecter(sante, 60, {}, maintenant + 2 * 60_000).collecter, true, "après 5 min : on reprend");
	assert.equal(doitCollecter(sante, 60, { force: true }, maintenant).raison, "forced", "une relance manuelle force");
});

test("état de santé : l'échec est publié dans la source et le journal", async () => {
	const id = IDS[0] as string;
	await creerSource(id);
	const santeAvant = await lireSanteSource(id);
	assert.equal(santeAvant?.etat, "jamais-collectee");

	await assert.rejects(
		() => executerCollecteur(fauxCollecteur(id, true), contexte()),
		/échec simulé/,
	);
	const sante = await lireSanteSource(id);
	assert.equal(sante?.etat, "degradee");
	assert.equal(sante?.echecsConsecutifs, 1);
	assert.match(sante?.dernierMessage ?? "", /échec simulé/);
	assert.ok(sante?.dernierEchec instanceof Date, "horodatage de l'échec publié");
	const traces = await query(
		"SELECT payload FROM journal WHERE kind = 'source.changed' AND subject = $1", [id],
	);
	assert.equal(traces.rows.length, 1, "un seul fait de dégradation");
	assert.equal((traces.rows[0] as { payload: { transition: string } }).payload.transition, "sante-degradee");
});

test("état de santé : un run réussi efface l'erreur et le compteur", async () => {
	const id = IDS[1] as string;
	await creerSource(id);
	await assert.rejects(() => executerCollecteur(fauxCollecteur(id, true), contexte()));
	await executerCollecteur(fauxCollecteur(id), contexte());

	const sante = await lireSanteSource(id);
	assert.equal(sante?.etat, "saine");
	assert.equal(sante?.echecsConsecutifs, 0);
	assert.equal(sante?.dernierMessage, null);
	assert.equal(sante?.dernierEchec, null, "le backoff est refermé");
	assert.ok(sante?.dernierOk instanceof Date);
	const traces = await query<{ kind: string; payload: Record<string, unknown> }>(
		"SELECT kind, payload FROM journal WHERE subject = $1", [id],
	);
	assert.equal(
		traces.rows.filter((t) => t.kind === "source.changed" && t.payload.transition === "sante-retour").length,
		1,
		`le retour à la santé est tracé — traces: ${JSON.stringify(traces.rows)}`,
	);
});

test("reprise après erreur : un collecteur en échec n'interrompt pas le cycle", async () => {
	const vus: string[] = [];
	const plan = {
		aExecuter: [IDS[0], IDS[1], IDS[2]].map((id, i) => ({
			sourceId: id as string,
			collecter: true,
			raison: "due" as const,
			sante: null,
			curseur: {},
			collecteur: fauxCollecteur(id as string, i === 1),
		})),
		sautees: [],
	};
	const resultat = await executerPlan(plan, async (etape) => {
		vus.push(etape.collecteur.id);
		await etape.collecteur.run(contexte());
	});
	assert.deepEqual(vus, IDS.slice(0, 3), "les trois sources ont été tentées");
	assert.equal(resultat.tentatives, 3);
	assert.equal(resultat.reussis, 2);
	assert.equal(resultat.echecs, 1);
	assert.equal(resultat.erreurs.length, 1);
	assert.match(resultat.erreurs[0] as string, new RegExp((IDS[1] as string).replace(/[-]/g, "-")));
	assert.ok(resultat.memoire.avantMo > 0 && resultat.memoire.apresMo > 0, "les deux mesures RSS sont présentes");
	assert.equal(typeof resultat.memoire.deltaMo, "number");
});

test("priorité : une source jamais collectée passe avant une source ancienne", async () => {
	const ancien = IDS[4] as string;
	const jamais = IDS[5] as string;
	await creerSource(ancien, { lastOk: "2026-01-01T00:00:00Z", run: "ok" });
	await creerSource(jamais);
	const initiaux = [...collectors];
	collectors.length = 0;
	collectors.push(fauxCollecteur(ancien), fauxCollecteur(jamais));
	try {
		const plan = await planifierCycle({ maintenant: new Date("2026-06-01T00:00:00Z").getTime() });
		assert.deepEqual(plan.aExecuter.map((e) => e.collecteur.id), [jamais, ancien]);
		assert.equal(plan.aExecuter[0]?.raison, "jamais-collectee");
		assert.equal(plan.aExecuter[1]?.raison, "due");
	} finally {
		collectors.length = 0;
		collectors.push(...initiaux);
	}
});

test("zéro source jamais collectée après un cycle : le ratissage en écrit un run", async () => {
	const id = IDS[3] as string;
	const avant = await query("SELECT id FROM source WHERE id = $1", [id]);
	if (avant.rows.length === 0) await creerSource(id);
	const restants = await ratisserSourcesJamaisCollectees(async (ids) => {
		for (const sourceId of ids) {
			await query(
				"INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new) VALUES ($1, now(), 'error', 0, 0)",
				[sourceId],
			);
		}
	}, { limite: 100_000 }); // au-delà de tout corpus : le test vérifie l'état final, pas la taille du lot
	assert.deepEqual(restants, [], "aucune source active n'est restée sans run");
	const runs = await query("SELECT status FROM collector_run WHERE source_id = $1", [id]);
	assert.equal(runs.rows.length, 1, "la tentative est mesurée, même en échec");
});

test("ratissage : 312 sources jamais collectées sont toutes reprises", async () => {
	const prefix = `cycle312-${TAG}-`;
	const ids = Array.from({ length: 312 }, (_, i) => `${prefix}${String(i).padStart(3, "0")}`);
	await query(
		`INSERT INTO source (id, name, family, url)
		 SELECT id, 'Source ' || id, 'ransomware', 'https://exemple.test/' || id
		   FROM unnest($1::text[]) AS id`,
		[ids],
	);
	const avant = await sourcesJamaisCollectees(400, ids);
	assert.equal(avant.length, 312, "les 312 sources sont bien sans run");

	const vus: string[] = [];
	const restants = await ratisserSourcesJamaisCollectees(async (lot) => {
		vus.push(...lot);
		await query(
			`INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new)
			 SELECT id, now(), 'error', 0, 0 FROM unnest($1::text[]) AS id`,
			[lot],
		);
	}, { limite: 400, ids });

	assert.equal(vus.length, 312, "aucune source du lot n'est sautée");
	assert.deepEqual([...vus].sort(), [...ids].sort());
	assert.deepEqual(restants, [], "aucune des 312 sources n'est oubliée");
	const runs = await query<{ id: string }>(
		"SELECT DISTINCT source_id AS id FROM collector_run WHERE source_id LIKE $1", [`${prefix}%`],
	);
	assert.equal(runs.rows.length, 312, "chaque source a un run, même en échec");
});

test("gazetteer columnaire : l'index garde les ids, les noms et les alias", async () => {
	const orgId = `org-${TAG}`;
	const { rows } = await query<{ id: number }>(
		"INSERT INTO org (name, slug, kind, city, sector) VALUES ($1,$2,'entreprise','Bordeaux','informatique') RETURNING id",
		[`Organisation ${TAG}`, orgId],
	);
	const id = Number(rows[0]?.id);
	await query(
		"INSERT INTO org_alias (org_id, alias, source) VALUES ($1,$2,'usage')",
		[id, `Alias ${TAG}`],
	);
	resetGazetteer();
	try {
		const gaz = await getGazetteer();
		const org = gaz.byAliasKey.get(`alias ${TAG}`)?.[0];
		assert.equal(org?.id, id, "l'id de colonne est bien celui de la ligne");
		assert.equal(org?.name, `Organisation ${TAG}`);
		assert.equal(gaz.orgsById.size, 1);
	} finally {
		resetGazetteer();
	}
});

test("gazetteer : la clé normalisée générée en base indexe l'alias accentué", async () => {
	const slug = `org-${TAG}-cle`;
	const { rows } = await query<{ id: number }>(
		"INSERT INTO org (name, slug, kind, city, sector) VALUES ($1,$2,'entreprise','Bordeaux','informatique') RETURNING id",
		[`Organisation ${TAG} clé`, slug],
	);
	const id = Number(rows[0]?.id);
	const alias = `Hôpital Saint-André ${TAG}`;
	await query(
		"INSERT INTO org_alias (org_id, alias, source) VALUES ($1,$2,'usage')",
		[id, alias],
	);
	const { rows: cleRows } = await query<{ nom_normalise: string }>(
		"SELECT nom_normalise FROM org_alias WHERE org_id = $1", [id],
	);
	const cle = cleRows[0]?.nom_normalise ?? "";
	resetGazetteer();
	try {
		const gaz = await getGazetteer();
		assert.ok(cle.length > 0, "la colonne générée fournit la clé");
		assert.equal(gaz.byAliasKey.get(cle)?.[0]?.id, id, "la clé générée en base indexe l'alias accentué");
	} finally {
		resetGazetteer();
	}
});

after(async () => {
	await query("DELETE FROM org_alias WHERE org_id IN (SELECT id FROM org WHERE slug LIKE $1)", [`org-${TAG}%`]).catch(() => {});
	await query("DELETE FROM org WHERE slug LIKE $1", [`org-${TAG}%`]).catch(() => {});
	await query("DELETE FROM collector_run WHERE source_id = ANY($1)", [IDS]).catch(() => {});
	await query("DELETE FROM collector_run WHERE source_id LIKE $1", [`cycle312-${TAG}-%`]).catch(() => {});
	await query("DELETE FROM source WHERE id LIKE $1", [`cycle312-${TAG}-%`]).catch(() => {});
	await query("DELETE FROM source WHERE id = ANY($1)", [IDS]).catch(() => {});
	await closePools();
});
