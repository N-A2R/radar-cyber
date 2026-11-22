/**
 * Chaque fait publié doit remonter à une URL source, une date de connaissance,
 * une date de collecte et une licence de réutilisation non nulles.
 *
 * Le test rejoue la migration 200 sur une source sans licence et un fait sans
 * URL source : c'est exactement le cas qui faisait échouer le critère externe.
 * Le rejeu est idempotent par construction (IF NOT EXISTS / ON CONFLICT).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { query } from "../src/db.js";

const MIGRATION = readFileSync(
  fileURLToPath(new URL("../../../db/migrate-200-export-public-provenance.sql", import.meta.url)),
  "utf8",
);
const CRITERION =
  "SELECT count(*) FROM event e LEFT JOIN source s ON s.id=e.source_id " +
  "WHERE e.id IN (SELECT event_id FROM export_public_event) " +
  "AND (e.source_url IS NULL OR e.at IS NULL OR s.license IS NULL OR e.collected_at IS NULL)";

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const sourceId = `provenance-test-${suffix}`;
const dedupKey = `public:provenance-test:${suffix}`;

describe("export public : provenance et licence", () => {
  it("complète la chaîne d'un fait sans URL ni licence puis le publie", async () => {
    await query(
      `INSERT INTO source (id, name, family, url, license)
       VALUES ($1, $2, 'ransomware', $3, NULL)`,
      [sourceId, "Source de test provenance", `https://example.invalid/${suffix}`],
    );
    const inserted = await query<{ id: string }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, source_id, source_url, observed_at)
       VALUES ($1, 'ransomware', 'third_party_claim', 'Fait sans URL', $2, NULL, now())
       RETURNING id::text AS id`,
      [dedupKey, sourceId],
    );
    const eventId = Number(inserted.rows[0]!.id);

    await query(MIGRATION);

    const row = await query<{
      license: string | null;
      source_url: string | null;
      at: Date | null;
      collected_at: Date | null;
      exported_at: Date | null;
    }>(
      `SELECT s.license, e.source_url, e.at, e.collected_at, x.exported_at
         FROM event e
         JOIN source s ON s.id = e.source_id
         LEFT JOIN export_public_event x ON x.event_id = e.id
        WHERE e.id = $1`,
      [eventId],
    );
    const provenance = row.rows[0]!;
    assert.ok(provenance.license && provenance.license.length > 0, "licence backfillée");
    assert.equal(provenance.source_url, `https://example.invalid/${suffix}`, "URL depuis la source");
    assert.ok(provenance.at instanceof Date, "date de connaissance conservée");
    assert.ok(provenance.collected_at instanceof Date, "date de collecte conservée");
    assert.ok(provenance.exported_at instanceof Date, "fait inscrit dans l'export daté");

    const criterion = await query<{ count: string }>(CRITERION);
    assert.equal(criterion.rows[0]!.count, "0");
  });

  it("refuse une ligne d'export dont l'URL ou la licence est vide", async () => {
    const inserted = await query<{ id: string }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, source_id, source_url, tlp)
       VALUES ($1, 'ransomware', 'third_party_claim', 'Fait public', $2,
               'https://example.invalid/public', 'CLEAR')
       RETURNING id::text AS id`,
      [`${dedupKey}-cleare`, sourceId],
    );
    const eventId = Number(inserted.rows[0]!.id);

    await assert.rejects(
      query(
        `INSERT INTO export_public_event (event_id, source_url, at, collected_at, license)
         VALUES ($1, '', now(), now(), 'Unlicense')`,
        [eventId],
      ),
      /export_public_event_url_nonvide/,
    );
    await assert.rejects(
      query(
        `INSERT INTO export_public_event (event_id, source_url, at, collected_at, license)
         VALUES ($1, 'https://example.invalid/public', now(), now(), '')`,
        [eventId],
      ),
      /export_public_event_license_nonvide/,
    );
  });
});
