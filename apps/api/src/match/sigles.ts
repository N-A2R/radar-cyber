/**
 * Sigles confirmés au registre (chantier couverture, S2.1 à S2.3).
 *
 * L'index des dénominations usuelles SIRENE (76 799 alias `sirene-usuelle`)
 * est chargé une fois en mémoire : clé = sigle normalisé, valeur =
 * organisations porteuses, avec leur département et leurs domaines. C'est
 * cet index — et non la seule poignée d'alias `annuaire-entreprises`/`usage`
 * d'origine — qui alimente le rapprochement.
 *
 * Quand plusieurs organisations partagent un sigle, on ne tire pas au sort :
 * le département ou le domaine de la source (organisation proposée par le
 * moteur, domaine porté par l'indice) départage. Sans contexte discriminant,
 * le sigle reste ambigu et le rattachement est refusé.
 *
 * Un indice de type sigle ne fonde un rattachement que si le registre
 * renvoie **une seule** organisation :
 *   - dénomination contenant le sigle comme mot entier, ou
 *   - alias officiel du registre (dont les usuelles SIRENE importées).
 *
 * La décision porte toujours son motif, pour que le refus soit motivé
 * dans la trace (`regles-precision.ts` → `ecarteeParRegles`).
 *
 * Les prédicats sont purs — la suite de tests les exerce sans base. Seules
 * les fonctions `…DepuisRegistre`, `chargerOrgParAliasSigle` et
 * `contexteSigleDepuisSource` touchent la base.
 */
import { query } from "../db.js";
import { codeDepartement } from "./dept.js";
import { domainFromHint, domaineRacine, normalizeDomainValue } from "./domaine.js";

/** Organisation candidate trouvée dans le registre. */
export type CandidatSigle = { orgId: number; orgName: string };

/** Ligne d'alias du registre, avec le contexte utile au départage. */
export type LigneAliasSigle = {
	alias: string;
	org_id: number;
	name: string;
	slug: string;
	kind: string;
	city: string | null;
	dept: string | null;
	domain: string | null;
	website: string | null;
	/** Alias `source='domain'` de l'org, pour départager par domaine racine. */
	domain_aliases?: readonly string[] | null;
};

/** Candidat indexé : le département et les domaines viennent de l'org. */
export type CandidatSigleIndexe = CandidatSigle & {
	dept: string | null;
	domain: string | null;
	website: string | null;
	domainAliases: readonly string[];
	slug: string;
	kind: string;
	city: string | null;
};

/** Index sigle normalisé → organisations porteuses. */
export type IndexSigles = Map<string, CandidatSigleIndexe[]>;

/** Contexte de la source, utilisé seulement en cas de sigle partagé. */
export type ContexteSigle = { dept?: string | null; domain?: string | null };

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
 * Un contexte (département ou domaine de la source) départage les homonymes
 * avant la décision ; sans lui, un sigle partagé reste ambigu. Le motif est
 * écrit dans la décision, donc dans la trace d'évaluation.
 */
