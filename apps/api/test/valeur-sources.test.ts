/**
 * Règle de valeur des sources et mesure du cycle avant/après.
 *
 * Tout est mémoire : le classement, la simulation et la décision du
 * planificateur sont vérifiés sans réseau ni base, avec des jeux synthétiques.
 * Le seul chiffre de coût utilisé ici est un argument explicite du test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chargerValeursSources,
  classerValeurs,
  FREQUENCE_HEBDO_SEC,
  valeurDe,
  type MesureValeurSource,
} from "../src/collectors/valeur-plan.js";
import { simulerCycleValeur, type TacheCycleValeur } from "../src/collectors/cycle-valeur.js";
import { construirePlan, sourcesDuCycle, type SourcePourPlan } from "../src/collectors/plan.js";
import { doitCollecter, type SanteSource } from "../src/collectors/index.js";
import { query } from "../src/db.js";

const JOUR_SEC = 24 * 3600;
const HORIZON_SEC = 30 * JOUR_SEC;
const COUT_MS = 3650;

function mesure(pertinents: number, temps: number): MesureValeurSource {
  return { pertinentsNA30j: pertinents, tempsCollecte: temps, uniteTemps: "runs" };
}

test("valeur : items pertinents divisés par temps de collecte, zéro borné", () => {
  assert.equal(valeurDe(mesure(6, 37)), 6 / 37);
  assert.equal(valeurDe(mesure(0, 37)), 0);
});

test("classement : premier quintile 4×, productifs 2×, zéro en hebdomadaire, sans mesure inchangé", () => {
  const mesures = {
    "muette": mesure(0, 10),
    "faible": mesure(1, 10),
    "moyenne": mesure(2, 10),
    "haute": mesure(4, 2),
  };
  const base = { muette: 3600, faible: 3600, moyenne: 7200, haute: 3600, jamais: 900 };
  const classes = classerValeurs(mesures, base);

  assert.equal(classes.get("haute")?.regle, "top");
  assert.equal(classes.get("haute")?.frequenceSec, 900);
  assert.equal(classes.get("haute")?.rang, 1);
  assert.equal(classes.get("moyenne")?.regle, "productif");
  assert.equal(classes.get("moyenne")?.frequenceSec, 3600);
  assert.equal(classes.get("muette")?.regle, "hebdomadaire");
  assert.equal(classes.get("muette")?.frequenceSec, FREQUENCE_HEBDO_SEC);
  assert.equal(classes.get("jamais")?.regle, "sans-mesure");
  assert.equal(classes.get("jamais")?.frequenceSec, 900);

  const inverse = classerValeurs(
    Object.fromEntries(Object.entries(mesures).reverse()),
    Object.fromEntries(Object.entries(base).reverse()),
  );
  assert.deepEqual([...inverse.keys()].sort(), [...classes.keys()].sort());
});

test("mesure chargée : un run sans item rend zéro, aucune mesure ne fabrique de zéro", async () => {
  const exec = (async (texte: string) => {
    if (texte.includes("FROM event")) {
      return {
        rows: [
          { source_id: "productive", title: "Fait", summary: null, admission_rule: "dept", secondes: "100" },
          { source_id: "sans-run", title: "Fait", summary: null, admission_rule: "dept", secondes: "200" },
        ],
        rowCount: 2,
      };
    }
    if (texte.includes("FROM collector_run")) {
      return {
        rows: [
          { source_id: "productive", runs: "10", secondes: "0" },
          { source_id: "muette", runs: "4", secondes: "0" },
        ],
        rowCount: 2,
      };
    }
    return {
      rows: [
        { id: "productive", interval_sec: 3600 },
        { id: "muette", interval_sec: 3600 },
        { id: "sans-run", interval_sec: 3600 },
        { id: "jamais", interval_sec: 3600 },
      ],
      rowCount: 4,
    };
  }) as typeof query;

  const mesures = await chargerValeursSources(exec, Date.UTC(2026, 10, 22));
  const classes = classerValeurs(mesures.mesures, mesures.intervallesBase);
  assert.equal(mesures.uniteTemps, "runs");
  assert.equal(mesures.mesures["jamais"], undefined);
  assert.deepEqual(mesures.itemsPertinentsSec["sans-run"], [200]);
  assert.equal(classes.get("muette")?.regle, "hebdomadaire");
  assert.ok((classes.get("productive")?.rang ?? 0) > 0);
  assert.ok((classes.get("sans-run")?.rang ?? 0) > 0);
  assert.equal(classes.get("jamais")?.regle, "sans-mesure");
});

test("cycle avant/après : même couverture, gain supérieur à 20 % à coût égal", () => {
  const taches: TacheCycleValeur[] = [];
  for (let i = 1; i <= 4; i++) {
    taches.push({
      id: `p${i}`,
      intervalSecBase: 3600,
      mesure: mesure(3, 10),
      coutMsParCollecte: COUT_MS,
      itemsPertinentsSec: [JOUR_SEC, 5 * JOUR_SEC, 20 * JOUR_SEC],
    });
  }
  for (let i = 1; i <= 20; i++) {
    taches.push({
      id: `z${i}`,
      intervalSecBase: 3600,
      mesure: mesure(0, 10),
      coutMsParCollecte: COUT_MS,
      itemsPertinentsSec: [],
    });
  }
  const cycle = simulerCycleValeur(taches, { horizonSec: HORIZON_SEC });

  assert.equal(cycle.couvertureEgale, true);
  assert.equal(cycle.avant.itemsPertinents, 12);
  assert.equal(cycle.apres.itemsPertinents, cycle.avant.itemsPertinents);
  assert.ok(cycle.gainPct >= 20, `gain mesuré ${cycle.gainPct} %`);
  assert.equal(cycle.parSource.find((s) => s.id === "z1")?.frequenceSecApres, FREQUENCE_HEBDO_SEC);
  assert.equal(cycle.parSource.find((s) => s.id === "p1")?.frequenceSecApres, 900);
  assert.equal(cycle.parSource.find((s) => s.id === "p1")?.regle, "top");
});

test("planificateur : cadence de valeur rend une source muette non due", () => {
  const maintenant = Date.UTC(2026, 10, 22, 12);
  const dernierOk = new Date(maintenant - 3 * 3600 * 1000).toISOString();
  const sources: SourcePourPlan[] = [
    { id: "productive", name: "productive", intervalSec: 3600, lastOkAt: dernierOk },
    { id: "muette", name: "muette", intervalSec: 3600, lastOkAt: dernierOk },
  ];
  const plan = construirePlan(sources, maintenant, {
    intervalles: { productive: 900, muette: FREQUENCE_HEBDO_SEC },
  });
  const parId = new Map(plan.entrees.map((e) => [e.id, e]));
  assert.equal(parId.get("productive")?.etat, "due");
  assert.equal(parId.get("muette")?.etat, "attente");
  assert.deepEqual(sourcesDuCycle(plan), ["productive"]);
});

test("décision de collecte : la cadence priorisée prolonge l'intervalle effectif", () => {
  const maintenant = Date.now();
  const sante: SanteSource = {
    id: "muette", etat: "saine", statut: "", enabled: true, echecsConsecutifs: 0,
    dernierOk: new Date(maintenant - 2 * 3600 * 1000), dernierEchec: null,
    dernierMessage: null, dernierStatutRun: "ok",
  };
  assert.equal(doitCollecter(sante, 3600, {}, maintenant).collecter, true);
  assert.equal(doitCollecter(sante, FREQUENCE_HEBDO_SEC, {}, maintenant).raison, "intervalle");
  assert.equal(doitCollecter(sante, FREQUENCE_HEBDO_SEC, { force: true }, maintenant).collecter, true);
});
