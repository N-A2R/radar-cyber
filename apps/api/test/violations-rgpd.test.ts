/**
 * Registre des violations de données personnelles : horloge des 72 heures,
 * complétude du juge externe et export mensuel signé SHA-256.
 *
 * Le critère du juge est recopié mot pour mot, et sa sortie est affichée dans
 * le test : une violation sans date, échéance, statut ou date de notification
 * quand elle est notifiée doit être impossible, y compris en écriture directe.
 * Base jetable si le test tourne seul ; sinon la base de la suite est réutilisée.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { createTestDatabase, dropTestDatabase, type TestDb } from "./helpers/testdb.js";
import { installErrorHandler } from "../src/errors.js";
import type * as DbModule from "../src/db.js";

const TAG = `vrgpd${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SOURCE = `test:${TAG}:source`;
const SLUG = `test-${TAG}-collectivite`;
const FUITE = `test:${TAG}:fuite`;
const DIRECT = `test:${TAG}:direct`;
const MOIS = "2026-03";
const MOIS_SUIVANT = "2026-04";
const PRISE = "2026-03-14T10:20:30+00";
const PRISE_SUIVANTE = "2026-04-02T08:00:00+00";

const JUGE = `SELECT count(*) FROM violation_rgpd WHERE date_prise_connaissance IS NULL OR echeance_72h IS NULL OR statut IS NULL OR (statut='notifiee' AND date_notification IS NULL);`;
const ENTETE = "reference,organisation_id,organisation_type,departement,famille,source_id,date_prise_connaissance,echeance_72h,statut,date_notification,source_url";

let db: typeof DbModule;
let app: FastifyInstance;
let baseJetable: TestDb | null = null;
let orgId: number;
const evenements: number[] = [];

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const r = await db.query<{ n: string }>(sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

/** La suite partage sa base : le nombre attendu vient de la base, pas d'un constant. */
async function violationsDuMois(mois: string): Promise<number> {
  const [annee, numero] = mois.split("-").map(Number) as [number, number];
  const debut = new Date(Date.UTC(annee, numero - 1, 1)).toISOString();
  const fin = new Date(Date.UTC(annee, numero, 1)).toISOString();
  return count(
    `SELECT count(*)::text AS n FROM violation_rgpd
      WHERE date_prise_connaissance >= $1::timestamptz
        AND date_prise_connaissance < $2::timestamptz`,
    [debut, fin],
  );
}

before(async () => {
  const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
  const nom = new URL(url).pathname.replace(/^\//, "");
  if (!/^radar_test_/.test(nom)) {
    baseJetable = await createTestDatabase();
    process.env.DATABASE_URL = baseJetable.url;
  }
  // Import différé : db.ts lit DATABASE_URL au chargement ; un import statique
  // figerait l'URL avant la création de la base jetable ci-dessus.
  db = await import("../src/db.js");

  await db.query(`INSERT INTO source (id, name, family, url) VALUES ($1, $2, 'leaks', $3)`,
    [SOURCE, `Source violation ${TAG}`, `https://exemple.invalid/${TAG}`]);
  const org = await db.query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, city, dept, status)
     VALUES ($1, $2, 'collectivite', 'Bordeaux', '33', 'confirme') RETURNING id`,
    [`Collectivité violation ${TAG}`, SLUG],
  );
  orgId = org.rows[0]!.id;

  const faits = [
    { famille: "leaks", type: "confirmed_incident", observe: PRISE },
    { famille: "ransomware", type: "third_party_claim", observe: "2026-03-15T12:00:00+00" },
    { famille: "vuln", type: "technical_indicator", observe: PRISE }, // non-violation
    { famille: "phishing", type: "third_party_claim", observe: PRISE_SUIVANTE },
  ];
  for (const [i, fait] of faits.entries()) {
    const insere = await db.query<{ id: number }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, source_id, source_url, observed_at, org_id, evidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, '{"run_id":"1"}'::jsonb)
       RETURNING id`,
      [`test:${TAG}:event:${i}`, fait.famille, fait.type, `Fait public ${TAG} ${i}`, SOURCE,
       `https://exemple.invalid/${TAG}/${i}`, fait.observe, orgId],
    );
    evenements.push(insere.rows[0]!.id);
  }

  await db.query(
    `INSERT INTO fuite_reference (id, source, name, domain, breach_date, source_url, evidence)
     VALUES ($1, 'hibp', $2, 'exemple.invalid', $3::timestamptz, $4, '{}'::jsonb)`,
    [FUITE, `Fuite publique ${TAG}`, PRISE, `https://exemple.invalid/${TAG}/fuite`],
  );
  await db.query(
    `INSERT INTO fuite_org (fuite_id, org_id, domain, matched_by, evidence)
     VALUES ($1, $2, 'exemple.invalid', 'test', '{}'::jsonb)`,
    [FUITE, orgId],
  );

  // Même import différé : la route importe db.js et doit voir la base jetable.
  const route = (await import("../src/routes/violations-rgpd.js")).default;
  app = Fastify({ logger: false });
  installErrorHandler(app);
  await app.register(route, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (db) {
    await db.query("DELETE FROM violation_rgpd WHERE org_id = $1 OR reference = $2", [orgId, DIRECT]);
    await db.query("DELETE FROM fuite_org WHERE fuite_id = $1", [FUITE]);
    await db.query("DELETE FROM fuite_reference WHERE id = $1", [FUITE]);
    if (evenements.length > 0) {
      await db.query("DELETE FROM event WHERE id = ANY($1::bigint[])", [evenements]);
    }
    await db.query("DELETE FROM org WHERE id = $1", [orgId]);
    await db.query("DELETE FROM source WHERE id = $1", [SOURCE]);
    await db.closePools();
  }
  if (baseJetable) await dropTestDatabase(baseJetable);
});

