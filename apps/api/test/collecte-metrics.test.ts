/**
 * Intégration de GET /api/collecte/metrics.
 *
 * Chaque comportement a son test : les compteurs d'un cycle, le résumé 24 h,
 * l'ordre de l'historique, l'alerte de cycle échoué, l'alerte de source muette
 * et le calcul de statut. Les chiffres attendus sont ceux des lignes insérées
 * ici et relus en SQL indépendamment de la route.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import { enregistrerCycleCollecte, statutDuCycle } from "../src/collecte/supervision.js";
import collecteMetricsRoute, { type CollecteMetrics } from "../src/routes/collecte-metrics.js";
import { runRetention } from "../src/maintenance/retention.js";

const TAG = `cm${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const IDS = {
  ok: `${TAG}-ok`,
  erreur: `${TAG}-erreur`,
  muette: `${TAG}-muette`,
};
const JOUR_MS = 86_400_000;
const MAINTENANT = new Date();
const CYCLE1 = {
  debut: new Date(MAINTENANT.getTime() - 2 * 3600_000),
  fin: new Date(MAINTENANT.getTime() - 3600_000),
};
const CYCLE2 = {
  debut: new Date(MAINTENANT.getTime() - 30 * 60_000),
  fin: new Date(MAINTENANT.getTime() - 20 * 60_000),
};

let app: FastifyInstance;
let cycle1Id: number;
let cycle2Id: number;
let cycleAncienId: number;
const alertIds: number[] = [];

before(async () => {
  for (const id of Object.values(IDS)) {
    await query(
      `INSERT INTO source (id, name, family, url) VALUES ($1, $2, 'cti', $3)`,
      [id, `${id} (test ${TAG})`, `https://exemple.invalid/${id}`],
    );
  }

  // Deux runs réussis et un run en erreur, tous dans la fenêtre du cycle 1.
  await query(
    `INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new)
     VALUES ($1, $3, 'ok', 5, 2),
            ($1, $4, 'ok', 7, 3),
            ($2, $5, 'error', 0, 0)`,
    [
      IDS.ok, IDS.erreur,
      new Date(CYCLE1.debut.getTime() + 60_000).toISOString(),
      new Date(CYCLE1.debut.getTime() + 120_000).toISOString(),
      new Date(CYCLE1.debut.getTime() + 180_000).toISOString(),
    ],
  );

  const premier = await enregistrerCycleCollecte({
    startedAt: CYCLE1.debut,
    finishedAt: CYCLE1.fin,
    memoireAvant: { rss: 1_000, heapUsed: 400 },
    memoireApres: { rss: 1_800, heapUsed: 600 },
    taches: [
      { nom: "collecteurs", erreur: null },
      { nom: "ingestion générique", erreur: null },
    ],
    maintenant: CYCLE1.fin,
  });
  cycle1Id = premier.cycle.id;
  alertIds.push(...premier.alertes.map((a) => a.id));
  assert.equal(premier.cycle.statut, "degraded");

  // Un cycle plus ancien que la fenêtre de 24 h : historique oui, résumé non.
  const ancien = await query<{ id: string }>(
    `INSERT INTO collecte_cycle
       (started_at, finished_at, duree_ms, statut, sources_ok, sources_error,
        items_in, items_new, memoire_rss_octets, memoire_heap_octets, memoire_delta_octets)
     VALUES (now() - interval '49 hours', now() - interval '48 hours', 1000, 'ok', 0, 0, 0, 0, 100, 50, 0)
     RETURNING id`,
  );
  cycleAncienId = Number(ancien.rows[0].id);

  // Cadence quotidienne sur 7 jours, puis silence de 3 jours : les runs ne
  // doivent jamais tomber dans les fenêtres des cycles 1 et 2.
  const cadence = Array.from({ length: 7 }, (_, i) =>
    new Date(MAINTENANT.getTime() - (10 - i - 0.5) * JOUR_MS).toISOString(),
  );
  await query(
    `INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new)
     SELECT $1, jour::timestamptz, 'ok', 4, 1
       FROM unnest($2::text[]) AS jour`,
    [IDS.muette, cadence],
  );

  const second = await enregistrerCycleCollecte({
    startedAt: CYCLE2.debut,
    finishedAt: CYCLE2.fin,
    memoireAvant: { rss: 900, heapUsed: 300 },
    memoireApres: { rss: 1_100, heapUsed: 350 },
    taches: [],
    maintenant: MAINTENANT,
  });
  cycle2Id = second.cycle.id;
  alertIds.push(...second.alertes.map((a) => a.id));
  assert.equal(second.cycle.statut, "ok");
  assert.equal(second.alertes.length, 1, "seule l'alerte source muette est produite");

  app = Fastify();
  await app.register(collecteMetricsRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  await query("DELETE FROM alert WHERE id = ANY($1)", [alertIds]);
  await query("DELETE FROM collecte_cycle WHERE id = ANY($1)", [[cycle1Id, cycle2Id, cycleAncienId]]);
  await query("DELETE FROM collector_run WHERE source_id = ANY($1)", [Object.values(IDS)]);
  await query("DELETE FROM source WHERE id = ANY($1)", [Object.values(IDS)]);
  await app.close();
  await closePools();
});

async function lire(limit = 20): Promise<CollecteMetrics> {
  const reponse = await app.inject({ method: "GET", url: `/api/collecte/metrics?limit=${limit}` });
  assert.equal(reponse.statusCode, 200, reponse.body);
  return reponse.json<CollecteMetrics>();
}

test("la route répond avec les compteurs réels du cycle", async () => {
  const corps = await lire();
  assert.equal(corps.fenetreHeures, 24);
  assert.ok(Date.parse(corps.generatedAt) > 0);

  const cycle = corps.cycles.find((c) => c.id === cycle1Id);
  assert.ok(cycle, "cycle 1 présent dans l'historique");
  assert.equal(cycle.dureeMs, 3_600_000);
  assert.equal(cycle.statut, "degraded");
  assert.equal(cycle.sourcesOk, 2);
  assert.equal(cycle.sourcesError, 1);
  assert.equal(cycle.itemsIn, 12);
  assert.equal(cycle.itemsNew, 5);
  assert.equal(cycle.memoireRssOctets, 1_800);
  assert.equal(cycle.memoireHeapOctets, 600);
  assert.equal(cycle.memoireDeltaOctets, 800);

  // Les mêmes chiffres, lus directement dans la table des runs.
  const runs = await query<{ ok: number; erreur: number; items: number }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'ok')::int AS ok,
            COUNT(*) FILTER (WHERE status = 'error')::int AS erreur,
            COALESCE(SUM(items_in), 0)::int AS items
       FROM collector_run
      WHERE finished_at >= $1 AND finished_at <= $2`,
    [CYCLE1.debut.toISOString(), CYCLE1.fin.toISOString()],
  );
  assert.equal(cycle.sourcesOk, Number(runs.rows[0].ok));
  assert.equal(cycle.sourcesError, Number(runs.rows[0].erreur));
  assert.equal(cycle.itemsIn, Number(runs.rows[0].items));
});

test("le résumé 24 h agrège les cycles sans inclure l'historique ancien", async () => {
  const { resume } = await lire();
  assert.equal(resume.cycles, 2);
  assert.equal(resume.cyclesEchoues, 1);
  assert.equal(resume.dureeMoyenneMs, 2_100_000);
  assert.equal(resume.dureeMaxMs, 3_600_000);
  assert.deepEqual(
    [resume.sourcesOk, resume.sourcesError, resume.itemsIn, resume.itemsNew],
    [2, 1, 12, 5],
  );
  assert.equal(resume.memoireMaxOctets, 1_800);
});

test("l'historique est trié du plus récent au plus ancien et borne limit", async () => {
  const tout = await lire();
  assert.deepEqual(tout.cycles.map((c) => c.id), [cycle2Id, cycle1Id, cycleAncienId]);
  const borne = await lire(2);
  assert.deepEqual(borne.cycles.map((c) => c.id), [cycle2Id, cycle1Id]);
});

test("une source en erreur produit une alerte de cycle échoué", async () => {
  const { alertes } = await lire();
  const alerte = alertes.find((a) => a.ruleId === "supervision-collecte:cycle-echeque");
  assert.ok(alerte, "alerte de cycle échoué publiée");
  assert.equal(alerte.cycleId, cycle1Id);
  assert.equal(alerte.severite, 3);
  assert.match(alerte.titre, /dégradé/);

  const ligne = await query<{ titre: string; scope: string }>(
    `SELECT title AS titre, scope FROM alert WHERE id = $1`,
    [alerte.id],
  );
  assert.equal(ligne.rows[0].scope, "supervision-collecte");
  assert.equal(ligne.rows[0].titre, alerte.titre);
});

test("une source productrice devenue muette produit une alerte", async () => {
  const { alertes } = await lire();
  const alerte = alertes.find((a) => a.ruleId === "supervision-collecte:source-muette");
  assert.ok(alerte, "alerte source muette publiée");
  assert.equal(alerte.sourceId, IDS.muette);
  assert.equal(alerte.cycleId, cycle2Id);
  assert.match(alerte.titre, /muette depuis 3 j/);
});

test("l'historique des cycles obéit à la rétention", async () => {
  const ins = await query<{ id: string }>(
    `INSERT INTO collecte_cycle
       (started_at, finished_at, duree_ms, statut, memoire_rss_octets, memoire_heap_octets, memoire_delta_octets)
     VALUES (now() - interval '91 days', now() - interval '91 days', 10, 'ok', 1, 1, 0)
     RETURNING id`,
  );
  const id = Number(ins.rows[0].id);
  const resultat = await runRetention(() => {}, { tables: ["collecte_cycle"], days: 30 });
  assert.equal(resultat.cyclesSupervision, 1);
  const restant = await query<{ n: number }>("SELECT COUNT(*)::int AS n FROM collecte_cycle WHERE id = $1", [id]);
  assert.equal(restant.rows[0].n, 0);
});

test("le statut du cycle est calculé sans base ni horloge", () => {
  assert.equal(statutDuCycle([], 0), "ok");
  assert.equal(statutDuCycle([], 2), "degraded");
  assert.equal(statutDuCycle([{ nom: "collecteurs", erreur: " timeout " }], 0), "error");
  assert.equal(statutDuCycle([{ nom: "collecteurs", erreur: "timeout" }], 2), "error");
});
