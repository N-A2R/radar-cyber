/**
 * Alerte NIS2 à 24 heures : 20 incidents synthétiques graves rattachés à une
 * organisation produisent 20 brouillons datés, sans donnée personnelle.
 *
 * La requête du juge externe est exécutée telle quelle, pas seulement
 * réécrite dans un helper.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { performance } from "node:perf_hooks";
import { query } from "../src/db.js";
import {
  brouillonsAlerte24h,
  compteurAlerte24hIncomplete,
  CRITERE_ALERTE_NIS2_24H,
  DELAI_ALERTE_24H_MS,
  genereAlertesNis2_24h,
  REGIME_ALERTE_24H,
  renduAlerte24h,
} from "../src/report/alerte-nis2-24h.js";

const TAG = `alerte24h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE_ID = `test:${TAG}:source-nationale`;
const PRIVE = ["VICTIME_MARKER", "RESUME_PRIVE_MARKER", "https://article.example/prive"];
const NB_INCIDENTS = 20;
const PRISE_EN_CONNAISSANCE = new Date("2026-11-23T10:00:00.000Z");

type Brouillon = {
  id: string;
  source_event_id: string;
  regime: string;
  awareness_at: Date;
  echeance: Date;
  payload: Record<string, unknown>;
};

let orgId: string;
let eventIds: string[] = [];
let dureeGenerationMs = 0;

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url, region, enabled)
     VALUES ($1, 'Source nationale de test alerte 24 h', 'vuln', 'https://exemple.invalid/alerte24h', 'national', false)`,
    [SOURCE_ID],
  );
  const org = await query<{ id: string }>(
    `INSERT INTO org (name, slug, kind, city, status)
     VALUES ('Entité NIS2 synthétique', $1, 'operateur_critique', 'Bordeaux', 'confirme')
     RETURNING id::text`,
    [`test-${TAG}`],
  );
  orgId = org.rows[0]!.id;

  const debut = performance.now();
  const insere = await query<{ id: string }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, summary, severity, confidence,
                        dept, at, valid_at, observed_at, source_id, source_url, evidence, org_id)
     SELECT $1 || ':' || g, 'ransomware', 'confirmed_incident', 'VICTIME_MARKER',
            'RESUME_PRIVE_MARKER', 4 + (g % 2), 'B2', '33',
            $2::timestamptz + (g || ' hours')::interval,
            $2::timestamptz - interval '1 hour',
            $2::timestamptz + (g || ' hours')::interval,
            $3, 'https://article.example/prive', '{"run_id":"1"}'::jsonb, $4::integer
       FROM generate_series(1, $5::integer) AS g
     RETURNING id::text`,
    [TAG, PRISE_EN_CONNAISSANCE.toISOString(), SOURCE_ID, orgId, NB_INCIDENTS],
  );
  eventIds = insere.rows.map((ligne) => ligne.id);
  dureeGenerationMs = performance.now() - debut;
  assert.equal(eventIds.length, NB_INCIDENTS);
});

after(async () => {
  if (eventIds.length > 0) {
    await query("DELETE FROM notification_brouillon WHERE source_event_id = ANY($1::bigint[])", [eventIds]);
    await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [eventIds]);
  }
  if (orgId) await query("DELETE FROM org WHERE id = $1", [orgId]);
  await query("DELETE FROM source WHERE id = $1", [SOURCE_ID]);
});

test("20 incidents graves produisent 20 brouillons datés en moins d'une minute", async () => {
  const evenements = await query<{ id: string; at: Date }>(
    `SELECT id::text, at FROM event WHERE id = ANY($1::bigint[]) ORDER BY id`,
    [eventIds],
  );
  const brouillons: Brouillon[] = [];
  for (const id of eventIds) {
    brouillons.push(...(await brouillonsAlerte24h(id)));
  }
  assert.equal(brouillons.length, NB_INCIDENTS, "un brouillon par incident");
  assert.equal(new Set(brouillons.map((b) => b.source_event_id)).size, NB_INCIDENTS);
  assert.ok(dureeGenerationMs < 60_000, `génération en ${dureeGenerationMs.toFixed(1)} ms`);

  for (const brouillon of brouillons) {
    assert.equal(brouillon.regime, REGIME_ALERTE_24H);
    const evenement = evenements.rows.find((e) => e.id === brouillon.source_event_id);
    assert.ok(evenement, "incident source présent");
    assert.equal(
      brouillon.awareness_at.getTime(),
      new Date(evenement!.at).getTime(),
      "horodatage de prise de connaissance",
    );
    assert.equal(
      brouillon.echeance.getTime() - brouillon.awareness_at.getTime(),
      DELAI_ALERTE_24H_MS,
      "échéance awareness_at + 24 h",
    );
    assert.equal(brouillon.payload["awareness_at"], brouillon.awareness_at.toISOString());
    assert.ok(String(brouillon.payload["impact"]).trim().length > 0, "impact renseigné");
    assert.equal(brouillon.payload["entite_id"], Number(orgId), "entité NIS2 rattachée");
    const texte = renduAlerte24h(brouillon);
    assert.ok(texte.includes("Prise de connaissance : " + brouillon.awareness_at.toISOString()));
    assert.ok(texte.includes("Échéance de notification : " + brouillon.echeance.toISOString()));
    assert.ok(texte.includes(String(brouillon.payload["impact"])));
    const serialise = JSON.stringify(brouillon.payload) + texte;
    for (const marqueur of PRIVE) {
      assert.equal(serialise.includes(marqueur), false, `${marqueur} ne doit pas être stocké`);
    }
  }
});

test("la requête du juge externe renvoie 0", async () => {
  const brut = await query<{ count: string }>(CRITERE_ALERTE_NIS2_24H);
  assert.equal(brut.rows[0]?.count, "0", CRITERE_ALERTE_NIS2_24H);
  assert.equal(await compteurAlerte24hIncomplete(), 0);
});

test("un incident de gravité inférieure à 4 ne crée pas d'alerte", async () => {
  const insere = await query<{ id: string }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, at, valid_at, source_id, source_url, evidence)
     VALUES ($1, 'vuln', 'confirmed_incident', 'incident mineur', now(), now(),
             'ransomlook', 'https://example.invalid/alerte24h', '{"run_id":"1"}'::jsonb)
     RETURNING id::text`,
    [`test:${TAG}:mineur`],
  );
  const id = insere.rows[0]!.id;
  try {
    assert.deepEqual(await brouillonsAlerte24h(id), []);
  } finally {
    await query("DELETE FROM event WHERE id = $1", [id]);
  }
});

test("le rattrapage est idempotent et répare un brouillon manquant", async () => {
  assert.equal(await genereAlertesNis2_24h(), 0, "rien à écrire quand tout est présent");
  const cible = eventIds[0]!;
  await query(
    "DELETE FROM notification_brouillon WHERE source_event_id = $1 AND regime = $2",
    [cible, REGIME_ALERTE_24H],
  );
  assert.equal(await genereAlertesNis2_24h(), 1, "le brouillon manquant est recreé");
  const brouillons = await brouillonsAlerte24h(cible);
  assert.equal(brouillons.length, 1);
  assert.equal(await compteurAlerte24hIncomplete(), 0, CRITERE_ALERTE_NIS2_24H);
});

test("corriger la prise de connaissance recale l'échéance sans doubler le brouillon", async () => {
  const cible = eventIds[1]!;
  const avant = (await brouillonsAlerte24h(cible))[0]!;
  await query("UPDATE event SET at = at + interval '1 hour' WHERE id = $1", [cible]);
  const apres = await brouillonsAlerte24h(cible);
  assert.equal(apres.length, 1);
  assert.equal(apres[0]!.awareness_at.getTime() - avant.awareness_at.getTime(), 3600_000);
  assert.equal(apres[0]!.echeance.getTime() - apres[0]!.awareness_at.getTime(), DELAI_ALERTE_24H_MS);
  assert.equal(await compteurAlerte24hIncomplete(), 0);
});
