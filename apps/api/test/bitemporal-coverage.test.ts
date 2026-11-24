import { test } from "node:test";
import assert from "node:assert/strict";
import { query, withClient } from "../src/db.js";
import { aliasValidesAu, muterOrganisation, orgsValidesAu } from "../src/referentiel/bitemporal.js";
import { backfillBitemporalVersions } from "../src/referentiel/bitemporal-backfill.js";

const slug = () => `coverage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function insertOrg(name: string, dept = "33", validFrom = "2023-01-01T00:00:00Z"): Promise<number> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, city, dept, valid_from)
     VALUES ($1, $2, 'collectivite', 'Testville', $3, $4) RETURNING id`,
    [name, slug(), dept, validFrom],
  );
  return rows[0]!.id;
}

async function cleanup(orgId: number): Promise<void> {
  await query("DELETE FROM org_alias_history WHERE org_id=$1", [orgId]);
  await query("DELETE FROM org_history WHERE org_id=$1", [orgId]);
  await query("DELETE FROM org_alias WHERE org_id=$1", [orgId]);
  await query("DELETE FROM org WHERE id=$1", [orgId]);
}

test("insert opens exactly one version with both clocks", async () => {
  const id = await insertOrg(`Coverage insert ${slug()}`);
  try {
    const { rows } = await query<{ recorded_at: string; superseded_at: string | null; valid_from: string }>(
      "SELECT recorded_at, superseded_at, valid_from FROM org_history WHERE org_id=$1", [id],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.superseded_at, null);
    assert.ok(rows[0]!.recorded_at);
    assert.equal(new Date(rows[0]!.valid_from).toISOString(), "2023-01-01T00:00:00.000Z");
  } finally {
    await cleanup(id);
  }
});

test("a raw SQL update is historized without caller cooperation", async () => {
  const id = await insertOrg(`Coverage raw ${slug()}`);
  try {
    await query("UPDATE org SET name=$2 WHERE id=$1", [id, `Renamed ${id}`]);
    const { rows } = await query<{ name: string; superseded_at: string | null }>(
      "SELECT name, superseded_at FROM org_history WHERE org_id=$1 ORDER BY id", [id],
    );
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0]!.superseded_at, null, "the former assertion must be closed");
    assert.equal(rows[1]!.superseded_at, null);
    assert.equal(rows[1]!.name, `Renamed ${id}`);
  } finally {
    await cleanup(id);
  }
});

test("alias insert and alias update are both historized", async () => {
  const id = await insertOrg(`Coverage alias ${slug()}`);
  try {
    const { rows: inserted } = await query<{ id: number }>(
      "INSERT INTO org_alias (org_id, alias, source, valid_from) VALUES ($1,$2,'test','2023-01-01') RETURNING id",
      [id, `alias-${id}`],
    );
    const aliasId = inserted[0]!.id;
    await query("UPDATE org_alias SET alias=$2 WHERE id=$1", [aliasId, `renamed-alias-${id}`]);
    const { rows } = await query<{ alias: string; superseded_at: string | null }>(
      "SELECT alias, superseded_at FROM org_alias_history WHERE org_alias_id=$1 ORDER BY id", [aliasId],
    );
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0]!.superseded_at, null);
    assert.equal(rows[1]!.alias, `renamed-alias-${id}`);
  } finally {
    await cleanup(id);
  }
});

test("valid-time read keeps the former name after a rename", async () => {
  const id = await insertOrg(`Coverage valid ${slug()}`);
  try {
    await muterOrganisation({
      orgId: id,
      changes: { name: `Merged ${id}` },
      validFrom: "2024-06-01T00:00:00Z",
      actor: "test:coverage",
    });
    const before = await orgsValidesAu({ asOfValid: "2024-01-15" });
    const after = await orgsValidesAu({ asOfValid: "2024-07-01" });
    assert.ok(before.some((row) => row.org_id === id && row.name.startsWith("Coverage valid")));
    assert.ok(after.some((row) => row.org_id === id && row.name === `Merged ${id}`));
    assert.ok(!after.some((row) => row.org_id === id && row.name.startsWith("Coverage valid")));
  } finally {
    await cleanup(id);
  }
});

