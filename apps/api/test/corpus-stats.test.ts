/**
 * GET /api/corpus/stats — test d'intégration contre la base de test jetable.
 *
 * On mesure l'apport de fixtures typées (sources localisées / ambiguës,
 * organisation avec domaine, incidents anciens et récents, indicateur technique)
 * par différence avec l'état initial : la réponse doit rester vraie même si la
 * base de test contient déjà des sources et des événements de migration.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import corpusRoute from "../src/routes/corpus-stats.js";

const TAG = `cs${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const IDS = {
  localisee: `${TAG}-47`,
  ambigue: `${TAG}-ambig`,
};
const ORG_SLUG = `${TAG}-org`;
const DEDUP = {
  recentConfirme: `${TAG}:recent-confirmed`,
  recentRevendique: `${TAG}:recent-claim`,
  ancien: `${TAG}:old-incident`,
  indicateur: `${TAG}:recent-indicator`,
};
const ALL_IDS = Object.values(IDS);
const ALL_DEDUP = Object.values(DEDUP);

type CorpusResponse = {
  generatedAt: string;
  totals: { sources: number; sourcesLocalised: number; organisations: number; incidents: number };
  byDepartment: { department: string; label: string; total: number; families: Record<string, number> }[];
  domainCoverage: { withDomain: number; organisations: number; percent: number | null };
  sinceLastReport: { newEvents: number; previousEvents: number; change: number; percentChange: number | null; windowHours: number };
  recentIncidents: { id: string; title: string; type: string; sourceName: string; sourceUrl: string | null; organisation: string | null; department: string | null; date: string | null }[];
};

let app: FastifyInstance;
let avant: CorpusResponse;
let apres: CorpusResponse;
let orgId: number;

async function lire(): Promise<CorpusResponse> {
  const res = await app.inject({ method: "GET", url: "/api/corpus/stats" });
  assert.equal(res.statusCode, 200, res.body);
  return res.json<CorpusResponse>();
}

before(async () => {
  app = Fastify();
  await app.register(corpusRoute, { prefix: "/api" });
  await app.ready();
  avant = await lire();

  await query(
    `INSERT INTO source (id, name, family, url, enabled, description)
     VALUES ($1,$2,'presse',$3,true,'Source de test localisée explicitement Lot-et-Garonne'),
            ($4,$5,'cti',$6,true,'Source de test Corrèze et Creuse : deux départements candidats')`,
    [
      IDS.localisee, `Sud Ouest Lot-et-Garonne test ${TAG}`, `https://example.invalid/${TAG}/47`,
      IDS.ambigue, `La Montagne Corrèze et Creuse test ${TAG}`, `https://example.invalid/${TAG}/ambig`,
    ],
  );

  const org = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, domain)
     VALUES ($1,$2,'entreprise','47',$3) RETURNING id`,
    [`Organisation corpus ${TAG}`, ORG_SLUG, `${TAG}.example`],
  );
  orgId = Number(org.rows[0].id);

  // Deux incidents récents (dont un sans organisation et sans URL de preuve),
  // un incident vieux de trois jours, et un indicateur technique récent qui ne
  // doit pas être compté comme incident (mais bien comme événement ingéré).
  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, collected_at, severity, source_id, source_url, org_id)
     VALUES ($1,'presse','confirmed_incident','Incident récent avec preuve', now() - interval '1 hour', now() - interval '1 hour', 3, $5, 'https://example.invalid/preuve', $8),
            ($2,'cti','third_party_claim','Revendication récente sans preuve', now() - interval '2 hours', now() - interval '2 hours', 3, $6, NULL, NULL),
            ($3,'presse','confirmed_incident','Incident ancien', now() - interval '3 days', now() - interval '3 days', 3, $5, NULL, $8),
            ($4,'vuln','technical_indicator','Indicateur technique récent', now() - interval '30 minutes', now() - interval '30 minutes', 2, $7, NULL, NULL)`,
    [
      DEDUP.recentConfirme, DEDUP.recentRevendique, DEDUP.ancien, DEDUP.indicateur,
      IDS.localisee, IDS.ambigue, "ransomlook", orgId,
    ],
  );
  apres = await lire();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM event WHERE dedup_key = ANY($1)", [ALL_DEDUP]);
  await query("DELETE FROM source WHERE id = ANY($1)", [ALL_IDS]);
  await query("DELETE FROM org WHERE id = $1", [orgId]);
  await closePools();
});

test("réponse publique : forme complète et horodatage mesuré", () => {
  assert.ok(Number.isFinite(Date.parse(apres.generatedAt)), apres.generatedAt);
  assert.equal(apres.sinceLastReport.windowHours, 24);
  assert.ok(apres.totals.sources > 0);
  assert.ok(apres.totals.incidents > 0);
  assert.equal(apres.recentIncidents.length, Math.min(20, apres.totals.incidents));
});

test("sources : barres empilées par département et famille, avec un bucket explicite pour l'ambiguïté", () => {
  const localise = apres.byDepartment.find((d) => d.department === "47");
  assert.ok(localise, "le 47 doit apparaître");
  assert.equal(localise!.label, "Lot-et-Garonne");
  assert.equal(localise!.families.presse - (avant.byDepartment.find((d) => d.department === "47")?.families.presse ?? 0), 1);
  assert.equal(localise!.total, Object.values(localise!.families).reduce((a, b) => a + b, 0));

  const ambigu = apres.byDepartment.find((d) => d.department === "");
  assert.ok(ambigu, "les sources sans département inférable ne doivent pas disparaître");
  assert.equal(ambigu!.label, "Not localised");
  assert.equal(
    apres.totals.sourcesLocalised,
    apres.totals.sources - Object.values(ambigu!.families).reduce((a, b) => a + b, 0),
  );
  assert.equal(apres.byDepartment.reduce((sum, d) => sum + d.total, 0), apres.totals.sources);
});

test("domaines : jauge mesurée sur le référentiel, pas sur le corpus", () => {
  assert.equal(apres.domainCoverage.organisations - avant.domainCoverage.organisations, 1);
  assert.equal(apres.domainCoverage.withDomain - avant.domainCoverage.withDomain, 1);
  assert.equal(apres.totals.organisations, apres.domainCoverage.organisations);
  assert.ok(apres.domainCoverage.percent !== null);
  assert.ok(Math.abs(
    apres.domainCoverage.percent! - (apres.domainCoverage.withDomain / apres.domainCoverage.organisations) * 100,
  ) < 0.001);
});

test("progression : +3 événements ingérés sur 24 h, comparés aux 24 h précédentes", () => {
  assert.equal(apres.sinceLastReport.newEvents - avant.sinceLastReport.newEvents, 3);
  assert.equal(apres.sinceLastReport.previousEvents, avant.sinceLastReport.previousEvents);
  assert.equal(apres.sinceLastReport.change - avant.sinceLastReport.change, 3);
  assert.equal(apres.sinceLastReport.comparedTo, "previous 24 hours");
});

test("incidents : seules les assertions d'incident comptent, pas les indicateurs", () => {
  assert.equal(apres.totals.incidents - avant.totals.incidents, 3);
  const titres = apres.recentIncidents.map((i) => i.title);
  assert.ok(titres.includes("Incident récent avec preuve"));
  assert.ok(titres.includes("Revendication récente sans preuve"));
  assert.ok(!titres.includes("Indicateur technique récent"));
  assert.ok(apres.recentIncidents.every(
    (i) => i.type === "confirmed_incident" || i.type === "third_party_claim",
  ));
});

test("20 derniers incidents : source cliquable ou repli explicite sur l'accueil de la source", () => {
  const avecPreuve = apres.recentIncidents.find((i) => i.title === "Incident récent avec preuve");
  assert.ok(avecPreuve);
  assert.equal(avecPreuve!.sourceUrl, "https://example.invalid/preuve");
  assert.equal(avecPreuve!.organisation, `Organisation corpus ${TAG}`);
  assert.equal(avecPreuve!.department, "47");
  assert.match(avecPreuve!.date!, /^\d{4}-\d{2}-\d{2}$/);

  const sansPreuve = apres.recentIncidents.find((i) => i.title === "Revendication récente sans preuve");
  assert.ok(sansPreuve);
  assert.equal(sansPreuve!.sourceUrl, `https://example.invalid/${TAG}/ambig`);
  assert.equal(sansPreuve!.organisation, null);

  const dates = apres.recentIncidents.map((i) => i.date!);
  assert.deepEqual(dates, [...dates].sort().reverse(), "les incidents sont triés du plus récent au plus ancien");
});
