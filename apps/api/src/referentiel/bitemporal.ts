/**
 * Bi-temporalité des organisations (chantier 4).
 *
 * Une organisation n'est pas immuable : fusion de communes (ex. Châtellerault
 * absorbe une commune en 2023), renommage d'entreprise, changement de périmètre
 * (EPCI qui s'étend). Si on réécrit `org` sans garder l'histoire, un incident
 * de 2024 se rattache à une organisation qui n'existait qu'en 2025 — ou pire,
 * à une organisation qui n'existait plus.
 *
 * Modèle : deux temps par fait, comme le journal, mais sur les organisations.
 *   * `valid_from` / `valid_to` — quand l'organisation portait ce nom / ce
 *     périmètre dans le monde (temps valide). `valid_to = null` signifie
 *     « encore valide ».
 *   * `recorded_at` / `superseded_at` — quand le radar l'a appris (temps
 *     transaction). Le journal fait déjà ce travail pour les décisions ; ce
 *     module le fait pour le référentiel.
 *
 * Lecture `as_of` : on veut l'état **valide** à une date donnée, **tel que
 * connu** à une date donnée. Par défaut on lit l'état actuel (valid_to IS NULL,
 * enregistré avant maintenant) ; avec `asOfValid` on lit le monde à une date
 * passée, avec `asOfRecorded` on lit ce que savait le radar à une date passée.
 *
 * Écriture : jamais d'UPDATE destructif. On ferme la ligne valide (`valid_to =
 * maintenant`) et on ouvre une nouvelle ligne dans `org_history`, qui garde
 * l'enveloppe. La projection `org` reste la version courante pour les lectures
 * sans `as_of`.
 */

import { query, withClient } from "../db.js";

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

// Intervalle ouvert en fin : [from, to) avec to = null = +∞
function encadre(date: string): string {
	const t = Date.parse(date);
	if (Number.isNaN(t)) throw new Error(`date invalide : ${date}`);
	return new Date(t).toISOString();
}

/**
 * Lit les organisations valides à une date donnée.
 *
 * Sans argument : l'état courant (valid_to IS NULL). Avec `asOfValid` : l'état
 * valide dans le monde à cette date. Avec `asOfRecorded` : l'état tel que connu
 * par le radar à cette date (filtre sur recorded_at).
 */
