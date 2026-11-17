/**
 * Promotion des revendications de quarantaine vers l'observatoire.
 *
 * Une revendication ne devient un événement public qu'après promotion :
 * - automatique quand `org_hint` correspond à une organisation connue
 *   (matchOrg, score >= MIN_CONFIDENCE) ;
 * - manuelle via POST /api/quarantine/:id/promote.
 *
 * La promotion crée un événement `ransomware` / `third_party_claim`,
 * dédupliqué sur `content_hash`, puis déclenche la règle
 * `ransomware-revendication` pour générer l'alerte.
 */
import { admitEvent } from "../contract/admit.js";
import { ingestQuery, query, withTransaction } from "../db.js";
import { consignerAvec } from "../journal/index.js";
import { porteeRegionale } from "../match/territorial.js";
import type { PoolClient, QueryResultRow } from "pg";
import { evaluateEvent } from "../detect/engine.js";
import { confirmOrganization } from "../match/decide.js";

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

/** Normalise un domaine : minuscules, sans `www.`, sans chemin, sans point final. */
export function normalizeDomain(d: string): string {
  return stripAccents(d.trim()).replace(/^www\./, "").replace(/\/.*$/, "").replace(/\.$/, "");
}

/** Candidat domaine dans un indice (URL ou nom de domaine nu). */
const DOMAIN_RE = /(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}/i;

/** Extrait le domaine d'un indice, ou null s'il n'en porte pas. */
function extractDomain(hint: string): string | null {
  const m = hint.match(DOMAIN_RE);
  return m ? normalizeDomain(m[0]) : null;
}

/**
 * Charge et pré-normalise les organisations.
 *
 * `filter` borne la requête (mesure, revue d'une poignée d'indices). Sans lui,
 * l'index complet — 1,2 million de lignes — est chargé : mesuré à 388 s par
 * passage de promotion automatique sur le ThinkBook, pour 6,5 min de cycle.
 */
export async function loadOrgIndex(filter?: { where: string; params?: unknown[] }): Promise<OrgIndexEntry[]> {
  const sql = `SELECT id, name, slug, kind, city, domain, website FROM org${filter ? ` WHERE ${filter.where}` : ""}`;
  const r = await query<OrgRow>(sql, filter?.params ?? []);
  return r.rows.map((o) => {
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
    };
  });
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
const GENERIC_TOKENS = new Set([
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
]);

/** Vrai si le jeton porte une information : ni trop court, ni générique. */
function isDiscriminating(token: string): boolean {
  return token.length >= 2 && !GENERIC_TOKENS.has(token);
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

  // 1. Domaine : égalité exacte, puis sous-domaine / parent.
  if (hintDomain) {
    if (e.domainNorm) {
      if (hintDomain === e.domainNorm) {
        best = Math.max(best, 0.95);
        viaDomain = true;
      } else if (hintDomain.endsWith("." + e.domainNorm) || e.domainNorm.endsWith("." + hintDomain)) {
        best = Math.max(best, 0.85);
        viaDomain = true;
      }
    }
    if (e.websiteDomain && hintDomain === e.websiteDomain) {
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
      // discriminent aucune organisation.
      const orgTokens = e.nameNorm.split(" ").filter(isDiscriminating);
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

  let best: OrgMatch | null = null;
  for (const e of index) {
    const { score, via } = scoreEntry(hintNorm, hintTokens, hintDomain, e);
    if (score < MIN_CONFIDENCE) continue;
    if (!best || score > best.confidence || (score === best.confidence && e.id < best.orgId)) {
      best = { orgId: e.id, confidence: score, via };
    }
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
  const portee = porteeRegionale(`${event.title} ${event.summary ?? ""}`, orgId);
  const sql = `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at, severity, confidence,
       source_id, source_url, evidence, geo_type, org_id, tlp, tlp_source, regional, regional_motif)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
  ];
  const r = await run<{ id: number; inserted: boolean }>(sql, values);
  await consignerAvec((sql, params) => run(sql, params as unknown[]), {
    kind: orgId !== null ? "event.rattachement" : "match.decided",
    subject: dedupKey,
    summary: orgId !== null
      ? `promotion : rattaché (quarantine ${row.id})`
      : `promotion : non rattaché (quarantine ${row.id})`,
    actor: `humain:${promotedBy}`,
    payload: { orgId, quarantineId: row.id, promotedBy },
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
  const index = await loadOrgIndex();
  const orgNameById = new Map(index.map((e) => [e.id, e.name]));

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
  let promoted = 0;
  let eventsCreated = 0;
  let alertsCreated = 0;
  const failures: { id: number; error: string }[] = [];

  for (const row of r.rows) {
    const m = matchOrgInIndex(row.org_hint ?? "", index);
    if (!m || m.confidence < AUTO_MIN_CONFIDENCE) continue;
    // Le modèle tranche avant écriture : un rapprochement nié n'attache rien.
    let confirmed = true;
    if (!dryRun) confirmed = await confirmMatch(row.org_hint ?? "", m.orgId, orgNameById, m.via);
    if (!confirmed) continue;
    matches.push({
      id: row.id,
      orgId: m.orgId,
      orgName: orgNameById.get(m.orgId) ?? "",
      confidence: m.confidence,
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
        return insertClaimEventRow(runnerOf(client), row, m.orgId, "auto");
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
      `${matches.length} correspondance(s), ${eventsCreated} événement(s), ${alertsCreated} alerte(s)`
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
};

/**
 * Promotion manuelle d'un fait (décision d'analyste). Promeut même sans
 * correspondance d'organisation : l'événement reste rattachable plus tard.
 */
export async function promoteOneTx(client: PoolClient, id: number, promotedBy: string): Promise<PromoteOneResult> {
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
  } as const;

  const r = await query<QuarantineRow>(
    `SELECT id, source, source_url, groupe, org_hint, claimed_at, extracted, raw_body, content_hash, promoted, tlp
     FROM quarantine_raw WHERE id=$1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return { ...base, found: false, id };
  if (row.promoted) return { ...base, alreadyPromoted: true };

  const index = await loadOrgIndex();
  const m = matchOrgInIndex(row.org_hint ?? "", index);
  const confirmed = m
    ? await confirmMatch(row.org_hint ?? "", m.orgId, new Map(index.map((e) => [e.id, e.name])), m.via)
    : false;

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
    confirmed && m ? m.orgId : null,
    promotedBy,
  );
  return {
    found: true,
    id,
    alreadyPromoted: false,
    orgId: m?.orgId ?? null,
    orgName: m ? (index.find((e) => e.id === m.orgId)?.name ?? null) : null,
    confidence: m?.confidence ?? null,
    eventId: ev.eventId,
    inserted: ev.inserted,
    alertsCreated: 0,
  };
}

export async function promoteOne(id: number, promotedBy: string): Promise<PromoteOneResult> {
  const r = await withTransaction((client) => promoteOneTx(client, id, promotedBy));
  // Hors transaction : l'évaluation doit voir l'événement commité.
  const alerts = r.inserted && r.eventId !== null ? await evaluateEvent(r.eventId, { force: true }) : 0;
  return { ...r, alertsCreated: alerts };
}
