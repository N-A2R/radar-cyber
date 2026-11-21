/**
 * Export CSV du journal de revue : garde admin, en-têtes et une ligne par
 * décision. Le journal étant append-only, ses lignes ne se suppriment pas :
 * la base de test jetable est détruite par le runner en fin de suite.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { closePools, query } from "../src/db.js";
import journalRoute from "../src/routes/journal.js";

const TAG = `csvexp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE = `${TAG}-source`;
const ADMIN_EMAIL = `admin-${TAG}@export.test`;
const LECTEUR_EMAIL = `lecteur-${TAG}@export.test`;
const ADMIN_TOKEN = `tok-admin-${TAG}`;
const LECTEUR_TOKEN = `tok-lecteur-${TAG}`;
const URL_EXPORT = "/api/journal/review/export.csv";

let app: FastifyInstance;

async function session(email: string, role: string, token: string): Promise<void> {
  const r = await query<{ id: number }>(
    "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x',$2) RETURNING id",
    [email, role],
  );
  await query(
    "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
    [hashSessionToken(token), Number(r.rows[0].id)],
  );
}

/** Parseur minimal : les raisons et indices peuvent contenir virgules et guillemets. */
function cellules(ligne: string): string[] {
  const valeurs: string[] = [];
  let courante = "";
  let entreGuillemets = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const caractere = ligne[i];
    if (entreGuillemets) {
      if (caractere === '"' && ligne[i + 1] === '"') {
        courante += '"';
        i += 1;
      } else if (caractere === '"') {
        entreGuillemets = false;
      } else {
        courante += caractere;
      }
    } else if (caractere === '"') {
      entreGuillemets = true;
    } else if (caractere === ",") {
      valeurs.push(courante);
      courante = "";
    } else {
      courante += caractere;
    }
  }
  valeurs.push(courante);
  return valeurs;
}

before(async () => {
  await session(ADMIN_EMAIL, "admin", ADMIN_TOKEN);
  await session(LECTEUR_EMAIL, "lecteur", LECTEUR_TOKEN);
  app = Fastify();
  await app.register(journalRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  for (const token of [ADMIN_TOKEN, LECTEUR_TOKEN]) {
    await query("DELETE FROM app_session WHERE token=$1", [hashSessionToken(token)]);
  }
  for (const email of [ADMIN_EMAIL, LECTEUR_EMAIL]) {
    await query("DELETE FROM app_user WHERE email=$1", [email]);
  }
  await query("DELETE FROM quarantine_raw WHERE source=$1", [SOURCE]);
  await closePools();
});

test("export : réservé aux admins", async () => {
  const anonyme = await app.inject({ method: "GET", url: URL_EXPORT });
  assert.equal(anonyme.statusCode, 401);
  const lecteur = await app.inject({
    method: "GET", url: URL_EXPORT,
    headers: { authorization: `Bearer ${LECTEUR_TOKEN}` },
  });
  assert.equal(lecteur.statusCode, 403);
});

test("export : trois décisions en base donnent l'en-tête et trois lignes", async () => {
  const avant = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM journal WHERE kind='review.decided'",
  );
  const deja = Number(avant.rows[0]?.n ?? 0);
  const cas: Array<{
    indice: string; decision: string; raison: string; orgId: number | null; id?: number;
  }> = [
    { indice: `${TAG}.example`, decision: "accepter", raison: "domaine confirmé", orgId: 101 },
    { indice: `Autre ${TAG}`, decision: "refuser", raison: "hors périmètre", orgId: null },
    { indice: `Indice ${TAG}, "spécial"`, decision: "creer", raison: `motif, "cité"`, orgId: 102 },
  ];

  for (const c of cas) {
    const hash = createHash("sha256").update(`${TAG}-${c.decision}`).digest("hex");
    const r = await query<{ id: number }>(
      `INSERT INTO quarantine_raw
         (source, source_url, groupe, org_hint, claimed_at, extracted, tlp, content_hash, status)
       VALUES ($1,$2,'lockbit3',$3,now(),'{}'::jsonb,'RED',$4,'pending') RETURNING id`,
      [SOURCE, `https://exemple.test/${hash.slice(0, 10)}`, c.indice, hash],
    );
    c.id = Number(r.rows[0].id);
    await query(
      `INSERT INTO journal (kind, subject, summary, actor, payload)
       VALUES ('review.decided', $1, $2, $3, $4::jsonb)`,
      [
        `quarantine:${c.id}`,
        `décision ${c.decision} ${TAG}`,
        `humain:${ADMIN_EMAIL}`,
        JSON.stringify({
          decision: c.decision,
          action: c.decision === "refuser" ? "reject" : "promote",
          reason: c.raison,
          orgId: c.orgId,
          quarantineId: c.id,
        }),
      ],
    );
  }

  const res = await app.inject({
    method: "GET", url: URL_EXPORT,
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.match(String(res.headers["content-type"]), /^text\/csv/);
  assert.equal(res.headers["content-disposition"], 'attachment; filename="journal-review.csv"');

  const lignes = res.body.replace(/\r?\n$/, "").split(/\r?\n/);
  assert.equal(lignes[0], "date,acteur,decision,indice,org_id,raison,quarantine_id");
  assert.equal(lignes.length, deja + 3 + 1, `corps reçu : ${res.body}`);

  const parQuarantine = new Map<string, string[]>();
  for (const ligne of lignes.slice(1)) {
    const cellule = cellules(ligne);
    if (cellule.length === 7) parQuarantine.set(cellule[6], cellule);
  }
  assert.equal(parQuarantine.size, deja + 3);
  for (const c of cas) {
    const ligne = parQuarantine.get(String(c.id));
    assert.ok(ligne, `ligne manquante pour la quarantaine ${c.id}`);
    assert.match(ligne[0], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(ligne[1], `humain:${ADMIN_EMAIL}`);
    assert.equal(ligne[2], c.decision);
    assert.equal(ligne[3], c.indice);
    assert.equal(ligne[4], String(c.orgId ?? ""));
    assert.equal(ligne[5], c.raison);
    assert.equal(ligne[6], String(c.id));
  }
});
