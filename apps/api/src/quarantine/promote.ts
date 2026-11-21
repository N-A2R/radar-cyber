/**
 * Promotion des revendications de quarantaine vers l'observatoire.
 *
 * Une revendication ne devient un événement public qu'après promotion :
 * - automatique quand `org_hint` correspond à une organisation connue
 *   (matchOrg, score >= MIN_CONFIDENCE) ;
 * - manuelle via POST /api/quarantine/:id/promote.
 *
 * Depuis la vague « branchement » (docs/rapport-regles-branchees.md), les six
 * règles de précision (match/regles-precision.ts) sont consultées au point de
 * décision, derrière le drapeau `PRECISION_RULES=on|off` : un rattachement
 * refusé n'est pas écrit, et le refus est journalisé avec la règle qui l'a
 * posé (kind `match.refuse`). Depuis le chantier couverture (S2.1), un
 * rattachement par sigle n'est accepté que si le registre confirme une seule
 * organisation ; la règle qui tranche est écrite dans la trace à l'acceptation
 * comme au refus.
 *
 * La promotion crée un événement `ransomware` / `third_party_claim`,
 * dédupliqué sur `content_hash`, puis déclenche la règle
 * `ransomware-revendication` pour générer l'alerte.
 */
import { admitEvent } from "../contract/admit.js";
import { languageVerdict } from "../collectors/filter.js";
import { ingestQuery, query, withTransaction } from "../db.js";
import { consigner, consignerAvec } from "../journal/index.js";
import { ecarteeParRegles, REGLE_SIGLE, type TraceRegle } from "../match/regles-precision.js";
import {
	chargerOrgParAliasSigle,
	contexteSigleDepuisSource,
	deciderSigleDepuisRegistre,
	estSigle,
	normaliseSigle,
	sigleDeIndice,
	type DecisionSigle,
} from "../match/sigles.js";
import { porteeRegionale } from "../match/territorial.js";
import type { PoolClient, QueryResultRow } from "pg";
import { evaluateEvent } from "../detect/engine.js";
import { confirmOrganization } from "../match/decide.js";
import {
  domainAffinity,
  domainFromHint,
  memesDomaines,
  normalizeDomainValue,
  resoudreDomaine,
  domaineRacine,
  type ResolutionDomaine,
} from "../match/domaine.js";

/** Organisme tel que lu en base. */
export type OrgRow = {
  id: number;
  name: string;
  slug: string;
  kind: string;
  city: string | null;
  domain: string | null;
  website: string | null;
};

/** Organisme pré-normalisé pour le rapprochement. */
export type OrgIndexEntry = OrgRow & {
  nameNorm: string;
  domainNorm: string | null;
  websiteDomain: string | null;
  cityNorm: string | null;
  nameTokens: string[];
  /** Alias officiel exact qui a fait entrer l'organisation dans l'index. */
  aliasSigle?: string;
  /** Alias `org_alias.source='domain'` portés par l'organisation. */
  domainAliases?: string[];
};


/** Résultat d'un rapprochement : orgId + score de confiance [0,1]. */
export type OrgMatch = {
	orgId: number;
	confidence: number;
	/**
	 * Ce qui a porté la correspondance. Un domaine exact est une **clé**, pas
	 * une ressemblance : il ne demande aucun arbitrage. Un nom, si.
	 */
	via: "domain" | "name";
};

/** Seuil minimal pour considérer un indice comme une organisation. */
/** Seuil de rapprochement proposé à un humain (« ville + nom » vaut 0,6). */
export const MIN_CONFIDENCE = 0.5;

/**
 * Seuil appliqué à la promotion **automatique**.
 *
 * À 0,5, l'index de 10 261 organisations faisait matcher des milliers de
 * revendications et 2 908 événements sont entrés en dix minutes. La machine
 * n'a pas le jugement d'un analyste : elle exige 0,85, l'humain garde 0,5.
 */
export const AUTO_MIN_CONFIDENCE = 0.85;

/**
 * Règles de précision du rattachement actives ? (spec :
 * `match/regles-precision.ts` — les six règles retenues par la campagne
 * précision, branchées par la vague « branchement », S1.1.)
 *
 * Drapeau `PRECISION_RULES=on|off`, lu **à chaque appel** : les deux régimes
 * se mesurent dans le même binaire. Absent = off : le comportement livré
 * reste le défaut jusqu'à ce que l'exploitation choisisse — la mesure du
 * compromis précision/couverture et la recommandation vivent dans
 * `docs/rapport-regles-branchees.md`.
 */
export function reglesPrecisionActives(): boolean {
	const v = (process.env.PRECISION_RULES ?? "").trim().toLowerCase();
	return v === "on" || v === "1" || v === "true";
}

/** Un rattachement refusé par les règles de précision (drapeau actif). */
export type RefusRegle = {
	id: number;
	/** La règle qui a refusé : sans elle, la baisse de couverture reste muette. */
	regle: string;
	indice: string;
	orgId: number;
	orgName: string;
	via: "domain" | "name";
	confidence: number;
};

/**
 * Évalue les règles de précision sur un rapprochement du moteur. Renvoie le
 * nom de la première règle qui refuse, ou null (drapeau off : null, le
 * rattachement suit le chemin livré sans changement). Le trace (fourni par
 * la promotion) porte la règle qui a tranché, y compris quand elle accepte.
 */
export function refusParRegles(
	indice: string,
	m: Pick<OrgMatch, "via" | "confidence" | "orgId">,
	orgName: string,
	opts: { sigle?: DecisionSigle; trace?: TraceRegle } = {},
): string | null {
	if (!reglesPrecisionActives()) return null;
	return ecarteeParRegles(
		{ indice, via: m.via, confidence: m.confidence, orgName, orgId: m.orgId, sigle: opts.sigle },
		opts.trace,
	);
}

/**
 * Résout un sigle au registre et rend le match à évaluer. Le sigle est
 * l'indice lui-même quand il a forme de sigle, sinon le jeton unique du nom
 * qui a fondé le 0,7. Un sigle confirmé fournit le match quand le moteur
 * n'en avait pas (alias exact) ; confirmé sur une autre organisation, il
 * laisse le match du moteur en place pour que la règle le refuse.
 */
