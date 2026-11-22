/**
 * Bi-temporal reads and writes for the organisation reference.
 *
 * Every version lives in org_history (or org_alias_history), including the
 * current one. Two clocks describe each row:
 *   valid_from / valid_to     when the fact was true in the world;
 *   recorded_at / superseded_at  when the radar knew it.
 * `superseded_at IS NULL` is the assertion currently held by the radar;
 * `valid_to IS NULL` is the state still true in the world.
 *
 * The migration 070 triggers maintain these tables on every INSERT, UPDATE and
 * DELETE of the source tables, so no write path can bypass the history. This
 * module only reads the versions and sets the actor for a deliberate mutation.
 */

import { query, withClient } from "../db.js";
import { consigner } from "../journal/index.js";

export type OrgVersion = {
	id: number;
	org_id: number;
	name: string;
	slug: string;
	kind: string;
	sector: string | null;
	city: string | null;
	dept: string | null;
	website: string | null;
	domain: string | null;
	status: string;
	lat: number | null;
	lon: number | null;
	entity_code: string | null;
	entity_source: string | null;
	valid_from: string;
	valid_to: string | null;
	recorded_at: string;
	superseded_at: string | null;
	actor: string;
};

export type AliasVersion = {
	org_id: number;
	alias: string;
	valid_from: string;
	valid_to: string | null;
	recorded_at: string;
	superseded_at: string | null;
	actor: string;
};

export type ClockOptions = {
	asOfValid?: string | Date | null;
	asOfRecorded?: string | Date | null;
};

function iso(value: string | Date): string {
	const t = value instanceof Date ? value.getTime() : Date.parse(value);
	if (Number.isNaN(t)) throw new Error(`invalid date: ${String(value)}`);
	return new Date(t).toISOString();
}

/** SQL conditions for the explicit clocks, with positional parameters in order. */
function clockFilters(options: ClockOptions): { conditions: string[]; values: unknown[] } {
	const conditions: string[] = [];
	const values: unknown[] = [];
	if (options.asOfValid) {
		const valid = iso(options.asOfValid);
		values.push(valid);
		conditions.push(`valid_from <= $${values.length}::timestamptz`);
		values.push(valid);
		conditions.push(`(valid_to IS NULL OR valid_to > $${values.length}::timestamptz)`);
	} else {
		conditions.push("valid_to IS NULL");
	}
	if (options.asOfRecorded) {
		const recorded = iso(options.asOfRecorded);
		values.push(recorded);
		conditions.push(`recorded_at <= $${values.length}::timestamptz`);
		values.push(recorded);
		conditions.push(`(superseded_at IS NULL OR superseded_at > $${values.length}::timestamptz)`);
	}
	return { conditions, values };
}

/**
 * Without an explicit recorded time, keep the most recently learned assertion
 * of each row: reading the world of 2024 today must show today's knowledge of
 * 2024, not an assertion already superseded before the reader was born.
 */
function versionQuery(table: string, key: string, columns: string, options: ClockOptions) {
	const { conditions, values } = clockFilters(options);
	const latest = !options.asOfRecorded;
	const sql = `SELECT * FROM (
		SELECT ${latest ? `DISTINCT ON (${key})` : ""} ${columns}
		  FROM ${table}
		 WHERE ${conditions.join(" AND ")}
		 ${latest ? `ORDER BY ${key}, recorded_at DESC, id DESC` : ""}
	) v ORDER BY ${key === "org_id" ? "name, org_id" : "alias, org_id"}`;
	return { sql, values };
}

/** Organisations true at asOfValid, as known at asOfRecorded. */
export async function orgsValidesAu(options: ClockOptions = {}): Promise<OrgVersion[]> {
	const { sql, values } = versionQuery(
		"org_history",
		"org_id",
		`org_id AS id, org_id, name, slug, kind, sector, city, dept, website, domain, status,
		 lat, lon, entity_code, entity_source,
		 valid_from::text, valid_to::text, recorded_at::text, superseded_at::text, actor`,
		options,
	);
	const { rows } = await query<OrgVersion>(sql, values);
	return rows;
}

/** Aliases true at asOfValid, as known at asOfRecorded. */
export async function aliasValidesAu(options: ClockOptions = {}): Promise<AliasVersion[]> {
	const { sql, values } = versionQuery(
		"org_alias_history",
		"org_alias_id",
		`org_alias_id, org_id, alias, valid_from::text, valid_to::text,
		 recorded_at::text, superseded_at::text, actor`,
		options,
	);
	const { rows } = await query<AliasVersion>(sql, values);
	return rows;
}

export const MUTABLE_ORG_COLUMNS = [
	"name",
	"slug",
	"kind",
	"sector",
	"city",
	"dept",
	"website",
	"domain",
	"status",
] as const;

/**
 * Close one version and open the next. The trigger archives the old row and
 * records the new one; the caller only supplies the new values and, optionally,
 * the date the change took effect in the world (`validFrom`).
 */
export async function muterOrganisation(options: {
	orgId: number;
	changes: Partial<Pick<OrgVersion, "name" | "slug" | "kind" | "sector" | "city" | "dept" | "website" | "domain" | "status">>;
	validFrom?: string | Date | null;
	actor?: string;
}): Promise<void> {
	const validFrom = options.validFrom ? iso(options.validFrom) : new Date().toISOString();
	const actor = options.actor ?? "system";

	const allowed = new Set<string>(MUTABLE_ORG_COLUMNS);
	for (const key of Object.keys(options.changes)) {
		if (!allowed.has(key)) throw new Error(`colonne non modifiable : ${key}`);
	}

	await withClient(async (client) => {
		await client.query("BEGIN");
		try {
			await client.query("SELECT set_config('radar.actor', $1, true)", [actor]);
			const setters: string[] = [];
			const values: unknown[] = [];
			for (const [key, value] of Object.entries(options.changes)) {
				values.push(value);
				setters.push(`${key}=$${values.length}`);
			}
			values.push(validFrom);
			setters.push(`valid_from=$${values.length}`);
			values.push(options.orgId);
			await client.query(`UPDATE org SET ${setters.join(", ")} WHERE id=$${values.length}`, values);
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		}
	});

	await consigner({
		kind: "org.changed",
		subject: `org:${options.orgId}`,
		summary: `org ${options.orgId} changed: ${Object.keys(options.changes).join(", ")}`,
		actor,
		payload: { orgId: options.orgId, changes: options.changes, validFrom },
		validAt: validFrom,
	});
}
