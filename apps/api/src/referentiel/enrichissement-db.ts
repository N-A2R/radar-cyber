/**
 * Accès base de l'enrichissement du référentiel.
 *
 * Les propositions sont calculées en dehors de toute transaction : un lot est
 * appliqué d'un seul tenant (provenance + colonne historique), avec un `WHERE`
 * qui garantit qu'une valeur déjà renseignée n'est jamais écrasée. La lecture
 * des organisations est paginée par clé sur `id` : les 1,67 M lignes ne sont
 * jamais chargées d'un coup.
 */

import { ingestQuery, query, withTransaction } from "../db.js";
import {
	CHAMPS,
	couvertureVide,
	type Champ,
	type CouvertureAvant,
	type OrgEnrichissable,
	type Proposition,
} from "./enrichissement.js";

const VIDE: Record<Champ, string> = {
	domain: "(o.domain IS NULL OR btrim(o.domain) = '')",
	siren: "(o.siren IS NULL OR btrim(o.siren) = '')",
	secteur: "(o.sector IS NULL OR btrim(o.sector) = '')",
	geo: "(o.lat IS NULL OR o.lon IS NULL)",
};

function colonnes(): string {
	return `o.id, o.name, o.name_norm, o.domain, o.website, o.siren, o.naf,
	        o.sector, o.city, o.dept, o.lat, o.lon`;
}

export interface CritereLecture {
	champs: ReadonlySet<Champ>;
	apresId: number;
	limite: number;
	depts?: readonly string[];
}

/** Lot d'organisations encore en défaut sur au moins un champ demandé. */
export async function lireOrganisations(critere: CritereLecture): Promise<OrgEnrichissable[]> {
	const conditions = [...critere.champs].map((champ) => VIDE[champ]);
	if (conditions.length === 0) return [];
	const params: unknown[] = [critere.apresId];
	let sql = `SELECT ${colonnes()} FROM org o
	           WHERE o.id > $1 AND (${conditions.join(" OR ")})`;
	if (critere.depts && critere.depts.length > 0) {
		params.push(critere.depts);
		sql += ` AND o.dept = ANY($${params.length}::text[])`;
	}
	params.push(critere.limite);
	sql += ` ORDER BY o.id LIMIT $${params.length}`;
	const { rows } = await ingestQuery<OrgEnrichissable>(sql, params);
	return rows;
}

export interface CouvertureMesuree {
	total: number;
	avant: CouvertureAvant;
}

/** Couverture réelle des colonnes et des valeurs tracées, avant enrichissement. */
export async function mesurerCouverture(): Promise<CouvertureMesuree> {
	const { rows } = await query<Record<string, string>>(
		`SELECT count(*)::text AS total,
		        count(*) FILTER (WHERE o.domain IS NOT NULL AND btrim(o.domain) <> '')::text AS domain,
		        count(*) FILTER (WHERE o.siren IS NOT NULL AND btrim(o.siren) <> '')::text AS siren,
		        count(*) FILTER (WHERE o.sector IS NOT NULL AND btrim(o.sector) <> '')::text AS secteur,
		        count(*) FILTER (WHERE o.lat IS NOT NULL AND o.lon IS NOT NULL)::text AS geo
		   FROM org o`,
	);
	const avant = couvertureVide();
	const total = Number(rows[0]?.total ?? 0);
	for (const champ of CHAMPS) avant[champ].remplis = Number(rows[0]?.[champ] ?? 0);

	// Sur une base non encore migrée, la table de provenance n'existe pas :
	// c'est un état vide légitime, pas une erreur de mesure.
	const { rows: present } = await query<{ ok: boolean }>(
		"SELECT to_regclass('public.org_enrichment') IS NOT NULL AS ok",
	);
	if (present[0]?.ok) {
		const { rows: traces } = await query<{ champ: Champ; n: string }>(
			"SELECT champ, count(*)::text AS n FROM org_enrichment GROUP BY champ",
		);
		for (const t of traces) {
			if (avant[t.champ]) avant[t.champ].traces = Number(t.n);
		}
	}
	return { total, avant };
}

export interface ResultatApplication {
	valeursTracees: number;
	colonnesMisesAJour: number;
}

/** Applique un lot entier ou rien : provenance et colonne restent cohérentes. */
export async function appliquerLot(propositions: readonly Proposition[]): Promise<ResultatApplication> {
	const resultat: ResultatApplication = { valeursTracees: 0, colonnesMisesAJour: 0 };
	if (propositions.length === 0) return resultat;
	return withTransaction(async (client) => {
		for (const p of propositions) {
			const trace = await client.query(
				`INSERT INTO org_enrichment (org_id, champ, valeur, source, confiance, details, verifie_le)
				 VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, now())
				 ON CONFLICT (org_id, champ) DO UPDATE
				   SET valeur = EXCLUDED.valeur,
				       source = EXCLUDED.source,
				       confiance = EXCLUDED.confiance,
				       details = EXCLUDED.details,
				       verifie_le = now()
				 WHERE EXCLUDED.confiance >= org_enrichment.confiance`,
				[p.orgId, p.champ, JSON.stringify(p.valeur), p.source, p.confiance, JSON.stringify(p.details)],
			);
			if ((trace.rowCount ?? 0) > 0) resultat.valeursTracees++;

			const valeur = p.valeur;
			if (p.champ === "domain") {
				const domaine = typeof valeur.domaine === "string" ? valeur.domaine : null;
				const r = await client.query(
					`UPDATE org SET domain = $2
					  WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')`,
					[p.orgId, domaine],
				);
				if ((r.rowCount ?? 0) > 0) resultat.colonnesMisesAJour++;
			} else if (p.champ === "siren") {
				const siren = typeof valeur.siren === "string" ? valeur.siren : null;
				const r = await client.query(
					`UPDATE org SET siren = $2
					  WHERE id = $1 AND (siren IS NULL OR btrim(siren) = '')`,
					[p.orgId, siren],
				);
				if ((r.rowCount ?? 0) > 0) resultat.colonnesMisesAJour++;
			} else if (p.champ === "secteur") {
				const secteur = typeof valeur.secteur === "string" ? valeur.secteur : null;
				const naf = typeof valeur.naf === "string" ? valeur.naf : null;
				const r = await client.query(
					`UPDATE org SET sector = $2, naf = COALESCE(naf, $3)
					  WHERE id = $1 AND (sector IS NULL OR btrim(sector) = '')`,
					[p.orgId, secteur, naf],
				);
				if ((r.rowCount ?? 0) > 0) resultat.colonnesMisesAJour++;
			} else if (p.champ === "geo") {
				const lat = typeof valeur.lat === "number" ? valeur.lat : null;
				const lon = typeof valeur.lon === "number" ? valeur.lon : null;
				const commune = typeof valeur.commune === "string" ? valeur.commune : null;
				const r = await client.query(
					`UPDATE org SET lat = $2, lon = $3, geo_source = $4
					  WHERE id = $1 AND (lat IS NULL OR lon IS NULL)`,
					[p.orgId, lat, lon, `code-postal:${commune ?? "inconnu"}`],
				);
				if ((r.rowCount ?? 0) > 0) resultat.colonnesMisesAJour++;
			}
		}
		return resultat;
	});
}