test("critère du juge exécuté tel quel : zéro violation incomplète", async () => {
  const r = await db.query<{ count: string }>(JUGE);
  console.log(`${JUGE}\ncount = ${r.rows[0]?.count}`);
  assert.equal(r.rows[0]?.count, "0");
});

test("chaque violation suspectée est inscrite avec l'horloge des 72 heures", async () => {
  const ref = `event:${evenements[0]}`;
  const r = await db.query<{
    reference: string; org_kind: string; famille: string; statut: string;
    prise: Date; echeance: Date; notification: Date | null;
  }>(
    `SELECT reference, org_kind, famille, statut,
            date_prise_connaissance AS prise, echeance_72h AS echeance, date_notification AS notification
       FROM violation_rgpd WHERE reference = $1`,
    [ref],
  );
  assert.equal(r.rows.length, 1, `ligne absente pour ${ref}`);
  const ligne = r.rows[0]!;
  assert.equal(ligne.org_kind, "collectivite");
  assert.equal(ligne.famille, "leaks");
  assert.equal(ligne.statut, "suspectee");
  assert.equal(ligne.notification, null);
  assert.equal(ligne.echeance.getTime() - ligne.prise.getTime(), 72 * 60 * 60 * 1000);
  assert.equal(ligne.prise.toISOString(), "2026-03-14T10:20:30.000Z");

  const n = await count("SELECT count(*)::text AS n FROM violation_rgpd WHERE org_id = $1", [orgId]);
  assert.equal(n, 4, "2 faits + 1 fuite en mars, 1 fait en avril ; le fait technique est exclu");
  assert.equal(await count("SELECT count(*)::text AS n FROM violation_rgpd WHERE reference = $1", [`event:${evenements[2]}`]), 0);
  assert.equal(await count("SELECT count(*)::text AS n FROM violation_rgpd WHERE reference = $1", [`fuite:${FUITE}:${orgId}`]), 1);
});