test("recorded-time read separates what was known before and after a correction", async () => {
  const id = await insertOrg(`Coverage recorded ${slug()}`);
  try {
    await query("UPDATE org SET name=$2 WHERE id=$1", [id, `Corrected ${id}`]);

    // The trigger stamps recorded clocks with now() (microseconds), while the
    // API truncates asOfRecorded to milliseconds. Align the two versions to
    // exact clocks so an explicit clock can be chosen strictly between them
    // regardless of how fast the insert and update statements execute.
    await query(
      `UPDATE org_history
          SET recorded_at = CASE WHEN superseded_at IS NULL
                                 THEN TIMESTAMPTZ '2026-01-02T00:00:00Z'
                                 ELSE TIMESTAMPTZ '2026-01-01T00:00:00Z' END,
              superseded_at = CASE WHEN superseded_at IS NULL
                                   THEN NULL
                                   ELSE TIMESTAMPTZ '2026-01-02T00:00:00Z' END
        WHERE org_id=$1`, [id],
    );

    const { rows: versions } = await query<{ recorded_at: string }>(
      "SELECT recorded_at::text AS recorded_at FROM org_history WHERE org_id=$1 ORDER BY id", [id],
    );
    assert.equal(versions.length, 2);
    const oldRecorded = Date.parse(versions[0]!.recorded_at);
    const newRecorded = Date.parse(versions[1]!.recorded_at);
    const asOfRecorded = new Date((oldRecorded + newRecorded) / 2).toISOString();
    assert.ok(Date.parse(asOfRecorded) > oldRecorded && Date.parse(asOfRecorded) < newRecorded);

    const oldRead = await orgsValidesAu({ asOfValid: "2024-01-15", asOfRecorded });
    const newRead = await orgsValidesAu({
      asOfValid: "2024-01-15",
      asOfRecorded: new Date(newRecorded + 60_000).toISOString(),
    });
    assert.ok(oldRead.some((row) => row.org_id === id && row.name.startsWith("Coverage recorded")));
    assert.ok(!oldRead.some((row) => row.org_id === id && row.name.startsWith("Corrected")));
    assert.ok(newRead.some((row) => row.org_id === id && row.name.startsWith("Corrected")));
    assert.ok(!newRead.some((row) => row.org_id === id && row.name.startsWith("Coverage recorded")));
  } finally {
    await cleanup(id);
  }
});

test("repeated changes leave one open assertion per organisation", async () => {
  const id = await insertOrg(`Coverage open ${slug()}`);
  try {
    await query("UPDATE org SET name=$2 WHERE id=$1", [id, `Second ${id}`]);
    await query("UPDATE org SET city=$2 WHERE id=$1", [id, "Limoges"]);
    const { rows } = await query<{ n: number }>(
      "SELECT count(*)::int AS n FROM org_history WHERE org_id=$1 AND superseded_at IS NULL", [id],
    );
    assert.equal(rows[0]!.n, 1);
    const current = await orgsValidesAu();
    assert.equal(current.filter((row) => row.org_id === id).length, 1);
    assert.equal(current.find((row) => row.org_id === id)!.city, "Limoges");
  } finally {
    await cleanup(id);
  }
});

test("backfill covers a pre-trigger row and is idempotent", async () => {
  let id = 0;
  await withClient(async (client) => {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO org (name, slug, kind, city, dept, valid_from)
       VALUES ($1,$2,'collectivite','Testville','33','2022-01-01') RETURNING id`,
      [`Coverage legacy ${slug()}`, slug()],
    );
    id = rows[0]!.id;
    await client.query("COMMIT");
    const first = await backfillBitemporalVersions(client);
    assert.ok(first.organisations >= 1);
    const second = await backfillBitemporalVersions(client);
    assert.equal(second.organisations, 0);
  });
  try {
    const { rows } = await query<{ actor: string; recorded_at: string }>(
      "SELECT actor, recorded_at FROM org_history WHERE org_id=$1", [id],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.actor, "backfill");
    assert.ok(rows[0]!.recorded_at);
  } finally {
    await cleanup(id);
  }
});

test("alias read uses the recorded clock of the history table", async () => {
  const id = await insertOrg(`Coverage alias read ${slug()}`);
  try {
    await query(
      "INSERT INTO org_alias (org_id, alias, source, valid_from, valid_to) VALUES ($1,$2,'test','2023-01-01','2025-01-01')",
      [id, `read-alias-${id}`],
    );
    const rows = await aliasValidesAu({ asOfValid: "2024-01-01" });
    assert.ok(rows.some((row) => row.org_id === id && row.alias === `read-alias-${id}`));
    const future = await aliasValidesAu({ asOfValid: "2030-01-01" });
    assert.ok(!future.some((row) => row.org_id === id && row.alias === `read-alias-${id}`));
  } finally {
    await cleanup(id);
  }
});
