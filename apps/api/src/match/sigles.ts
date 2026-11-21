/**
 * Sigles confirmés au registre (chantier couverture, S2.1).
 *
 * Un indice de type sigle ne fonde un rattachement que si le registre
 * renvoie **une seule** organisation :
 *   - dénomination contenant le sigle comme mot entier, ou
 *   - alias dont la source est `annuaire-entreprises` ou `usage`.
 *
 * Deux organisations = refus : on ne tire pas au sort. Aucune organisation =
 * refus. La décision porte toujours son motif, pour que le refus soit motivé
 * dans la trace (`regles-precision.ts` → `ecarteeParRegles`).
 *
 * Les prédicats sont purs — la suite de tests les exerce sans base. Seules
 * `candidatsSigleDepuisRegistre` et `chargerOrgParAliasSigle` touchent la base.
 */
import { query } from "../db.js";

/** Organisation candidate trouvée dans le registre. */
export type CandidatSigle = { orgId: number; orgName: string };

/** Pourquoi la décision a été prise. */
export type MotifSigle = "confirme" | "ambigu" | "inconnu" | "mot-courant" | "non-sigle";

/** Décision complète : elle porte la règle et l'organisation retenue. */
export type DecisionSigle = {
	sigle: string;
	accepte: boolean;
	/** Nombre d'organisations distinctes renvoyées par le registre. */
	candidats: number;
	motif: MotifSigle;
	orgId?: number;
	orgName?: string;
};

/** Majuscules, sans points, sans espaces — la normalisation de la règle. */
export function normaliseSigle(texte: string): string {
	return texte
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toUpperCase()
		.replace(/\./g, "")
		.replace(/\s+/g, "");
}

/** Nombre de groupes de voyelles consécutives : « AMF » → 1, « ORANGE » → 3. */
function groupesVoyelles(sigle: string): number {
	return (sigle.match(/[AEIOUY]+/g) ?? []).length;
}

/**
 * Forme d'un sigle : 2 à 8 caractères alphanumériques, au moins une lettre,
 * pas plus de deux groupes de voyelles. Ce dernier garde-fou écarte les mots
 * courants (« ORANGE », « PROVENCE ») sans dictionnaire : ils sont de toute
 * façon ambiguous au registre, mais la forme seule les refuse déjà.
 */
export function estSigle(texte: string): boolean {
	const s = normaliseSigle(texte);
	return /^[A-Z0-9]{2,8}$/.test(s) && /[A-Z]/.test(s) && groupesVoyelles(s) <= 2;
}

/** Un mot courant n'est pas un sigle, même s'il est court. */
export function estMotCourant(texte: string): boolean {
	const s = normaliseSigle(texte);
	return /^[A-Z]{2,}$/.test(s) && groupesVoyelles(s) > 2;
}

/**
 * Décision pure : un seul candidat accepte, zéro ou plusieurs refusent.
 * Le motif est écrit dans la décision, donc dans la trace d'évaluation.
 */
export function decideSigle(indice: string, candidats: CandidatSigle[]): DecisionSigle {
	const sigle = normaliseSigle(indice);
	const uniques = [...new Map(candidats.map((c) => [c.orgId, c])).values()];
	if (!estSigle(sigle)) {
		return {
			sigle,
			accepte: false,
			candidats: uniques.length,
			motif: estMotCourant(sigle) ? "mot-courant" : "non-sigle",
		};
	}
	if (uniques.length === 0) return { sigle, accepte: false, candidats: 0, motif: "inconnu" };
	if (uniques.length > 1) {
		return { sigle, accepte: false, candidats: uniques.length, motif: "ambigu" };
	}
	const seul = uniques[0]!;
	return {
		sigle,
		accepte: true,
		candidats: 1,
		motif: "confirme",
		orgId: seul.orgId,
		orgName: seul.orgName,
	};
}
/** Mots de liaison et formes juridiques : jamais un sigle discriminant. */
const GENERIC: Record<string, true> = {
	de: true, du: true, des: true, la: true, le: true, les: true,
	et: true, au: true, aux: true, en: true, sur: true,
	france: true, societe: true, society: true,
	sarl: true, sas: true, sasu: true, eurl: true, sci: true,
	ltd: true, limited: true, inc: true, llc: true, corp: true,
	corporation: true, plc: true,
};

