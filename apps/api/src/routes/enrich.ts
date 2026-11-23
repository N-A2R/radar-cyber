import { notFound } from "../errors.js";
import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { enrichIndicator } from "../enrich/index.js";
import { enrichDomain } from "../enrich/whois.js";
import { resolveDomain } from "../enrich/dns.js";
import { certificatesFor } from "../enrich/certs.js";
import { scoreIndicator } from "../enrich/score.js";
import {
  findEnrichJob,
  listEnrichJobs,
  recordEnrichmentFailure,
  replayEnrichJob,
  type EnrichJob,
} from "../enrich/jobs.js";
import { depuisEvidence, estIndisponible, libelleMotif } from "../journal/rattachement.js";
import { confianceDe, fraicheurDe } from "../analyse/confiance.js";
import { evenementPublicSql, indicateurPublicSql } from "../security/tlp.js";

async function cacheGet(key: string): Promise<unknown | null> {
  const r = await query<{ value: unknown }>("SELECT value FROM enrich_cache WHERE key=$1 AND expires_at > now()", [key]);
  return r.rows[0]?.value ?? null;
}
async function cacheSet(key: string, value: unknown, ttlHours = 24) {
  await query("INSERT INTO enrich_cache (key, value, expires_at) VALUES ($1,$2, now() + ($3 || ' hours')::interval) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, expires_at=EXCLUDED.expires_at", [key, JSON.stringify(value), String(ttlHours)]);
}

function errorsOf(value: unknown): string[] {
  if (value && typeof value === "object" && "errors" in value) {
    const errors = value.errors;
    return Array.isArray(errors) ? errors.filter((e): e is string => typeof e === "string") : [];
  }
  return [];
}

function asPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? { ...value } : {};
}

function jobSummary(job: EnrichJob | null) {
  return job
    ? {
        id: job.id,
        state: job.state,
        attempts: job.attempts,
        next_try_at: job.next_try_at,
        last_error: job.last_error,
      }
    : null;
}

export default async function (app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/enrich/indicator/:id", async (req) => {
    const id = Number(req.params.id);
    const ir = await query("SELECT * FROM indicator i WHERE i.id=$1 AND " + indicateurPublicSql("i"), [id]);
    const ind = ir.rows[0];
    if (!ind) throw notFound();
    const key = `ind:${id}`;
    const target = { type: ind.type, value: ind.value };
    let enrichment = await cacheGet(key);
    if (!enrichment) {
      const fresh = await enrichIndicator(target);
      const errors = errorsOf(fresh);
      if (errors.length > 0) {
        // Un échec n'est jamais mis en cache : il devient un job visible,
        // avec tentative, prochaine échéance et rejeu possible.
        const job = await recordEnrichmentFailure(target, errors.join("; "));
        enrichment = { ...fresh, job: jobSummary(job) };
      } else {
        enrichment = fresh;
        await cacheSet(key, enrichment);
      }
    } else if (errorsOf(enrichment).length > 0) {
      // Ancien cache d'échec : on affiche l'état du job sans compter une
      // nouvelle tentative à chaque lecture.
      enrichment = { ...asPayload(enrichment), job: jobSummary(await findEnrichJob(target)) };
    }
    return { indicator: ind, enrichment, score: scoreIndicator({ type: ind.type, first_seen: ind.first_seen, sources: [ind.source_id], sourceConfidence: ind.confidence }) };
  });
  app.get<{ Params: { value: string } }>("/enrich/domain/:value", async (req) => {
    const { value } = req.params;
    // Une source externe en échec ne doit pas faire échouer la réponse.
    const errors: string[] = [];
    const safe = async <T>(p: Promise<T>, label: string): Promise<T | null> => {
      try { return await p; } catch (e: unknown) { errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`); return null; }
    };
    const [whois, dns, certs] = await Promise.all([
      safe(enrichDomain(value), "whois"),
      safe(resolveDomain(value), "dns"),
      safe(certificatesFor(value), "certs"),
    ]);
    return { whois, dns, certs, errors };
  });
  app.get<{ Params: { id: string } }>("/enrich/events/:id", async (req) => {
    const id = Number(req.params.id);
    const er = await query("SELECT * FROM event e WHERE e.id=$1 AND " + evenementPublicSql("e"), [id]);
    const ev = er.rows[0];
    if (!ev) throw notFound();
    // Le pourquoi du rattachement, tel qu'il a été décidé à l'ingestion. Il vit
    // dans `evidence` : aucune colonne, aucun recalcul, donc aucun risque qu'il
    // change après coup — c'est une trace, pas une déduction.
    const explication = depuisEvidence(ev.evidence);
    const rattachement = explication
      ? {
          motif: explication.motif,
          libelle: libelleMotif(explication.motif),
          alias: explication.alias,
          confiance: explication.confiance,
          moteur: explication.moteur,
          candidats: explication.candidats ?? [],
          indecis: estIndisponible(explication),
        }
      : null;
    const inds = await query(
      "SELECT * FROM indicator i WHERE i.id=ANY($1::bigint[]) AND " + indicateurPublicSql("i"),
      [ev.evidence?.indicator_ids ?? []],
    ).catch(() => ({ rows: [] }));
    const org = ev.org_id ? (await query("SELECT * FROM org WHERE id=$1", [ev.org_id])).rows[0] : null;
    // Fraîcheur et confiance : mêmes calculs que GET /events, pour que
    // l'inspecteur dise « depuis quand » et « à quel point on y croit »
    // sans que le front ne déduise.
    const sourcesDistinctes = ev.org_id
      ? (await query<{ n: number }>(`SELECT COUNT(DISTINCT source_id)::int AS n FROM event WHERE org_id=$1 AND COALESCE(observed_at, collected_at) >= now() - interval '30 days'`, [ev.org_id]).catch(() => ({ rows: [{ n: 0 }] })) ).rows[0]?.n ?? 0
      : 0;
    const dateObs = (ev.observed_at ?? ev.collected_at) as string | null;
    const fraicheur = fraicheurDe({ observedAt: dateObs ? new Date(dateObs).toISOString() : null, dateSource: (ev.date_source as string | null) ?? null });
    const confiance = confianceDe({ sourceConfidence: (ev.confidence as string | null) ?? null, assertionType: (ev.assertion_type as string | null) ?? null, orgId: ev.org_id as number | null, sourcesDistinctes });
    const enrichedEvent = { ...ev, fraicheur, confiance };
    let enrichment = null;
    if (inds.rows[0]) {
      const key = `ind:${inds.rows[0].id}`;
      enrichment = await cacheGet(key);
      if (!enrichment) { enrichment = await enrichIndicator({ type: inds.rows[0].type, value: inds.rows[0].value }); await cacheSet(key, enrichment); }
    }
    return { event: enrichedEvent, indicators: inds.rows, org, enrichment, rattachement };
  });

  /** File d'attente des enrichissements en échec, visible sans journalisation opaque. */
  app.get<{ Querystring: { state?: string } }>("/enrich/jobs", async (req) => {
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const jobs = await listEnrichJobs({ state, limit: 100 });
    return { count: jobs.length, jobs };
  });

  /** Rejoue un job non terminal après correction de la cible ou du fournisseur. */
  app.post<{ Params: { id: string } }>("/enrich/jobs/:id/replay", async (req) => {
    const attempt = await replayEnrichJob(Number(req.params.id));
    if (!attempt) throw notFound();
    return { job: attempt.job };
  });
}