export async function resoudreSigle(
	indice: string,
	match: OrgMatch | null,
	orgName: string,
): Promise<{ match: OrgMatch | null; orgName: string; decision?: DecisionSigle }> {
	if (!reglesPrecisionActives() || (match && match.confidence !== 0.7)) {
		return { match, orgName };
	}
	const sigle = sigleDeIndice(indice, orgName);
	if (!sigle) return { match, orgName };
	// Le département de l'organisation proposée par le moteur et le domaine
	// porté par l'indice départagent les sigles partagés au registre.
	const contexte = await contexteSigleDepuisSource(match?.orgId ?? null, indice);
	const decision = await deciderSigleDepuisRegistre(sigle, contexte);

	if (decision.accepte && decision.orgId !== undefined && decision.orgId !== match?.orgId) {
		return {
			match: { orgId: decision.orgId, confidence: 0.7, via: "name" },
			orgName: decision.orgName ?? "",
			decision,
		};
	}
	return { match, orgName, decision };
}

/**
 * Consigne un refus de règle dans le journal de vérité. Le fait porte
 * **quelle règle** a refusé (S1.2) : sans elle, on ne saurait jamais pourquoi
 * la couverture a baissé.
 *
 * La promotion automatique rescanne les faits `pending` à chaque passage : le
 * refus d'un fait est le même fait à chaque scan — on ne le réécrit pas
 * (journal append-only, un seul fait par (sujet, règle)).
 */
async function consignerRefusRegle(
	row: QuarantineRow,
	orgId: number,
	m: Pick<OrgMatch, "via" | "confidence">,
	orgName: string,
	regle: string,
): Promise<{ ok: boolean; error?: string }> {
	const subject = `quarantine:${row.content_hash}`;
	const deja = await query<{ ok: number }>(
		"SELECT 1 AS ok FROM journal WHERE kind='match.refuse' AND subject=$1 AND payload->>'regle'=$2 LIMIT 1",
		[subject, regle],
	);
	if (deja.rows.length > 0) return { ok: true };
	return consigner({
		kind: "match.refuse",
		subject,
		summary: `rattachement refusé par la règle ${regle} (quarantine ${row.id})`,
		actor: "moteur:regles-precision@1",
		payload: {
			quarantineId: Number(row.id),
			regle,
			indice: row.org_hint ?? "",
			orgId,
			orgName,
			via: m.via,
			confidence: m.confidence,
			drapeau: "PRECISION_RULES=on",
		},
	});
}

/** Ligne de quarantaine nécessaire à la promotion. */
type QuarantineRow = {
  id: number;
  source: string;
  source_url: string;
  groupe: string | null;
  org_hint: string | null;
  claimed_at: Date | string | null;
  extracted: Record<string, unknown>;
  raw_body: string | null;
  content_hash: string;
  promoted: boolean;
  tlp: string | null;
};