export function decideSigle(
  indice: string,
  candidats: ReadonlyArray<CandidatSigle>,
  contexte?: ContexteSigle,
): DecisionSigle {
	const sigle = normaliseSigle(indice);
	const distincts = [...new Map(candidats.map((c) => [c.orgId, c])).values()];
	const retenus = contexte
		? desambiguiserSigles(distincts, contexte)
		: distincts;
	if (!estSigle(sigle)) {
		return {
			sigle,
			accepte: false,
			candidats: retenus.length,
			motif: estMotCourant(sigle) ? "mot-courant" : "non-sigle",
		};
	}
	if (retenus.length === 0) return { sigle, accepte: false, candidats: 0, motif: "inconnu" };
	if (retenus.length > 1) {
		return { sigle, accepte: false, candidats: retenus.length, motif: "ambigu" };
	}
	const seul = retenus[0]!;
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


// ── Index sigle → organisations ─────────────────────────────────────────

/** Une seule requête charge tout le registre des sigles (76 799 usuelles). */
export const SQL_INDEX_SIGLES = `
SELECT a.alias, o.id AS org_id, o.name, o.slug, o.kind, o.city, o.dept, o.domain, o.website,
       d.domaines AS domain_aliases
FROM org_alias a
JOIN org o ON o.id = a.org_id
LEFT JOIN LATERAL (
  SELECT array_agg(al.alias ORDER BY al.alias) AS domaines
    FROM org_alias al
   WHERE al.org_id = o.id AND al.source = 'domain'
     AND al.status = 'active' AND al.valid_to IS NULL
) d ON true
WHERE a.status = 'active' AND a.source IN ('sirene-usuelle', 'sirene-sigle', 'annuaire-entreprises', 'usage')`;

let indexSiglesPromise: Promise<IndexSigles> | null = null;

/** Construit l'index depuis des lignes `org_alias` jointes à `org`. */
export function buildIndexSigles(rows: ReadonlyArray<LigneAliasSigle>): IndexSigles {
	const index: IndexSigles = new Map();
	for (const row of rows) {
		const sigle = normaliseSigle(row.alias);
		if (!estSigle(sigle)) continue;
		let entrees = index.get(sigle);
		if (!entrees) {
			entrees = [];
			index.set(sigle, entrees);
		}
		// Une organisation peut porter deux alias qui se normalisent pareil.
		if (entrees.some((e) => e.orgId === Number(row.org_id))) continue;
		entrees.push({
			orgId: Number(row.org_id),
			orgName: row.name,
			dept: row.dept ?? null,
			domain: row.domain ?? null,
			website: row.website ?? null,
			domainAliases: row.domain_aliases ?? [],
			slug: row.slug,
			kind: row.kind,
			city: row.city ?? null,
		});
	}
	return index;
}

async function chargerIndexSigles(): Promise<IndexSigles> {
	const r = await query<LigneAliasSigle>(SQL_INDEX_SIGLES);
	return buildIndexSigles(r.rows);
}

function getIndexSigles(): Promise<IndexSigles> {
	indexSiglesPromise ??= chargerIndexSigles().catch((err: unknown) => {
		indexSiglesPromise = null;
		throw err;
	});
	return indexSiglesPromise;
}

/** Vide l'index mémoire (tests, ou après un import du registre). */
export function resetIndexSigles(): void {
	indexSiglesPromise = null;
}

/** Taille de l'index et nombre de sigles partagés (mesure, diagnostic). */
export async function statistiquesIndexSigles(): Promise<{
	alias: number;
	sigles: number;
	ambigus: number;
}> {
	const index = await getIndexSigles();
	let alias = 0;
	let ambigus = 0;
	for (const entrees of index.values()) {
		alias += entrees.length;
		if (entrees.length > 1) ambigus++;
	}
	return { alias, sigles: index.size, ambigus };
}

/**
 * Égalité de domaines **racines** : `www.sous.beta.fr` et `beta.fr`
 * désignent la même organisation, pas deux homonymes. Un suffixe public
 * composé est conservé entier par `domaineRacine`.
 */
function memesDomainesSigle(a: string | null | undefined, b: string | null | undefined): boolean {
	const ra = domaineRacine(a);
	const rb = domaineRacine(b);
	if (ra !== null && rb !== null) return ra === rb;
	const na = normalizeDomainValue(a);
	const nb = normalizeDomainValue(b);
	return na !== null && nb !== null && na === nb;
}
/** Candidat muni, ou non, du contexte chargé depuis le registre. */
type CandidatContextuel = CandidatSigle & {
	dept?: string | null;
	domain?: string | null;
	website?: string | null;
	domainAliases?: readonly string[];
};

/**
 * Désambiguïsation : on garde le sous-ensemble le plus discriminant —
 * intersection département ∧ domaine, puis département, puis domaine. Un
 * filtre sans résultat est ignoré ; plusieurs organisations restantes
 * restent ambiguës (la décision refusera). Le département accepte aussi bien
 * un code INSEE qu'un libellé, et le domaine est comparé à sa racine.
 */
export function desambiguiserSigles<T extends CandidatContextuel>(
	candidats: readonly T[],
	contexte?: ContexteSigle,
): T[] {
	const uniques = [...new Map(candidats.map((c) => [c.orgId, c])).values()];
	if (uniques.length <= 1 || !contexte) return uniques;
	const dept = codeDepartement(contexte.dept);
	const parDept = dept
		? uniques.filter((c) => codeDepartement(c.dept) === dept)
		: [];
	const domaineContexte = normalizeDomainValue(contexte.domain);
	const parDomaineExact = domaineContexte
		? uniques.filter((c) =>
				[c.domain, c.website, ...(c.domainAliases ?? [])].some(
					(d) => normalizeDomainValue(d) === domaineContexte,
				),
			)
		: [];
	const parDomaineRacine = contexte.domain
		? uniques.filter((c) =>
				[c.domain, c.website, ...(c.domainAliases ?? [])].some((d) => memesDomainesSigle(d, contexte.domain)),
			)
		: [];
	// Le domaine exact l'emporte sur la racine : deux organisations peuvent
	// partager `exemple.com` sans partager `sous1`/`sous2`.
	const parDomaine = parDomaineExact.length > 0 ? parDomaineExact : parDomaineRacine;
	const croise = parDept.filter((c) => parDomaine.some((d) => d.orgId === c.orgId));
	if (croise.length > 0) return croise;
	if (parDept.length > 0) return parDept;
	if (parDomaine.length > 0) return parDomaine;
	return uniques;
}

/** Organisations du registre portant ce sigle, départagées par la source. */
export async function candidatsSigleDepuisIndex(
	sigle: string,
	contexte?: ContexteSigle,
): Promise<CandidatSigleIndexe[]> {
	const index = await getIndexSigles();
	return desambiguiserSigles(index.get(normaliseSigle(sigle)) ?? [], contexte);
}

/**
 * Contexte de la source d'un indice : domaine porté par l'indice lui-même et
 * département de l'organisation proposée par le moteur. Sans organisation
 * proposée, le domaine seul peut départager.
 */
export async function contexteSigleDepuisSource(
	orgId: number | null,
	indice: string,
): Promise<ContexteSigle | undefined> {
	const domain = domainFromHint(indice);
	let dept: string | null = null;
	if (orgId !== null && Number.isInteger(orgId)) {
		const r = await query<{ dept: string | null }>("SELECT dept FROM org WHERE id=$1", [orgId]);
		dept = r.rows[0]?.dept ?? null;
	}
	if (!dept && !domain) return undefined;
	return { ...(dept ? { dept } : {}), ...(domain ? { domain } : {}) };
}

/**
 * Requête unique des candidats : dénomination (mot entier) OU alias officiel.
 * `name_norm` conserve la ponctuation (migration 041) : on retire d'abord les
 * points pour que « C.H.U. » devienne le mot « CHU », puis on ne garde que les
 * mots entiers. Les alias sont normalisés de la même manière que l'indice.
 * Le paramètre 1 est le sigle en minuscules, le 2 en majuscules.
 */
export const SQL_CANDIDATS_SIGLE = `
SELECT id, name, dept, domain, website FROM (
  SELECT o.id, o.name, o.dept, o.domain, o.website
  FROM org o
  WHERE replace(o.name_norm, '.', '') LIKE '%' || $1::text || '%'
    AND ' ' || regexp_replace(replace(o.name_norm, '.', ''), '[^a-z0-9]+', ' ', 'g') || ' '
        LIKE '% ' || $1::text || ' %'
  UNION
  -- Toutes les sources actives : limiter aux usuelles faisait « confirmer »
  -- BMW ou AIR alors que cinq organisations portaient ce sigle au registre.
  SELECT o.id, o.name, o.dept, o.domain, o.website
  FROM org_alias a
  JOIN org o ON o.id = a.org_id
  WHERE a.status = 'active'
    AND (lower(a.alias) = $1::text
         OR regexp_replace(regexp_replace(upper(a.alias), '\\.', '', 'g'), '[^A-Z0-9]+', '', 'g') = $2::text)
) candidats
ORDER BY id`;

/** Organisation dont un alias officiel est exactement le sigle. */
export const SQL_ALIAS_SIGLE = `
SELECT o.id, o.name, o.slug, o.kind, o.city, o.domain, o.website
FROM org_alias a
JOIN org o ON o.id = a.org_id
WHERE a.status = 'active'
  AND (lower(a.alias) = lower($1::text)
       OR regexp_replace(regexp_replace(upper(a.alias), '\\.', '', 'g'), '[^A-Z0-9]+', '', 'g') = $1::text)
ORDER BY o.id`;

/**
 * Candidats du registre pour un sigle : alias du registre (dont les 76 799
 * usuelles SIRENE) et dénominations. `contexte` ne départage que les sigles
 * partagés par plusieurs organisations.
 */
export async function candidatsSigleDepuisRegistre(
	sigle: string,
	contexte?: ContexteSigle,
): Promise<CandidatSigle[]> {
	const s = normaliseSigle(sigle);
	const [parNom, parAlias] = await Promise.all([
		query<{ id: number; name: string; dept: string | null; domain: string | null; website: string | null }>(
			SQL_CANDIDATS_SIGLE,
			[s.toLowerCase(), s],
		),
		candidatsSigleDepuisIndex(s, contexte),
	]);
	const parId = new Map<number, CandidatSigleIndexe>();
	for (const o of parNom.rows) {
		parId.set(Number(o.id), {
			orgId: Number(o.id),
			orgName: o.name,
			dept: o.dept ?? null,
			domain: o.domain ?? null,
			website: o.website ?? null,
			domainAliases: [],
			slug: "",
			kind: "",
			city: null,
		});
	}
	for (const c of parAlias) parId.set(c.orgId, c);
	return desambiguiserSigles([...parId.values()], contexte);
}

/** Décision complète, calculée sur le registre réel. */
export async function deciderSigleDepuisRegistre(
	sigle: string,
	contexte?: ContexteSigle,
): Promise<DecisionSigle> {
	return decideSigle(sigle, await candidatsSigleDepuisRegistre(sigle, contexte));
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

/** Organisations portant le sigle au registre — chargées pour le moteur. */
export async function chargerOrgParAliasSigle(
	sigle: string,
	contexte?: ContexteSigle,
): Promise<OrgAliasRow[]> {
	return (await candidatsSigleDepuisIndex(sigle, contexte))
		.map((c) => ({
			id: c.orgId,
			name: c.orgName,
			slug: c.slug,
			kind: c.kind,
			city: c.city,
			domain: c.domain,
			website: c.website,
		}))
		.sort((a, b) => a.id - b.id);
}
