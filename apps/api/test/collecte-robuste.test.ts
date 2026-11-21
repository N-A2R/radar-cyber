/**
 * Cycle de collecte robuste : priorité, backoff, santé, reprise et lots du
 * gazetteer. Les fonctions pures sont testées sans base ; les transitions
 * d'état et le point de reprise passent par la vraie base de test jetable.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { query, closePools } from "../src/db.js";
import {
  attenteRestanteMs,
  delaiBackoffMs,
  enregistrerEchecSource,
  enregistrerSuccesSource,
  lireSanteSource,
  santeApresEchec,
} from "../src/collectors/sante-source.js";
import {
  cycleCourant,
  demarrerCycle,
  marquerTraitee,
  planifierCycle,
  terminerCycle,
  mesurerCycle,
  formatRapportCycle,
} from "../src/collectors/cycle.js";
import { ConstructeurGazetteer, buildGazetteer, resoudre, type GazetteerRow } from "../src/match/gazetteer.js";

const TAG = `cycle${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE = `test-${TAG}`;

type Etat = {
  id: string;
  last_ok_at?: string | null;
  last_error_at?: string | null;
  sante?: string | null;
  statut?: string | null;
  enabled?: boolean;
  echecs_consecutifs?: number | null;
  prochaine_tentative_at?: string | null;
};

const maintenant = Date.parse("2026-11-21T12:00:00Z");
const avant = (jour: number) => new Date(maintenant - jour * 86400_000).toISOString();
const futur = (ms: number) => new Date(maintenant + ms).toISOString();

test("planification : sources jamais collectées en tête, backoff et mortes écartées", () => {
  const entrees: Etat[] = [
    { id: "morte", statut: "morte", last_ok_at: avant(1) },
    { id: "desactivee", enabled: false, last_ok_at: avant(1) },
    { id: "backoff", prochaine_tentative_at: futur(60_000), last_ok_at: avant(1) },
    { id: "vue", last_ok_at: avant(1) },
    { id: "jamais-b", last_ok_at: null, last_error_at: null },
    { id: "jamais-a", last_ok_at: null, last_error_at: null },
    { id: "tentee", last_ok_at: null, last_error_at: avant(2) },
  ];
  const plan = planifierCycle(entrees, maintenant);
  assert.deepEqual(plan.aCollecter, ["jamais-a", "jamais-b", "tentee", "vue"]);
  assert.equal(plan.jamaisCollectees, 2);
  assert.deepEqual(plan.reportees.map((s) => s.id), ["backoff"]);
  assert.equal(plan.reportees[0]?.attenteMs, 60_000);
  assert.deepEqual(plan.exclues.map((s) => s.id), ["morte", "desactivee"]);
});

test("planification : liste vide et backoff échu", () => {
  assert.deepEqual(planifierCycle([], maintenant), {
    aCollecter: [], reportees: [], exclues: [], jamaisCollectees: 0,
  });
  const plan = planifierCycle(
    [{ id: "prete", prochaine_tentative_at: avant(0.01), last_ok_at: avant(1) }],
    maintenant,
  );
  assert.deepEqual(plan.aCollecter, ["prete"]);
  assert.equal(plan.reportees.length, 0);
});

test("santé : paliers exponentiels, remise à zéro et temps restant", () => {
  const delais = [1, 2, 3, 4, 5].map(delaiBackoffMs);
  assert.deepEqual(delais, [60_000, 300_000, 1_800_000, 7_200_000, 7_200_000]);
  assert.ok(delais.every((d, i) => i === 0 || d >= delais[i - 1]!));
  assert.equal(delaiBackoffMs(0), 0);
  assert.equal(santeApresEchec(1), "rouge");
  assert.equal(santeApresEchec(4), "rouge");
  assert.equal(santeApresEchec(5), "morte");
  assert.equal(attenteRestanteMs({ id: "x", prochaine_tentative_at: futur(90_000) }, maintenant), 90_000);
  assert.equal(attenteRestanteMs({ id: "x" }, maintenant), 0);
});

test("gazetteer : le chargement par lots produit exactement le même index", () => {
  const lignes: GazetteerRow[] = [
    { org_id: 1, name: "Ville de Tarnos", kind: "collectivite", dept: "40", city: "Tarnos", sector: "commune", alias: "Ville de Tarnos", source: "usage" },
    { org_id: 2, name: "Tarnos Distribution", kind: "entreprise", dept: "40", city: "Tarnos", sector: "commerce", alias: "Tarnos Distribution", source: "annuaire-entreprises" },
    { org_id: 3, name: "Hyper U", kind: "entreprise", dept: "33", city: "Bordeaux", sector: "commerce", alias: "hyper u", source: "annuaire-entreprises" },
  ];
  const enBloc = buildGazetteer(lignes);
  const parLots = new ConstructeurGazetteer();
  for (const ligne of lignes) parLots.ajouter(ligne);
  const gaz = parLots.construire();
  assert.equal(gaz.byAliasKey.size, enBloc.byAliasKey.size);
  assert.deepEqual([...gaz.byAliasKey.keys()], [...enBloc.byAliasKey.keys()]);
  assert.equal(resoudre(gaz, "ville de tarnos victime").org?.id, 1);
  assert.equal(resoudre(gaz, "Tarnos Distribution attaquée").org?.id, 2);
  assert.equal(resoudre(gaz, "texte sans organisation").org, null);
});

test("mesure : rapport lisible avec un cycle vide", () => {
  const mem = { rss: 100 * 1048576, heapUsed: 50 * 1048576 } as NodeJS.MemoryUsage;
  const apres = { rss: 140 * 1048576, heapUsed: 70 * 1048576 } as NodeJS.MemoryUsage;
  const rapport = mesurerCycle(mem, apres, null);
  assert.equal(rapport.deltaRssMo, 40);
  assert.equal(rapport.deltaTasMo, 20);
  assert.equal(rapport.sourcesCollectees, 0);
  assert.match(formatRapportCycle(rapport), /mémoire RSS.*40 Mo/);
});

test("base : échecs consécutifs → rouge, backoff persistant, puis morte", async () => {
  await query(
    "INSERT INTO source (id, name, family, url) VALUES ($1,$2,'cti','https://exemple.test/cycle')",
    [SOURCE, `Source cycle ${TAG}`],
  );
  for (let i = 1; i <= 4; i++) {
    await enregistrerEchecSource(SOURCE, new Error(`panne ${i}`));
    const etat = await lireSanteSource(SOURCE);
    assert.equal(etat?.echecs_consecutifs, i);
    assert.equal(etat?.sante, "rouge");
    assert.ok(etat?.prochaine_tentative_at, `backoff posé à l'échec ${i}`);
  }
  const avantSucces = await lireSanteSource(SOURCE);
  await enregistrerSuccesSource(SOURCE, { items: 7, ajoutes: 3 });
  const apresSucces = await lireSanteSource(SOURCE);
  assert.equal(apresSucces?.sante, "ok");
  assert.equal(apresSucces?.echecs_consecutifs, 0);
  assert.equal(apresSucces?.prochaine_tentative_at, null);
  const rendement = await query<{ items_total: number; last_items: number }>(
    "SELECT items_total, last_items FROM source WHERE id=$1", [SOURCE],
  );
  assert.equal(Number(rendement.rows[0]?.items_total), 7);
  assert.equal(Number(rendement.rows[0]?.last_items), 3);
  assert.ok(avantSucces?.prochaine_tentative_at);

  for (let i = 1; i <= 5; i++) await enregistrerEchecSource(SOURCE, new Error("panne finale"));
  const morte = await lireSanteSource(SOURCE);
  assert.equal(morte?.sante, "morte");
  assert.equal(morte?.statut, "morte");
  assert.equal(morte?.enabled, false);
  const traces = await query<{ id: number }>(
    "SELECT id FROM journal WHERE kind='source.morte' AND subject=$1", [SOURCE],
  );
  assert.equal(traces.rows.length, 1);
});

test("base : cycle interrompu repris, décomptes idempotents, cycle vide", async () => {
  const opened = await demarrerCycle(["a", "b", "c"], { jamaisCollectees: 3 });
  assert.deepEqual(opened.aCollecter, ["a", "b", "c"]);
  assert.equal(opened.reprise, false);
  await marquerTraitee("a", "ok");
  await marquerTraitee("a", "ok"); // reprise après erreur réseau : pas de double comptage
  let etat = await cycleCourant();
  assert.deepEqual(etat?.traitees, ["a"]);
  assert.equal(etat?.sources_collectees, 1);
  assert.equal(etat?.fin, null);

  const repris = await demarrerCycle(["a", "b", "c"]);
  assert.equal(repris.reprise, true);
  assert.deepEqual(repris.aCollecter, ["b", "c"]);
  await marquerTraitee("b", "erreur");
  await marquerTraitee("c", "reporte");
  etat = await cycleCourant();
  assert.equal(etat?.sources_collectees, 1);
  assert.equal(etat?.sources_en_echec, 1);
  assert.notEqual(etat?.fin, null, "le cycle se clôt dès que toutes les sources sont traitées");
  await terminerCycle(123_456);
  assert.equal(Number((await cycleCourant())?.rss_apres_octets), 123_456);

  const vide = await demarrerCycle([]);
  assert.deepEqual(vide.aCollecter, []);
  await terminerCycle();
  assert.notEqual((await cycleCourant())?.fin, null);
});

after(async () => {
  await query("DELETE FROM source WHERE id=$1", [SOURCE]).catch(() => {});
  await closePools();
});