/** Supprime les accents et passe en minuscules. */
export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Normalise un nom : minuscules, sans accents, ponctuation remplacée par des espaces. */
export function normalizeName(s: string): string {
  return stripAccents(s).replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Normalise un domaine (côté `org.domain` ou URL).
 * Le module `match/domaine` porte la règle ; la forme ancienne reste en repli
 * pour les valeurs qui ne sont pas des domaines (historique de données).
 */
export function normalizeDomain(d: string): string {
  return normalizeDomainValue(d) ?? stripAccents(d.trim()).replace(/^www\./, "").replace(/\/.*$/, "").replace(/\.$/, "");
}

/** Extrait le domaine d'un indice, y compris avec scheme, port ou chemin. */
export function extractDomain(hint: string): string | null {
  return domainFromHint(hint);
}

/**
 * Ligne `org` → entrée d'index pré-normalisée.
 */
function toIndexEntry(o: OrgRow, aliasSigle?: string): OrgIndexEntry {
  const nameNorm = normalizeName(o.name);
  return {
    ...o,
    nameNorm,
    domainNorm: o.domain ? normalizeDomain(o.domain) : null,
    websiteDomain: o.website ? extractDomain(o.website) : null,
    cityNorm: o.city ? normalizeName(o.city) : null,
    // Jetons distincts, et sans les termes techniques génériques : « CODE
    // 202 (CODE 202) » ne doit pas compter comme un nom à deux jetons.
    nameTokens: [...new Set(nameNorm.split(" ").filter((t) => t.length >= 4 && !GENERIC_TOKENS.has(t)))],
    ...(aliasSigle ? { aliasSigle } : {}),
  };
}

/**
 * Organisations dont l'alias officiel est exactement l'indice. Sans règle de
 * précision active, le moteur livré ne les charge pas : c'est le drapeau qui
 * décide de la couverture supplémentaire.
 */
async function chargerEntreesAliasSigle(hint: string): Promise<OrgIndexEntry[]> {
  if (!reglesPrecisionActives() || !estSigle(hint)) return [];
  const sigle = normaliseSigle(hint);
  const orgs = await chargerOrgParAliasSigle(sigle);
  return orgs.map((o) => toIndexEntry(o, sigle));
}

/**
 * Charge et pré-normalise les organisations.
 *
 * `filter` borne la requête (mesure, revue d'une poignée d'indices). Sans lui,
 * l'index complet — 1,2 million de lignes — est chargé.
 */
export async function loadOrgIndex(filter?: { where: string; params?: unknown[] }): Promise<OrgIndexEntry[]> {
  const sql = `SELECT id, name, slug, kind, city, domain, website FROM org${filter ? ` WHERE ${filter.where}` : ""}`;
  const r = await query<OrgRow>(sql, filter?.params ?? []);
  return attacherAliasDomaines(r.rows.map((o) => toIndexEntry(o)), await chargerAliasDomaines());
}

/**
 * Alias matérialisés en domaine par le chargeur de référentiel et par
 * `createOrgFromHint`. 19 lignes mesurées sur la base de test : la table
 * entière tient en mémoire, aucun préfiltre SQL n'est nécessaire ici.
 */
const SQL_ALIAS_DOMAINE = `
SELECT o.id, o.name, o.slug, o.kind, o.city, o.domain, o.website, a.alias
  FROM org_alias a JOIN org o ON o.id = a.org_id
 WHERE a.source = 'domain' AND a.status = 'active' AND a.valid_to IS NULL
 ORDER BY o.id, a.alias`;

type AliasDomaineRow = OrgRow & { alias: string };

/** Toutes les lignes alias-domaine, ou seulement celles de la racine visée. */
async function chargerAliasDomaines(racine?: string): Promise<AliasDomaineRow[]> {
  const r = await query<AliasDomaineRow>(SQL_ALIAS_DOMAINE);
  return racine ? r.rows.filter((row) => domaineRacine(row.alias) === racine) : r.rows;
}

/** Attache les alias-domaine aux entrées présentes, en créant les manquantes. */
function attacherAliasDomaines(
  entrees: OrgIndexEntry[],
  rows: readonly AliasDomaineRow[],
): OrgIndexEntry[] {
  const parId = new Map(entrees.map((e) => [e.id, e]));
  for (const row of rows) {
    const entree = parId.get(row.id) ?? toIndexEntry(row);
    const liste = (entree.domainAliases ??= []);
    if (!liste.includes(row.alias)) liste.push(row.alias);
    parId.set(row.id, entree);
  }
  return [...parId.values()];
}

async function avecAliasDomaines(hint: string, entrees: OrgIndexEntry[]): Promise<OrgIndexEntry[]> {
  const racine = domaineRacine(hint);
  if (!racine) return entrees;
  return attacherAliasDomaines(entrees, await chargerAliasDomaines(racine));
}


/**
 * Expression SQL miroir de `normalizeDomainValue`, utilisée seulement pour
 * **élargir** le préfiltre : une org dont le domaine est stocké avec un
 * scheme, un port ou un `www.` doit rester visible du moteur, qui tranche
 * ensuite avec la normalisation TypeScript.
 */
function sqlDomain(column: string): string {
  return `regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(btrim(${column})), '^https?://', ''), '[/?#].*$', ''), ':\\d+$', ''), '\\.$', ''), '^www\\.', '')`;
}
/**
 * Organisations candidates pour un indice — sans charger 1,24 M de lignes.
 *
 * Le moteur exige l'égalité des jetons : une correspondance par nom suppose
 * qu'un jeton du nom soit présent dans l'indice, et une correspondance par
 * domaine passe par `domain` ou `website`. On borne donc la requête à ces cas
 * (index trigramme `org_name_trgm`), puis le moteur tranche sur ce
 * sur-ensemble. Mesuré : 11 ms par indice au lieu de 388 s pour l'index
 * entier.
 */
export async function loadCandidateIndex(hint: string): Promise<OrgIndexEntry[]> {
  const tokens = [...new Set(normalizeName(hint).split(" ").filter((t) => t.length >= 2))];
  const domain = extractDomain(hint);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (tokens.length > 0) {
    params.push(tokens.map((t) => `%${t}%`));
    // Préfiltre sur `name_norm` (colonne générée déaccentuée, migration 041)
    // et non sur `name` : les jetons ici sont déaccentués par `normalizeName`,
    // et `name ILIKE '%esperance%'` ne rencontre jamais « Espérance ». Mesuré
    // le 2026-11-21 : les deux ensembles ILIKE étaient disjoints, et une
    // revendication citant une organisation au nom accentué par son domaine
    // (jamais accentué) ne trouvait personne. Le moteur conserve sa
    // normalisation propre ; le préfiltre doit seulement rester un
    // sur-ensemble — il l'est désormais pour les noms accentués.
    clauses.push(`name_norm ILIKE ANY($${params.length}::text[])`);
  }
  if (domain) {
    params.push(domain);
    const d = `$${params.length}`;
    const nd = sqlDomain("domain");
    const nw = sqlDomain("website");
    clauses.push(
      `(${nd} = ${d} OR ${nd} LIKE '%.' || ${d} OR ${d} LIKE '%.' || ${nd} OR ${nw} = ${d} OR ${nw} LIKE '%.' || ${d} OR lower(coalesce(website, '')) LIKE '%' || ${d})`,
    );
  }
  // Un sous-domaine (`www.library.uta.edu`) n'est pas la clé : c'est la racine
  // (`uta.edu`) qui doit retrouver l'organisation, y compris si son domaine
  // stocké porte lui-même un sous-domaine.
  const racine = domaineRacine(hint);
  if (racine && racine !== domain) {
    params.push(racine);
    const r = `$${params.length}`;
    const nd = sqlDomain("domain");
    const nw = sqlDomain("website");
    clauses.push(`(${nd} = ${r} OR ${nd} LIKE '%.' || ${r} OR ${nw} = ${r} OR ${nw} LIKE '%.' || ${r})`);
  }
  // « A.M.F. » ne laisse que des jetons d'une lettre : pas de préfiltre par
  // nom, mais l'alias exact suffit — charger 1,24 M de lignes serait absurde.
  if (clauses.length === 0) {
    return reglesPrecisionActives() && estSigle(hint) ? avecAlias(hint, []) : loadOrgIndex();
  }
  const r = await query<OrgRow>(
    `SELECT id, name, slug, kind, city, domain, website FROM org WHERE ${clauses.join(" OR ")}`,
    params,
  );
  return avecAliasDomaines(hint, await avecAlias(hint, r.rows.map((o) => toIndexEntry(o))));
}

/** Ajoute les organisations trouvées par alias sans doublon d'identifiant. */
async function avecAlias(hint: string, entrees: OrgIndexEntry[]): Promise<OrgIndexEntry[]> {
  const alias = await chargerEntreesAliasSigle(hint);
  if (alias.length === 0) return entrees;
  const parId = new Map(entrees.map((e) => [e.id, e]));
  for (const e of alias) if (!parId.has(e.id)) parId.set(e.id, e);
  return [...parId.values()];
}

/**
 * Test de présence d'une expression complète (frontières de mot) dans une
 * chaîne normalisée. `normalizeName` ayant remplacé toute ponctuation par
 * des espaces, un simple padding suffit — pas de regex à recompiler.
 */
function containsPhrase(hintNorm: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${hintNorm} `.includes(` ${phrase} `);
}

/**
 * Jetons qui ne désignent rien.
 *
 * « com » est présent dans *tous* les domaines en `.com` : une organisation
 * nommée « N-COM (N-COM) » se réduisait donc à ce jeton et attrapait chaque
 * revendication `quelquechose.com` à 0,75. Huit revendications d'un lot de
 * dix ont été rattachées à cette seule société de Villeneuve-d'Ornon.
 *
 * La règle est simple : un jeton générique ne peut jamais *fonder* un
 * rapprochement. Il peut accompagner (« chu bordeaux fr »), pas décider.
 */
export const GENERIC_TOKENS = new Set([
  "com", "net", "org", "edu", "gouv", "gov", "int", "info", "biz",
  "fr", "eu", "be", "ch", "ca", "uk", "de", "es", "it", "nl", "lu",
  "www", "http", "https", "mail", "web", "site",
  // Termes techniques : présents dans tous les CVE et dans des milliers de
  // raisons sociales. Ils ne distinguent rien.
  "code", "software", "network", "networks", "system", "systems", "server",
  "servers", "service", "services", "solution", "solutions", "security",
  "secure", "platform", "platforms", "product", "products", "digital",
  "cloud", "data", "media", "group", "global", "technology", "technologies",
  // Formes juridiques : présentes dans des centaines de milliers de raisons
  // sociales. Elles ne distinguent rien, mais elles **bloquaient** la règle
  // « tous les jetons du nom sont dans l'indice » : « EARL BLACK STAR » ne
  // pouvait pas rencontrer l'indice « black star » à cause du seul « earl ».
  // Retirées ici, elles ne fondent jamais un rapprochement et cessent de
  // l'empêcher.
  "earl", "sarl", "sas", "sasu", "eurl", "sci", "scm", "snc", "scs", "scic",
  "scop", "gie", "geie", "sei", "sep", "selarl", "selas", "scp", "eirl",
  // Formes juridiques étrangères et mots d'activité, même statut : mesuré le
  // 2026-11-21 sur 180 revendications, « Boutinot Limited » se rattachait à
  // « LIMITED (La Jarrie-Audouin) » et « Actualize Consulting » à « H
  // CONSULTING (H CONSULTING) » — un nom réduit à un mot d'activité n'a rien
  // de distinctif.
  "ltd", "limited", "inc", "llc", "corp", "corporation", "plc",
  "consulting", "consultant", "consultants", "advisory",
]);

/** Vrai si le jeton porte une information : ni trop court, ni générique. */
function isDiscriminating(token: string): boolean {
  // Trois caractères minimum : à deux, un org porte des fragments de pays/TLD
  // — « JP & CO » fondait un rattachement à 0,75 sur « wakao.co.jp » et
  // « IN'CO CONSULTING » sur « plasmagen.co.in » (mesuré le 2026-11-21 sur
  // 180 revendications). Un sigle utile fait au moins trois lettres.
  return token.length >= 3 && !GENERIC_TOKENS.has(token);
}

/**
 * Score d'un organisme pour un indice donné. La responsabilité du seuil
 * reste dans `matchOrgInIndex` ; cette fonction renvoie 0..1.
 *
 * Le nom est comparé par jetons entiers : « travel » ne doit pas rapprocher
 * « Avel », ni « davinci » « Vinci ». Le containment de sous-chaîne n'est
 * volontairement pas utilisé.
 */
function scoreEntry(
  hintNorm: string,
  hintTokens: Set<string>,
  hintDomain: string | null,
  e: OrgIndexEntry
): { score: number; via: "domain" | "name" } {
  let best = 0;
  let viaDomain = false;

  // Un alias officiel exact est un indice de nom, pas une clé : il arrive au
  // même score 0,7 que le jeton unique, et c'est `sigle-confirme` qui tranche
  // ensuite (ambiguïté, dénomination divergente).
  if (e.aliasSigle && normaliseSigle(hintNorm) === e.aliasSigle) {
    best = 0.7;
  }

  // Étiquettes du domaine, TLD exclu : « black-star.fr » → { black, star }.
  //
  // Sans ce jeu de jetons, une revendication qui ne donne qu'un domaine ne
  // pouvait jamais rencontrer une organisation dont on connaît le nom mais pas
  // le site — c'est-à-dire 1 244 036 des 1 244 048 organisations du référentiel
  // (`org.domain` n'est renseigné que pour 12 d'entre elles). Le domaine reste
  // un indice de **nom**, pas une clé : il est scoré par les mêmes règles, donc
  // il plafonne à 0,75 et ne peut jamais déclencher une promotion automatique
  // (seuil 0,85).
  const stemTokens =
    hintDomain === null
      ? null
      : new Set(
          hintDomain
            .split(".")
            .slice(0, -1)
            .join(" ")
            .split(" ")
            .filter((t) => t.length >= 2)
        );

  // 1. Domaine : la normalisation et la prudence sur les sous-domaines
  // génériques vivent dans `match/domaine` (mail.exemple.com ≠ exemple.com).
  if (hintDomain) {
    const d = domainAffinity(hintDomain, e.domainNorm);
    if (d > 0) {
      best = Math.max(best, d);
      viaDomain = true;
    }
    if (memesDomaines(hintDomain, e.websiteDomain)) {
      best = Math.max(best, 0.9);
      viaDomain = true;
    }
  }

  // 2. Nom normalisé : égalité, ou tous les jetons du nom présent dans l'indice.
  if (hintNorm && e.nameNorm) {
    if (hintNorm === e.nameNorm) {
      best = Math.max(best, 0.9);
    } else {
      // Les jetons d'une lettre (« T D F ») sont du bruit : non significatifs.
      // Les jetons génériques (« com », « fr ») sont retirés : ils ne
      // discriminent aucune organisation. Dédupliqués : sans le Set,
      // « CO & CO » comptait deux jetons pour un seul mot et se rattachait à
      // chaque domaine en « .co.** » (« wakao.co.jp », « triad.co.ke »…) — 6
      // propositions fausses sur 180 revendications mesurées le 2026-11-21.
      const orgTokens = [...new Set(e.nameNorm.split(" ").filter(isDiscriminating))];
      // Le nom est présent soit dans les jetons de l'indice, soit dans ceux de
      // son domaine (« black-star.fr » → black, star).
      const allPresent =
        (orgTokens.length > 0 && orgTokens.every((t) => hintTokens.has(t))) ||
        (stemTokens !== null && orgTokens.length > 0 && orgTokens.every((t) => stemTokens.has(t)));
      if (allPresent && orgTokens.length >= 2) {
        // Nom complet présent dans l'indice (« Kenall/Legrand » pour « Legrand »
        // est traité plus bas, car un nom simple est un mot courant possible).
        best = Math.max(best, 0.75);
      } else if (
        orgTokens.length === 1 &&
        orgTokens[0].length >= 5 &&
        hintTokens.has(orgTokens[0]) &&
        hintTokens.size <= 2
      ) {
        // Nom court et indice court : « Kenall/Legrand », « Legrand CRM ».
        // Au-delà, un mot courant (« Orange Public School… ») est un faux positif.
        // Le domaine n'entre pas ici : ses étiquettes sont plus courtes que
        // l'indice, et les compter reviendrait à relâcher la garde. Mesuré :
        // `advelo-<tag>.com` se rattachait à « N-COM (N-COM) <tag> », le seul
        // jeton restant étant le tag commun aux deux.
        best = Math.max(best, 0.7);
      }
    }
  }

  // 3. Ville + nom : la ville seule ne désigne pas une organisation.
  if (hintNorm && e.cityNorm && containsPhrase(hintNorm, e.cityNorm)) {
    const cityTokens = new Set(e.cityNorm.split(" ").filter(Boolean));
    const nonCityTokens = e.nameTokens.filter((t) => !cityTokens.has(t));
    if (nonCityTokens.some((t) => hintTokens.has(t))) best = Math.max(best, 0.6);
  }

  return { score: best, via: viaDomain ? "domain" : "name" };
}

/**
 * Rapproche un indice d'une organisation de l'index pré-normalisé.
 * Renvoie la meilleure correspondance au-dessus de MIN_CONFIDENCE,
 * ou null. À égalité de score, l'id le plus faible l'emporte (déterministe).
 */
export function matchOrgInIndex(hint: string, index: OrgIndexEntry[]): OrgMatch | null {
  const trimmed = hint.trim();
  if (!trimmed) return null;
  const hintNorm = normalizeName(trimmed);
  const hintDomain = extractDomain(trimmed);
  if (!hintNorm && !hintDomain) return null;
  const hintTokens = new Set(hintNorm.split(" ").filter(Boolean));

  // Chaîne de résolution des indices-domaines. On s'arrête au premier étage
  // qui réussit : un refus pour ambiguïté à l'étage 2 n'est jamais contourné
  // par le score de nom, qui n'exige pas l'unicité des candidates.
  let resolution: ResolutionDomaine | null = null;
  let borne: number | null = null;
  if (hintDomain) {
    resolution = resoudreDomaine(trimmed, index, { domain: trimmed });
    if (resolution.etape === "exact") {
      return { orgId: resolution.orgId!, confidence: resolution.confidence, via: "domain" };
    }
    if (resolution.etape !== "racine") return null; // étage 3 : revue
    borne = resolution.orgId;
  }

  let best: OrgMatch | null = null;
  for (const e of index) {
    if (borne !== null && e.id !== borne) continue;
    const { score, via } = scoreEntry(hintNorm, hintTokens, hintDomain, e);
    if (score < MIN_CONFIDENCE) continue;
    if (!best || score > best.confidence || (score === best.confidence && e.id < best.orgId)) {
      best = { orgId: e.id, confidence: score, via };
    }
  }
  if (!best && resolution?.orgId !== null && resolution?.orgId !== undefined) {
    best = { orgId: resolution.orgId, confidence: resolution.confidence, via: "name" };
  }
  return best;
}

/**
 * Rapproche un indice d'une organisation. Charge l'index des organisations
 * si aucun n'est fourni (pratique pour un appel isolé ou un test).
 */
export async function matchOrg(hint: string, index?: OrgIndexEntry[]): Promise<OrgMatch | null> {
  const list = index ?? (await loadOrgIndex());
  return matchOrgInIndex(hint, list);
}

const sourceIdCache = new Map<string, string>();

/**
 * Résout le `source_id` d'un fait de quarantaine. Les collecteurs de
 * quarantaine déclarent leurs sources sous la forme `quarantine:<nom>` ;
 * à défaut, on retombe sur la source `ransomlook`, puis sur la première
 * source ransomware (la colonne `event.source_id` est NOT NULL).
 */
async function resolveSourceId(source: string): Promise<string> {
  const cached = sourceIdCache.get(source);
  if (cached) return cached;
  let id: string | null = null;
  for (const candidate of [`quarantine:${source}`, "ransomlook"]) {
    const r = await query<{ id: string }>("SELECT id FROM source WHERE id=$1", [candidate]);
    if (r.rows[0]) { id = r.rows[0].id; break; }
  }
  if (!id) {
    const r = await query<{ id: string }>("SELECT id FROM source WHERE family='ransomware' ORDER BY id LIMIT 1");
    id = r.rows[0]?.id ?? null;
  }
  if (!id) throw new Error(`promotion : aucune source ransomware pour '${source}'`);
  sourceIdCache.set(source, id);
  return id;
}


/**
 * Confirme un rapprochement par le modèle de décision avant de l'écrire.
 *
 * Le rapprochement par nom est trop permissif sur les revendications :
 * « El Portal Imaging Center » avait été rattaché à « IBM Services Center
 * France ». Le modèle lit le texte et le nom ; s'il nie, on n'attache rien.
 * S'il hésite (`null`), on garde la décision déterministe : on ne bloque pas
 * une promotion sur une incertitude du modèle.
 */
async function confirmMatch(
  hint: string,
  orgId: number,
  nameById: Map<number, string>,
  via: "domain" | "name" = "name",
): Promise<boolean> {
  // Un domaine identique n'est pas une ressemblance de nom : c'est la même
  // adresse. Aucun modèle ne doit arbitrer une égalité de clé.
  if (via === "domain") return true;
  const name = nameById.get(orgId);
  if (!name) return true;
  const verdict = await confirmOrganization(hint, name);
  return verdict !== false;
}

export type ClaimEventResult = { eventId: number; inserted: boolean; alerts: number };

type EventRunner = <T extends QueryResultRow>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;

/** Adapte un client de transaction au type `EventRunner`. */
const runnerOf = (client: PoolClient): EventRunner =>
  <T extends QueryResultRow>(text: string, params?: unknown[]) => client.query<T>(text, params);

/**
 * Insère l'événement public associé à un fait promu. Idempotent :
 * `dedup_key = quarantine:<content_hash>`. Un conflit ne recrée rien.
 *
 * Aucune évaluation de règle ici : elle doit tourner APRÈS le COMMIT. Lancée
 * dans la transaction, elle ouvre une autre connexion qui ne voit pas encore
 * la ligne insérée et conclut « aucune alerte ».
 */
async function insertClaimEventRow(
  run: EventRunner,
  row: QuarantineRow,
  orgId: number | null,
  promotedBy: string,
  regleTrace?: string,
): Promise<{ eventId: number; inserted: boolean }> {
  const sourceId = await resolveSourceId(row.source);
  const dedupKey = `quarantine:${row.content_hash}`;
  const title = `${row.org_hint ?? "Revendication"} — revendiqué par ${row.groupe ?? "groupe inconnu"}`.slice(0, 400);
  const description = (row.extracted?.description as string | null | undefined) ?? row.raw_body ?? null;
  const summary = row.tlp === "RED" ? null : description ? String(description).slice(0, 4000) : null;
  // La date de promotion sert de `observed_at` : la date de revendication (2025)
  // est antérieure à la rétention de 90 j et viderait l'événement. Elle reste
  // dans `quarantine_raw.claimed_at` et dans `evidence`.
  const observedAt = new Date().toISOString();

  // Contrat appliqué aussi à la promotion : un fait promu par un analyste
  // reste un événement comme les autres. Ici tout est construit par nous, donc
  // un rejet signale une régression du code, pas une source mal formée : on le
  // rend explicite plutôt que d'écrire une ligne incohérente en base.
  const admitted = admitEvent({
    dedupKey,
    family: "ransomware",
    assertionType: "third_party_claim",
    title,
    summary,
    observedAt,
    severity: 4,
    confidence: "C3",
    sourceId,
    sourceUrl: row.source_url ?? undefined,
    geoType: "claimed_origin",
    orgHint: row.org_hint ?? undefined,
    evidence: {
      quarantine_id: row.id,
      group: row.groupe,
      org_hint: row.org_hint,
      claimed_at: row.claimed_at,
      promoted_by: promotedBy,
    },
  });
  if (!admitted.ok) {
    throw new Error(`promotion refusée par le contrat (${admitted.rejections.join(", ")}) : ${admitted.hint}`);
  }
  const event = admitted.event;
  const langue = languageVerdict(event.title, event.summary);
  if (!langue.keep) {
    throw new Error(`promotion refusée : langue ${langue.language} absente de RADAR_LANGUAGES`);
  }
  const portee = porteeRegionale(`${event.title} ${event.summary ?? ""}`, orgId);
  const sql = `INSERT INTO event (dedup_key, family, assertion_type, title, summary, langue, observed_at, severity, confidence,
       source_id, source_url, evidence, geo_type, org_id, tlp, tlp_source, regional, regional_motif)
     VALUES ($1,$2,$3,$4,$5,$18,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (dedup_key) DO UPDATE SET observed_at = COALESCE(event.observed_at, EXCLUDED.observed_at)
     RETURNING id, (xmax = 0) AS inserted`;
  const values = [
    event.dedupKey,
    event.family,
    event.assertionType,
    event.title,
    event.summary ?? null,
    event.observedAt ?? observedAt,
    event.severity,
    event.confidence ?? "C3",
    event.sourceId,
    event.sourceUrl ?? null,
    JSON.stringify(event.evidence ?? {}),
    event.geoType,
    orgId,
    row.tlp,
    row.source,
    portee.regional,
    portee.motif,
    langue.language,
  ];
  const r = await run<{ id: number; inserted: boolean }>(sql, values);
  await consignerAvec((sql, params) => run(sql, params as unknown[]), {
    kind: orgId !== null ? "event.rattachement" : "match.decided",
    subject: dedupKey,
    summary: orgId !== null
      ? `promotion : rattaché (quarantine ${row.id})`
      : `promotion : non rattaché (quarantine ${row.id})`,
    actor: `humain:${promotedBy}`,
    payload: {
      orgId,
      quarantineId: row.id,
      promotedBy,
      ...(regleTrace ? { regle: regleTrace } : {}),
    },
    validAt: observedAt,
  });
  return { eventId: Number(r.rows[0].id), inserted: Boolean(r.rows[0].inserted) };
}

/**
 * Crée l'événement puis évalue les règles, hors transaction.
 * C'est l'entrée utilisée hors promotion transactionnelle.
 */
export async function insertClaimEvent(
  row: QuarantineRow,
  orgId: number | null,
  promotedBy: string,
): Promise<ClaimEventResult> {
  const r = await insertClaimEventRow(ingestQuery, row, orgId, promotedBy);
  const alerts = r.inserted ? await evaluateEvent(r.eventId, { force: true }) : 0;
  return { eventId: r.eventId, inserted: r.inserted, alerts };
}

/** Nombre maximal de faits promus automatiquement par passage. */
const MAX_AUTO_PER_RUN = 50;

export type PromotionMatch = {
  id: number;
  orgId: number;
  orgName: string;
  confidence: number;
  /** Règle qui a tranché l'acceptation (trace de `ecarteeParRegles`). */
  regle?: string;
};


export type PromotionResult = {
  scanned: number;
  matched: number;
  promoted: number;
  eventsCreated: number;
  alertsCreated: number;
  failures: { id: number; error: string }[];
  dryRun: boolean;
  matches: PromotionMatch[];
  /** Rattachements refusés par les règles de précision, comptés par règle. */
  refusRegles: Record<string, number>;
  /** Détail des refus (borné au passage : au plus MAX_AUTO_PER_RUN). */
  refus: RefusRegle[];
};

/**
 * Promotion automatique : promeut les faits `pending` non promus dont
 * `org_hint` correspond à une organisation. `dryRun` se contente de lister.
 * `opts.ids` restreint le balayage à des faits précis (tests).
 */
export async function promoteMatches(
  dryRun = false,
  opts: { ids?: number[]; log?: (msg: string) => void } = {}
): Promise<PromotionResult> {
  const log = opts.log ?? (() => {});

  const params: unknown[] = [];
  let where = "WHERE status='pending' AND promoted=false AND kind='claim' AND org_hint IS NOT NULL AND org_hint <> ''";
  if (opts.ids?.length) {
    params.push(opts.ids);
    where += ` AND id = ANY($${params.length}::bigint[])`;
  }
  // Plafond par passage : une promotion automatique doit rester un filet, pas
  // une inondation. Le reste attend le passage suivant.
  const r = await query<QuarantineRow>(
    `SELECT id, source, source_url, groupe, org_hint, claimed_at, extracted, raw_body, content_hash, promoted, tlp
     FROM quarantine_raw ${where} ORDER BY id LIMIT ${MAX_AUTO_PER_RUN}`,
    params
  );

  const matches: PromotionMatch[] = [];
  const refusRegles: Record<string, number> = {};
  const refus: RefusRegle[] = [];
  let promoted = 0;
  let eventsCreated = 0;
  let alertsCreated = 0;
  const failures: { id: number; error: string }[] = [];

  for (const row of r.rows) {
    // Candidats bornés par SQL, pas l'index complet : charger 1,24 M
    // d'organisations pour examiner 50 indices coûtait 388 s et 1,2 Go par
    // cycle. Le filtre trigramme rend un sur-ensemble exact des
    // correspondances possibles — le moteur, appliqué dessus, tranche.
    const candidates = await loadCandidateIndex(row.org_hint ?? "");
    let m = matchOrgInIndex(row.org_hint ?? "", candidates);
    const matchInitial = m;
    let orgName = matchInitial ? (candidates.find((e) => e.id === matchInitial.orgId)?.name ?? "") : "";
    let decision: DecisionSigle | undefined;
    if (!m || (m.via === "name" && m.confidence === 0.7)) {
      const resolu = await resoudreSigle(row.org_hint ?? "", m, orgName);
      m = resolu.match;
      orgName = resolu.orgName;
      decision = resolu.decision;
    }
    // Un sigle confirmé au registre est la seule exception au seuil auto :
    // la confirmation tient lieu de clé, le modèle garde son arbitrage.
    if (!m || (m.confidence < AUTO_MIN_CONFIDENCE && !decision?.accepte)) continue;
    // Les règles de précision tranchent avant le modèle et avant l'écriture :
    // un rattachement non fondé n'est ni confirmé, ni promu — le fait reste
    // en file pour la revue humaine, avec la règle qui a refusé au journal.
    const trace: TraceRegle = { regle: "", accepte: false };
    const regle = refusParRegles(row.org_hint ?? "", m, orgName, { sigle: decision, trace });
    if (regle) {
      refusRegles[regle] = (refusRegles[regle] ?? 0) + 1;
      refus.push({
        id: Number(row.id),
        regle,
        indice: row.org_hint ?? "",
        orgId: m.orgId,
        orgName,
        via: m.via,
        confidence: m.confidence,
      });
      if (!dryRun) {
        const trace = await consignerRefusRegle(row, m.orgId, m, orgName, regle);
        if (!trace.ok) log(`promotion : journal du refus indisponible (${trace.error})`);
      }
      continue;
    }
    const orgNameById = new Map([[m.orgId, orgName]]);
    // Le modèle tranche avant écriture : un rapprochement nié n'attache rien.
    let confirmed = true;
    if (!dryRun) confirmed = await confirmMatch(row.org_hint ?? "", m.orgId, orgNameById, m.via);
    if (!confirmed) continue;
    matches.push({
      id: row.id,
      orgId: m.orgId,
      orgName,
      confidence: m.confidence,
      ...(trace.accepte ? { regle: trace.regle } : {}),
    });
    if (dryRun) continue;

    try {
      const upd = await withTransaction(async (client) => {
        const u = await client.query(
          `UPDATE quarantine_raw SET promoted=true, promoted_at=now(), promoted_by='auto', status='promoted'
           WHERE id=$1 AND promoted=false`,
          [row.id]
        );
        if ((u.rowCount ?? 0) === 0) return null;
        return insertClaimEventRow(runnerOf(client), row, m.orgId, "auto", trace.accepte ? trace.regle : undefined);
      });
      if (upd === null) continue;
      promoted++;
      if (upd.inserted) {
        eventsCreated++;
        // Après COMMIT : l'évaluation ouvre une autre connexion et doit voir la ligne.
        alertsCreated += await evaluateEvent(upd.eventId, { force: true });
      }
    } catch (e) {
      failures.push({ id: row.id, error: String(e) });
    }
  }

  log(
    `promotion : ${promoted} promu(s) / ${r.rows.length} candidat(s), ` +
      `${matches.length} correspondance(s), ${eventsCreated} événement(s), ${alertsCreated} alerte(s)` +
      (Object.keys(refusRegles).length > 0
        ? `, refus règles : ${Object.entries(refusRegles).map(([k, n]) => `${k}=${n}`).join(", ")}`
        : "")
  );
  return {
    scanned: r.rows.length,
    matched: matches.length,
    promoted,
    eventsCreated,
    alertsCreated,
    dryRun,
    matches,
    failures,
    refusRegles,
    refus,
  };
}

export type PromoteOneResult = {
  found: boolean;
  id: number;
  alreadyPromoted: boolean;
  orgId: number | null;
  orgName: string | null;
  confidence: number | null;
  eventId: number | null;
  alertsCreated: number;
  /** Vrai si l'événement vient d'être créé (faux si dédupliqué). */
  inserted: boolean;
  /** Règle de précision qui a refusé le rattachement du moteur (drapeau
   * `PRECISION_RULES=on`), ou null. La promotion d'un analyste reste posée :
   * c'est le rattachement produit par le moteur qui est refusé. */
  refuseParRegle: string | null;
  /** Règle qui a tranché (acceptation comprise) — trace de la décision. */
  regleTrace?: string;
};

/** Organisation choisie par un analyste : le moteur ne tranche plus. */
export type OrgOverride = { orgId: number; orgName: string };

/**
 * Promotion manuelle d'un fait (décision d'analyste). Promeut même sans
 * correspondance d'organisation : l'événement reste rattachable plus tard.
 *
 * `override` vient de la file de revue : l'humain a désigné l'organisation.
 * Les règles de précision et le modèle ne reprennent pas la main sur ce choix,
 * mais l'écriture de l'événement et du journal reste exactement la même.
 */
export async function promoteOneTx(
  client: PoolClient,
  id: number,
  promotedBy: string,
  override?: OrgOverride,
): Promise<PromoteOneResult> {
  const base = {
    found: true,
    id,
    alreadyPromoted: false,
    orgId: null,
    orgName: null,
    confidence: null,
    eventId: null,
    alertsCreated: 0,
    inserted: false,
    refuseParRegle: null,
  } as const;

  const r = await query<QuarantineRow>(
    `SELECT id, source, source_url, groupe, org_hint, claimed_at, extracted, raw_body, content_hash, promoted, tlp
     FROM quarantine_raw WHERE id=$1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return { ...base, found: false, id };
  if (row.promoted) return { ...base, alreadyPromoted: true };

  let orgId: number | null = null;
  let attachedOrgId: number | null = null;
  let orgName: string | null = null;
  let confidence: number | null = null;
  let regle: string | null = null;
  let matchedOrgName = "";
  let m: OrgMatch | null = null;
  let trace: TraceRegle = { regle: "", accepte: false };
  if (override) {
    // Décision d'analyste : le moteur et les règles ne reprennent pas la main.
    const org = await client.query<{ name: string }>("SELECT name FROM org WHERE id=$1", [override.orgId]);
    if (!org.rows[0]) throw new Error(`promotion : organisation ${override.orgId} introuvable`);
    orgId = override.orgId;
    attachedOrgId = override.orgId;
    orgName = override.orgName || org.rows[0].name;
    confidence = 1;
  } else {
    const index = await avecAlias(row.org_hint ?? "", await loadOrgIndex());
    m = matchOrgInIndex(row.org_hint ?? "", index);
    const matchInitial = m;
    const resolu = await resoudreSigle(
      row.org_hint ?? "",
      m,
      matchInitial ? (index.find((e) => e.id === matchInitial.orgId)?.name ?? "") : "",
    );
    m = resolu.match;
    orgName = resolu.orgName;
    matchedOrgName = resolu.orgName ?? "";
    // Les règles de précision tranchent avant le modèle : un rapprochement
    // refusé ne demande pas d'arbitrage et n'attache rien.
    trace = { regle: "", accepte: false };
    regle = m ? refusParRegles(row.org_hint ?? "", m, orgName, { sigle: resolu.decision, trace }) : null;
    const confirmed = m && !regle
      ? await confirmMatch(row.org_hint ?? "", m.orgId, new Map(index.map((e) => [e.id, e.name])), m.via)
      : false;
    orgId = m?.orgId ?? null;
    attachedOrgId = confirmed && m && !regle ? m.orgId : null;
  }


  const upd = await client.query(
    `UPDATE quarantine_raw SET promoted=true, promoted_at=now(), promoted_by=$2, status='promoted'
     WHERE id=$1 AND promoted=false`,
    [id, promotedBy]
  );
  if ((upd.rowCount ?? 0) === 0) {
    return { ...base, alreadyPromoted: true };
  }
  const ev = await insertClaimEventRow(
    runnerOf(client),
    row,
    attachedOrgId,
    promotedBy,
    trace.accepte ? trace.regle : undefined,
  );
  if (regle && m) {
    // Le refus est écrit dans la même transaction que la promotion : le fait
    // porte la règle, l'analyste peut lire pourquoi rien n'est attaché.
    await consignerAvec((sql, params) => client.query(sql, params as unknown[]), {
      kind: "match.refuse",
      subject: `quarantine:${row.content_hash}`,
      summary: `rattachement refusé par la règle ${regle} (quarantine ${row.id}, promotion ${promotedBy})`,
      actor: "moteur:regles-precision@1",
      payload: {
        quarantineId: Number(row.id),
        regle,
        indice: row.org_hint ?? "",
        orgId: m.orgId,
        orgName: matchedOrgName,
        via: m.via,
        confidence: m.confidence,
        drapeau: "PRECISION_RULES=on",
      },
    });
  }
  return {
    found: true,
    id,
    alreadyPromoted: false,
    orgId,
    orgName,
    confidence,
    eventId: ev.eventId,
    inserted: ev.inserted,
    alertsCreated: 0,
    refuseParRegle: regle,
    regleTrace: trace.regle || undefined,
  };
}

export async function promoteOne(id: number, promotedBy: string): Promise<PromoteOneResult> {
  const r = await withTransaction((client) => promoteOneTx(client, id, promotedBy));
  // Hors transaction : l'évaluation doit voir l'événement commité.
  const alerts = r.inserted && r.eventId !== null ? await evaluateEvent(r.eventId, { force: true }) : 0;
  return { ...r, alertsCreated: alerts };
}
