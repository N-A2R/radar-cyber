import { test } from "node:test";
import assert from "node:assert/strict";
import { query } from "../src/db.js";

/**
 * Le score de corroboration est une lecture, pas une opinion : une annonce
 * isolée reste à 0 et n'entre jamais dans la surface publique.
 */

async function orgAvecDomaine(slug: string, domaine: string | null): Promise<number> {
  const r = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, domain, status)
     VALUES ($1, $2, 'entreprise', $3, 'confirme') RETURNING id`,
    [`Organisation ${slug}`, slug, domaine],
  );
  return r.rows[0].id;
}

async function revendication(
  fingerprint: string,
  orgId: number,
  source = "ransomlook",
  victim = "Victime Test",
  group = "Groupe Test",
): Promise<number> {
  const r = await query<{ id: number }>(
    `INSERT INTO leak_claim
       (fingerprint, source, site_slug, group_name, victim, na, org_id)
     VALUES ($1, $2, 'site-test', $3, $4, true, $5)
     RETURNING id`,
    [fingerprint, source, group, victim, orgId],
  );
  return r.rows[0].id;
}

async function score(claimId: number): Promise<number | null> {
  const r = await query<{ corroboration_score: number }>(
    "SELECT corroboration_score FROM leak_claim WHERE id = $1",
    [claimId],
  );
  return r.rows[0]?.corroboration_score ?? null;
}

async function dansDiffusionPublique(claimId: number): Promise<boolean> {
  const r = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM leak_claim_public WHERE id = $1",
    [claimId],
  );
  return r.rows[0].n > 0;
}

test("annonce isolée : score 0 et absente de la diffusion publique", async () => {
  const orgId = await orgAvecDomaine("corro-isolee", null);
  const claimId = await revendication(`isolee-${Date.now()}`, orgId);

  await query("SELECT recompute_leak_claim_corroboration($1)", [orgId]);

  assert.equal(await score(claimId), 0);
  assert.equal(await dansDiffusionPublique(claimId), false);
});

test("event et seconde source : score 2, donc publiable", async () => {
  const orgId = await orgAvecDomaine("corro-deux-sources", null);
  const claimId = await revendication(`deux-sources-${Date.now()}`, orgId, "ransomlook");

  await query(
    `INSERT INTO source (id, name, family, url)
     VALUES ('test-cert', 'CERT de test', 'cert_fr', 'https://example.invalid/cert')`,
  );
  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, source_id, org_id)
     VALUES ($1, 'ransomware', 'third_party_claim', 'Revendication corroborée', 'test-cert', $2)`,
    [`corro-${Date.now()}`, orgId],
  );

  await query("SELECT recompute_leak_claim_corroboration($1)", [orgId]);

  assert.equal(await score(claimId), 2);
  assert.equal(await dansDiffusionPublique(claimId), true);
});

test("une fuite documentée seule ne suffit pas à publier (score 1)", async () => {
  const domaine = `fuite-${Date.now()}.example`;
  const orgId = await orgAvecDomaine(`corro-fuite-${Date.now()}`, domaine);
  const claimId = await revendication(`fuite-${Date.now()}`, orgId);

  await query(
    `INSERT INTO fuite_reference (id, source, name, domain, source_url)
     VALUES ($1, 'test-fuite', 'Organisation fuite test', $2, 'https://example.invalid/fuite')`,
    [`fuite-${Date.now()}`, domaine],
  );

  await query("SELECT recompute_leak_claim_corroboration($1)", [orgId]);

  assert.equal(await score(claimId), 1);
  assert.equal(await dansDiffusionPublique(claimId), false);
});

test("deux revendications de même victime et groupe : un signal, pas deux", async () => {
  const orgId = await orgAvecDomaine(`corro-reprise-${Date.now()}`, null);
  const victime = `Victime reprise ${Date.now()}`;
  const first = await revendication(`reprise-a-${Date.now()}`, orgId, "ransomlook", victime, "Groupe reprise");
  const second = await revendication(`reprise-b-${Date.now()}`, orgId, "ransomwatch", victime, "Groupe reprise");

  await query("SELECT recompute_leak_claim_corroboration($1)", [orgId]);

  assert.equal(await score(first), 1);
  assert.equal(await score(second), 1);
  assert.equal(await dansDiffusionPublique(first), false);
  assert.equal(await dansDiffusionPublique(second), false);
});
