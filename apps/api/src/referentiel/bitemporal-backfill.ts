/**
 * Idempotent backfill of bitemporal versions for rows that predate migration
 * 070. The triggers cover future writes; these functions fill the gap without
 * changing the source rows. Large tables are filled in bounded id slices so
 * every command stays under the 60 s budget, even under concurrent load.
 */

export type SqlClient = {
	query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
};

const ORG_COLUMNS = `org_id, name, slug, kind, sector, city, dept, website, domain, status,
  lat, lon, entity_code, entity_source, effectif_min, parent_org_id,
  valid_from, valid_to, recorded_at, superseded_at, actor`;
const ALIAS_COLUMNS = `org_alias_id, org_id, alias, source, status, rejected_at,
  nom_normalise, valid_from, valid_to, recorded_at, superseded_at, actor`;

export const BACKFILL_INDEXES = [
	`DROP INDEX IF EXISTS org_history_org_valid_idx, org_history_valid_idx, org_history_recorded_idx,
	   org_alias_history_org_valid_idx, org_alias_history_recorded_idx, org_alias_history_open_idx`,
	`CREATE INDEX org_history_org_valid_idx ON org_history (org_id, valid_from, valid_to)`,
	`CREATE INDEX org_history_valid_idx ON org_history (valid_from, valid_to)`,
	`CREATE INDEX org_history_recorded_idx ON org_history (recorded_at DESC)`,
	`CREATE INDEX org_alias_history_org_valid_idx ON org_alias_history (org_id, valid_from, valid_to)`,
	`CREATE INDEX org_alias_history_recorded_idx ON org_alias_history (recorded_at DESC)`,
	`CREATE INDEX org_alias_history_open_idx ON org_alias_history (org_id) WHERE superseded_at IS NULL`,
];

async function skipForeignKeyChecks(client: SqlClient): Promise<void> {
	const { rows } = await client.query<{ super: boolean }>(
		"SELECT rolsuper AS super FROM pg_roles WHERE rolname = current_user",
	);
	if (rows[0]?.super) {
		// Source rows and primary keys are untouched; only the check is skipped.
		await client.query("SET LOCAL session_replication_role = replica");
	}
}

const INT32_MAX = 2_147_483_647;

/** Insert one bounded slice of organisation versions; returns the row count. */
export async function backfillOrgSlice(
	client: SqlClient,
	afterId: number,
	beforeId: number,
): Promise<number> {
	await client.query("BEGIN");
	try {
		await skipForeignKeyChecks(client);
		const { rowCount } = await client.query(`
      INSERT INTO org_history (${ORG_COLUMNS})
      SELECT o.id, o.name, o.slug, o.kind, o.sector, o.city, o.dept, o.website, o.domain, o.status,
             o.lat, o.lon, o.entity_code, o.entity_source, o.effectif_min, o.parent_org_id,
             o.valid_from, o.valid_to, COALESCE(o.created_at, o.valid_from), NULL, 'backfill'
        FROM org o
       WHERE o.id > $1 AND o.id <= $2
         AND NOT EXISTS (SELECT 1 FROM org_history h WHERE h.org_id = o.id)`, [afterId, beforeId]);
		await client.query("COMMIT");
		return rowCount ?? 0;
	} catch (error) {
		await client.query("ROLLBACK").catch(() => {});
		throw error;
	}
}

/** Insert one bounded slice of alias versions; returns the row count. */
export async function backfillAliasSlice(
	client: SqlClient,
	afterId: number,
	beforeId: number,
): Promise<number> {
	await client.query("BEGIN");
	try {
		await skipForeignKeyChecks(client);
		const { rowCount } = await client.query(`
      INSERT INTO org_alias_history (${ALIAS_COLUMNS})
      SELECT a.id, a.org_id, a.alias, a.source, a.status, a.rejected_at, a.nom_normalise,
             a.valid_from, a.valid_to, COALESCE(a.created_at, a.valid_from), NULL, 'backfill'
        FROM org_alias a
       WHERE a.id > $1 AND a.id <= $2
         AND NOT EXISTS (SELECT 1 FROM org_alias_history h WHERE h.org_alias_id = a.id)`, [afterId, beforeId]);
		await client.query("COMMIT");
		return rowCount ?? 0;
	} catch (error) {
		await client.query("ROLLBACK").catch(() => {});
		throw error;
	}
}

/** Whole-table convenience path used by the small test database. */
export async function backfillBitemporalVersions(
	client: SqlClient,
): Promise<{ organisations: number; aliases: number }> {
	await client.query("BEGIN");
	try {
		await skipForeignKeyChecks(client);
		for (const sql of BACKFILL_INDEXES) await client.query(sql);
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK").catch(() => {});
		throw error;
	}
	const organisations = await backfillOrgSlice(client, 0, INT32_MAX);
	const aliases = await backfillAliasSlice(client, 0, INT32_MAX);
	return { organisations, aliases };
}
