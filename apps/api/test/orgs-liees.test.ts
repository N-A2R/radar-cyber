/**
 * GET /api/orgs/liees : appel authentifié réel et comparaison des quatre
 * comptes à des requêtes SQL indépendantes, sur la base de test du port 5433.
 *
 * Rejouer les chiffres de la base `radar` (lecture seule) :
 *   PGPASSWORD=radar psql -h localhost -p 5433 -U radar -d radar -c "
 *   SELECT (SELECT count(DISTINCT org_id)::int FROM event WHERE org_id IS NOT NULL
 *             AND COALESCE(observed_at, collected_at) >= now() - interval '7 days') AS semaine,
 *          (SELECT count(*)::int FROM quarantine_raw WHERE promoted=true) AS total,
 *          (SELECT count(*)::int FROM quarantine_raw WHERE kind='claim' AND status='pending'
 *             AND promoted=false AND org_hint IS NOT NULL AND btrim(org_hint) <> '') AS en_attente,
 *          (SELECT count(DISTINCT subject)::int FROM journal WHERE kind='review.decided') AS examinees;"
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { closePools, query } from "../src/db.js";
import authRoute from "../src/routes/auth.js";
import orgsLieesRoute from "../src/routes/orgs-liees.js";

const TAG = `liees${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const EMAIL = `${TAG}@orgs-liees.test`;
const TOKEN = `tok-${TAG}`;
const auth = { authorization: `Bearer ${TOKEN}` };

let app: FastifyInstance;
let orgIds: number[] = [];

before(async () => {
  const user = await query<{ id: number }>(
    "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','lecteur') RETURNING id",
    [EMAIL],
  );
  await query(
    "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
    [hashSessionToken(TOKEN), user.rows[0].id],
  );

  const orgs = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, city, dept, status)
     VALUES ($1,$2,'entreprise','Bordeaux','33','confirme'),
            ($3,$4,'entreprise','Angoulême','16','confirme'),
            ($5,$6,'entreprise','Lille','59','confirme')
     RETURNING id`,
    [`Org liées ${TAG} A`, `${TAG}-a`, `Org liées ${TAG} B`, `${TAG}-b`, `Org liées ${TAG} C`, `${TAG}-c`],
  );
  orgIds = orgs.rows.map((r) => Number(r.id));

  // Deux organisations dans les 7 jours, une hors fenêtre (doit être ignorée).
  for (const [i, when] of [orgIds[0], orgIds[1]].entries()) {
    await query(
      `INSERT INTO event (dedup_key, family, assertion_type, title, severity, source_id, org_id, observed_at, source_url, evidence)
       VALUES ($1,'cti','mention',$2,2,'ransomlook',$3, now() - ($4 || ' days')::interval,'https://example.invalid/event','{"run_id":"1"}'::jsonb)`,
      [`${TAG}-event-${i}`, `Événement de test ${i}`, when, i === 0 ? "2" : "1"],
    );
  }
  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, severity, source_id, org_id, observed_at, source_url, evidence)
     VALUES ($1,'cti','mention','Événement ancien',2,'ransomlook',$2, now() - interval '30 days','https://example.invalid/event','{"run_id":"1"}'::jsonb)`,
    [`${TAG}-event-old`, orgIds[2]],
  );

  // Revendications : une en attente comptée, deux exclues, une promue.
  for (const [i, hint, status, promoted] of [
    [1, `${TAG} HINT`, "pending", false],
    [2, "   ", "pending", false],
    [3, `${TAG} REJETEE`, "rejected", false],
    [4, `${TAG} PROMUE`, "promoted", true],
  ] as const) {
    const hash = createHash("sha256").update(`${TAG}-claim-${i}`).digest("hex");
    await query(
      `INSERT INTO quarantine_raw
         (source, source_url, groupe, org_hint, tlp, content_hash, status, promoted,
          promoted_at, promoted_by)
       VALUES ($1,$2,'lockbit3',$3,'RED',$4,$5,$6,$7,$8)`,
      [
        `${TAG}-source`, `https://exemple.test/${hash.slice(0, 8)}`, hint,
        hash, status, promoted,
        promoted ? new Date().toISOString() : null,
        promoted ? "test" : null,
      ],
    );
  }

  for (const suffix of ["a", "b"]) {
    await query(
      `INSERT INTO journal (kind, subject, summary, payload, actor)
       VALUES ('review.decided',$1,'décision de test','{}'::jsonb,'test')`,
      [`${TAG}:${suffix}`],
    );
  }

  app = Fastify();
  await app.register(authRoute, { prefix: "/api" });
  await app.register(orgsLieesRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  // Le journal est append-only : ses sujets restent préfixés par TAG, la base
  // de test est détruite à la fin de la suite.
  await query("DELETE FROM event WHERE dedup_key LIKE $1", [`${TAG}-event-%`]);
  await query("DELETE FROM quarantine_raw WHERE source=$1", [`${TAG}-source`]);
  await query("DELETE FROM org WHERE id = ANY($1::int[])", [orgIds]);
  await query("DELETE FROM app_session WHERE token=$1", [hashSessionToken(TOKEN)]);
  await query("DELETE FROM app_user WHERE email=$1", [EMAIL]);
  await closePools();
});

/** Comptes attendus calculés à part, directement en SQL. */
async function attenduSql() {
  const [n, depts] = await Promise.all([
    query<Record<string, number>>(
      `SELECT
         (SELECT count(DISTINCT org_id)::int FROM event WHERE org_id IS NOT NULL
            AND COALESCE(observed_at, collected_at) >= now() - interval '7 days') AS semaine,
         (SELECT count(*)::int FROM quarantine_raw WHERE promoted=true) AS total,
         (SELECT count(*)::int FROM quarantine_raw WHERE kind='claim' AND status='pending'
            AND promoted=false AND org_hint IS NOT NULL AND btrim(org_hint) <> '') AS "enAttente",
         (SELECT count(DISTINCT subject)::int FROM journal WHERE kind='review.decided') AS examinees`,
    ),
    query<{ dept: string; n: number }>(
      `SELECT COALESCE(NULLIF(btrim(o.dept), ''), 'non renseigné') AS dept,
              count(DISTINCT e.org_id)::int AS n
         FROM event e LEFT JOIN org o ON o.id = e.org_id
        WHERE e.org_id IS NOT NULL
          AND COALESCE(e.observed_at, e.collected_at) >= now() - interval '7 days'
        GROUP BY 1 ORDER BY n DESC, dept LIMIT 5`,
    ),
  ]);
  return {
    semaine: Number(n.rows[0].semaine),
    total: Number(n.rows[0].total),
    enAttente: Number(n.rows[0].enAttente),
    examinees: Number(n.rows[0].examinees),
    parDepartement: depts.rows.map((d) => ({ dept: d.dept, n: Number(d.n) })),
  };
}

