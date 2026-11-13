/**
 * Annuaire à l'échelle — pagination, facettes et recherche classée côté serveur.
 *
 * Problème résolu : `GET /orgs` renvoyait **toute** la table, sans pagination,
 * et l'interface filtrait en mémoire. À 4 462 organisations ça passe ; à
 * 10 261 (l'instance réelle) le chargement devient lourd ; à 100 000 il tombe.
 *
 * Deux chemins :
 *  - **sans recherche** : tout en SQL — filtrage, tri, pagination, facettes ;
 *  - **avec recherche** : présélection SQL large (y compris par alias et par
 *    préfixe, pour absorber les fautes de frappe), puis classement en mémoire
 *    par `rankOrgs`, puis pagination.
 *
 * Les facettes d'une dimension sont comptées **sans le filtre de cette
 * dimension** : on peut changer de département sans que la liste des
 * départements se vide. Comportement attendu d'un annuaire à facettes.
 *
 * Aucune extension Postgres n'est requise (pas de pg_trgm) : aucune migration.
 */
import { query } from "../db.js";
import { rankOrgs, searchTokens, type RankReason } from "./rank.js";

export type DirectorySort = "relevance" | "name" | "eventCount" | "city" | "dept";
export type DirectoryDir = "asc" | "desc";

export type DirectoryParams = {
	q?: string;
	kind?: string | null;
	sector?: string | null;
	dept?: string | null;
	withEvents?: boolean;
	sort?: DirectorySort;
	dir?: DirectoryDir;
	page?: number;
	limit?: number;
};

export type DirectoryOrg = {
	id: number;
	name: string;
	slug: string;
	kind: string;
	sector: string | null;
	city: string | null;
	dept: string | null;
	website: string | null;
	domain: string | null;
	lat: number | null;
	lon: number | null;
	eventCount: number;
	score?: number;
	reason?: RankReason;
	matchedAlias?: string | null;
};

export type Facet = { value: string; count: number };

export type DirectoryResult = {
	rows: DirectoryOrg[];
	total: number;
	page: number;
	limit: number;
	facets: { kind: Facet[]; sector: Facet[]; dept: Facet[] };
	/** La présélection a atteint son plafond : totaux et facettes approchés. */
	truncated: boolean;
	tookMs: number;
};

/** Plafond de la présélection classée en mémoire. */
const CANDIDATE_CAP = Number(process.env.RADAR_DIRECTORY_CANDIDATES ?? 2000);
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
/** Au-delà, un OFFSET coûte plus cher qu'un curseur : on le refuse explicitement. */
const MAX_PAGE = 1000;

const SORT_COLUMNS: Record<Exclude<DirectorySort, "relevance">, string> = {
	name: "o.name",
	eventCount: "event_count",
	city: "o.city",
	dept: "o.dept",
};

type RawRow = {
	id: number;
	name: string;
	slug: string;
	kind: string;
	sector: string | null;
	city: string | null;
	dept: string | null;
	website: string | null;
	domain: string | null;
	lat: number | null;
	lon: number | null;
	event_count: number;
	aliases: string[] | null;
	total: string | null;
};

const SELECT_FIELDS = `
  o.id, o.name, o.slug, o.kind, o.sector, o.city, o.dept, o.website, o.domain, o.lat, o.lon,
  (SELECT COUNT(*)::int FROM event e WHERE e.org_id = o.id) AS event_count`;

function mapRow(row: RawRow): DirectoryOrg {
	return {
		// org.id est un serial mais les jointures renvoient parfois des chaînes :
		// on normalise, comme ailleurs dans le code.
		id: Number(row.id),
		name: row.name,
		slug: row.slug,
		kind: row.kind,
		sector: row.sector,
		city: row.city,
		dept: row.dept,
		website: row.website,
		domain: row.domain,
		lat: row.lat === null ? null : Number(row.lat),
		lon: row.lon === null ? null : Number(row.lon),
		eventCount: Number(row.event_count ?? 0),
	};
}

/** Construit le WHERE commun. `skip` retire une dimension pour ses facettes. */
function buildWhere(params: DirectoryParams, skip?: "kind" | "sector" | "dept"): {
	sql: string;
	values: unknown[];
} {
	const clauses: string[] = [];
	const values: unknown[] = [];
	const add = (clause: string, value: unknown) => {
		values.push(value);
		clauses.push(clause.replace("?", `$${values.length}`));
	};
	if (params.kind && skip !== "kind") add("o.kind = ?", params.kind);
	if (params.sector && skip !== "sector") add("o.sector = ?", params.sector);
	if (params.dept && skip !== "dept") add("o.dept = ?", params.dept);
	if (params.withEvents) clauses.push("EXISTS (SELECT 1 FROM event e WHERE e.org_id = o.id)");
	return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

async function facet(
	column: "kind" | "sector" | "dept",
	params: DirectoryParams,
): Promise<Facet[]> {
	const { sql, values } = buildWhere(params, column);
	const r = await query<{ value: string | null; n: number }>(
		`SELECT o.${column} AS value, COUNT(*)::int AS n FROM org o ${sql}
		  GROUP BY o.${column} ORDER BY n DESC, value`,
		values,
	);
	return r.rows
		.filter((row): row is { value: string; n: number } => row.value !== null && row.value !== "")
		.map((row) => ({ value: row.value, count: Number(row.n) }));
}

/** `%` et `_` saisis par l'utilisateur sont des littéraux, pas des jokers. */
export function likeLiteral(value: string): string {
	return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function facetsFrom(
	rows: readonly DirectoryOrg[],
	params: DirectoryParams,
): DirectoryResult["facets"] {
	const keep = (org: DirectoryOrg, skip: "kind" | "sector" | "dept") =>
		(!params.kind || skip === "kind" || org.kind === params.kind)
		&& (!params.sector || skip === "sector" || org.sector === params.sector)
		&& (!params.dept || skip === "dept" || org.dept === params.dept);
	const count = (pick: (org: DirectoryOrg) => string | null, skip: "kind" | "sector" | "dept"): Facet[] => {
		const map = new Map<string, number>();
		for (const row of rows) {
			if (!keep(row, skip)) continue;
			const value = pick(row);
			if (!value) continue;
			map.set(value, (map.get(value) ?? 0) + 1);
		}
		return [...map.entries()]
			.map(([value, count]) => ({ value, count }))
			.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "fr"));
	};
	return {
		kind: count((o) => o.kind, "kind"),
		sector: count((o) => o.sector, "sector"),
		dept: count((o) => o.dept, "dept"),
	};
}

