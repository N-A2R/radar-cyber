/**
 * Fatigue d'alerte : déduplication jour/organisation/règle, mesure 30 jours et
 * non-diffusion des doublons.
 *
 * Les organisations, règles et alertes créées ici sont jetables et retirées
 * dans `after`. La base est celle du lanceur de tests (`radar_test_<pid>`),
 * jamais la base de production.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { closePools, query } from "../src/db.js";
import {
  applyAlertFatiguePolicy,
  ligneObjectifFatigue,
  measureAlertFatigue,
  objectifFatigueAtteint,
  MESURE_OBJECTIF_FATIGUE_2026_11_24,
  verifierDeclarationObjectifFatigue,
} from "../src/maintenance/alert-fatigue.js";
import { fetchPendingAlerts } from "../src/notify/alert-delivery.js";

const TAG = `fatigue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const alertIds: number[] = [];
const orgIds: number[] = [];
let seq = 0;
const next = () => `${TAG}-${++seq}`;

async function insertOrg(): Promise<number> {
  const r = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, city) VALUES ($1,$2,'entreprise','Bordeaux') RETURNING id",
    [next(), next()],
  );
  const id = r.rows[0]!.id;
  orgIds.push(id);
  return id;
}

async function insertAlert(orgId: number, ruleId: string, createdAt?: Date): Promise<number> {
  const r = await query<{ id: number }>(
    `INSERT INTO alert (rule_id, title, severity, org_id, created_at)
     VALUES ($1,$2,3,$3,COALESCE($4, now())) RETURNING id`,
    [ruleId, `${TAG} — alerte`, orgId, createdAt ?? null],
  );
  const id = r.rows[0]!.id;
  alertIds.push(id);
  return id;
}

after(async () => {
  if (alertIds.length > 0) await query("DELETE FROM alert WHERE id = ANY($1::int[])", [alertIds]);
  if (orgIds.length > 0) await query("DELETE FROM org WHERE id = ANY($1::int[])", [orgIds]);
  await closePools();
});

test("un doublon même org/jour/règle est acquitté avec la trace de l'alerte couverte", async () => {
  const org = await insertOrg();
  const rule = next();
  const ids = [await insertAlert(org, rule), await insertAlert(org, rule), await insertAlert(org, rule)];

  const result = await applyAlertFatiguePolicy();
  assert.ok(result.acknowledgedDuplicates >= ids.length - 1);

  const rows = await query<{ id: number; status: string; reason: string | null; covered: string | null }>(
    `SELECT id, status,
            evidence->'fatigue'->>'reason' AS reason,
            evidence->'fatigue'->>'covered_by_alert_id' AS covered
       FROM alert WHERE id = ANY($1::int[]) ORDER BY id`,
    [ids],
  );
  assert.deepEqual(
    rows.rows.map((r) => r.status),
    ["open", "ack", "ack"],
  );
  for (const row of rows.rows.slice(1)) {
    assert.equal(row.reason, "duplicate_same_org_day_rule");
    assert.equal(Number(row.covered), ids[0]);
  }
});

test("la charge compte une alerte par règle et par org/jour, hors fenêtre 30 jours", async () => {
  const org = await insertOrg();
  const rule = next();
  await insertAlert(org, rule);
  await insertAlert(org, rule);
  await insertAlert(org, next());
  const oldOrg = await insertOrg();
  await insertAlert(oldOrg, next(), new Date(Date.now() - 45 * 24 * 3600 * 1000));

  await applyAlertFatiguePolicy();

  const rows = await query<{ day: string; alerts_per_day: number }>(
    "SELECT day::text, alerts_per_day FROM alert_load_daily WHERE org_id = $1",
    [org],
  );
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0]!.alerts_per_day, 2);
  const old = await query("SELECT 1 FROM alert_load_daily WHERE org_id = $1", [oldOrg]);
  assert.equal(old.rows.length, 0);
});

test("la politique est idempotente et les deux taux du critère restent mesurables", async () => {
  const org = await insertOrg();
  const rule = next();
  for (let i = 0; i < 13; i++) await insertAlert(org, rule);

  await applyAlertFatiguePolicy();
  const second = await applyAlertFatiguePolicy();
  assert.equal(second.acknowledgedDuplicates, 0);

  const mesure = await measureAlertFatigue();
  assert.ok(mesure.loadRatio >= 0 && mesure.loadRatio <= 1);
  assert.ok(mesure.ackRatio >= 0 && mesure.ackRatio <= 1);
  assert.equal(
    mesure.alertRows,
    mesure.openAlerts + mesure.systemAcked + mesure.humanAcked + mesure.resolved,
  );
});

test("un doublon acquitté par la politique ne part pas en diffusion", async () => {
  const org = await insertOrg();
  const rule = next();
  const premier = await insertAlert(org, rule);
  const doublon = await insertAlert(org, rule);

  await applyAlertFatiguePolicy();

  const pending = await fetchPendingAlerts(100_000);
  const ids = new Set(pending.map((a) => a.id));
  assert.ok(ids.has(premier), "l'alerte présentée reste à diffuser");
  assert.ok(!ids.has(doublon), "le doublon acquitté est exclu de la diffusion");
});

test("les seuils de sortie sont appliqués aux valeurs mesurées", () => {
  const base = {
    dailyRows: 100,
    alertRows: 200,
    openAlerts: 90,
    systemAcked: 100,
    humanAcked: 5,
    resolved: 5,
  };
  const atteint = { ...base, loadRatio: 0.9, ackRatio: 0.5 };
  assert.equal(objectifFatigueAtteint(atteint), true);
  assert.match(ligneObjectifFatigue(atteint), /^OBJECTIF : atteint — charge 90,0 % \/ 90,0 %/);

  assert.equal(objectifFatigueAtteint({ ...base, loadRatio: 0.899, ackRatio: 0.5 }), false);
  assert.equal(objectifFatigueAtteint({ ...base, loadRatio: 0.95, ackRatio: 0.499 }), false);
});

test("l'objectif figé est celui de la mesure reproductible publiée", () => {
  const mesure = MESURE_OBJECTIF_FATIGUE_2026_11_24;
  assert.equal(objectifFatigueAtteint(mesure), true);
  assert.equal(
    ligneObjectifFatigue(mesure),
    "OBJECTIF : atteint — charge 98,8 % / 90,0 % (83 organisations-jours) ; acquittement 81,8 % / 50,0 % (1652 alertes)",
  );
});

test("le rapport déclare une seule fois la ligne OBJECTIF mesurée", () => {
  const rapport = readFileSync(new URL("../../../docs/alert-fatigue.md", import.meta.url), "utf8");
  const ligne = ligneObjectifFatigue(MESURE_OBJECTIF_FATIGUE_2026_11_24);
  assert.equal(verifierDeclarationObjectifFatigue(rapport, ligne), true);
  assert.equal(verifierDeclarationObjectifFatigue(rapport, "OBJECTIF : atteint — charge 1,0 % / 90,0 %"), false);
});