export async function orgsValidesAu(options: {
	asOfValid?: string | Date | null;
	asOfRecorded?: string | Date | null;
} = {}): Promise<OrgVersion[]> {
	const valid = options.asOfValid ? encadre(String(options.asOfValid)) : null;
	const recorded = options.asOfRecorded ? encadre(String(options.asOfRecorded)) : null;

	// Sans filtre, on lit la projection courante — la plus rapide, indexée par
	// valid_to IS NULL. Avec filtre temporel, on interroge org_history + org
	// (les deux doivent être lus, car une organisation peut n'avoir jamais
	// changé et n'avoir qu'une ligne dans org).
	if (!valid && !recorded) {
		const { rows } = await query<OrgVersion>(
			`SELECT id, id AS org_id, name, slug, kind, sector, city, dept, website, domain, status,
			        lat, lon, entity_code, entity_source,
			        valid_from::text, valid_to::text, now()::text AS recorded_at, null::text AS superseded_at, 'system' AS actor
			 FROM org WHERE valid_to IS NULL ORDER BY name`,
		);
		return rows;
	}

	// Lecture bi-temporelle : org_history porte les versions closes, org la
	// version courante. Les deux temps sont des filtres optionnels.
	const conditions: string[] = [];
	const valeurs: unknown[] = [];
	const push = (sql: string, v: unknown) => {
		valeurs.push(v);
		conditions.push(sql.replace("?", `$${valeurs.length}`));
	};

	// Temps valide : l'organisation existait à cette date.
	if (valid) {
		// [valid_from, valid_to) contient `valid`
		push("(valid_from <= ?::timestamptz AND (valid_to IS NULL OR valid_to > ?::timestamptz))", valid);
		valeurs.push(valid); // second placeholder pour le > valid_to
		conditions[conditions.length - 1] = conditions[conditions.length - 1]!.replace("$1", `$${valeurs.length - 1}`).replace("$2", `$${valeurs.length}`);
		// Ajustement : la ligne ci-dessus a mal remplacé ; on reconstruit proprement
		conditions.pop();
		valeurs.pop(); valeurs.pop();
		push("valid_from <= ?::timestamptz", valid);
		push("(valid_to IS NULL OR valid_to > ?::timestamptz)", valid);
	}
	if (recorded) {
		push("recorded_at <= ?::timestamptz", recorded);
		push("(superseded_at IS NULL OR superseded_at > ?::timestamptz)", recorded);
	}

	const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

	const sql = `
		SELECT id, org_id, name, slug, kind, sector, city, dept, website, domain, status,
		       lat, lon, entity_code, entity_source,
		       valid_from::text, valid_to::text, recorded_at::text, superseded_at::text, actor
		FROM org_history
		${where}
		UNION ALL
		SELECT id, id AS org_id, name, slug, kind, sector, city, dept, website, domain, status,
		       lat, lon, entity_code, entity_source,
		       valid_from::text, valid_to::text, now()::text AS recorded_at, null::text AS superseded_at, 'system' AS actor
		FROM org
		${where.replace(/recorded_at/g, "now()").replace(/superseded_at/g, "null")}
		ORDER BY name`;

	// Simplification : pour org (projection), les conditions sur recorded_at
	// n'ont pas de sens — on les retire côté org en remplaçant par true.
	// On fait deux requêtes plus lisibles plutôt qu'une UNION complexe.

	const histConds: string[] = [];
	const histVals: unknown[] = [];
	if (valid) {
		histVals.push(valid);
		histConds.push(`valid_from <= $${histVals.length}::timestamptz`);
		histVals.push(valid);
		histConds.push(`(valid_to IS NULL OR valid_to > $${histVals.length}::timestamptz)`);
	}
	if (recorded) {
		histVals.push(recorded);
		histConds.push(`recorded_at <= $${histVals.length}::timestamptz`);
		histVals.push(recorded);
		histConds.push(`(superseded_at IS NULL OR superseded_at > $${histVals.length}::timestamptz)`);
	}
	const histWhere = histConds.length ? `WHERE ${histConds.join(" AND ")}` : "";
	const histRows = await query<OrgVersion>(
		`SELECT id, org_id, name, slug, kind, sector, city, dept, website, domain, status,
		        lat, lon, entity_code, entity_source,
		        valid_from::text, valid_to::text, recorded_at::text, superseded_at::text, actor
		 FROM org_history ${histWhere} ORDER BY name`,
		histVals,
	);

	const curWhere: string[] = [];
	const curVals: unknown[] = [];
	if (valid) {
		curVals.push(valid);
		curWhere.push(`valid_from <= $${curVals.length}::timestamptz`);
		curVals.push(valid);
		curWhere.push(`(valid_to IS NULL OR valid_to > $${curVals.length}::timestamptz)`);
	}
	if (recorded) {
		curVals.push(recorded);
		curWhere.push(`valid_from <= $${curVals.length}::timestamptz`);
	}
	const curSql = `SELECT id, id AS org_id, name, slug, kind, sector, city, dept, website, domain, status,
	                       lat, lon, entity_code, entity_source,
	                       valid_from::text, valid_to::text, now()::text AS recorded_at, null::text AS superseded_at, 'system' AS actor
	                FROM org ${curWhere.length ? `WHERE ${curWhere.join(" AND ")}` : "WHERE valid_to IS NULL"} ORDER BY name`;
	const curRows = await query<OrgVersion>(curSql, curVals);

	return [...histRows.rows, ...curRows.rows];
}

