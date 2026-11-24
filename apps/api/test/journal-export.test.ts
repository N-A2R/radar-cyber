/**
 * CSV audit export: admin guard, Content-Disposition, one row per filtered
 * entry, and proof (raw payload) carried in the file. The journal is
 * append-only; the disposable test database is dropped by the runner.
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
const ENTETE = "date,kind,actor,decision,subject,reason,org_id,quarantine_id,evidence";

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

/** Minimal parser: reasons, subjects and evidence may contain commas and quotes. */
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

async function inject(url: string, token = ADMIN_TOKEN) {
  return app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });
}

/** Inserts a claim and returns its id, so the journal subject can point at it. */
async function quarantine(indice: string): Promise<number> {
  const hash = createHash("sha256").update(`${TAG}-${indice}`).digest("hex");
  const r = await query<{ id: number }>(
    `INSERT INTO quarantine_raw
       (source, source_url, groupe, org_hint, claimed_at, extracted, tlp, content_hash, status)
     VALUES ($1,$2,'lockbit3',$3,now(),'{}'::jsonb,'RED',$4,'pending') RETURNING id`,
    [SOURCE, `https://exemple.test/${hash.slice(0, 10)}`, indice, hash],
  );
  return Number(r.rows[0].id);
}

async function journal(kind: string, subject: string, actor: string, payload: unknown): Promise<void> {
  await query(
    `INSERT INTO journal (kind, subject, summary, actor, payload)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [kind, subject, `summary ${TAG}`, actor, JSON.stringify(payload)],
  );
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

test("export: admins only", async () => {
  const anonyme = await app.inject({ method: "GET", url: URL_EXPORT });
  assert.equal(anonyme.statusCode, 401);
  const lecteur = await inject(URL_EXPORT, LECTEUR_TOKEN);
  assert.equal(lecteur.statusCode, 403);
});

test("export: Content-Disposition, English header, one row per decision with its proof", async () => {
  const acteur = `humain:${ADMIN_EMAIL}`;
  const cas: Array<{
    indice: string; decision: string; raison: string; orgId: number | null; id: number;
  }> = [];
  for (const indice of [
    `${TAG}.example`,
    `Autre ${TAG}`,
    `Indice ${TAG}, "spécial"`,
  ]) {
    const id = await quarantine(indice);
    const decision = id % 2 === 0 ? "accepter" : "refuser";
    const raison = id % 2 === 0 ? `domaine confirmé ${TAG}` : `motif, "cité" ${TAG}`;
    const orgId = id % 2 === 0 ? 101 : null;
    cas.push({ indice, decision, raison, orgId, id });
    await journal("review.decided", `quarantine:${id}`, acteur, {
      decision,
      action: decision === "refuser" ? "reject" : "promote",
      reason: raison,
      orgId,
      quarantineId: id,
    });
  }

  const res = await inject(`${URL_EXPORT}?acteur=${encodeURIComponent(TAG)}&kind=review`);
  assert.equal(res.statusCode, 200, res.body);
  assert.match(String(res.headers["content-type"]), /^text\/csv/);
  assert.equal(res.headers["content-disposition"], 'attachment; filename="journal-review.csv"');
  assert.equal(res.headers["cache-control"], "no-store");

  const lignes = res.body.replace(/\r?\n$/, "").split(/\r?\n/);
  assert.equal(lignes[0], ENTETE);
  assert.equal(lignes.length, cas.length + 1, `corps reçu : ${res.body}`);

  const parQuarantine = new Map<string, string[]>();
  for (const ligne of lignes.slice(1)) {
    const cellule = cellules(ligne);
    assert.equal(cellule.length, 9, ligne);
    parQuarantine.set(cellule[7], cellule);
  }
  assert.equal(parQuarantine.size, cas.length);
  for (const c of cas) {
    const ligne = parQuarantine.get(String(c.id));
    assert.ok(ligne, `ligne manquante pour la quarantaine ${c.id}`);
    assert.match(ligne[0], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(ligne[1], "review.decided");
    assert.equal(ligne[2], acteur);
    assert.equal(ligne[3], c.decision);
    assert.equal(ligne[4], c.indice);
    assert.equal(ligne[5], c.raison);
    assert.equal(ligne[6], String(c.orgId ?? ""));
    assert.equal(ligne[7], String(c.id));
    const evidence = JSON.parse(ligne[8]) as Record<string, unknown>;
    assert.deepEqual(evidence, {
      decision: c.decision,
      action: c.decision === "refuser" ? "reject" : "promote",
      reason: c.raison,
      orgId: c.orgId,
      quarantineId: c.id,
    }, `preuve exacte pour la quarantaine ${c.id}`);
  }
});

test("export: only the filtered entries are downloaded", async () => {
  const acteur = `humain:${ADMIN_EMAIL}`;
  const cible = `CIBLE-${TAG}`;
  const autre = `AUTRE-${TAG}`;
  const cibleId = await quarantine(`${cible}.org`);
  const autreId = await quarantine(`${autre}.org`);
  await journal("review.decided", `quarantine:${cibleId}`, acteur, {
    decision: "accepter", reason: cible, quarantineId: cibleId,
  });
  await journal("review.decided", `quarantine:${autreId}`, acteur, {
    decision: "refuser", reason: autre, quarantineId: autreId,
  });
  await journal("org.changed", `org:${cible}`, acteur, { reason: cible, orgId: 909 });

  const parType = await inject(`${URL_EXPORT}?acteur=${encodeURIComponent(TAG)}&kind=correction&q=${cible}`);
  assert.equal(parType.headers["content-disposition"], 'attachment; filename="journal-review.csv"');
  let corps = parType.body.replace(/\r?\n$/, "").split(/\r?\n/).slice(1).map(cellules);
  assert.equal(corps.length, 1);
  assert.equal(corps[0][1], "org.changed");

  const parRecherche = await inject(`${URL_EXPORT}?acteur=${encodeURIComponent(TAG)}&kind=review&q=${cible}`);
  corps = parRecherche.body.replace(/\r?\n$/, "").split(/\r?\n/).slice(1).map(cellules);
  assert.equal(corps.length, 1);
  assert.equal(corps[0][3], "accepter");

  const parPeriode = await inject(
    `${URL_EXPORT}?acteur=${encodeURIComponent(TAG)}&kind=review&du=2999-01-01&au=2999-01-02`,
  );
  corps = parPeriode.body.replace(/\r?\n$/, "").split(/\r?\n/).slice(1).map(cellules);
  assert.equal(corps.length, 0, parPeriode.body);
  assert.equal(parPeriode.headers["content-disposition"], 'attachment; filename="journal-review.csv"');

  const invalide = await inject(`${URL_EXPORT}?du=21-11-2026`);
  assert.equal(invalide.statusCode, 400);
});
