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
 * Normalise une valeur de domaine. Renvoie `null` si la valeur n'est pas un
 * domaine (chemin seul, adresse e-mail, nom d'organisation…).
 *
 * L'ordre importe : on retire le schéma **avant** de couper sur `/`, puis le
 * chemin avant le port, ce qui évite de confondre `:` de scheme et de port.
 */
export function normalizeDomainValue(value: string | null | undefined): string | null {
	if (!value) return null;
	let s = value.trim().toLowerCase();
	if (!s) return null;
	s = s.replace(SCHEME_RE, "");
	s = s.split(/[/?#]/, 1)[0] ?? "";
	s = s.split(":", 1)[0] ?? "";
	s = s.replace(/\.+$/, "");
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
  domain?: string | null;
  website?: string | null;
  domainNorm?: string | null;
  websiteDomain?: string | null;
};

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

/**
 * Chaîne de résolution d'un indice-domaine, dans l'ordre imposé :
 *  1. domaine exact (`domain` ou `website` normalisés) ;
 *  2. racine du domaine contre `slug` / nom normalisé — mot ≥ 5 lettres et
 *     **une seule** candidate, sinon refus motivé ;
 *  3. aucun rattachement : l'indice part en revue.
 *
 * En cas d'égalité sur l'étage 1, l'identifiant le plus faible gagne
 * (déterminisme du moteur existant).
 */
export function resoudreDomaine(hint: string, orgs: readonly OrgDomaine[]): ResolutionDomaine {
  const hintDomain = domainFromHint(hint);
  if (!hintDomain) return { etape: "aucune", orgId: null, confidence: 0, raison: "pas un domaine" };

  const exact = orgs
    .filter((o) =>
      memesDomaines(hintDomain, normalizeDomainValue(o.domainNorm ?? o.domain)) ||
      memesDomaines(hintDomain, normalizeDomainValue(o.websiteDomain ?? o.website)),
    )
    .map((o) => o.id)
    .sort((a, b) => a - b);
  if (exact.length > 0) return { etape: "exact", orgId: exact[0]!, confidence: 0.95 };

  const root = racineDomaine(hintDomain);
  if (!root) return { etape: "aucune", orgId: null, confidence: 0, raison: "racine trop courte" };
  const byRoot = orgs.filter((o) =>
    nameWords(o.slug).includes(root) || nameWords(o.nameNorm ?? o.name).includes(root),
  );
  if (byRoot.length === 0) {
    return { etape: "aucune", orgId: null, confidence: 0, raison: "aucune candidate par racine" };
  }
  if (byRoot.length > 1) {
    return { etape: "aucune", orgId: null, confidence: 0, raison: `${byRoot.length} candidates par racine` };
  }
  return { etape: "racine", orgId: byRoot[0]!.id, confidence: 0.75 };
}