test("la route exige un jeton valide", async () => {
  for (const headers of [{}, { authorization: "Bearer jeton-inexistant" }]) {
    const res = await app.inject({ method: "GET", url: "/api/orgs/liees", headers });
    assert.equal(res.statusCode, 401);
  }
});

test("les cinq comptes sont lus en base et comparés au SQL", async () => {
  const res = await app.inject({ method: "GET", url: "/api/orgs/liees", headers: auth });
  assert.equal(res.statusCode, 200);
  const body = res.json<{
    semaine: number; total: number; enAttente: number; examinees: number;
    parDepartement: { dept: string; n: number }[];
  }>();
  assert.deepEqual(body, await attenduSql());

  // Les lignes injectées par ce test sont bien présentes dans la mesure.
  assert.ok(body.semaine >= 2, "deux organisations récentes comptées");
  assert.ok(body.total >= 1, "revendication promue comptée");
  assert.ok(body.enAttente >= 1, "revendication en attente comptée");
  assert.ok(body.examinees >= 2, "deux décisions journalisées comptées");
  assert.ok(body.parDepartement.some((d) => d.dept === "33" && d.n >= 1));
  assert.ok(body.parDepartement.length <= 5);
  for (let i = 1; i < body.parDepartement.length; i++) {
    assert.ok(
      body.parDepartement[i - 1].n >= body.parDepartement[i].n,
      "classement décroissant",
    );
  }
});