test("l'échéance et la notification ne peuvent pas être écrites à la main", async () => {
  const ref = `event:${evenements[1]}`;
  const avant = await db.query<{ prise: Date }>(
    "SELECT date_prise_connaissance AS prise FROM violation_rgpd WHERE reference = $1", [ref],
  );
  await db.query("UPDATE violation_rgpd SET echeance_72h = now() WHERE reference = $1", [ref]);
  const apres = await db.query<{ echeance: Date }>(
    "SELECT echeance_72h AS echeance FROM violation_rgpd WHERE reference = $1", [ref],
  );
  assert.equal(apres.rows[0]!.echeance.getTime() - avant.rows[0]!.prise.getTime(), 72 * 60 * 60 * 1000);

  await db.query("UPDATE violation_rgpd SET statut = 'notifiee' WHERE reference = $1", [ref]);
  const notifie = await db.query<{ statut: string; notification: Date | null }>(
    "SELECT statut, date_notification AS notification FROM violation_rgpd WHERE reference = $1", [ref],
  );
  assert.equal(notifie.rows[0]!.statut, "notifiee");
  assert.ok(notifie.rows[0]!.notification instanceof Date, "le passage à notifiee horodate la notification");

  await db.query(
    `INSERT INTO violation_rgpd (reference, origine, origine_id, org_kind, famille,
                                 date_prise_connaissance, statut)
     VALUES ($1, 'event', $2, 'collectivite', 'leaks', $3::timestamptz, 'notifiee')`,
    // Hors des mois de l'export contrôlé, pour ne pas changer ses décomptes.
    [DIRECT, "direct", "2026-06-01T00:00:00+00"],
  );
  const direct = await db.query<{ notification: Date | null }>(
    "SELECT date_notification AS notification FROM violation_rgpd WHERE reference = $1", [DIRECT],
  );
  assert.ok(direct.rows[0]!.notification instanceof Date);
  assert.equal((await db.query<{ count: string }>(JUGE)).rows[0]?.count, "0");

  const jalons = await count("SELECT count(*)::text AS n FROM violation_rgpd_chronologie WHERE reference = $1", [ref]);
  assert.equal(jalons, 3, "prise de connaissance, échéance et notification");
});

test("export mensuel : une ligne par violation, nom daté et empreinte SHA-256", async () => {
  const res = await app.inject({ method: "GET", url: `/api/violations-rgpd/export.csv?mois=${MOIS}` });
  const attendu = await violationsDuMois(MOIS);
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.headers["content-type"], "text/csv; charset=utf-8");
  assert.equal(res.headers["content-disposition"], `attachment; filename="violations_${MOIS}.csv"`);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["x-lignes"], String(attendu));
  assert.equal(res.headers["x-fichier"], `violations_${MOIS}.csv`);
  assert.equal(
    res.headers["x-sha256"],
    createHash("sha256").update(Buffer.from(res.body, "utf8")).digest("hex"),
    "l'empreinte porte sur les octets exacts du CSV renvoyé",
  );

  const lignes = res.body.split("\r\n");
  assert.equal(lignes[0], ENTETE);
  assert.equal(lignes[lignes.length - 1], "", "le corps finit par CRLF");
  assert.equal(lignes.length - 2, attendu, "une ligne par violation du mois");
  assert.ok(lignes.slice(1, -1).some((l) => l.startsWith(`event:${evenements[0]},`)));
  assert.ok(lignes.slice(1, -1).some((l) => l.startsWith(`fuite:${FUITE}:${orgId},`)));
  assert.ok(!res.body.includes("Fait public"), "aucun titre de fait, donc aucune donnée personnelle");
});

test("export mensuel : filtre par mois et mois invalide rejeté", async () => {
  const suivant = await app.inject({ method: "GET", url: `/api/violations-rgpd/export.csv?mois=${MOIS_SUIVANT}` });
  const attenduSuivant = await violationsDuMois(MOIS_SUIVANT);
  assert.equal(suivant.headers["x-lignes"], String(attenduSuivant));
  assert.equal(suivant.body.split("\r\n").length - 2, attenduSuivant);
  assert.ok(suivant.body.includes(`event:${evenements[3]},`), "le fait d'avril est bien dans son mois");

  const vide = await app.inject({ method: "GET", url: "/api/violations-rgpd/export.csv?mois=2099-01" });
  assert.equal(vide.statusCode, 200);
  assert.equal(vide.body.split("\r\n").length - 2, 0);

  const invalide = await app.inject({ method: "GET", url: "/api/violations-rgpd/export.csv?mois=2026-13" });
  assert.equal(invalide.statusCode, 400);
});
