/**
 * GET /api/sources/dashboard — test d'intégration contre la base jetable.
 *
 * Le tableau de bord ne doit jamais afficher une constante : on mesure
 * l'état de la base avant puis après l'ajout de cinq sources typées (une par
 * état), puis après une troisième écriture. Chaque compteur, chaque rendement,
 * chaque jour d'évolution et le temps de collecte doivent suivre les écritures.
 *
 * Isolation : sources, runs et événements tagués, supprimés dans `after`.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import dashboardRoute, { FENETRE_JOURS, LIMITE_CLASSEMENT, SEUIL_LENTE_MS } from "../src/routes/sources-dashboard.js";
import { buildApp } from "../src/app.js";

const TAG = `sdb${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const IDS = {
  ok: `${TAG}-ok`,
  muette: `${TAG}-muette`,
  lente: `${TAG}-lente`,
  morte: `${TAG}-morte`,
  dormante: `${TAG}-dormante`,
};
const ALL_IDS = Object.values(IDS);

type Etat = "ok200" | "muette" | "morte" | "lente" | "dormante";
type Rendement = { id: string; name: string; family: string; entrees: number; evenements: number; rendement: number | null };
type Dashboard = {
  generatedAt: string;
  fenetreJours: number;
  fenetreRendementJours: number;
  seuilLenteMs: number;
  limiteClassement: number;
  totalSources: number;
  etats: Record<Etat, number>;
  meilleures: Rendement[];
  pires: Rendement[];
  evolution: { date: string; evenements: number; entrees: number; sourcesActives: number }[];
  collecte: { dureeTotaleMs: number; runs: number };
};

let app: FastifyInstance;
let avant: Dashboard;
let apres: Dashboard;
let apresRecolte: Dashboard;

async function lire(): Promise<Dashboard> {
  const res = await app.inject({ method: "GET", url: "/sources/dashboard" });
  assert.equal(res.statusCode, 200, res.body);
  return res.json<Dashboard>();
}

function delta(state: Etat): number {
  return apres.etats[state] - avant.etats[state];
}

async function ajouterSource(id: string, nom: string, statut = "active"): Promise<void> {
  await query(
    `INSERT INTO source (id, name, family, url, statut)
     VALUES ($1,$2,'cti','https://exemple.invalid/${TAG}', $3)`,
    [id, nom, statut],
  );
}

/** `debutSecondes` = début du run avant maintenant, `dureeSecondes` = durée réelle. */
async function ajouterRun(
  sourceId: string,
  debutSecondes: number,
  dureeSecondes: number,
  entrees: number,
  statut = "ok",
): Promise<void> {
  await query(
    `INSERT INTO collector_run (source_id, started_at, finished_at, status, items_in)
     VALUES ($1,
             now() - ($2::numeric * interval '1 second'),
             now() - (($2::numeric - $3::numeric) * interval '1 second'),
             $4, $5)`,
    [sourceId, debutSecondes, dureeSecondes, statut, entrees],
  );
}

async function ajouterEvenement(sourceId: string, suffixe: string, ageSecondes: number): Promise<void> {
  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, source_id, source_url, evidence,
                        observed_at, collected_at, severity)
     VALUES ($1,'cti','ambient_signal',$2,$3,$5,'{"run_id":"1"}'::jsonb,
             now() - ($4::numeric * interval '1 second'),
             now() - ($4::numeric * interval '1 second'), 2)`,
    [`${TAG}:${suffixe}`, `Événement de test ${suffixe}`, sourceId, ageSecondes,
     `https://exemple.invalid/${suffixe}`],
  );
}

