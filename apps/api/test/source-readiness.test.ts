/**
 * DB-M8 — disponibilité ≠ prêt à collecter.
 *
 * Quatre effets observables, sans réseau : une source `false` n'entre dans
 * aucun plan (même forcé) ni dans le ratissage, un succès la rend `true`,
 * l'API distingue l'attente de branchement du désactivé/jamais collecté, et la
 * couverture ne compte pas une source non branchée comme opérationnelle.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import type { CollectContext, Collector } from "@radar/shared";
import { closePools, query } from "../src/db.js";
import {
  chargerPlanCycle,
  construirePlan,
  sourcesDuCycle,
  type SourcePourPlan,
} from "../src/collectors/plan.js";
import {
  classifierSante,
  doitCollecter,
  executerCollecteur,
  lireSanteSource,
  planifierCycle,
  ratisserSourcesJamaisCollectees,
  sourcesJamaisCollectees,
} from "../src/collectors/index.js";
import { runGenericSources } from "../src/collectors/generic.js";
import { listLiveSources, markSourceOk } from "../src/collecte/live.js";
import { runCollectors } from "../src/collecte/cycle.js";
import sourcesRoute, { statutCollecteSource } from "../src/routes/sources.js";
import {
  mesurerCouverture,
  SQL_COLLECTE,
  SQL_EVENEMENTS,
  SQL_ETAT_BASE,
  SQL_FILTRE,
  SQL_SECTEURS,
  type ExecuteurSQL,
} from "../src/analyse/couverture-base.js";
import type { CorpusConsolide } from "../src/analyse/corpus-couverture.js";

const TAG = `m8${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const IDS = {
  planAttente: `${TAG}-plan-attente`,
  planNul: `${TAG}-plan-nul`,
  planPret: `${TAG}-plan-pret`,
  dedieAttente: `${TAG}-dedie-attente`,
  dedieNul: `${TAG}-dedie-nul`,
  cycleOk: `${TAG}-cycle-ok`,
  ratissageAttente: `${TAG}-rat-attente`,
  ratissageNul: `${TAG}-rat-nul`,
  generiqueAttente: `${TAG}-gen-attente`,
  generiqueOk: `${TAG}-gen-ok`,
  liveAttente: `${TAG}-live-attente`,
  liveNul: `${TAG}-live-nul`,
  apiAttente: `${TAG}-api-attente`,
  apiJamais: `${TAG}-api-jamais`,
  apiDesactivee: `${TAG}-api-desactivee`,
  apiErreur: `${TAG}-api-erreur`,
  statsAttente: `${TAG}-stats-attente`,
} as const;
const TOUS: readonly string[] = Object.values(IDS);
const MAINTENANT = Date.UTC(2026, 10, 24, 12, 0, 0);

type OptionsSource = {
  pret?: boolean | null;
  enabled?: boolean;
  lastOk?: string | null;
  lastError?: string | null;
  live?: boolean;
  region?: string | null;
};

async function creerSource(id: string, options: OptionsSource = {}): Promise<void> {
  await query(
    `INSERT INTO source
       (id, name, family, url, kind, format, enabled, pret_a_collecter, statut, last_ok_at, last_error_at, live, region)
     VALUES ($1, $2, 'cti', 'https://exemple.invalid/flux', 'narrative', 'rss', $3, $4, 'active', $5, $6, $7, $8)`,
    [id, `Source ${id}`, options.enabled ?? true, options.pret ?? null,
      options.lastOk ?? null, options.lastError ?? null, options.live ?? false, options.region ?? null],
  );
}

function contexte(): CollectContext {
  return {
    fetchJson: async () => { throw new Error("réseau interdit dans ce test"); },
    fetchText: async () => { throw new Error("réseau interdit dans ce test"); },
    cursor: {},
    log: () => {},
    now: () => new Date(MAINTENANT),
  };
}

function fauxCollecteur(id: string): Collector {
  return {
    id,
    family: "cti",
    intervalSec: 60,
    run: async () => ({ events: [] }),
  };
}

after(async () => {
  await query("DELETE FROM journal WHERE subject = ANY($1::text[])", [TOUS]);
  await query("DELETE FROM collector_run WHERE source_id = ANY($1::text[])", [TOUS]);
  await query("DELETE FROM source WHERE id = ANY($1::text[])", [TOUS]);
  await closePools();
});

function sourceDePlan(id: string, pret: boolean | null): SourcePourPlan {
  return { id, name: id, family: "cti", intervalSec: 3600, lastOkAt: null, pretACollecter: pret };
}

test("plan pur : false est exclu, y compris d'un forçage explicite ; null garde l'historique", () => {
  const plan = construirePlan([
    sourceDePlan("attente", false),
    sourceDePlan("histoire", null),
    sourceDePlan("prete", true),
  ], MAINTENANT);

  assert.deepEqual(sourcesDuCycle(plan), ["histoire", "prete"]);
  assert.deepEqual(sourcesDuCycle(plan, { forcer: ["attente"] }), ["histoire", "prete"]);
  const attente = plan.entrees.find((e) => e.id === "attente");
  assert.equal(attente?.etat, "exclue");
  assert.equal(attente?.pretACollecter, false);
  assert.match(attente?.raison ?? "", /branchement/);
  assert.equal(plan.totaux.enAttenteBranchement, 1);
});

test("plan chargé de la base : la source en attente reste exclue d'un cycle forcé", async () => {
  for (const [id, pret] of [
    [IDS.planAttente, false], [IDS.planNul, null], [IDS.planPret, true],
  ] as const) {
    await creerSource(id, { pret });
  }
  const plan = await chargerPlanCycle(query, {}, MAINTENANT);
  const vues = plan.entrees.filter((e) => TOUS.includes(e.id));
  assert.equal(vues.length, 3);
  const attente = vues.find((e) => e.id === IDS.planAttente);
  assert.equal(attente?.etat, "exclue");
  assert.equal(attente?.pretACollecter, false);
  assert.match(attente?.raison ?? "", /branchement/);
  assert.equal(sourcesDuCycle(plan, { forcer: [IDS.planAttente] }).includes(IDS.planAttente), false);
  assert.ok(sourcesDuCycle(plan).includes(IDS.planNul), "NULL garde le comportement historique");
  assert.ok(sourcesDuCycle(plan).includes(IDS.planPret));
});

test("collecteurs dédiés : onlyId + force ne relancent pas une source non branchée", async () => {
  await creerSource(IDS.dedieAttente, { pret: false });
  await creerSource(IDS.dedieNul, { pret: null });
  const collecteurs = [fauxCollecteur(IDS.dedieAttente), fauxCollecteur(IDS.dedieNul)];
  const plan = await planifierCycle({ collecteurs, force: true, maintenant: MAINTENANT });
  assert.deepEqual(plan.aExecuter.map((e) => e.collecteur.id), [IDS.dedieNul]);
  assert.deepEqual(plan.sautees.map((e) => [e.sourceId, e.raison]), [
    [IDS.dedieAttente, "en-attente-branchement"],
  ]);

  const sante = await lireSanteSource(IDS.dedieAttente);
  assert.equal(sante?.etat, "en-attente-branchement");
  assert.equal(sante?.pretACollecter, false);
  assert.equal(doitCollecter(sante, 60, { force: true }, MAINTENANT).collecter, false);
  assert.equal(doitCollecter(await lireSanteSource(IDS.dedieNul), 60, { force: true }, MAINTENANT).collecter, true);
  assert.equal(classifierSante({
    statut: "active", enabled: true, pret_a_collecter: false, echecs_consecutifs: 0,
    last_ok_at: null, last_error_at: null, last_error: null, dernier_statut: null,
  }), "en-attente-branchement");
});

test("succès collecteur : un run réussi bascule pret_a_collecter à true", async () => {
  await executerCollecteur(fauxCollecteur(IDS.dedieAttente), contexte());
  const sante = await query<{ pret_a_collecter: boolean | null; last_ok_at: string | null }>(
    "SELECT pret_a_collecter, last_ok_at FROM source WHERE id=$1", [IDS.dedieAttente],
  );
  assert.equal(sante.rows[0]?.pret_a_collecter, true);
  assert.ok(sante.rows[0]?.last_ok_at, "last_ok_at et disponibilité sont écrits ensemble");

  await creerSource(IDS.cycleOk, { pret: null });
  await runCollectors({
    collecteurs: [fauxCollecteur(IDS.cycleOk)], onlyId: IDS.cycleOk, force: true,
    etapesSupplementaires: false,
  });
  const cycle = await query<{ pret_a_collecter: boolean | null }>(
    "SELECT pret_a_collecter FROM source WHERE id=$1", [IDS.cycleOk],
  );
  assert.equal(cycle.rows[0]?.pret_a_collecter, true, "le cycle marque aussi la disponibilité");
});

test("ratissage : une source non branchée n'est jamais tentée", async () => {
  await creerSource(IDS.ratissageAttente, { pret: false });
  await creerSource(IDS.ratissageNul, { pret: null });
  const ids = [IDS.ratissageAttente, IDS.ratissageNul];
  const vus: string[] = [];
  await ratisserSourcesJamaisCollectees(async (tentées) => { vus.push(...tentées); }, { ids, limite: 10 });
  assert.deepEqual(vus, [IDS.ratissageNul]);
  assert.deepEqual(await sourcesJamaisCollectees(10, ids), [IDS.ratissageNul]);
});

test("générique : sourceIds + force écartent false, et un succès rend true", async () => {
  await creerSource(IDS.generiqueAttente, { pret: false });
  await creerSource(IDS.generiqueOk, { pret: null });
  let appelsReseau = 0;
  await runGenericSources(() => {}, {
    sourceIds: [IDS.generiqueAttente, IDS.generiqueOk],
    force: true,
    // 304 simulé : aucun HTTP, aucun parseur, aucun événement.
    fetchTexte: async () => { appelsReseau++; return ""; },
  });
  assert.equal(appelsReseau, 1, "une seule source lue : la source en attente n'a même pas été fetchée");
  const etats = await query<{ id: string; pret_a_collecter: boolean | null; last_ok_at: string | null }>(
    "SELECT id, pret_a_collecter, last_ok_at FROM source WHERE id = ANY($1::text[])",
    [[IDS.generiqueAttente, IDS.generiqueOk]],
  );
  const attente = etats.rows.find((r) => r.id === IDS.generiqueAttente);
  const ok = etats.rows.find((r) => r.id === IDS.generiqueOk);
  assert.equal(attente?.pret_a_collecter, false);
  assert.equal(attente?.last_ok_at, null, "aucun succès enregistré pour une source non branchée");
  assert.equal(ok?.pret_a_collecter, true);
  assert.ok(ok?.last_ok_at);
});

test("flux live : false n'est pas éligible, un succès explicite rend true", async () => {
  await creerSource(IDS.liveAttente, { pret: false, live: true, region: "nouvelle-aquitaine" });
  await creerSource(IDS.liveNul, { pret: null, live: true, region: "nouvelle-aquitaine" });
  const eligibles = (await listLiveSources()).map((s) => s.id);
  assert.equal(eligibles.includes(IDS.liveAttente), false);
  assert.equal(eligibles.includes(IDS.liveNul), true);
  await markSourceOk(IDS.liveAttente);
  const etat = await query<{ pret_a_collecter: boolean | null }>(
    "SELECT pret_a_collecter FROM source WHERE id=$1", [IDS.liveAttente],
  );
  assert.equal(etat.rows[0]?.pret_a_collecter, true);
});

type LigneApi = {
  id: string;
  enabled: boolean;
  pretACollecter: boolean | null;
  statutCollecte: string;
  ok: boolean;
};

test("GET /sources : en-attente-branchement ≠ désactivée ≠ jamais-collectée ≠ en-erreur", async () => {
  await creerSource(IDS.apiAttente, { pret: false, lastOk: new Date().toISOString() });
  await creerSource(IDS.apiJamais, { pret: null });
  await creerSource(IDS.apiDesactivee, { pret: null, enabled: false });
  await creerSource(IDS.apiErreur, { pret: null, lastError: new Date().toISOString() });

  const app = Fastify();
  await app.register(sourcesRoute);
  try {
    const reponse = await app.inject({ method: "GET", url: "/sources" });
    assert.equal(reponse.statusCode, 200);
    const lignes = (reponse.json() as LigneApi[]).filter((s) => TOUS.includes(s.id));
    const parId = new Map(lignes.map((s) => [s.id, s]));
    const attente = parId.get(IDS.apiAttente);
    assert.equal(attente?.pretACollecter, false);
    assert.equal(attente?.statutCollecte, "en-attente-branchement");
    assert.equal(attente?.enabled, true, "la source n'est pas désactivée");
    assert.equal(attente?.ok, false, "un ancien succès ne la dit pas saine");
    assert.equal(parId.get(IDS.apiJamais)?.statutCollecte, "jamais-collectee");
    assert.equal(parId.get(IDS.apiDesactivee)?.statutCollecte, "desactivee");
    assert.equal(parId.get(IDS.apiErreur)?.statutCollecte, "en-erreur");
    assert.equal(statutCollecteSource({
      pret_a_collecter: false, enabled: true, statut: "active",
      last_ok_at: new Date().toISOString(), last_error_at: null,
    }), "en-attente-branchement");
  } finally {
    await app.close();
  }
});

test("GET /stats : une source en attente n'est pas comptée parmi les sources OK", async () => {
  const lireStats = async (): Promise<{ sources: { ok: number; enAttente: number } }> => {
    const app = Fastify();
    await app.register(sourcesRoute);
    try {
      const reponse = await app.inject({ method: "GET", url: "/stats" });
      assert.equal(reponse.statusCode, 200);
      return reponse.json() as { sources: { ok: number; enAttente: number } };
    } finally {
      await app.close();
    }
  };
  const avant = await lireStats();
  await creerSource(IDS.statsAttente, { pret: false, lastOk: new Date().toISOString() });
  const apres = await lireStats();
  assert.equal(apres.sources.enAttente, avant.sources.enAttente + 1);
  assert.equal(apres.sources.ok, avant.sources.ok, "elle porte pourtant un last_ok_at");
});

test("couverture : une source non branchée n'est pas une preuve de collecte", async () => {
  const jour = "2026-11-24";
  const incident = {
    id: `${TAG}-incident`, date_publication: jour, date_incident: null,
    organisation: "Organisation test", departement: "Gironde", type: "ransomware",
    source: "Éditeur test", titre: "Incident test", url: "https://exemple.fr/incident",
    extrait: null, resume: null, confiance: null, verifie_le: null,
  };
  const corpus: CorpusConsolide = {
    incidents: [incident],
    canonique: JSON.stringify(incident),
    sha256: "sha256-test",
    fichiers: [],
    doublons: [],
  };
  const sql: ExecuteurSQL = async <T>(texte: string): Promise<{ rows: T[] }> => {
    if (texte === SQL_ETAT_BASE) {
      return { rows: [{
        derniere_collecte: jour, derniere_execution: jour, evenements: 10,
        evenements_archives: 0, sources: 1, organisations: "100",
      }] as T[] };
    }
    if (texte === SQL_SECTEURS) {
      return { rows: Object.entries({ agroalimentaire: 10, industrie: 10, construction: 10, commerce: 10 })
        .map(([secteur, n]) => ({ secteur, n: String(n) })) as T[] };
    }
    if (texte === SQL_EVENEMENTS || texte === SQL_FILTRE) return { rows: [] as T[] };
    if (texte === SQL_COLLECTE) {
      return { rows: [{
        id: IDS.apiAttente, name: "Source en attente", family: "presse",
        url: "https://exemple.fr", enabled: true, pret_a_collecter: false,
        last_ok_at: `${jour}T12:00:00Z`, executions_du_jour: 2, evenements_du_jour: 1,
        derniere_execution: `${jour}T12:00:00Z`,
      }] as T[] };
    }
    throw new Error(`requête SQL inattendue : ${texte}`);
  };

  const rapport = await mesurerCouverture({ corpus, query: sql });
  const verdict = rapport.incidents[0];
  assert.equal(verdict?.sources[0]?.pretACollecter, false);
  assert.equal(verdict?.collecteeCeJour, false, "run et événement du jour ne suffisent pas");
  assert.equal(verdict?.motif, "pas_collecte");
  assert.match(rapport.method.collecte, /pret_a_collecter=false/);
});
