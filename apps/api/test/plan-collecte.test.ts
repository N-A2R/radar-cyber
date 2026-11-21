/**
 * Ordonnanceur de collecte : un comportement, un test.
 *
 * Les dix sources synthétiques sont des objets mémoire : aucun réseau, aucune
 * base. Le dernier test (route) vérifie que la même fonction alimente l'API.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { query } from "../src/db.js";
import {
  construirePlan,
  sourcesDuCycle,
  type SourcePourPlan,
} from "../src/collectors/plan.js";
import collectePlanRoute from "../src/routes/collecte-plan.js";

const MAINTENANT = Date.UTC(2026, 10, 21, 12, 0, 0);
const JOUR = 24 * 3600;
const TAG = `plan${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function source(id: string, overrides: Partial<SourcePourPlan> = {}): SourcePourPlan {
  return {
    id,
    name: id,
    family: "cti",
    intervalSec: 3600,
    lastOkAt: new Date(MAINTENANT - 3 * JOUR * 1000).toISOString(),
    ...overrides,
  };
}

/** Dix sources synthétiques : cinq jamais collectées, cinq anciennes. */
function dixSources(): SourcePourPlan[] {
  return [
    source(`${TAG}-jamais-1`, { family: "presse", lastOkAt: null }),
    source(`${TAG}-jamais-2`, { family: "vuln", lastOkAt: null }),
    source(`${TAG}-jamais-3`, { family: "cti", lastOkAt: null }),
    source(`${TAG}-jamais-4`, { family: "ransomware", lastOkAt: null }),
    source(`${TAG}-jamais-5`, { family: "reputation", lastOkAt: null }),
    source(`${TAG}-ancienne-1`, { family: "presse" }),
    source(`${TAG}-ancienne-2`, { family: "vuln" }),
    source(`${TAG}-ancienne-3`, { family: "cert" }),
    source(`${TAG}-ancienne-4`, { family: "cti" }),
    source(`${TAG}-ancienne-5`, { family: "reputation" }),
  ];
}

test("fréquence attendue : une source récente attend, une source ancienne est due", () => {
  const plan = construirePlan([
    source("recente", { lastOkAt: new Date(MAINTENANT - 600_000).toISOString() }),
    source("ancienne", { lastOkAt: new Date(MAINTENANT - 3 * JOUR * 1000).toISOString() }),
  ], MAINTENANT);
  const parId = new Map(plan.entrees.map((e) => [e.id, e]));
  assert.equal(parId.get("recente")?.etat, "attente");
  assert.equal(parId.get("recente")?.frequenceSec, 3600);
  assert.equal(parId.get("ancienne")?.etat, "due");
  assert.deepEqual(sourcesDuCycle(plan), ["ancienne"]);
});

test("priorité : familles critiques avant la presse à ancienneté égale", () => {
  const plan = construirePlan([
    source("presse"),
    source("vuln", { family: "vuln" }),
    source("cert", { family: "cert" }),
  ], MAINTENANT);
  assert.deepEqual(sourcesDuCycle(plan), ["cert", "vuln", "presse"]);
});

test("santé : morte et désactivée exclues, dégradée après une source saine", () => {
  const plan = construirePlan([
    source("morte", { statut: "morte" }),
    source("desactivee", { enabled: false }),
    source("degradee", { lastErrorAt: new Date(MAINTENANT - 60_000).toISOString() }),
    source("saine"),
  ], MAINTENANT);
  const parId = new Map(plan.entrees.map((e) => [e.id, e]));
  assert.equal(parId.get("morte")?.etat, "exclue");
  assert.equal(parId.get("morte")?.raison, "source déclarée morte");
  assert.equal(parId.get("desactivee")?.etat, "exclue");
  assert.equal(parId.get("desactivee")?.raison, "source désactivée");
  assert.deepEqual(sourcesDuCycle(plan), ["saine", "degradee"]);
});

test("jamais collectée : passe avant une source due en erreur récente", () => {
  const plan = construirePlan([
    source("en-erreur", { lastErrorAt: new Date(MAINTENANT - 60_000).toISOString() }),
    source("jamais", { lastOkAt: null, lastErrorAt: new Date(MAINTENANT - 60_000).toISOString() }),
  ], MAINTENANT);
  assert.deepEqual(sourcesDuCycle(plan), ["jamais", "en-erreur"]);
  assert.equal(plan.totaux.jamaisCollecteesDues, 1);
});

test("cycle sur 10 sources synthétiques : zéro source jamais collectée après le passage", () => {
  const sources = dixSources();
  const avant = construirePlan(sources, MAINTENANT);
  const debut = performance.now();
  // Un cycle : on exécute exactement ce que le plan a retenu, puis on enregistre
  // le succès comme le fait le moteur (last_ok_at + run ok).
  const retenues = sourcesDuCycle(avant);
  const parId = new Map(sources.map((s) => [s.id, s]));
  for (const id of retenues) {
    const s = parId.get(id);
    if (!s) throw new Error(`source ${id} absente du jeu synthétique`);
    s.lastOkAt = new Date(MAINTENANT).toISOString();
    s.historique = {
      dernierRunAt: s.lastOkAt,
      dernierOkRunAt: s.lastOkAt,
      dernierErreurRunAt: null,
      dernierStatut: "ok",
      runsOk: 1,
      runsErreur: 0,
    };
  }
  const apres = construirePlan(sources, MAINTENANT);
  const dureeMs = performance.now() - debut;

  assert.equal(avant.totaux.jamaisCollecteesDues, 5);
  assert.equal(retenues.length, 10);
  assert.equal(apres.totaux.jamaisCollectees, 0);
  assert.equal(apres.totaux.dues, 0);
  console.log(`plan collecte : 10/10 sources collectées, 0 jamais collectée après le cycle, ${dureeMs.toFixed(1)} ms`);
});

test("GET /api/collecte/plan expose le plan chargé depuis la base", async () => {
  const insérées = dixSources().map((s) => s.id);
  for (const id of insérées) {
    const ancienne = id.includes("ancienne");
    await query(
      `INSERT INTO source (id, name, family, url, interval_sec, last_ok_at)
       VALUES ($1,$2,'cti','https://exemple.test/plan',3600,${ancienne ? "now() - interval '3 days'" : "NULL"})`,
      [id, id],
    );
  }
  const app = Fastify();
  await app.register(collectePlanRoute);
  try {
    const reponse = await app.inject({ method: "GET", url: "/collecte/plan" });
    assert.equal(reponse.statusCode, 200);
    const corps = reponse.json<{ totaux: { sources: number; jamaisCollecteesDues: number }; entrees: Array<{ id: string; etat: string; rang: number | null }> }>();
    const vues = corps.entrees.filter((e) => insérées.includes(e.id));
    assert.equal(vues.length, 10);
    assert.equal(corps.totaux.jamaisCollecteesDues >= 5, true);
    const jamais = vues.filter((e) => e.id.includes("jamais"));
    const anciennes = vues.filter((e) => e.id.includes("ancienne"));
    assert.equal(jamais.length, 5);
    assert.equal(anciennes.length, 5);
    assert.ok(jamais.every((e) => e.etat === "due" && e.rang !== null));
    assert.ok(jamais.every((e) => anciennes.every((a) => (e.rang ?? 99) < (a.rang ?? 99))));
  } finally {
    await app.close();
  }
});

after(async () => {
  await query("DELETE FROM collector_run WHERE source_id = ANY($1::text[])", [dixSources().map((s) => s.id)]);
  await query("DELETE FROM source WHERE id = ANY($1::text[])", [dixSources().map((s) => s.id)]);
});