before(async () => {
  app = Fastify();
  await app.register(dashboardRoute);
  await app.ready();
  avant = await lire();

  await ajouterSource(IDS.ok, `Alpha ${TAG}`);
  await ajouterSource(IDS.muette, `Beta ${TAG}`);
  await ajouterSource(IDS.lente, `Gamma ${TAG}`);
  await ajouterSource(IDS.morte, `Delta ${TAG}`, "morte");
  await ajouterSource(IDS.dormante, `Epsilon ${TAG}`);

  // Un run sain de 5 s et deux événements récents : 2 / 10 = 20 %.
  await ajouterRun(IDS.ok, 360, 5, 10);
  await ajouterEvenement(IDS.ok, "ok1", 0);
  await ajouterEvenement(IDS.ok, "ok2", 0);

  // 40 entrées lues, un seul événement vieux de 60 jours : muette, 0 %.
  await ajouterRun(IDS.muette, 7200, 1, 40);
  await ajouterEvenement(IDS.muette, "ancien", 5_184_000);

  // 45 s : au-dessus du seuil, mais avec un événement dans les 7 jours.
  await ajouterRun(IDS.lente, 10800, 45, 10);
  await ajouterEvenement(IDS.lente, "lente", 0);

  // Morte : sa décision prime, même si son run est rapide et productif.
  await ajouterRun(IDS.morte, 3600, 2, 100);
  await ajouterEvenement(IDS.morte, "morte", 0);

  // Dormant : dernier run il y a 10 jours, hors fenêtre de 7 jours.
  await ajouterRun(IDS.dormante, 864_000, 3, 5);

  // Un run en erreur compte dans le temps de collecte cumulé, pas dans « ok ».
  await ajouterRun(IDS.ok, 1800, 12, 0, "error");

  apres = await lire();

  // Troisième écriture : le dormant redevient actif. Si un chiffre était
  // figé ou calculé une seule fois, ce test le verrait.
  await ajouterRun(IDS.dormante, 240, 4, 20);
  await ajouterEvenement(IDS.dormante, "reveil", 0);
  apresRecolte = await lire();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM event WHERE source_id = ANY($1)", [ALL_IDS]);
  await query("DELETE FROM collector_run WHERE source_id = ANY($1)", [ALL_IDS]);
  await query("DELETE FROM source WHERE id = ANY($1)", [ALL_IDS]);
  await closePools();
});

test("les cinq états comptent chaque source une seule fois", () => {
  assert.equal(delta("ok200"), 1, "un run rapide et productif");
  assert.equal(delta("muette"), 1, "collectée mais sans production sur 7 j");
  assert.equal(delta("lente"), 1, "run au-dessus du seuil");
  assert.equal(delta("morte"), 1, "décision explicite");
  assert.equal(delta("dormante"), 1, "aucun run sur 7 j");
  assert.equal(apres.totalSources - avant.totalSources, ALL_IDS.length);
  assert.equal(
    Object.values(apres.etats).reduce((a, b) => a + b, 0),
    apres.totalSources,
    "la somme des états doit être le nombre de sources déclarées",
  );
});

test("la réponse porte ses propres fenêtres et son horodatage mesuré", () => {
  assert.ok(Number.isFinite(Date.parse(apres.generatedAt)));
  assert.equal(apres.fenetreJours, FENETRE_JOURS);
  assert.equal(apres.seuilLenteMs, SEUIL_LENTE_MS);
  assert.equal(apres.limiteClassement, LIMITE_CLASSEMENT);
});

test("les rendements viennent des runs et des événements des 30 jours", () => {
  const meilleures = new Map(apres.meilleures.map((r) => [r.id, r]));
  const pires = new Map(apres.pires.map((r) => [r.id, r]));
  assert.ok(apres.meilleures.length <= LIMITE_CLASSEMENT && apres.pires.length <= LIMITE_CLASSEMENT);

  const ok = meilleures.get(IDS.ok);
  assert.deepEqual(
    ok && { entrees: ok.entrees, evenements: ok.evenements, rendement: ok.rendement },
    { entrees: 10, evenements: 2, rendement: 0.2 },
  );
  const lente = meilleures.get(IDS.lente);
  assert.deepEqual(
    lente && { entrees: lente.entrees, evenements: lente.evenements, rendement: lente.rendement },
    { entrees: 10, evenements: 1, rendement: 0.1 },
  );
  const muette = pires.get(IDS.muette);
  assert.deepEqual(
    muette && { entrees: muette.entrees, evenements: muette.evenements, rendement: muette.rendement },
    { entrees: 40, evenements: 0, rendement: 0 },
    "40 entrées lues sans événement : zéro mesuré, pas « non mesurable »",
  );
  const rendementOk = apres.meilleures.find((r) => r.id === IDS.ok);
  const rendementLente = apres.pires.find((r) => r.id === IDS.lente);
  assert.ok((rendementOk?.rendement ?? 0) > (rendementLente?.rendement ?? 0));
});

