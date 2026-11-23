/**
 * Certificat d'ignorance — ce que le radar ne sait pas d'une organisation.
 *
 * Le registre `org_unknown` est écrit par la fonction SQL
 * `enregistrer_org_unknown()` : chaque ligne nomme une facette pour laquelle
 * le radar ne détient aucune preuve, avec la raison et la date du contrôle.
 * Ce module ne calcule rien côté Node : il pilote le scan et lit le registre,
 * pour que le juge externe puisse exécuter exactement le même SQL.
 *
 * Périmètre : « le radar ne connaît pas cette donnée », jamais « cette
 * organisation n'a pas de domaine / n'a rien subi ». Aucune donnée personnelle
 * n'est stockée : le contact public est une absence d'information, pas une
 * fiche de contact.
 */
export const ORG_UNKNOWN_FIELDS = [
	"domaine",
	"actifs",
	"evenements",
	"certificat_tls",
	"localisation",
	"identifiant_legal",
	"secteur",
	"code_postal",
	"alias",
	"historique",
	"contact_public",
] as const;

export type OrgUnknownField = (typeof ORG_UNKNOWN_FIELDS)[number];

/** Plancher du certificat : trois champs explicitement inconnus par org. */
export const MIN_UNKNOWN_FIELDS = 3;

/** Seuil du contrôle externe sur le corpus de référence. */
export const OBJECTIF_ORG_UNKNOWN = 10261;

/** Critère exécuté tel quel par le verificateur externe. */
export const CRITERE_ORG_UNKNOWN_SQL = `
SELECT count(*)::bigint AS n
  FROM org_unknown
 WHERE unknown_field IS NOT NULL
   AND checked_at IS NOT NULL
`.trim();

export const PORTEE_CERTIFICAT =
	"Facettes pour lesquelles le radar ne détient aucune preuve, datées et nommées ; " +
	"ne prouve pas l'absence de la donnée dans le monde réel.";

export type ExecuteurSQL = <T = any>(
	texte: string,
	params?: unknown[],
) => Promise<{ rows: T[]; rowCount?: number | null }>;

export type RapportCertificatIgnorance = {
	organisations: number;
	lignesEcrites: number;
	total: number;
	minChampsParOrg: number;
	champsDistincts: number;
};

type LigneComptage = { n: string | number | bigint };
type LigneChamps = { champs: string };

export async function enregistrerCertificatIgnorance(
	executeur: ExecuteurSQL,
	limit?: number | null,
): Promise<RapportCertificatIgnorance> {
	if (limit !== undefined && limit !== null && (!Number.isInteger(limit) || limit < 0)) {
		throw new Error(`limite invalide : ${String(limit)}`);
	}
	const ecrit = await executeur<LigneComptage>(
		"SELECT enregistrer_org_unknown($1)::text AS n",
		[limit ?? null],
	);
	const cibles = await executeur<LigneComptage>(
		"SELECT count(*)::text AS n FROM org" + (limit ? " WHERE id IN (SELECT id FROM org ORDER BY id LIMIT $1)" : ""),
		limit ? [limit] : [],
	);
	const mesure = await mesurerCertificatIgnorance(executeur);
	return {
		organisations: Number(cibles.rows[0]?.n ?? 0),
		lignesEcrites: Number(ecrit.rows[0]?.n ?? 0),
		...mesure,
	};
}

export async function mesurerCertificatIgnorance(
	executeur: ExecuteurSQL,
): Promise<Pick<RapportCertificatIgnorance, "total" | "minChampsParOrg" | "champsDistincts">> {
	const total = await executeur<LigneComptage>(CRITERE_ORG_UNKNOWN_SQL);
	const parOrg = await executeur<LigneChamps>(`
		SELECT count(DISTINCT unknown_field)::text AS champs
		  FROM org_unknown
		 WHERE unknown_field IS NOT NULL AND checked_at IS NOT NULL
		 GROUP BY org_id
	`);
	const distincts = await executeur<LigneComptage>(`
		SELECT count(DISTINCT unknown_field)::text AS n
		  FROM org_unknown
		 WHERE unknown_field IS NOT NULL AND checked_at IS NOT NULL
	`);
	const minimum = parOrg.rows.reduce(
		(min, ligne) => Math.min(min, Number(ligne.champs)),
		Number.POSITIVE_INFINITY,
	);
	return {
		total: Number(total.rows[0]?.n ?? 0),
		minChampsParOrg: Number.isFinite(minimum) ? minimum : 0,
		champsDistincts: Number(distincts.rows[0]?.n ?? 0),
	};
}

export function certificatAtteint(
	mesure: Pick<RapportCertificatIgnorance, "total" | "minChampsParOrg" | "champsDistincts">,
): boolean {
	return (
		mesure.total >= OBJECTIF_ORG_UNKNOWN &&
		mesure.minChampsParOrg >= MIN_UNKNOWN_FIELDS &&
		mesure.champsDistincts >= MIN_UNKNOWN_FIELDS
	);
}
