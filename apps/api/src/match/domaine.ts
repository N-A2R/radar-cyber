/**
 * Indices qui sont des **domaines** : normalisation et rapprochement.
 *
 * Un `org_hint` comme `connectwell.com`, `WWW.Exemple.FR.` ou
 * `https://www.exemple.com:8443/contact` désigne une organisation par son
 * domaine, pas par un nom. La normalisation doit donc porter des deux côtés :
 * côté indice (scheme, port, chemin, `www.`, point final, casse) et côté
 * `org.domain` (qui peut être saisi avec les mêmes variations).
 *
 * Deux règles de prudence, issues de mesures sur la file de quarantaine :
 *  - une étiquette générique (`mail`, `www`, `ns`, `api`…) ne fonde **jamais**
 *    un rattachement : `mail.exemple.com` n'est pas `exemple.com` ;
 *  - un TLD ne se compense pas : `exemple.fr` ≠ `exemple.com`.
 *
 * Ce module est pur (aucune base, aucun état) : il est utilisé par le moteur
 * de quarantaine et testé sur les cas limites sans PostgreSQL.
 */

import { codeDepartement } from "./dept.js";
import { MOTS_GENERIQUES, MOTS_GENERIQUES_ENTREPRISE } from "./generique.js";

/** Schéma d'URL : retiré avant le chemin, sinon `https://…` devient `https:`. */
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Domaine nu, ASCII, au moins une étiquette avant le TLD alphabétique. */
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/** Domaine tel qu'il apparaît dans un texte libre (adresse e-mail, titre…). */
const HOST_IN_TEXT_RE = /(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}/i;

/**
 * Étiquettes qui ne désignent pas une organisation : services techniques ou
 * sous-domaines de convenance. Leur présence ne peut pas transformer un
 * domaine en clé de rattachement vers son parent.
 */
export const SOUS_DOMAINES_GENERIQUES: Record<string, true> = {
	www: true, www2: true, mail: true, email: true, webmail: true, smtp: true,
	imap: true, pop: true, pop3: true, ns: true, ns1: true, ns2: true, dns: true,
	mx: true, ftp: true, ssh: true, vpn: true, remote: true, api: true, dev: true,
	test: true, staging: true, admin: true, web: true, blog: true, cdn: true,
	static: true, portal: true, intranet: true, extranet: true, secure: true,
	shop: true, m: true, mobile: true, cloud: true, apps: true, app: true,
	srv: true, server: true, host: true, home: true,
	library: true, libraries: true, docs: true, wiki: true, support: true,
	info: true, sales: true, news: true, forum: true, status: true, img: true,
	beta: true, demo: true, old: true, new: true, s3: true, git: true,
};

/**
 * Suffixes publics à deux étiquettes observés dans le lot (co.uk, com.br,
 * gob.pe…) et les plus courants. Sans cette liste, `solarium.com.br` devien-
 * drait `com.br` et se rattacherait à n'importe quelle organisation en
 * `.com.br` : quatre faux positifs de ce type sur le lot mesuré.
 */
const SUFFIXES_PUBLICS_COMPOSES: ReadonlySet<string> = new Set([
	"ac.uk", "ac.za", "co.id", "co.in", "co.il", "co.jp", "co.ke", "co.kr",
	"co.mz", "co.nz", "co.th", "co.tz", "co.uk", "co.us", "co.ug", "co.za",
	"com.ar", "com.au", "com.bo", "com.br", "com.cn", "com.co", "com.do",
	"com.ec", "com.gt", "com.hk", "com.mx", "com.my", "com.ng", "com.pa",
	"com.pe", "com.ph", "com.sa", "com.sg", "com.sv", "com.tr", "com.tw",
	"com.ua", "com.vn", "com.ve", "gob.mx", "gob.pe", "go.jp", "gov.br",
	"gov.in", "gov.ph", "gov.uk", "ne.jp", "net.au", "net.br", "net.id",
	"net.ng", "net.nz", "or.jp", "org.au", "org.br", "org.mk", "org.ng",
	"org.tr", "org.uk", "org.za",
]);

/**
 * Domaine racine (eTLD+1) d'un indice ou d'une valeur stockée : schéma, port,
 * chemin, `www.` et **tous** les sous-domaines sont retirés.
 * `https://www.library.uta.edu:8443/a` → `uta.edu` ; `solarium.com.br` →
 * `solarium.com.br` (`com.br` est un suffixe public, pas un sous-domaine).
 * Renvoie `null` pour une valeur qui n'est pas un domaine enregistrable.
 */
