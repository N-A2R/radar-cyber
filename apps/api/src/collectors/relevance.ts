// pertinence cyber pour les flux de presse généraliste
// Le moteur de score et la configuration vivent dans pertinence.ts ; ce module
// garde `isRelevant` comme porte historique et le rattachement d'organisations.
import { evaluatePertinence } from "./pertinence.js";
export { CYBER_KEYWORDS } from "./pertinence.js";
import type { RelevanceConfig } from "./pertinence.js";
import { ingestQuery } from "../db.js";
import { getGazetteer } from "./org-gazetteer.js";
import { buildGazetteer, designateUneOrganisation, resoudre } from "../match/gazetteer.js";
import { MOTS_GENERIQUES, MOTS_GENERIQUES_ENTREPRISE } from "../match/generique.js";
import type { OrgRef } from "@radar/shared";
import type { ExplicationRattachement } from "../journal/rattachement.js";

interface MatchOrgRow {
  id: number;
  name: string;
  slug?: string | null;
  domain?: string | null;
}

export interface OrgMatch {
  orgId: number;
  confidence: number;
  /**
   * Le pourquoi du rattachement, tel que le moteur l'a décidé. Facultatif pour
   * ne pas casser les appelants qui n'ont que l'identifiant — mais l'ingestion
   * le renseigne toujours, parce qu'un rattachement sans motif n'est pas
   * auditable.
   */
  explication?: ExplicationRattachement;
}

interface CachedOrg extends MatchOrgRow {
  normName: string;
  normSlug: string;
  normDomain: string;
  nameTokens: string[];
  slugTokens: string[];
}

const ORG_MATCH_CACHE_TTL_MS = 10 * 60 * 1000;
let orgMatchCache: { at: number; orgs: CachedOrg[] } | null = null;

const STOPWORDS: Record<string, true> = {
  pour: true, avec: true, dans: true, sur: true, les: true, des: true, une: true, aux: true,
  par: true, est: true, sont: true, son: true, ses: true, leur: true, leurs: true, que: true,
  qui: true, pas: true, plus: true, du: true, de: true, la: true, le: true, et: true, en: true,
  au: true, nos: true, vos: true, ces: true, cet: true, cette: true, mais: true, ou: true,
  donc: true, car: true, ni: true, ne: true, se: true, sa: true, ce: true, un: true, dun: true,
};

const LEGAL_FORMS_RE = /\b(sas|sarl|sa|sci|scp|eurl)\b/g;

export interface RelevanceOrg {
  name: string;
  slug?: string | null;
  domain?: string | null;
  assets?: string[];
}