export async function queryDirectory(params: DirectoryParams): Promise<DirectoryResult> {
	const started = performance.now();
	const limit = Math.min(MAX_LIMIT, Math.max(1, params.limit ?? DEFAULT_LIMIT));
	const page = Math.min(MAX_PAGE, Math.max(0, params.page ?? 0));
	const q = (params.q ?? "").trim();
	const sort = params.sort ?? (q ? "relevance" : "name");
	const dir: DirectoryDir = params.dir === "desc" ? "desc" : "asc";

	if (q === "") {
		const { sql, values } = buildWhere(params);
		const column = sort === "relevance" ? "o.name" : SORT_COLUMNS[sort];
		const order = `ORDER BY ${column} ${dir.toUpperCase()} NULLS LAST, o.id`;
		const [rowsResult, countResult, kind, sector, dept] = await Promise.all([
			query<RawRow>(
				`SELECT ${SELECT_FIELDS} FROM org o ${sql} ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
				[...values, limit, page * limit],
			),
			query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM org o ${sql}`, values),
			facet("kind", params),
			facet("sector", params),
			facet("dept", params),
		]);
		return {
			rows: rowsResult.rows.map(mapRow),
			total: Number(countResult.rows[0]?.n ?? 0),
			page,
			limit,
			facets: { kind, sector, dept },
			truncated: false,
			tookMs: Number((performance.now() - started).toFixed(1)),
		};
	}

	// Présélection : sous-chaîne sur le nom, la ville, le domaine et les alias,
	// plus un préfixe de quatre caractères pour absorber une faute de frappe
	// (« pesssak » doit quand même atteindre « Pessac », que le flou départage).
	const tokens = searchTokens(q);
	const patterns = new Set<string>([`%${likeLiteral(q.toLowerCase())}%`]);
	for (const token of tokens) {
		patterns.add(`%${likeLiteral(token)}%`);
		if (token.length >= 5) patterns.add(`${likeLiteral(token.slice(0, 4))}%`);
	}
	// Les filtres de facette sont appliqués après classement, pour que les
	// compteurs de chaque dimension restent calculés hors de leur propre filtre.
	const { sql, values } = buildWhere({ ...params, kind: null, sector: null, dept: null });
	const where = sql === "" ? "WHERE" : `${sql} AND`;
	values.push([...patterns]);
	const patternIndex = values.length;
	const candidates = await query<RawRow>(
		`SELECT ${SELECT_FIELDS},
		        (SELECT array_agg(a.alias) FROM org_alias a WHERE a.org_id = o.id) AS aliases
		   FROM org o
		   ${where} (
		     o.name ILIKE ANY($${patternIndex}::text[])
		     OR COALESCE(o.city,'') ILIKE ANY($${patternIndex}::text[])
		     OR COALESCE(o.domain,'') ILIKE ANY($${patternIndex}::text[])
		     OR EXISTS (SELECT 1 FROM org_alias a WHERE a.org_id = o.id AND a.alias ILIKE ANY($${patternIndex}::text[]))
		   )
		   ORDER BY event_count DESC, o.name, o.id
		   LIMIT ${CANDIDATE_CAP + 1}`,
		values,
	);

	const truncated = candidates.rows.length > CANDIDATE_CAP;
	const pool = candidates.rows.slice(0, CANDIDATE_CAP).map((row) => ({
		...mapRow(row),
		aliases: row.aliases ?? [],
	}));
	let ranked = rankOrgs(pool, q);
	if (sort !== "relevance") {
		const key = sort;
		ranked = [...ranked].sort((a, b) => {
			const left = key === "eventCount" ? a.eventCount : String(a[key] ?? "");
			const right = key === "eventCount" ? b.eventCount : String(b[key] ?? "");
			const comparison = typeof left === "number" && typeof right === "number"
				? left - right
				: String(left).localeCompare(String(right), "fr");
			if (comparison !== 0) return dir === "desc" ? -comparison : comparison;
			return dir === "desc" ? b.id - a.id : a.id - b.id;
		});
	}

	const filtered = ranked.filter((org) =>
		(!params.kind || org.kind === params.kind)
		&& (!params.sector || org.sector === params.sector)
		&& (!params.dept || org.dept === params.dept));
	const rows = filtered.slice(page * limit, page * limit + limit).map((org) => {
		const { aliases: _aliases, ...rest } = org;
		return rest;
	});
	// Les facettes avec recherche portent sur l'ensemble classé, pas sur la
	// page. Si la présélection a été plafonnée, `truncated` le dit.
	const facets = facetsFrom(ranked, params);
	return {
		rows,
		total: filtered.length,
		page,
		limit,
		facets,
		truncated,
		tookMs: Number((performance.now() - started).toFixed(1)),
	};
}
