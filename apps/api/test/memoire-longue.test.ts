/**
 * Chantier 2 — mémoire longue : les trois preuves du critère de sortie
 * (`docs/chantiers.md` §2), sur la vraie base de test isolée.
 *
 * 1. un fait vieux de 100 jours quitte `event` mais reste dans les deux
 *    archives (résumé pour la mesure, copie intégrale pour l'audit) ;
 * 2. `GET /api/history` répond sur 12 mois glissants et retrouve ce fait
 *    uniquement depuis l'archive, filtre `org` à l'appui ;
 * 3. `scripts/rejeu-periode.mts` rejoue la fenêtre : le moteur courant choisit
 *    le même rattachement, la projection est recréée à l'identique, et un
 *    second rejeu de la même période n'écrit rien.
 *
 * Le fait porte un `dedup_key` et une horloge uniques : le test ne compte que
 * ses propres lignes, même si d'autres fichiers ont archivé les leurs.
 */
import { test, before, after, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import { consigner, MOTEURS } from "../src/journal/index.js";
import { runRetention } from "../src/maintenance/retention.js";
import historyRoute from "../src/routes/history.js";

const execFileAsync = promisify(execFile);
const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const REJEU = fileURLToPath(new URL("../../../scripts/rejeu-periode.mts", import.meta.url));

const TAG = `ml${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const CLE = `${TAG}:cent-jours`;
const SOURCE = `${TAG}-source`;
const ORG_NOM = `Fonderie Memorielle ${TAG.toUpperCase()}`;
const AGE_JOURS = 100;
const OBSERVE = new Date(Date.now() - AGE_JOURS * 86_400_000);
/** Fenêtre d'une minute : le rejeu ne lit que notre archive, pas celle des autres tests. */
const DEPUIS = new Date(OBSERVE.getTime() - 60_000).toISOString();
const JUSQUA = new Date(OBSERVE.getTime() + 60_000).toISOString();
const MAINTENANT = new Date();
const DEBUT = new Date(Date.UTC(MAINTENANT.getUTCFullYear(), MAINTENANT.getUTCMonth() - 11, 1))
  .toISOString().slice(0, 10);
const FIN = new Date(Date.UTC(MAINTENANT.getUTCFullYear(), MAINTENANT.getUTCMonth() + 1, 0))
  .toISOString().slice(0, 10);
const MOIS_ATTENDU = OBSERVE.toISOString().slice(0, 7);

let app: FastifyInstance | undefined;
let orgId: number;

before(async () => {
  app = Fastify();
  await app.register(historyRoute, { prefix: "/api" });
  await app.ready();

  await query("INSERT INTO source (id, name, family, url) VALUES ($1,$2,'cti',$3)", [
    SOURCE, `Source mémoire longue ${TAG}`, `https://exemple.invalid/${TAG}`,
  ]);
  const org = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,'entreprise','33') RETURNING id",
    [ORG_NOM, `${TAG}-org`],
  );
  orgId = Number(org.rows[0].id);
  await query("INSERT INTO org_alias (org_id, alias, source, status) VALUES ($1,$2,'test','active')", [
    orgId, ORG_NOM,
  ]);

  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at,
                        severity, confidence, source_id, org_id, evidence)
     VALUES ($1,'ransomware','confirmed_incident',$2,$3,$4,2,'C3',$5,$6,$7)`,
    [CLE, `Incident ${ORG_NOM}`, `Résumé ${TAG}`, OBSERVE.toISOString(), SOURCE, orgId,
      JSON.stringify({ rattachement: { moteur: MOTEURS.rattachement, motif: "alias-distinctif", alias: ORG_NOM, confiance: 0.9 } })],
  );

  // Le rattachement d'époque est un fait daté du journal : la rejeu doit
  // retrouver exactement cette décision, pas seulement la valeur archivée.
  const fait = await consigner({
    kind: "event.rattachement",
    subject: CLE,
    summary: `rattachement d'époque — ${ORG_NOM}`,
    actor: `moteur:${MOTEURS.rattachement}`,
    payload: { orgId, moteur: MOTEURS.rattachement, motif: "alias-distinctif", alias: ORG_NOM, confiance: 0.9 },
    validAt: OBSERVE,
  });
  assert.equal(fait.ok, true);

  // La vraie rétention : archive puis purge de tout ce qui a plus de 90 jours.
  await runRetention(() => {}, { days: 90, tables: ["event"] });
});

after(async () => {
  if (app) await app.close();
  // Le journal est append-only : ses faits restent, comme en production.
  for (const table of ["event", "event_archive", "archive_event"]) {
    await query(`DELETE FROM ${table} WHERE dedup_key = $1`, [CLE]).catch(() => {});
  }
  await query("DELETE FROM org WHERE id = $1", [orgId]).catch(() => {});
  await query("DELETE FROM source WHERE id = $1", [SOURCE]).catch(() => {});
  await closePools();
});