/** Jetons d'un texte pour la recherche du sigle sous-jacent à un match 0,7. */
export function jetonsPourSigle(texte: string): string[] {
	return texte
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.split(" ")
		.filter((t) => t.length >= 3 && GENERIC[t] !== true);
}

export function sigleDeIndice(indice: string, orgName: string): string | null {
	if (estSigle(indice)) return normaliseSigle(indice);
	const dansIndice = new Set(jetonsPourSigle(indice));
	const communs = [...new Set(jetonsPourSigle(orgName))].filter((t) => dansIndice.has(t));
	if (communs.length !== 1 || !estSigle(communs[0]!)) return null;
	return normaliseSigle(communs[0]!);
}


/**
 * Requête unique des candidats : dénomination (mot entier) OU alias officiel.
 * `name_norm` conserve la ponctuation (migration 041) : on retire d'abord les
 * points pour que « C.H.U. » devienne le mot « CHU », puis on ne garde que les
 * mots entiers. Les alias sont normalisés de la même manière que l'indice.
 * Le paramètre 1 est le sigle en minuscules, le 2 en majuscules.
 */
export const SQL_CANDIDATS_SIGLE = `
SELECT id, name FROM (
  SELECT o.id, o.name
  FROM org o
  WHERE replace(o.name_norm, '.', '') LIKE '%' || $1::text || '%'
    AND ' ' || regexp_replace(replace(o.name_norm, '.', ''), '[^a-z0-9]+', ' ', 'g') || ' '
        LIKE '% ' || $1::text || ' %'
  UNION
  SELECT o.id, o.name
  FROM org_alias a
  JOIN org o ON o.id = a.org_id
  WHERE a.source IN ('annuaire-entreprises', 'usage')
    AND regexp_replace(regexp_replace(upper(a.alias), '\\.', '', 'g'), '[^A-Z0-9]+', '', 'g') = $2::text
) candidats
ORDER BY id`;

/** Organisation dont un alias officiel est exactement le sigle. */
export const SQL_ALIAS_SIGLE = `
SELECT o.id, o.name, o.slug, o.kind, o.city, o.domain, o.website
FROM org_alias a
JOIN org o ON o.id = a.org_id
WHERE a.source IN ('annuaire-entreprises', 'usage')
  AND regexp_replace(regexp_replace(upper(a.alias), '\\.', '', 'g'), '[^A-Z0-9]+', '', 'g') = $1::text
ORDER BY o.id`;

/** Candidats du registre pour un sigle — la requête est publique pour la mesure. */
export async function candidatsSigleDepuisRegistre(sigle: string): Promise<CandidatSigle[]> {
	const s = normaliseSigle(sigle);
	const r = await query<{ id: number; name: string }>(SQL_CANDIDATS_SIGLE, [s.toLowerCase(), s]);
	return r.rows.map((o) => ({ orgId: Number(o.id), orgName: o.name }));
}

/** Décision complète, calculée sur le registre réel. */
export async function deciderSigleDepuisRegistre(sigle: string): Promise<DecisionSigle> {
	return decideSigle(sigle, await candidatsSigleDepuisRegistre(sigle));
}

/** Ligne `org` trouvée par alias, pour le préfiltre du moteur. */
export type OrgAliasRow = {
	id: number;
	name: string;
	slug: string;
	kind: string;
	city: string | null;
	domain: string | null;
	website: string | null;
};

/** Organisations portant l'alias officiel exact — chargées pour le moteur. */
export async function chargerOrgParAliasSigle(sigle: string): Promise<OrgAliasRow[]> {
	const r = await query<OrgAliasRow>(SQL_ALIAS_SIGLE, [normaliseSigle(sigle)]);
	return r.rows;
}
