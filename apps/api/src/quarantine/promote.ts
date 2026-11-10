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
import { ingestQuery, query } from "../db.js";
import { evaluateEvent } from "../detect/engine.js";

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
export type OrgMatch = { orgId: number; confidence: number };

/** Seuil minimal pour considérer un indice comme une organisation. */
export const MIN_CONFIDENCE = 0.5;

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
 * Charge et pré-normalise toutes les organisations.
 * Appelant unique (route, promoteMatches) : un chargement par requête.
 */
export async function loadOrgIndex(): Promise<OrgIndexEntry[]> {
  const r = await query<OrgRow>("SELECT id, name, slug, kind, city, domain, website FROM org");
  return r.rows.map((o) => {
    const nameNorm = normalizeName(o.name);
    return {
      ...o,
      nameNorm,
      domainNorm: o.domain ? normalizeDomain(o.domain) : null,
      websiteDomain: o.website ? extractDomain(o.website) : null,
      cityNorm: o.city ? normalizeName(o.city) : null,
      nameTokens: nameNorm.split(" ").filter((t) => t.length >= 4),
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
): number {
  let best = 0;

  // 1. Domaine : égalité exacte, puis sous-domaine / parent.
  if (hintDomain) {
    if (e.domainNorm) {
      if (hintDomain === e.domainNorm) best = Math.max(best, 0.95);
      else if (hintDomain.endsWith("." + e.domainNorm) || e.domainNorm.endsWith("." + hintDomain)) {
        best = Math.max(best, 0.85);
      }
    }
    if (e.websiteDomain && hintDomain === e.websiteDomain) best = Math.max(best, 0.9);
  }

  // 2. Nom normalisé : égalité, ou tous les jetons du nom présent dans l'indice.
  if (hintNorm && e.nameNorm) {
    if (hintNorm === e.nameNorm) {
      best = Math.max(best, 0.9);
    } else {
      // Les jetons d'une lettre (« T D F ») sont du bruit : non significatifs.
      const orgTokens = e.nameNorm.split(" ").filter((t) => t.length >= 2);
      const allPresent = orgTokens.length > 0 && orgTokens.every((t) => hintTokens.has(t));
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

  return best;
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
    const score = scoreEntry(hintNorm, hintTokens, hintDomain, e);
    if (score < MIN_CONFIDENCE) continue;
    if (!best || score > best.confidence || (score === best.confidence && e.id < best.orgId)) {
      best = { orgId: e.id, confidence: score };
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

export type ClaimEventResult = { eventId: number; inserted: boolean; alerts: number };

/**
 * Crée l'événement public associé à un fait promu, puis évalue les règles.
 * Idempotent : `dedup_key = quarantine:<content_hash>` (contenu unique par
 * fait, source incluse dans le hash). Un conflit ne recrée ni événement ni
 * alerte.
 */
export async function insertClaimEvent(
  row: QuarantineRow,
  orgId: number | null,
  promotedBy: string
): Promise<ClaimEventResult> {
  const sourceId = await resolveSourceId(row.source);
  const dedupKey = `quarantine:${row.content_hash}`;
  const title = `${row.org_hint ?? "Revendication"} — revendiqué par ${row.groupe ?? "groupe inconnu"}`.slice(0, 400);
  const description = (row.extracted?.description as string | null | undefined) ?? row.raw_body ?? null;
  const summary = description ? String(description).slice(0, 4000) : null;
  // La date de promotion sert de `observed_at` : la date de revendication (2025)
  // est antérieure à la rétention de 90 j et viderait l'événement. Elle reste
  // dans `quarantine_raw.claimed_at` et dans `evidence`.
  const observedAt = new Date().toISOString();

  const r = await ingestQuery<{ id: number; inserted: boolean }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at, severity, confidence,
       source_id, source_url, evidence, geo_type, org_id)
     VALUES ($1,'ransomware','third_party_claim',$2,$3,$4,4,'C3',$5,$6,$7,'claimed_origin',$8)
     ON CONFLICT (dedup_key) DO UPDATE SET observed_at = COALESCE(event.observed_at, EXCLUDED.observed_at)
     RETURNING id, (xmax = 0) AS inserted`,
    [
      dedupKey,
      title,
      summary,
      observedAt,
      sourceId,
      row.source_url,
      JSON.stringify({
        quarantine_id: row.id,
        group: row.groupe,
        org_hint: row.org_hint,
        claimed_at: row.claimed_at,
        promoted_by: promotedBy,
      }),
      orgId,
    ]
  );
  const eventId = Number(r.rows[0].id);
  const inserted = Boolean(r.rows[0].inserted);
  const alerts = inserted ? await evaluateEvent(eventId) : 0;
  return { eventId, inserted, alerts };
}

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
  let where = "WHERE status='pending' AND promoted=false AND org_hint IS NOT NULL AND org_hint <> ''";
  if (opts.ids?.length) {
    params.push(opts.ids);
    where += ` AND id = ANY($${params.length}::bigint[])`;
  }
  const r = await query<QuarantineRow>(
    `SELECT id, source, source_url, groupe, org_hint, claimed_at, extracted, raw_body, content_hash, promoted
     FROM quarantine_raw ${where} ORDER BY id`,
    params
  );

  const matches: PromotionMatch[] = [];
  let promoted = 0;
  let eventsCreated = 0;
  let alertsCreated = 0;

  for (const row of r.rows) {
    const m = matchOrgInIndex(row.org_hint ?? "", index);
    if (!m) continue;
    matches.push({
      id: row.id,
      orgId: m.orgId,
      orgName: orgNameById.get(m.orgId) ?? "",
      confidence: m.confidence,
    });
    if (dryRun) continue;

    const upd = await query(
      `UPDATE quarantine_raw SET promoted=true, promoted_at=now(), promoted_by='auto', status='promoted'
       WHERE id=$1 AND promoted=false`,
      [row.id]
    );
    if ((upd.rowCount ?? 0) === 0) continue;
    promoted++;

    const ev = await insertClaimEvent(row, m.orgId, "auto");
    if (ev.inserted) {
      eventsCreated++;
      alertsCreated += ev.alerts;
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
};

/**
 * Promotion manuelle d'un fait (décision d'analyste). Promeut même sans
 * correspondance d'organisation : l'événement reste rattachable plus tard.
 */
export async function promoteOne(id: number, promotedBy: string): Promise<PromoteOneResult> {
  const base = {
    found: true,
    id,
    alreadyPromoted: false,
    orgId: null,
    orgName: null,
    confidence: null,
    eventId: null,
    alertsCreated: 0,
  } as const;

  const r = await query<QuarantineRow>(
    `SELECT id, source, source_url, groupe, org_hint, claimed_at, extracted, raw_body, content_hash, promoted
     FROM quarantine_raw WHERE id=$1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return { ...base, found: false, id };
  if (row.promoted) return { ...base, alreadyPromoted: true };

  const index = await loadOrgIndex();
  const m = matchOrgInIndex(row.org_hint ?? "", index);

  const upd = await query(
    `UPDATE quarantine_raw SET promoted=true, promoted_at=now(), promoted_by=$2, status='promoted'
     WHERE id=$1 AND promoted=false`,
    [id, promotedBy]
  );
  if ((upd.rowCount ?? 0) === 0) return { ...base, alreadyPromoted: true };

  const ev = await insertClaimEvent(row, m?.orgId ?? null, promotedBy);
  return {
    found: true,
    id,
    alreadyPromoted: false,
    orgId: m?.orgId ?? null,
    orgName: m ? (index.find((e) => e.id === m.orgId)?.name ?? null) : null,
    confidence: m?.confidence ?? null,
    eventId: ev.eventId,
    alertsCreated: ev.alerts,
  };
}