function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function normalizeMatchText(s: string): string {
  return normalize(s)
    .replace(/[^a-z0-9.\s-]+/g, " ")
    .replace(LEGAL_FORMS_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeMatchText(s: string): string[] {
  const out: string[] = [];
  const seen: Record<string, true> = {};
  for (const token of normalizeMatchText(s).split(/[^a-z0-9]+/g)) {
    if (token.length < 4 || STOPWORDS[token] || seen[token]) continue;
    seen[token] = true;
    out.push(token);
  }
  return out;
}

function prepareOrgForMatch(org: MatchOrgRow): CachedOrg {
  const normName = normalizeMatchText(org.name ?? "");
  const normSlug = normalizeMatchText(org.slug ?? "");
  const normDomain = normalizeMatchText(org.domain ?? "");
  return {
    ...org,
    normName,
    normSlug,
    normDomain,
    nameTokens: tokenizeMatchText(org.name ?? ""),
    slugTokens: tokenizeMatchText(org.slug ?? ""),
  };
}

/**
 * Même moteur que l'ingestion, sur une liste en mémoire (tests, benches).
 *
 * Construit un gazetteer à partir des noms et slugs fournis, puis applique les
 * règles de `match/gazetteer.ts`. Conserver deux implémentations — une pour les
 * tests, une pour la production — garantissait qu'elles divergent.
 */
export function matchOrgForTextFromList(text: string, orgs: MatchOrgRow[]): OrgMatch | null {
	const rows = orgs.flatMap((org) => {
		const alias = [org.name, org.slug ?? ""].filter((a) => normalizeMatchText(a).length >= 4);
		return alias.map((a) => ({
			org_id: org.id,
			name: org.name,
			kind: "entreprise",
			dept: null as string | null,
			city: null as string | null,
			sector: null as string | null,
			alias: a,
		}));
	});
	const gaz = buildGazetteer(rows);
	const resultat = resoudre(gaz, text);
	return resultat.org ? { orgId: resultat.org.id, confidence: resultat.confidence } : null;
}

/**
 * Rattachement d'un texte, adossé au gazetteer partagé.
 *
 * Cette fonction remplace un parcours de toutes les organisations par
 * recouvrement de jetons, qui exigeait un candidat unique dans la table
 * entière : sur 34 330 organisations, il ne rattachait plus qu'un incident sur
 * quinze. Le gazetteer ne consulte que les alias présents dans le texte et
 * refuse de trancher sur un toponyme nu. Une panne de chargement rend `null` :
 * l'ingestion continue, l'événement reste non rattaché.
 */
export async function matchOrgForText(text: string): Promise<OrgMatch | null> {
	try {
		const gaz = await getGazetteer();
		const resultat = resoudre(gaz, text);
		return resultat.org ? { orgId: resultat.org.id, confidence: resultat.confidence } : null;
	} catch {
		return null;
	}
}

/**
 * Variante synchrone utilisée à l'ingestion : elle réutilise le gazetteer déjà
 * chargé par le run et n'ouvre aucune connexion. Rend `null` quand l'index
 * n'est pas encore prêt, ce qui laisse la porte sur ses mots-clés.
 */
export function designateOrganization(text: string): OrgMatch | null {
	const gaz = gazetteerCharge();
	// L'index n'est pas chargé : ce n'est pas « aucune organisation trouvée ».
	// Confondre les deux fait compter une panne de référentiel comme un échec de
	// rattachement — et c'est déjà arrivé sur la mesure de couverture.
	if (!gaz) return null;
	const resultat = designateUneOrganisation(gaz, text);
	return resultat.org
		? {
				orgId: resultat.org.id,
				confidence: resultat.confidence,
				explication: {
					moteur: "gazetteer@2",
					motif: resultat.reason,
					alias: resultat.alias,
					confiance: resultat.confidence,
					...(resultat.tied.length > 0 ? { candidats: resultat.tied.map((o) => ({ id: o.id, name: o.name })) } : {}),
				},
			}
		: null;
}

/**
 * Le « pourquoi » d'une absence de rattachement, quand on veut l'écrire.
 *
 * `designateOrganization` rend `null` pour quatre causes très différentes :
 * texte vide, aucun alias, ambiguïté refusée, index indisponible. Sans cette
 * fonction, la fiche d'un événement non rattaché ne peut rien dire — et
 * « non rattaché » devient un silence.
 */
export function expliquerRattachement(text: string): ExplicationRattachement {
	const gaz = gazetteerCharge();
	if (!gaz) {
		return { moteur: "gazetteer@2", motif: "aucun", alias: null, confiance: 0, indisponible: true };
	}
	const resultat = designateUneOrganisation(gaz, text);
	return {
		moteur: "gazetteer@2",
		motif: resultat.reason,
		alias: resultat.alias,
		confiance: resultat.confidence,
		...(resultat.tied.length > 0 ? { candidats: resultat.tied.map((o) => ({ id: o.id, name: o.name })) } : {}),
	};
}

let dernierGazetteer: { at: number; gaz: ReturnType<typeof buildGazetteer> } | null = null;

/** Mémoïse localement le gazetteer déjà résolu par le chargement asynchrone. */
export function gazetteerCharge(): ReturnType<typeof buildGazetteer> | null {
	return dernierGazetteer?.gaz ?? null;
}

/** À appeler avant un run d'ingestion : charge l'index une fois, sans requête par item. */
export async function preparerGazetteer(): Promise<number> {
	const gaz = await getGazetteer();
	dernierGazetteer = { at: Date.now(), gaz };
	return gaz.byAliasKey.size;
}

const GENERIQUES_PORTE = new Set<string>([...MOTS_GENERIQUES, ...MOTS_GENERIQUES_ENTREPRISE]);

/**
 * Vrai si le nom porte un mot qui n'est ni une catégorie ni une particule.
 * « Ecole primaire » → faux ; « Collège de l'Osme » → vrai.
 */
export function nomPropre(nomNormalise: string): boolean {
	return nomNormalise
		.split(" ")
		.some((jeton) => jeton.length > 2 && !GENERIQUES_PORTE.has(jeton) && !/^\d+$/.test(jeton));
}

function normalizeOrgName(name: string): string {
  let n = normalize(name);
  // retirer suffixes juridiques courants
  n = n.replace(/\b(sarl|sas|sa|eurl|sci|scp|association|assoc\.?|groupe|group)\b/g, "").trim();
  n = n.replace(/\s+/g, " ");
  return n;
}


export function loadRelevanceOrgIndex(orgs: { name: string; slug?: string | null; domain?: string | null; assets?: string[] }[] = []): RelevanceOrg[] {
  return orgs.map((o) => ({
    name: o.name,
    slug: o.slug ?? null,
    domain: o.domain ?? null,
    assets: o.assets ?? [],
  }));
}

/**
 * Porte historique, conservée pour les appelants et les scripts d'audit.
 * Elle délègue désormais au moteur de score : un texte ne passe plus parce
 * qu'un mot ambigu (« menace », « attaque ») apparaît, et la configuration
 * RADAR_CYBER_* s'applique partout.
 */
export function isRelevant(
  item: { title?: string | null; summary?: string | null; url?: string | null; sourceUrl?: string | null },
  opts: { orgs: RelevanceOrg[]; ignoreDomains?: string[]; config?: RelevanceConfig },
): { relevant: boolean; reason: "keyword" | "org" | "none"; match?: string; score: number } {
  // Un nom de catégorie (« école primaire ») ne désigne personne : on ne
  // garde alors que son domaine/actif, comme le faisait l'ancienne porte.
  const orgs = (opts.orgs ?? []).map((org) => {
    const name = normalizeOrgName(String(org.name ?? ""));
    return name.length >= 4 && nomPropre(name) ? org : { ...org, name: "" };
  });
  const verdict = evaluatePertinence(item, {
    orgs,
    ignoreDomains: opts.ignoreDomains,
    config: opts.config,
  });
  const reason = verdict.reason === "org" ? "org"
    : verdict.relevant ? "keyword"
    : "none";
  return {
    relevant: verdict.relevant,
    reason,
    match: verdict.exclusion ?? verdict.matches[0]?.term,
    score: verdict.score,
  };
}

// ---------------------------------------------------------------------------
// Couverture élargie : deux règles d'admission supplémentaires, décidées par
// l'utilisateur (2026-11-10) et bornées par des mesures (docs/couverture.md).
//
//   (a) CVE exploitable : le CVE de l'item a un score EPSS ≥ seuil dans la
//       table `epss` déjà en base (aucun appel réseau).
//   (b) département cité : un département de Nouvelle-Aquitaine ou une
//       préfecture apparaît en mot entier dans le titre ou le résumé — jamais
//       dans l'URL, sinon chaque article d'un média local passerait.
//
// Les items admis par ces règles mais sans organisation rattachée reçoivent
// `event.admission_rule = 'epss' | 'dept'` ; ceux rattachés gardent 'org'.
// ---------------------------------------------------------------------------

/** Code INSEE → libellé normalisé (minuscules, sans accents) du département. */
export const DEPT_LABELS: Readonly<Record<string, string>> = {
  "16": "charente",
  "17": "charente-maritime",
  "19": "correze",
  "23": "creuse",
  "24": "dordogne",
  "33": "gironde",
  "40": "landes",
  "47": "lot-et-garonne",
  "64": "pyrenees-atlantiques",
  "79": "deux-sevres",
  "86": "vienne",
  "87": "haute-vienne",
};

/** Préfectures de Nouvelle-Aquitaine : une commune citée vaut le département. */
export const PREFECTURES: readonly string[] = [
  "angouleme",
  "la rochelle",
  "tulle",
  "gueret",
  "perigueux",
  "bordeaux",
  "mont-de-marsan",
  "agen",
  "pau",
  "niort",
  "poitiers",
  "limoges",
];

/**
 * Noms qui désignent aussi autre chose (fleuve, ville d'une autre région) :
 * « Vienne » est une ville d'Isère, « Lot » et « Dordogne » sont des rivières.
 * Seule une mention explicite du contexte administratif les retient.
 */
const AMBIGUOUS_PLACES: Readonly<Record<string, true>> = {
  vienne: true,
  lot: true,
  pau: true,
  niort: true,
  saintes: true,
  dax: true,
  charente: true,
  dordogne: true,
  creuse: true,
  correze: true,
  sevre: true,
  isle: true,
  landes: true,
};

/**
 * Contexte administratif explicite : autorise l'homonyme où qu'il soit dans la
 * phrase (« le département du Lot », « la ville de Pau »). Volontairement
 * resserré au vocabulaire administratif — « région » en est exclu, il apparaît
 * dans « région Nouvelle-Aquitaine » aussi bien que dans « la région de Pau »
 * sans rien dire du statut du toponyme.
 */
const ADMIN_CUE_RE =
  /\b(departement|prefecture|prefet|prefectoral|prefectorale|conseil departemental|commune de|commune d|ville de|ville d|agglomeration|metropole)\b/;

/**
 * Indice locatif immédiatement antérieur (« en Vienne », « à Pau », « dans le
 * Lot »). Ne vaut que collé au toponyme : le reste de la phrase ne suffit pas,
 * sinon « à » et « en », omniprésents en français, valideraient n'importe quel
 * homonyme et la règle redeviendrait inerte.
 */
const LOCATIVE_CUE_RE = /\b(?:en|au|aux|a|dans|sur|vers|depuis|pres de|autour de)\s+$/;

/** Occurrences d'URL : elles ne disent rien du sujet de l'article. */
const URL_OCCURRENCE_RE = /\b(?:https?:\/\/|www\.)\S+/gi;

/**
 * Seuil EPSS d'admission. Fixé à 0,30 sur décision utilisateur du 10 novembre :
 * 0,10 admettait trop de CVE peu exploitables et noyait le fil ; 0,30 ne garde
 * que les scores où l'exploitation est réellement probable à court terme.
 * La mesure d'origine (136/272 à 0,10) reste dans docs/couverture.md.
 */
export const EPSS_ADMISSION_THRESHOLD = 0.3;

/** Contexte d'admission transmis par le collecteur (chargé une fois par run). */
export interface CoverageContext {
  /** Scores EPSS par CVE (table `epss`, migration 021), jamais depuis `event`. */
  epssByCve: ReadonlyMap<string, number>;
  epssThreshold: number;
  deptNames: readonly string[];
}

const CVE_ID_RE = /\bCVE-\d{4}-\d{4,}\b/gi;

/** Identifiants CVE d'un texte, en majuscules, sans doublon. */
export function extractCveIds(text: string): string[] {
  const found = text.match(CVE_ID_RE);
  if (!found) return [];
  return [...new Set(found.map((cve) => cve.toUpperCase()))];
}

/**
 * Règle (a) : un CVE de l'item dépasse le seuil EPSS. Le score vient de la
 * table `epss` (migration 021), jamais du réseau ni de `event`.
 */
export function admitByEpss(text: string, ctx: CoverageContext): { cve: string; score: number } | null {
  for (const cve of extractCveIds(text)) {
    const score = ctx.epssByCve.get(cve);
    if (score !== undefined && score >= ctx.epssThreshold) return { cve, score };
  }
  return null;
}

const deptPatternCache = new Map<string, RegExp>();

/** Motif « mot entier » unicode sur des libellés déjà normalisés. */
function deptPattern(names: readonly string[]): RegExp {
  const key = names.join("|");
  const cached = deptPatternCache.get(key);
  if (cached) return cached;
  const sorted = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length);
  const escaped = sorted.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  deptPatternCache.set(key, re);
  return re;
}

/**
 * Règle (b) : département ou préfecture cité en mot entier dans le texte
 * fourni (titre + résumé — l'URL est exclue par l'appelant et retirée ici par
 * précaution). Un homonyme ambigu (`AMBIGUOUS_PLACES`) n'est retenu que :
 *   - collé à une préposition locative (« en Vienne », « à Pau »), ou
 *   - accompagné d'un terme administratif dans la même phrase, ou
 *   - sous une forme composée non ambiguë (`lot-et-garonne`,
 *     `charente-maritime`, `pyrénées-atlantiques`…).
 * Mesure de l'effet : `scripts/audit-dept.mts` (docs/couverture.md).
 */
export function admitsDepartment(text: string, deptNames: readonly string[]): boolean {
  if (!text || deptNames.length === 0) return false;
  const hay = normalize(text.replace(URL_OCCURRENCE_RE, " "));
  const pattern = deptPattern(deptNames);
  pattern.lastIndex = 0;
  for (const match of hay.matchAll(pattern)) {
    const name = match[1]?.toLowerCase() ?? "";
    const at = match.index;
    if (!name || at === undefined) continue;
    // Forme composée : le trait d'union lève l'ambiguïté (« lot » vs
    // « lot-et-garonne », « vienne » vs « haute-vienne »).
    if (name.includes("-")) return true;
    if (AMBIGUOUS_PLACES[name] !== true) return true;
    const before = hay.slice(Math.max(0, at - 32), at);
    if (LOCATIVE_CUE_RE.test(before)) return true;
    if (ADMIN_CUE_RE.test(deptSentenceWindow(hay, at, at + name.length))) return true;
  }
  return false;
}

/** Fenêtre bornée à la phrase autour de `[start, end)`, pour juger du contexte. */
function deptSentenceWindow(hay: string, start: number, end: number): string {
  const from = Math.max(0, start - 120);
  const to = Math.min(hay.length, end + 120);
  let left = from;
  const head = hay.slice(from, start);
  const cutLeft = Math.max(
    head.lastIndexOf("."),
    head.lastIndexOf("!"),
    head.lastIndexOf("?"),
    head.lastIndexOf(";"),
    head.lastIndexOf("\n")
  );
  if (cutLeft >= 0) left = from + cutLeft + 1;
  let right = to;
  const tail = hay.slice(end, to);
  const cutRight = tail.search(/[.!?;\n]/);
  if (cutRight >= 0) right = end + cutRight;
  return hay.slice(left, right);
}

/**
 * Migration idempotente : marqueur d'admission sur `event`. Valeurs écrites par
 * `generic.ts` : `org`, `epss`, `dept`, ou null. Aucun accès à `org_id`.
 */
export async function ensureCoverageSchema(): Promise<void> {
  await ingestQuery("ALTER TABLE event ADD COLUMN IF NOT EXISTS admission_rule text");
}

// réexport type OrgRef pour compat
export type { OrgRef };
