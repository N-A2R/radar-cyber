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
/** Le radar l'apprend trois jours après : les deux horloges doivent survivre. */
const AT = new Date(OBSERVE.getTime() + 3 * 86_400_000);
const CLE_CORRIGE = `${TAG}:corrige`;
const OBSERVE_CORRIGE = new Date(OBSERVE.getTime() + 5 * 86_400_000);
/** Fenêtre d'une minute : le rejeu ne lit que notre archive, pas celle des autres tests. */
const DEPUIS = new Date(OBSERVE.getTime() - 60_000).toISOString();
const JUSQUA = new Date(OBSERVE.getTime() + 60_000).toISOString();
const DEPUIS_CORRIGE = new Date(OBSERVE_CORRIGE.getTime() - 60_000).toISOString();
const JUSQUA_CORRIGE = new Date(OBSERVE_CORRIGE.getTime() + 60_000).toISOString();
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
                        valid_at, at, severity, confidence, source_id, org_id, evidence)
     VALUES ($1,'ransomware','confirmed_incident',$2,$3,$4,$5,$6,2,'C3',$7,$8,$9)`,
    [CLE, `Incident ${ORG_NOM}`, `Résumé ${TAG}`, OBSERVE.toISOString(), OBSERVE.toISOString(),
      AT.toISOString(), SOURCE, orgId,
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

  // Archive sans organisation : le rejeu devra la corriger et le diff devra
  // nommer l'organisation retenue, pas seulement son identifiant.
  await query(
    `INSERT INTO event_archive
       (dedup_key, family, assertion_type, source_id, org_name, severity,
        observed_at, collected_at, valid_at, at)
     VALUES ($1,'ransomware','confirmed_incident',$2,$3,2,$4,$4,$4,$5)`,
    [CLE_CORRIGE, SOURCE, ORG_NOM, OBSERVE_CORRIGE.toISOString(), AT.toISOString()],
  );
  // La vraie rétention : archive puis purge de tout ce qui a plus de 90 jours.
  await runRetention(() => {}, { days: 90, tables: ["event"] });
});

after(async () => {
  if (app) await app.close();
  // Le journal est append-only : ses faits restent, comme en production.
  for (const table of ["event", "event_archive", "archive_event"]) {
    await query(`DELETE FROM ${table} WHERE dedup_key = ANY($1)`, [CLE, CLE_CORRIGE]).catch(() => {});
  }
  await query("DELETE FROM org WHERE id = $1", [orgId]).catch(() => {});
  await query("DELETE FROM source WHERE id = $1", [SOURCE]).catch(() => {});
  await closePools();
});

test("1 — le fait de 100 jours est archivé, pas supprimé", async (t: TestContext) => {
  const brut = await query<{ n: string }>("SELECT count(*)::text AS n FROM event WHERE dedup_key = $1", [CLE]);
  const resumes = await query<{ n: string; org: string | null; valide: Date; su: Date }>(
    `SELECT count(*)::text AS n, max(org_id)::text AS org,
            max(valid_at) AS valide, max(at) AS su
       FROM event_archive WHERE dedup_key = $1`, [CLE],
  );
  const complets = await query<{ n: string; titre: string | null; valide: Date; su: Date }>(
    `SELECT count(*)::text AS n, max(title) AS titre,
            max(valid_at) AS valide, max(at) AS su
       FROM archive_event WHERE dedup_key = $1`, [CLE],
  );

  assert.equal(Number(brut.rows[0].n), 0, "plus aucune ligne dans le brut après 100 jours");
  assert.equal(Number(resumes.rows[0].n), 1, "une ligne dans l'archive de mesure");
  assert.equal(Number(complets.rows[0].n), 1, "une copie intégrale dans l'archive d'audit");
  assert.equal(Number(resumes.rows[0].org), orgId, "le rattachement surviv à la purge dans l'archive");
  assert.equal(complets.rows[0].titre, `Incident ${ORG_NOM}`, "titre et preuves conservés");
  for (const [archive, ligne] of [["résumé", resumes.rows[0]], ["copie intégrale", complets.rows[0]]] as const) {
    assert.equal(new Date(ligne.valide).toISOString(), OBSERVE.toISOString(), `valid_at conservé dans l'archive ${archive}`);
    assert.equal(new Date(ligne.su).toISOString(), AT.toISOString(), `at conservé dans l'archive ${archive}`);
  }

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
    horloge: string; total: number; brut: number; archive: number;
    parMois: { mois: string; brut: number; archive: number; total: number }[];
  }>();

  assert.equal(corps.horloge, "valid_at", "la requête 12 mois raisonne sur la date de vérité");
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

  const proj = await query<{
    org_id: number | null; evidence: { rejeu?: string; orgArchiveId?: number };
    valide: Date; su: Date;
  }>(
    "SELECT org_id, evidence, valid_at AS valide, at AS su FROM event WHERE dedup_key = $1", [CLE],
  );
  assert.equal(proj.rows[0]?.org_id, orgId, "le rejeu recrée le même org_id");
  assert.equal(proj.rows[0]?.evidence.rejeu, "event_archive", "la projection recréée dit d'où elle vient");
  assert.equal(String(proj.rows[0]?.evidence.orgArchiveId), String(orgId), "l'ancien rattachement est conservé comme preuve");
  assert.equal(new Date(proj.rows[0].valide).toISOString(), OBSERVE.toISOString(), "le rejeu ne réinvente pas valid_at");
  assert.equal(new Date(proj.rows[0].su).toISOString(), AT.toISOString(), "le rejeu ne réinvente pas at");

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