test("l'évolution porte sept jours, y compris les zéro", () => {
  assert.equal(apres.evolution.length, FENETRE_JOURS);
  assert.deepEqual(
    apres.evolution.map((jour) => jour.date),
    [...apres.evolution.map((jour) => jour.date)].sort(),
    "jours ordonnés du plus ancien au plus récent",
  );
  assert.equal(
    apres.evolution.reduce((total, jour) => total + jour.evenements, 0)
      - avant.evolution.reduce((total, jour) => total + jour.evenements, 0),
    4,
    "quatre événements récents (la source muette n'en a produit aucun sur 7 j)",
  );
  assert.equal(
    apres.evolution.reduce((total, jour) => total + jour.entrees, 0)
      - avant.evolution.reduce((total, jour) => total + jour.entrees, 0),
    160,
    "seules les entrées des runs réussis sur 7 j comptent",
  );
  const dernier = apres.evolution[apres.evolution.length - 1]!;
  assert.equal(dernier.date, new Date().toISOString().slice(0, 10), "le dernier jour est aujourd'hui en UTC");
  assert.equal(dernier.sourcesActives - avant.evolution[avant.evolution.length - 1]!.sourcesActives, 3);
});

test("le temps de collecte cumule les runs terminés, tous statuts confondus", () => {
  assert.equal(apres.collecte.dureeTotaleMs - avant.collecte.dureeTotaleMs, 65_000);
  assert.equal(apres.collecte.runs - avant.collecte.runs, 5, "quatre runs ok et un run error dans les 7 jours");
});

test("une nouvelle collecte change les chiffres sans redémarrer la route", () => {
  assert.equal(apresRecolte.etats.dormante, apres.etats.dormante - 1);
  assert.equal(apresRecolte.etats.ok200, apres.etats.ok200 + 1);
  assert.equal(apresRecolte.collecte.dureeTotaleMs, apres.collecte.dureeTotaleMs + 4_000);
  assert.equal(apresRecolte.collecte.runs, apres.collecte.runs + 1);

  const dernier = apresRecolte.evolution[apresRecolte.evolution.length - 1]!;
  assert.equal(dernier.evenements - apres.evolution[apres.evolution.length - 1]!.evenements, 1);
  assert.equal(dernier.entrees - apres.evolution[apres.evolution.length - 1]!.entrees, 20);

  const reveil = apresRecolte.meilleures.find((r) => r.id === IDS.dormante);
  assert.ok(reveil, "la source réveillée doit entrer dans le classement mesuré");
  assert.equal(reveil.entrees, 25, "5 entrées il y a 10 j + 20 entrées aujourd'hui, sur 30 j");
  assert.equal(reveil.evenements, 1);
  assert.equal(reveil.rendement, 0.04);
});

test("l'application complète expose la route en /api et /api/v1", async () => {
  const complet = await buildApp();
  try {
    for (const url of ["/api/sources/dashboard", "/api/v1/sources/dashboard"]) {
      const res = await complet.inject({ method: "GET", url });
      assert.equal(res.statusCode, 200, `${url} : ${res.body}`);
      const corps = res.json<Dashboard>();
      assert.deepEqual(corps.etats, apresRecolte.etats, `${url} : mêmes états mesurés`);
      assert.equal(corps.collecte.dureeTotaleMs, apresRecolte.collecte.dureeTotaleMs);
      assert.equal(corps.totalSources, apresRecolte.totalSources);
    }
  } finally {
    await complet.close();
  }
});
