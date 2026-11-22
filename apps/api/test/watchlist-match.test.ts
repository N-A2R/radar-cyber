/**
 * Critère de sortie du chantier « déclencher des alertes par correspondance
 * avec les listes de veille ».
 *
 * Scénario joué tel quel en SQL : une liste de veille contient une seule
 * organisation ; trois événements sont insérés, un seul touche cette
 * organisation. La sortie brute contient la requête du critère et le
 * compteur lu en base, puis la preuve de non-duplication (ré-insertion et
 * mise à jour de l'événement), puis le déclenchement sur `fuite_org`.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";

const TAG = `wm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SOURCE_ID = `test-watchlist-match-${TAG}`;
const WATCHLIST_SLUG = `veille-${TAG}`;
const FUITE_ID = `fuite-${TAG}`;
const ORG_IDS: number[] = [];
const EVENT_IDS: number[] = [];
let watchlistId: number;

async function insertEvent(titre: string, orgId: number | null): Promise<number> {
  const res = await query<{ id: number }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, severity, source_id, org_id, source_url, evidence)
     VALUES ($1, 'ransomware', 'confirmed_incident', $2, 4, $3, $4, 'https://example.invalid/event', '{"run_id":"1"}'::jsonb)
     RETURNING id`,
    [`${TAG}-${titre}-${EVENT_IDS.length}`, titre, SOURCE_ID, orgId],
  );
  const id = Number(res.rows[0]!.id);
  EVENT_IDS.push(id);
  return id;
}

async function count(sql: string): Promise<number> {
  const res = await query<{ count: string }>(sql);
  return Number(res.rows[0]!.count);
}

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url) VALUES ($1, $2, 'ransomware', 'https://example.invalid/')`,
    [SOURCE_ID, `Source test ${TAG}`],
  );
  for (const suffixe of ["a", "b"]) {
    const org = await query<{ id: number }>(
      `INSERT INTO org (name, slug, kind, sector, status)
       VALUES ($1, $2, 'sante', 'sante', 'confirme') RETURNING id`,
      [`Organisation test ${TAG} ${suffixe}`, `${TAG}-org-${suffixe}`],
    );
    ORG_IDS.push(Number(org.rows[0]!.id));
  }
  const wl = await query<{ id: number }>(
    `INSERT INTO watchlist (slug, name, description)
     VALUES ($1, $2, 'Liste de test du déclenchement') RETURNING id`,
    [WATCHLIST_SLUG, `Veille test ${TAG}`],
  );
  watchlistId = Number(wl.rows[0]!.id);
  await query(
    `INSERT INTO watchlist_item (watchlist_id, kind, ref, org_id) VALUES ($1, 'org', $2, $3)`,
    [watchlistId, `${TAG}-org-a`, ORG_IDS[0]!],
  );
});

after(async () => {
  if (watchlistId) await query("DELETE FROM watchlist WHERE id=$1", [watchlistId]);
  if (EVENT_IDS.length) await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [EVENT_IDS]);
  if (ORG_IDS.length) {
    await query("DELETE FROM alert WHERE rule_id='watchlist' AND org_id = ANY($1::int[])", [ORG_IDS]);
    await query("DELETE FROM org WHERE id = ANY($1::int[])", [ORG_IDS]);
  }
  await query("DELETE FROM fuite_reference WHERE id=$1", [FUITE_ID]);
  await query("DELETE FROM source WHERE id=$1", [SOURCE_ID]);
  await closePools();
});

test("3 événements dont 1 sur l'org listée : 1 correspondance, 1 alerte watchlist, aucune duplication", async () => {
  const [orgListee, orgAutre] = ORG_IDS as [number, number];

  // Trois événements : un seul est rattaché à l'organisation listée.
  const evtListe = await insertEvent("Intrusion chez l'organisation listée", orgListee);
  await insertEvent("Incident chez une organisation non listée", orgAutre);
  await insertEvent("Signal régional sans organisation", null);

  const SQL_COUNT = "SELECT count(*) FROM watchlist_match";
  const matches = await count(SQL_COUNT);
  console.log(`\n${SQL_COUNT}\n${matches}`);

  const SQL_ALERT =
    "SELECT rule_id, title, severity, org_id, event_id FROM alert WHERE rule_id='watchlist'";
  const alerte = await query<Record<string, unknown>>(SQL_ALERT);
  console.log(`${SQL_ALERT}\n${JSON.stringify(alerte.rows)}`);

  assert.equal(matches, 1, "un seul des trois événements touche une liste");
  assert.equal(alerte.rows.length, 1, "une alerte watchlist créée");
  assert.equal(alerte.rows[0]!.rule_id, "watchlist");
  assert.equal(Number(alerte.rows[0]!.event_id), evtListe);

  // Non-duplication : la mise à jour de l'événement rejoue le déclencheur,
  // une quatrième insertion sur une org non listée ne crée rien non plus.
  await query("UPDATE event SET org_id=$1 WHERE id=$2", [orgListee, evtListe]);
  await insertEvent("Deuxième incident non listé", orgAutre);
  const apresRejeu = await count(SQL_COUNT);
  const alertesApres = await count("SELECT count(*) FROM alert WHERE rule_id='watchlist'");
  console.log(`${SQL_COUNT} /* après rejeu */\n${apresRejeu}`);
  console.log(`SELECT count(*) FROM alert WHERE rule_id='watchlist' /* après rejeu */\n${alertesApres}`);
  assert.equal(apresRejeu, 1, "le rejeu ne duplique pas la correspondance");
  assert.equal(alertesApres, 1, "le rejeu ne duplique pas l'alerte");
});

test("une fuite documentée sur l'org listée remplit watchlist_match et ouvre une alerte", async () => {
  const orgListee = ORG_IDS[0]!;
  await query(
    `INSERT INTO fuite_reference (id, source, name, domain, source_url)
     VALUES ($1, 'hibp', $2, 'org-a.example', 'https://example.invalid/fuite')`,
    [FUITE_ID, `Fuite test ${TAG}`],
  );
  await query(
    `INSERT INTO fuite_org (fuite_id, org_id, domain, matched_by)
     VALUES ($1, $2, 'org-a.example', 'domaine')
     ON CONFLICT DO NOTHING`,
    [FUITE_ID, orgListee],
  );
  await query(
    `INSERT INTO fuite_org (fuite_id, org_id, domain, matched_by)
     VALUES ($1, $2, 'org-a.example', 'domaine')
     ON CONFLICT DO NOTHING`,
    [FUITE_ID, orgListee],
  ); // rejeu : la clé primaire et le trigger se taisent.

  const SQL_MATCH = "SELECT count(*) FROM watchlist_match WHERE fuite_id=$1";
  const res = await query<{ count: string }>(SQL_MATCH, [FUITE_ID]);
  console.log(`${SQL_MATCH}\n${res.rows[0]!.count}`);
  assert.equal(Number(res.rows[0]!.count), 1, "une correspondance de fuite, pas deux");

  const SQL_ALERT =
    "SELECT count(*) FROM alert WHERE rule_id='watchlist' AND evidence->>'fuite_id'=$1";
  const alertes = await query<{ count: string }>(SQL_ALERT, [FUITE_ID]);
  console.log(`${SQL_ALERT}\n${alertes.rows[0]!.count}`);
  assert.equal(Number(alertes.rows[0]!.count), 1, "une alerte de fuite, pas deux");
});
