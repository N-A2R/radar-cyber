/**
 * `/health/causes` — la répartition doit venir des runs réellement stockés,
 * pas d'un tableau codé en dur. Chaque compte est comparé à une requête
 * indépendante dans la base de test jetable ; les exemples sont des noms de
 * sources insérés ici, jamais des valeurs inventées.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import healthCausesRoute, { type HealthCauses } from "../src/routes/health-causes.js";

const TAG = `hc${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const IDS = {
  code404: `${TAG}-404`,
  code403a: `${TAG}-403a`,
  code403b: `${TAG}-403b`,
  vide: `${TAG}-vide`,
  muette: `${TAG}-muette`,
  active: `${TAG}-active`,
};
const ALL_IDS = Object.values(IDS);
let app: FastifyInstance;

before(async () => {
  for (const [key, id] of Object.entries(IDS)) {
    await query(
      `INSERT INTO source (id, name, family, url, enabled)
       VALUES ($1,$2,'cti','https://exemple.invalid/${key}',true)`,
      [id, `${key} (test ${TAG})`],
    );
  }
  await query(
    `INSERT INTO collector_run (source_id, finished_at, started_at, status, error, items_in)
     VALUES ($1, now(), now(), 'error', 'HTTP 404 pour https://exemple.invalid/404', 0),
            ($2, now(), now(), 'error', 'Source blocked (403) for https://exemple.invalid/a', 0),
            ($3, now(), now(), 'error', 'Source blocked (403) for https://exemple.invalid/b', 0),
            ($3, now(), now(), 'error', 'Source blocked (403) for https://exemple.invalid/b', 0),
            ($4, now(), now(), 'ok', NULL, 0),
            ($5, now(), now(), 'error', 'Source blocked (403) for https://exemple.invalid/active', 0)`,
    [IDS.code404, IDS.code403a, IDS.code403b, IDS.vide, IDS.active],
  );
  // Une source avec un fait récent n'est pas rouge : son erreur 403 ne doit
  // pas apparaître dans la répartition des sources rouges.
  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, severity, source_id)
     VALUES ($1,'cti','ambient_signal','Fait récent (test)',now(),2,$2)`,
    [`${TAG}:evenement`, IDS.active],
  );

  app = Fastify();
  await app.register(healthCausesRoute);
  await app.ready();
});

after(async () => {
  await query("DELETE FROM event WHERE source_id = ANY($1)", [ALL_IDS]);
  await query("DELETE FROM collector_run WHERE source_id = ANY($1)", [ALL_IDS]);
  await query("DELETE FROM source WHERE id = ANY($1)", [ALL_IDS]);
  await app.close();
  await closePools();
});

async function lire(): Promise<HealthCauses> {
  const res = await app.inject({ method: "GET", url: "/health/causes" });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as HealthCauses;
}

async function entier(sql: string, params: unknown[] = []): Promise<number> {
  const r = await query<{ n: number }>(sql, params);
  return Number(r.rows[0]?.n ?? -1);
}

const ROUGES_SQL = `
  WITH rouges AS (
    SELECT s.id FROM source s
    LEFT JOIN (SELECT source_id, max(COALESCE(observed_at, collected_at)) AS dernier
                 FROM event GROUP BY source_id) e ON e.source_id = s.id
    WHERE e.dernier IS NULL OR e.dernier < now() - interval '7 days'
  )`;

test("la route porte les six causes, trois exemples au plus et le champ proposé", async () => {
  const b = await lire();
  assert.equal(b.ok, true);
  assert.ok(Date.parse(b.generatedAt) > 0);
  assert.deepEqual(b.causes.map((c) => c.code), ["404", "403", "5xx", "timeout", "parse", "vide"]);
  for (const c of b.causes) {
    assert.ok(Number.isInteger(c.sources) && c.sources >= 0, `entier attendu : ${c.code}`);
    assert.ok(c.exemples.length <= 3, `trois exemples au plus pour ${c.code}`);
    assert.ok(c.libelle.length > 0 && c.regle.length > 0);
    for (const ex of c.exemples) {
      assert.ok(ex.source.length > 0 && ex.detail.length > 0);
    }
  }
  assert.equal(b.stockage.causeStockee, false);
  assert.equal(b.stockage.champPropose.table, "collector_run");
  assert.ok(b.stockage.champPropose.colonne.includes("cause"));
  assert.ok(b.stockage.explication.includes("Aucune colonne"), "le manque de cause structurée est explicite");
});

test("les comptes et exemples viennent des runs stockés, pas d'une estimation", async () => {
  const b = await lire();
  const parCode = (code: string) => b.causes.find((c) => c.code === code)!;

  assert.equal(
    b.rouges,
    await entier(`${ROUGES_SQL} SELECT count(*)::int AS n FROM rouges`),
  );
  // Deux sources 403 (quatre runs) : les runs répétés ne comptent qu'une fois.
  assert.equal(
    parCode("403").sources,
    await entier(`${ROUGES_SQL}
      SELECT count(DISTINCT cr.source_id)::int AS n
        FROM rouges ro JOIN collector_run cr ON cr.source_id = ro.id
       WHERE cr.started_at >= now() - interval '30 days' AND cr.error ~ '403'`),
  );
  assert.equal(
    parCode("404").sources,
    await entier(`${ROUGES_SQL}
      SELECT count(DISTINCT cr.source_id)::int AS n
        FROM rouges ro JOIN collector_run cr ON cr.source_id = ro.id
       WHERE cr.started_at >= now() - interval '30 days' AND cr.error ~ '404'`),
  );
  assert.equal(
    parCode("vide").sources,
    await entier(`${ROUGES_SQL}
      SELECT count(DISTINCT cr.source_id)::int AS n
        FROM rouges ro JOIN collector_run cr ON cr.source_id = ro.id
       WHERE cr.started_at >= now() - interval '30 days'
         AND cr.status = 'ok' AND cr.items_in = 0`),
  );

  // Les exemples sont plafonnés à trois : on vérifie qu'ils sont réels,
  // pas qu'ils correspondent à nos fixtures (d'autres sources 403 existent).
  for (const ex of b.causes.flatMap((c) => c.exemples)) {
    assert.equal(
      await entier("SELECT count(*)::int AS n FROM source WHERE name = $1", [ex.source]),
      1,
      `exemple réel en base : ${ex.source}`,
    );
  }
  for (const c of b.causes.filter((c) => c.origine === "message_erreur")) {
    for (const ex of c.exemples) {
      assert.ok(
        (await entier(
          `SELECT count(*)::int AS n
             FROM collector_run cr JOIN source s ON s.id = cr.source_id
            WHERE s.name = $1 AND cr.error = $2`,
          [ex.source, ex.detail],
        )) > 0,
        `le détail de ${ex.source} est le message stocké`,
      );
    }
  }
  assert.ok(
    !b.causes.some((c) => c.exemples.some((e) => e.source.includes(IDS.active))),
    "la source verte n'est pas comptée",
  );
  assert.ok(
    !b.causes.some((c) => c.exemples.some((e) => e.source.includes(IDS.muette))),
    "la source sans trace n'est pas inventée dans une cause",
  );
});
