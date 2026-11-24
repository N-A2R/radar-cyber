/**
 * Régressions des collecteurs : identité stable sans date, refus des pages
 * d'erreur HTTP, corrélations MISP fondées sur un recoupement réel.
 * Toutes les entrées sont injectées : aucun appel réseau réel.
 */
import { randomUUID } from "node:crypto";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import { correlaterIndicateursCertfrMisp } from "../src/collectors/certfr-misp-correlate.js";
import { parseObservedAt } from "../src/collectors/dates.js";
import { fingerprintOf, runGenericSources } from "../src/collectors/generic.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

after(async () => {
  await closePools().catch(() => {});
});

test("C4 : deux items sans date de jours différents ont la même empreinte", () => {
  const titre = "Rançongiciel : incident en Nouvelle-Aquitaine";
  const premier = parseObservedAt(undefined, { fetchedAt: new Date("2026-11-20T08:00:00.000Z") });
  const second = parseObservedAt(undefined, { fetchedAt: new Date("2026-11-21T23:30:00.000Z") });
  assert.equal(premier.source, "fetched");
  assert.equal(second.source, "fetched");
  assert.notEqual(premier.at?.toISOString(), second.at?.toISOString(), "observed_at garde le jour de collecte");

  const empreinteA = fingerprintOf(titre, "flux:dedup", { at: premier.at, dateSource: premier.source });
  const empreinteB = fingerprintOf(titre, "flux:dedup", { at: second.at, dateSource: second.source });
  assert.equal(empreinteA, empreinteB, "le jour de collecte ne déplace pas l'empreinte");

  // Une URL/guid est une identité plus forte que le titre.
  const url = "https://editeur.test/article/42";
  assert.equal(
    fingerprintOf("Titre corrigé", "flux:dedup", { identity: url, dateSource: "fetched" }),
    fingerprintOf("Ancien titre", "flux:dedup", { identity: url, dateSource: "fetched" }),
  );

  // Le jour d'un flux reste utile quand il vient réellement de la source.
  const dia = fingerprintOf(titre, "flux:dedup", {
    at: new Date("2026-11-20T12:00:00.000Z"), dateSource: "feed",
  });
  const dib = fingerprintOf(titre, "flux:dedup", {
    at: new Date("2026-11-21T12:00:00.000Z"), dateSource: "feed",
  });
  assert.notEqual(dia, dib);
});

test("C3 : une page 503 n'est ni ingérée ni suivie d'une source marquée saine", async () => {
  const sourceId = `test-repair-503-${Date.now()}`;
  await query(
    `INSERT INTO source (id, name, family, url, kind, format, relevance)
     VALUES ($1, $2, 'ransomware', 'https://collector.test/503', 'narrative', 'rss', 'strict')`,
    [sourceId, `Source test ${sourceId}`],
  );
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    "<html><title>Rançongiciel</title><p>503 service indisponible</p></html>",
    { status: 503, headers: { "content-type": "text/html", "retry-after": "0" } },
  )) as typeof fetch;
  try {
    await runGenericSources(() => {}, { sourceIds: [sourceId], force: true });
  } finally {
    globalThis.fetch = fetchOriginal;
  }
  const sante = await query<{ last_ok_at: string | null; last_error: string | null }>(
    "SELECT last_ok_at, last_error FROM source WHERE id=$1", [sourceId],
  );
  assert.equal(sante.rows[0]?.last_ok_at, null, "une page d'erreur ne rend pas la source saine");
  assert.match(sante.rows[0]?.last_error ?? "", /HTTP 503/);
  const evenements = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM event WHERE source_id=$1", [sourceId],
  );
  assert.equal(evenements.rows[0]?.n, 0, "le corps de la page 503 n'est pas parsé");
  await query("DELETE FROM collector_run WHERE source_id=$1", [sourceId]);
  await query("DELETE FROM source WHERE id=$1", [sourceId]);
});