test("1 — le fait de 100 jours est archivé, pas supprimé", async (t: TestContext) => {
  const brut = await query<{ n: string }>("SELECT count(*)::text AS n FROM event WHERE dedup_key = $1", [CLE]);
  const resumes = await query<{ n: string; org: string | null }>(
    "SELECT count(*)::text AS n, max(org_id)::text AS org FROM event_archive WHERE dedup_key = $1", [CLE],
  );
  const complets = await query<{ n: string; titre: string | null }>(
    "SELECT count(*)::text AS n, max(title) AS titre FROM archive_event WHERE dedup_key = $1", [CLE],
  );

  assert.equal(Number(brut.rows[0].n), 0, "plus aucune ligne dans le brut après 100 jours");
  assert.equal(Number(resumes.rows[0].n), 1, "une ligne dans l'archive de mesure");
  assert.equal(Number(complets.rows[0].n), 1, "une copie intégrale dans l'archive d'audit");
  assert.equal(Number(resumes.rows[0].org), orgId, "le rattachement surviv à la purge dans l'archive");
  assert.equal(complets.rows[0].titre, `Incident ${ORG_NOM}`, "titre et preuves conservés");

  const age = (Date.now() - OBSERVE.getTime()) / 86_400_000;
  t.diagnostic(JSON.stringify({
    preuve: "archivage", ageJours: Math.round(age * 100) / 100, seuilJours: 90,
    brut: Number(brut.rows[0].n), eventArchive: Number(resumes.rows[0].n), archiveEvent: Number(complets.rows[0].n),
  }));
});

test("2 — /api/history retrouve le fait sur 12 mois glissants", async (t: TestContext) => {
  assert.ok(app, "serveur de test non initialisé");
  const res = await app.inject({
    method: "GET",
    url: `/api/history?from=${DEBUT}&to=${FIN}&org=${orgId}`,
  });
  assert.equal(res.statusCode, 200, res.body);
  const corps = res.json<{
    total: number; brut: number; archive: number;
    parMois: { mois: string; brut: number; archive: number; total: number }[];
  }>();

  assert.equal(corps.parMois.length, 12, "douze mois glissants répondent, pas uniquement 90 jours");
  assert.equal(corps.total, 1, "le fait centenaire est retrouvé");
  assert.equal(corps.archive, 1, "il vient de l'archive");
  assert.equal(corps.brut, 0, "il n'est plus dans le brut");
  const mois = corps.parMois.find((m) => m.mois === MOIS_ATTENDU);
  assert.equal(mois?.archive, 1, `le fait est compté dans ${MOIS_ATTENDU}`);
  assert.deepEqual(corps.parMois.map((m) => m.mois), corps.parMois.map((m) => m.mois).slice().sort());

  t.diagnostic(JSON.stringify({
    preuve: "historique", fenetreMois: corps.parMois.length, from: DEBUT, to: FIN,
    total: corps.total, brut: corps.brut, archive: corps.archive, mois: MOIS_ATTENDU,
  }));
});

test("3 — le rejeu de la période redonne le même rattachement", async (t: TestContext) => {
  const { stdout, stderr } = await execFileAsync(TSX, [
    REJEU, `--depuis=${DEPUIS}`, `--jusqu-a=${JUSQUA}`, "--mesurer-idempotence",
  ], { cwd: RACINE, env: process.env, timeout: 120_000 });
  const sortie = `${stdout}\n${stderr}`;

  assert.match(sortie, /Archives lues : 1 \(1 avec organisation archivée\)/, sortie);
  assert.match(sortie, /Rattachements : 1 identiques, 0 changés/, sortie);
  assert.match(sortie, /Écritures : 1 inséré\(s\), 0 mis à jour/, sortie);
  assert.match(sortie, /IDEMPOTENT : oui/, sortie);

  const proj = await query<{ org_id: number | null; evidence: { rejeu?: string; orgArchiveId?: number } }>(
    "SELECT org_id, evidence FROM event WHERE dedup_key = $1", [CLE],
  );
  assert.equal(proj.rows[0]?.org_id, orgId, "le rejeu recrée le même org_id");
  assert.equal(proj.rows[0]?.evidence.rejeu, "event_archive", "la projection recréée dit d'où elle vient");
  assert.equal(String(proj.rows[0]?.evidence.orgArchiveId), String(orgId), "l'ancien rattachement est conservé comme preuve");

  const journal = await query<{ org: string | null }>(
    `WITH dernier AS (
       SELECT DISTINCT ON (subject) subject, payload
         FROM journal
        WHERE subject = $1 AND kind IN ('event.rattachement', 'match.decided')
        ORDER BY subject, recorded_at DESC, id DESC
     )
     SELECT payload->>'orgId' AS org FROM dernier`,
    [CLE],
  );
  assert.equal(Number(journal.rows[0]?.org), orgId, "le dernier fait de journal reste le rattachement d'époque");

  const empreintes = [...sortie.matchAll(/Empreinte de la projection \(sha256\/16\) : ([0-9a-f]{16})/g)]
    .map((m) => m[1]);
  assert.equal(empreintes.length, 2, "deux rejeux consécutifs ont chacun leur empreinte");
  assert.equal(empreintes[0], empreintes[1], "les deux projections sont identiques");

  t.diagnostic(JSON.stringify({
    preuve: "rejeu", archivesLues: 1, identiques: 1, changes: 0,
    insertions: 1, misesAJour: 0, ecrituresSecondePasse: 0, idempotent: true,
    empreinteProjection: empreintes[0], orgId,
  }));
});