/** Même chose pour les alias — un alias peut naître ou mourir à une date. */
export async function aliasValidesAu(options: {
	asOfValid?: string | Date | null;
	asOfRecorded?: string | Date | null;
} = {}): Promise<{ org_id: number; alias: string; valid_from: string; valid_to: string | null }[]> {
	const valid = options.asOfValid ? encadre(String(options.asOfValid)) : null;
	const conditions: string[] = [];
	const vals: unknown[] = [];
	if (valid) {
		vals.push(valid);
		conditions.push(`valid_from <= $${vals.length}::timestamptz`);
		vals.push(valid);
		conditions.push(`(valid_to IS NULL OR valid_to > $${vals.length}::timestamptz)`);
	}
	const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "WHERE valid_to IS NULL";
	const { rows } = await query(
		`SELECT org_id, alias, valid_from::text, valid_to::text FROM org_alias ${where} ORDER BY alias`,
		vals,
	);
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
 * Ferme une version d'organisation (fusion, renommage, changement de périmètre)
 * et ouvre la suivante. Jamais d'UPDATE destructif : on archive l'ancienne
 * version dans org_history, on met à jour org.
 *
 * `validFrom` = quand le changement a pris effet dans le monde (date de
 * fusion, publication au JO). Par défaut, maintenant.
 */
export async function muterOrganisation(options: {
	orgId: number;
	changes: Partial<Pick<OrgVersion, "name" | "slug" | "kind" | "sector" | "city" | "dept" | "website" | "domain" | "status">>;
	validFrom?: string | Date | null;
	actor?: string;
}): Promise<void> {
	const validFrom = options.validFrom ? encadre(String(options.validFrom)) : new Date().toISOString();
	const actor = options.actor ?? "system";

	// Whitelist des colonnes modifiables
	const allowed = new Set<string>(MUTABLE_ORG_COLUMNS);
	for (const k of Object.keys(options.changes)) {
		if (!allowed.has(k)) {
			throw new Error(`colonne non modifiable : ${k}`);
		}
	}

	await withClient(async (client) => {
		await client.query("BEGIN");
		try {
			// 1. Lire l'état courant
			const { rows } = await client.query(
				`SELECT id, id AS org_id, name, slug, kind, sector, city, dept, website, domain, status,
				        lat, lon, entity_code, entity_source, valid_from::text, valid_to::text
				 FROM org WHERE id=$1`,
				[options.orgId],
			);
			const cur = rows[0];
			if (!cur) throw new Error(`organisation ${options.orgId} introuvable`);

			// 2. Archiver l'ancienne version dans org_history
			await client.query(
				`INSERT INTO org_history (org_id, name, slug, kind, sector, city, dept, website, domain, status,
				                          lat, lon, entity_code, entity_source, valid_from, valid_to, recorded_at, actor)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now(), $17)`,
				[
					cur.org_id,
					cur.name,
					cur.slug,
					cur.kind,
					cur.sector,
					cur.city,
					cur.dept,
					cur.website,
					cur.domain,
					cur.status,
					cur.lat,
					cur.lon,
					cur.entity_code,
					cur.entity_source,
					cur.valid_from,
					validFrom,
					actor,
				],
			);

			// 3. Mettre à jour la projection
			const setters: string[] = [];
			const vals: unknown[] = [];
			for (const [k, v] of Object.entries(options.changes)) {
				vals.push(v);
				setters.push(`${k}=$${vals.length}`);
			}
			vals.push(validFrom);
			setters.push(`valid_from=$${vals.length}`);
			vals.push(options.orgId);
			await client.query(`UPDATE org SET ${setters.join(", ")} WHERE id=$${vals.length}`, vals);

			await client.query("COMMIT");
		} catch (e) {
			await client.query("ROLLBACK");
			throw e;
		}
	});

	// 4. Journaliser
	const { consigner } = await import("../journal/index.js");
	await consigner({
		kind: "org.changed",
		subject: `org:${options.orgId}`,
		summary: `org ${options.orgId} mutée : ${Object.keys(options.changes).join(", ")}`,
		actor,
		payload: { orgId: options.orgId, changes: options.changes, validFrom },
		validAt: validFrom,
	});
}