test("C1 : pas de corrélation fabriquée hors fenêtre ni sans recoupement", async () => {
  const sourceId = `test-certfr-misp-repair-${Date.now()}`;
  const uuidVieux = randomUUID();
  const uuidRecupere = randomUUID();
  const uuidContexte = randomUUID();
  await query(
    `INSERT INTO source (id, name, family, url, kind, format, relevance)
     VALUES ($1, $2, 'cti', 'https://collector.test/misp-repair', 'narrative', 'json', 'strict')`,
    [sourceId, `Corrélation test ${sourceId}`],
  );
  const org = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, city, dept, domain, status, lat, lon)
     VALUES ($1, $2, 'entreprise', 'Bordeaux', '33', $3, 'confirme', 44.84, -0.58) RETURNING id`,
    [`Org corrélation ${sourceId}`, `org-corr-${sourceId}`, `${sourceId}.test`],
  );
  const orgId = org.rows[0]?.id;
  assert.ok(orgId, "organisation régionale de test");

  const regional = async (cle: string, titre: string, date: string) => {
    const r = await query<{ id: string }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at, valid_at, at,
                          source_id, source_url, evidence, geo_type, regional, regional_motif, org_id, lat, lon, date_source)
       VALUES ($1, 'ransomware', 'third_party_claim', $2, 'Revendication de test', $3, $3, $3,
               'ransomlook', 'https://example.invalid/regional',
               '{"feed":"test","run_id":"1"}'::jsonb, 'entity_location', true, 'rattachement', $4, 44.84, -0.58, 'feed')
       RETURNING id::text AS id`,
      [cle, titre, `${date}T12:00:00.000Z`, orgId],
    );
    return r.rows[0]?.id;
  };
  await regional(`regional-${sourceId}-recupere`, `Revendication Sandworm ${sourceId} en Gironde`, "2027-02-10");
  await regional(`regional-${sourceId}-contexte`, `Revendication ransomware ${sourceId} en Gironde`, "2027-02-20");

  const corpus = async (uuid: string, date: string, info: string, labels: string[]) => {
    await query(
      `INSERT INTO certfr_misp_event (uuid, misp_date, info, org_name, indicators, context, feed_url)
       VALUES ($1, $2, $3, 'CERT-FR', '[]'::jsonb, $4::jsonb, $5)`,
      [uuid, date, info, JSON.stringify({ labels, targetLocations: [], urls: [], attachments: [], comments: [], dates: [] }),
        `https://misp.test/${uuid}.json`],
    );
  };
  // Un fait de 2020 ne peut plus fonder la corrélation de 2027, même s'il
  // nomme le même acteur.
  await corpus(uuidVieux, "2020-05-01", "Campagne Sandworm historique", ["sandworm"]);
  await corpus(uuidRecupere, "2027-02-10", "Campagne Sandworm", ["sandworm"]);
  await corpus(uuidContexte, "2027-02-20", "Bulletin du jour", []);

  try {
    const resultat = await correlaterIndicateursCertfrMisp({
      days: 1, now: new Date("2027-02-10T15:00:00.000Z"), sourceId, log: () => {},
    });
    assert.equal(resultat.evenements, 1, "un seul MISP du jour recoupe réellement un fait régional");
    assert.equal(resultat.bases.semantique, 1);
    assert.ok(resultat.relations >= 1);
    const ecrit = await query<{
      confidence: string; regional: boolean; org_id: number | null; lat: number | null; lon: number | null;
      basis: string; lag: number; uuid: string; score: number;
    }>(
      `SELECT confidence, regional, org_id, lat, lon, pertinence_score AS score,
              evidence->>'correlationBasis' AS basis,
              (evidence->>'correlationLagDays')::float AS lag, evidence->>'mispUuid' AS uuid
         FROM event WHERE source_id=$1 AND assertion_type='suggested_relation'`, [sourceId],
    );
    assert.equal(ecrit.rows.length, 1);
    assert.equal(ecrit.rows[0]?.uuid, uuidRecupere, "le MISP de 2020 n'a pas été réutilisé");
    assert.equal(ecrit.rows[0]?.basis, "semantique");
    assert.equal(ecrit.rows[0]?.confidence, "B2");
    assert.equal(ecrit.rows[0]?.score, 8, "B2 n'est accordé qu'avec recoupement et proximité");
    assert.ok(ecrit.rows[0]?.lag !== null && ecrit.rows[0]!.lag <= 2, "B2 exige la proximité temporelle");

    const logs: string[] = [];
    const contexte = await correlaterIndicateursCertfrMisp({
      days: 1, now: new Date("2027-02-20T15:00:00.000Z"), sourceId, log: (m) => { logs.push(m); },
    });
    assert.equal(contexte.evenements, 0, "un simple contexte du jour n'écrit aucun événement");
    assert.equal(contexte.bases["contexte-du-jour"], 1);
    assert.ok(logs.some((m) => m.includes("contexte du jour")), "le contexte est journalisé");
    const apres = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM event WHERE source_id=$1 AND assertion_type='suggested_relation'`, [sourceId],
    );
    assert.equal(apres.rows[0]?.n, 1, "aucune corrélation géolocalisée supplémentaire");
  } finally {
    const evenements = await query<{ id: string }>(
      "SELECT id::text AS id FROM event WHERE source_id=$1", [sourceId],
    );
    for (const row of evenements.rows) {
      await query("DELETE FROM relation WHERE src_id=$1 OR dst_id=$1", [row.id]);
    }
    await supprimerEvenementsArchivees("source_id=$1 OR dedup_key LIKE $2", [sourceId, `regional-${sourceId}-%`]);
    await query("DELETE FROM certfr_misp_event WHERE uuid = ANY($1::text[])", [[uuidVieux, uuidRecupere, uuidContexte]]);
    await query("DELETE FROM collector_run WHERE source_id=$1", [sourceId]);
    await query("DELETE FROM source WHERE id=$1", [sourceId]);
    await query("DELETE FROM org WHERE slug=$1", [`org-corr-${sourceId}`]);
  }
});
