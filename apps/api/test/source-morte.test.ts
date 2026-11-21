/**
 * Route admin POST /api/sources/:id/morte — marquage, motif, journal.
 *
 * Isolation : source fabriquée et comptes jetables, préfixés. Le journal est
 * append-only, donc ses lignes ne se suppriment pas : le runner de tests
 * détruit la base jetable entière en fin de suite. `after` retire tout de même
 * les fixtures modifiables, pour rester propre si le fichier est lancé à part.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { closePools, query } from "../src/db.js";
import { hashSessionToken } from "../src/auth.js";
import sourcesRoute from "../src/routes/sources.js";

const TAG = `morte${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE_ID = `test-${TAG}`;
const ADMIN_EMAIL = `admin-${TAG}@source-test.local`;
const LECTEUR_EMAIL = `lecteur-${TAG}@source-test.local`;
const ADMIN_TOKEN = `tok-admin-${TAG}`;
const LECTEUR_TOKEN = `tok-lecteur-${TAG}`;
const RAISON = "HTTP 410 — flux retiré (test)";

async function freshApp() {
  const app = Fastify();
  await app.register(sourcesRoute, { prefix: "/api" });
  await app.ready();
  return app;
}

test("fixtures : une source fabriquée, un admin et un lecteur", async () => {
  await query(
    "INSERT INTO source (id, name, family, url) VALUES ($1,$2,'ransomware','https://exemple.test/source-morte')",
    [SOURCE_ID, `Source fabriquée ${TAG}`],
  );
  for (const [email, role] of [[ADMIN_EMAIL, "admin"], [LECTEUR_EMAIL, "lecteur"]] as const) {
    const r = await query<{ id: number }>(
      "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x',$2) RETURNING id",
      [email, role],
    );
    const token = role === "admin" ? ADMIN_TOKEN : LECTEUR_TOKEN;
    await query(
      "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
      [hashSessionToken(token), Number(r.rows[0].id)],
    );
  }
});

test("accès admin et raison obligatoire", async () => {
  const app = await freshApp();
  try {
    const noToken = await app.inject({
      method: "POST", url: `/api/sources/${SOURCE_ID}/morte`, payload: { raison: RAISON },
    });
    assert.equal(noToken.statusCode, 401, "sans jeton : refusé");

    const lecteur = await app.inject({
      method: "POST", url: `/api/sources/${SOURCE_ID}/morte`,
      headers: { authorization: `Bearer ${LECTEUR_TOKEN}` }, payload: { raison: RAISON },
    });
    assert.equal(lecteur.statusCode, 403, "un lecteur ne peut pas déclarer une source morte");

    for (const payload of [{}, { raison: "   " }]) {
      const res = await app.inject({
        method: "POST", url: `/api/sources/${SOURCE_ID}/morte`,
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` }, payload,
      });
      assert.equal(res.statusCode, 400, "la raison est obligatoire");
    }

    const introuvable = await app.inject({
      method: "POST", url: "/api/sources/source-inexistante-test/morte",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` }, payload: { raison: RAISON },
    });
    assert.equal(introuvable.statusCode, 404, "source inexistante : 404, sans journal");

    const apres = await query<{ statut: string }>(
      "SELECT statut FROM source WHERE id = $1", [SOURCE_ID],
    );
    assert.equal(apres.rows[0]?.statut, "active", "aucun appel invalide ne modifie la source");
    const traces = await query(
      "SELECT id FROM journal WHERE subject = $1 AND kind = 'source.changed'", [SOURCE_ID],
    );
    assert.equal(traces.rows.length, 0, "aucun appel invalide n'écrit dans le journal");
  } finally {
    await app.close();
  }
});

test("marquage : statut, motif, désactivation, journal et aucune suppression", async () => {
  const avant = await query<{ n: number }>("SELECT count(*)::int AS n FROM source");
  const app = await freshApp();
  try {
    const res = await app.inject({
      method: "POST", url: `/api/sources/${SOURCE_ID}/morte`,
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` }, payload: { raison: RAISON },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      id: SOURCE_ID, statut: "morte", derniereErreur: RAISON,
      enabled: false, journalise: true,
    });

    const source = await query<{
      statut: string; derniere_erreur: string | null; enabled: boolean; disabled_reason: string | null;
    }>(
      "SELECT statut, derniere_erreur, enabled, disabled_reason FROM source WHERE id = $1", [SOURCE_ID],
    );
    assert.equal(source.rows[0]?.statut, "morte");
    assert.equal(source.rows[0]?.derniere_erreur, RAISON);
    assert.equal(source.rows[0]?.enabled, false, "une source morte ne doit plus être collectée");
    assert.equal(source.rows[0]?.disabled_reason, RAISON);

    const apres = await query<{ n: number }>("SELECT count(*)::int AS n FROM source");
    assert.equal(apres.rows[0]?.n, avant.rows[0]?.n, "aucune ligne supprimée");

    const journal = await query<{
      summary: string; actor: string; payload: Record<string, unknown>;
    }>(
      `SELECT summary, actor, payload FROM journal
        WHERE kind = 'source.changed' AND subject = $1
          AND payload->>'raison' = $2 ORDER BY id DESC LIMIT 1`,
      [SOURCE_ID, RAISON],
    );
    assert.equal(journal.rows.length, 1, "un fait source.changed porte la raison");
    assert.equal(journal.rows[0]?.actor, `humain:${ADMIN_EMAIL}`);
    assert.equal(journal.rows[0]?.payload.transition, "morte");
    assert.match(journal.rows[0]?.summary ?? "", new RegExp(RAISON.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const liste = await app.inject({ method: "GET", url: "/api/sources" });
    const ligne = liste.json().find((s: { id: string }) => s.id === SOURCE_ID);
    assert.equal(ligne?.statut, "morte", "le statut est exposé par GET /sources");
    assert.equal(ligne?.derniereErreur, RAISON);
  } finally {
    await app.close();
  }
});

after(async () => {
  await query("DELETE FROM source WHERE id = $1", [SOURCE_ID]).catch(() => {});
  await query("DELETE FROM app_session WHERE user_id IN (SELECT id FROM app_user WHERE email = ANY($1))", [[ADMIN_EMAIL, LECTEUR_EMAIL]]).catch(() => {});
  await query("DELETE FROM app_user WHERE email = ANY($1)", [[ADMIN_EMAIL, LECTEUR_EMAIL]]).catch(() => {});
  await closePools();
});
