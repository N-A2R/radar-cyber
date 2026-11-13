import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { enrichIndicator } from "../enrich/index.js";
import { enrichDomain } from "../enrich/whois.js";
import { resolveDomain } from "../enrich/dns.js";
import { certificatesFor } from "../enrich/certs.js";
import { scoreIndicator } from "../enrich/score.js";
import { depuisEvidence, estIndisponible, libelleMotif } from "../journal/rattachement.js";
import { confianceDe, fraicheurDe } from "../analyse/confiance.js";

async function cacheGet(key: string): Promise<unknown | null> {
  const r = await query<{ value: unknown }>("SELECT value FROM enrich_cache WHERE key=$1 AND expires_at > now()", [key]);
  return r.rows[0]?.value ?? null;
}
async function cacheSet(key: string, value: unknown, ttlHours = 24) {
  await query("INSERT INTO enrich_cache (key, value, expires_at) VALUES ($1,$2, now() + ($3 || ' hours')::interval) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, expires_at=EXCLUDED.expires_at", [key, JSON.stringify(value), String(ttlHours)]);
}

export default async function (app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/enrich/indicator/:id", async (req) => {
    const id = Number(req.params.id);
    const ir = await query("SELECT * FROM indicator WHERE id=$1", [id]);
    const ind = ir.rows[0];
    if (!ind) return { error: "not found" };
    const key = `ind:${id}`;
    let enrichment = await cacheGet(key);
    if (!enrichment) {
      enrichment = await enrichIndicator({ type: ind.type, value: ind.value });
      await cacheSet(key, enrichment);
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
    const er = await query("SELECT * FROM event WHERE id=$1", [id]);
    const ev = er.rows[0];
    if (!ev) return { error: "not found" };
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
    const inds = await query("SELECT * FROM indicator WHERE id=ANY($1::bigint[])", [ev.evidence?.indicator_ids ?? []]).catch(() => ({ rows: [] }));
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
}