test("4 — le diff nominatif nomme le rattachement corrigé", async (t: TestContext) => {
  const { stdout, stderr } = await execFileAsync(TSX, [
    REJEU, `--depuis=${DEPUIS_CORRIGE}`, `--jusqu-a=${JUSQUA_CORRIGE}`, "--mesurer-idempotence",
  ], { cwd: RACINE, env: process.env, timeout: 120_000 });
  const sortie = `${stdout}\n${stderr}`;

  assert.match(sortie, /Archives lues : 1 \(0 avec organisation archivée\)/, sortie);
  assert.match(sortie, /Rattachements : 0 identiques, 1 changés \(1 nouveaux, 0 perdus, 0 modifiés\)/, sortie);
  assert.ok(
    sortie.includes(`${CLE_CORRIGE} | ${ORG_NOM} (#null) → ${ORG_NOM} (#${orgId})`),
    `le diff doit nommer avant/après : ${sortie}`,
  );
  assert.match(sortie, /Écritures : 1 inséré\(s\), 0 mis à jour/, sortie);
  assert.match(sortie, /IDEMPOTENT : oui/, sortie);

  const proj = await query<{ org_id: number | null; valide: Date; su: Date }>(
    "SELECT org_id, valid_at AS valide, at AS su FROM event WHERE dedup_key = $1", [CLE_CORRIGE],
  );
  assert.equal(proj.rows[0]?.org_id, orgId, "le rattachement manquant est corrigé dans la projection");
  assert.equal(new Date(proj.rows[0].valide).toISOString(), OBSERVE_CORRIGE.toISOString(), "valid_at est repris de l'archive");
  assert.equal(new Date(proj.rows[0].su).toISOString(), AT.toISOString(), "at est repris de l'archive");

  const journal = await query<{ org: string | null }>(
    `WITH dernier AS (
       SELECT DISTINCT ON (subject) subject, payload
         FROM journal
        WHERE subject = $1 AND kind IN ('event.rattachement', 'match.decided')
        ORDER BY subject, recorded_at DESC, id DESC
     )
     SELECT payload->>'orgId' AS org FROM dernier`,
    [CLE_CORRIGE],
  );
  assert.equal(Number(journal.rows[0]?.org), orgId, "la correction est consignée au journal");

  t.diagnostic(JSON.stringify({ preuve: "diff", avant: null, apres: ORG_NOM, orgId, idempotent: true }));
});

test("5 — une période sans archive est un état vide, pas une erreur", async () => {
  const { stdout, stderr } = await execFileAsync(TSX, [
    REJEU, "--depuis=2001-01-01", "--jusqu-a=2001-01-02", "--mesurer-idempotence",
  ], { cwd: RACINE, env: process.env, timeout: 120_000 });
  const sortie = `${stdout}\n${stderr}`;
  assert.match(sortie, /Aucune archive sur la période/, sortie);
  assert.match(sortie, /Écritures : 0 inséré\(s\), 0 mis à jour/, sortie);
  assert.match(sortie, /IDEMPOTENT : oui/, sortie);
});

test("6 — une période invalide est refusée avant toute écriture", async () => {
  async function echec(args: string[]): Promise<string> {
    try {
      await execFileAsync(TSX, [REJEU, ...args], { cwd: RACINE, env: process.env, timeout: 120_000 });
    } catch (error) {
      const echecRejeu = error as { code?: number; stdout?: string; stderr?: string };
      assert.notEqual(echecRejeu.code, 0, "le rejeu doit finir en erreur");
      return `${echecRejeu.stdout ?? ""}\n${echecRejeu.stderr ?? ""}`;
    }
    assert.fail("le rejeu aurait dû refuser la période");
  }

  const inverse = await echec(["--depuis=2026-02-02", "--jusqu-a=2026-02-01"]);
  assert.match(inverse, /période vide ou inversée/, inverse);
  const egale = await echec(["--depuis=2026-02-02", "--jusqu-a=2026-02-02"]);
  assert.match(egale, /période vide ou inversée/, egale);
  const mauvaiseDate = await echec(["--depuis=pas-une-date"]);
  assert.match(mauvaiseDate, /--depuis invalide/, mauvaiseDate);
  const sansPeriode = await echec([]);
  assert.match(sansPeriode, /période est obligatoire/, sansPeriode);
});