export function domaineRacine(value: string | null | undefined): string | null {
	const domain = domainFromHint(value ?? "");
	if (!domain || SUFFIXES_PUBLICS_COMPOSES.has(domain)) return null;
	const labels = domain.split(".");
	const suffix = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`;
	const largeur = SUFFIXES_PUBLICS_COMPOSES.has(suffix) ? 3 : 2;
	return labels.slice(-Math.min(largeur, labels.length)).join(".");
}

/**
 * Normalise une valeur de domaine. Renvoie `null` si la valeur n'est pas un
 * domaine (chemin seul, adresse e-mail, nom d'organisation…).
 *
 * L'ordre importe : on retire le schéma **avant** de couper sur `/`, puis les
 * éventuels identifiants (`user:pass@`) avant le port, ce qui évite de
 * confondre `:` de scheme, d'authentification et de port.
 */
export function normalizeDomainValue(value: string | null | undefined): string | null {
	if (!value || typeof value !== "string") return null;
	let s = value.trim().toLowerCase();
	if (!s) return null;
	s = s.replace(SCHEME_RE, "");
	s = s.split(/[/?#]/, 1)[0] ?? "";
	const at = s.lastIndexOf("@");
	if (at >= 0) s = s.slice(at + 1);
	s = s.split(":", 1)[0] ?? "";
	s = s.replace(/^\.+/, "").replace(/\.+$/, "");
	while (s.startsWith("www.")) s = s.slice(4);
	return HOST_RE.test(s) ? s : null;
}

/**
 * Domaine porté par un indice. Le chemin direct (`https://…`, `www.…`) est
 * tenté d'abord ; on retombe ensuite sur la première séquence en forme de
 * domaine dans un texte libre (`courriel@pessac.fr`, `acme.com — 20 GB`).
 */
export function domainFromHint(hint: string): string | null {
	const direct = normalizeDomainValue(hint);
	if (direct) return direct;
	const found = hint.match(HOST_IN_TEXT_RE);
	return found ? normalizeDomainValue(found[0]) : null;
}

/** Vrai si l'indice, entièrement normalisé, est un domaine. */
export function isDomainHint(hint: string): boolean {
	return normalizeDomainValue(hint) !== null;
}

/**
 * Une étiquette de sous-domaine est « spécifique » quand elle porte une
 * information : au moins 3 caractères, ni générique, ni purement numérique.
 * `mail.exemple.com` ne l'est pas ; `laboratoire.exemple.com` l'est.
 */
export function estSpecifique(label: string): boolean {
	return (
		label.length >= 3 &&
		!/^\d+$/.test(label) &&
		!SOUS_DOMAINES_GENERIQUES[label] &&
		!MOTS_GENERIQUES.has(label) &&
		!MOTS_GENERIQUES_ENTREPRISE.has(label)
	);
}

/**
 * Force d'un rapprochement entre deux domaines normalisés, sur l'échelle de
 * confiance du moteur de quarantaine. `0` signifie « aucun rattachement ».
 *
 *   - égalité exacte (après normalisation) : clé, 0,95 ;
 *   - sous-domaine dont l'étiquette est spécifique : 0,85 ;
 *   - sous-domaine générique ou TLD différent : 0.
 */
export function domainAffinity(hintDomain: string | null, orgDomain: string | null): number {
	if (!hintDomain || !orgDomain) return 0;
	if (hintDomain === orgDomain) return 0.95;
	const [short, long] = hintDomain.length <= orgDomain.length
		? [hintDomain, orgDomain]
		: [orgDomain, hintDomain];
	if (!long.endsWith(`.${short}`)) return 0;
	const labels = long.slice(0, -(short.length + 1)).split(".");
	return labels.length > 0 && labels.every(estSpecifique) ? 0.85 : 0;
}

/** Égalité stricte de domaines normalisés (utilisée pour `website`). */
export function memesDomaines(a: string | null, b: string | null): boolean {
	return a !== null && b !== null && a === b;
}

/**
 * Racine distinctive d'un domaine : **première** étiquette (découpée sur `-`)
 * dont un fragment fait au moins cinq lettres et n'est pas un service
 * générique. `connectwell.com` → `connectwell`, `black-star.fr` → `black`,
 * `www.sdjeng.com` → `sdjeng` (`www.` déjà retiré par la normalisation).
 * On ne saute pas une étiquette : `mail.exemple.com` ne doit pas devenir
 * `exemple` et s'attacher au parent. Une racine trop courte (`dts.edu`)
 * n'est pas proposée non plus.
 */
export function racineDomaine(domain: string | null): string | null {
  if (!domain) return null;
  const premiere = domain.split(".")[0] ?? "";
  return premiere.split("-").find((part) => part.length >= 5 && estSpecifique(part)) ?? null;
}

/** Organisation vue par la chaîne de résolution (champs déjà normalisés). */
export type OrgDomaine = {
  id: number;
  slug: string;
  name: string;
  nameNorm?: string;
  dept?: string | null;
  domain?: string | null;
  website?: string | null;
  domainNorm?: string | null;
  websiteDomain?: string | null;
  /** Alias `org_alias.source='domain'` portés par l'organisation. */
  domainAliases?: readonly string[];
};

/** Contexte de la source, utilisé seulement quand plusieurs orgs sont candidates. */
export type ContexteDomaine = { dept?: string | null; domain?: string | null };

/** Résultat de la chaîne : premier étage qui réussit, sinon la revue. */
export type ResolutionDomaine = {
  etape: "exact" | "racine" | "aucune";
  orgId: number | null;
  confidence: number;
  /** Pourquoi l'étage 2 a refusé (diagnostic de la file de revue). */
  raison?: string;
};

function nameWords(value: string): string[] {
  // `slug` porte des tirets ; `nameNorm` est déjà déaccentué par le moteur.
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Valeurs de domaine enregistrées pour une organisation, avec leur racine. */
function domainesDe(org: OrgDomaine): string[] {
  const valeurs = [org.domainNorm ?? org.domain, org.websiteDomain ?? org.website, ...(org.domainAliases ?? [])];
  const domaines: string[] = [];
  for (const valeur of valeurs) {
    const normalise = normalizeDomainValue(valeur);
    if (normalise) domaines.push(normalise);
    const racine = domaineRacine(valeur);
    if (racine) domaines.push(racine);
  }
  return domaines;
}

/**
 * Départage d'un domaine partagé : le département et le domaine de la source
 * sont des contextes indépendants. On garde l'intersection quand elle existe,
 * sinon le meilleur des deux critères. Un filtre sans résultat n'est jamais
 * imposé : un départage ne doit pas transformer une ambiguïté en erreur.
 */
function departageParContexte(
  candidats: readonly OrgDomaine[],
  contexte?: ContexteDomaine,
): OrgDomaine[] {
  if (candidats.length <= 1 || !contexte) return [...candidats];
  const dept = codeDepartement(contexte.dept);
  const domaine = normalizeDomainValue(contexte.domain);
  const racine = domaineRacine(contexte.domain);
  const parDept = dept
    ? candidats.filter((o) => codeDepartement(o.dept) === dept)
    : [];
  const parDomaineExact = domaine
    ? candidats.filter((o) => domainesDe(o).includes(domaine))
    : [];
  const parDomaineRacine = racine
    ? candidats.filter((o) => domainesDe(o).includes(racine))
    : [];
  // Un domaine plus précis que la racine départage avant elle : deux orgs
  // peuvent partager `exemple.com` sans partager `sous1`/`sous2`.
  const parDomaine = parDomaineExact.length > 0 ? parDomaineExact : parDomaineRacine;
  const croise = parDept.filter((o) => parDomaine.includes(o));
  if (croise.length > 0) return croise;
  if (parDept.length > 0) return parDept;
  if (parDomaine.length > 0) return parDomaine;
  return [...candidats];
}

/**
 * Chaîne de résolution d'un indice-domaine, dans l'ordre imposé :
 *  1. domaine racine exact (`domain`, `website` ou alias de type domaine) ;
 *  2. racine du domaine contre `slug` / nom normalisé — mot ≥ 5 lettres et
 *     **une seule** candidate, sinon refus motivé ;
 *  3. aucun rattachement : l'indice part en revue.
 *
 * En cas d'égalité sur l'étage 1 sans contexte, l'identifiant le plus faible
 * gagne (déterminisme du moteur existant). Avec un contexte (département ou
 * domaine de la source), plusieurs candidats restent ambigus et sont refusés :
 * on ne tire pas au sort une organisation pour une clé partagée.
 */
export function resoudreDomaine(
  hint: string,
  orgs: readonly OrgDomaine[],
  contexte?: ContexteDomaine,
): ResolutionDomaine {
  const racine = domaineRacine(hint);
  if (!racine) return { etape: "aucune", orgId: null, confidence: 0, raison: "pas un domaine" };

  const exact = orgs
    .filter((o) => domainesDe(o).includes(racine))
    .sort((a, b) => a.id - b.id);
  if (exact.length > 0) {
    const retenus = departageParContexte(exact, contexte);
    if (contexte && retenus.length > 1) {
      return { etape: "aucune", orgId: null, confidence: 0, raison: `${retenus.length} organisations pour ce domaine` };
    }
    return { etape: "exact", orgId: retenus[0]!.id, confidence: 0.95 };
  }

  const root = racineDomaine(racine);
  if (!root) return { etape: "aucune", orgId: null, confidence: 0, raison: "racine trop courte" };
  const byRoot = orgs.filter((o) =>
    nameWords(o.slug).includes(root) || nameWords(o.nameNorm ?? o.name).includes(root),
  );
  if (byRoot.length === 0) {
    return { etape: "aucune", orgId: null, confidence: 0, raison: "aucune candidate par racine" };
  }
  if (byRoot.length > 1) {
    const retenus = departageParContexte(byRoot, contexte);
    const motif = contexte && retenus.length < byRoot.length
      ? `${retenus.length} candidates après départage`
      : `${byRoot.length} candidates par racine`;
    if (retenus.length !== 1) {
      return { etape: "aucune", orgId: null, confidence: 0, raison: motif };
    }
    return { etape: "racine", orgId: retenus[0]!.id, confidence: 0.75 };
  }
  return { etape: "racine", orgId: byRoot[0]!.id, confidence: 0.75 };
}
