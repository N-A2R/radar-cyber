import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { confianceDe, fraicheurDe } from "../analyse/confiance.js";
import { evenementPublic, evenementPublicSql } from "../security/tlp.js";

/**
 * La portée régionale est une colonne (`migrate-035`), remplie à l'écriture
 * par `porteeRegionale` — la même fonction pour les cinq voies d'ingestion.
 *
 * Avant, elle valait `org_id IS NOT NULL`, donc faux partout depuis que les
 * rattachements faux avaient été défaits : le fil affichait 19 000 lignes dont
 * **aucune** ne concernait la région, et 87 % étaient des bulletins CVE.
 */
const REGIONAL_SQL = "e.regional";

/** Date de l'événement, quelle que soit la colonne qui la porte. */
function dateObservee(row: Record<string, unknown>): string | null {
	const valeur = row.observed_at ?? row.collected_at;
	if (valeur === null || valeur === undefined) return null;
	const date = valeur instanceof Date ? valeur : new Date(String(valeur));
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function redactEvent(row: Record<string, unknown>) {
  // Défense en profondeur : la requête ne sort que du CLEAR, mais une valeur
  // restreinte ne doit jamais resurrecter un résumé si le SQL évolue.
  const summary = evenementPublic(row) ? row.summary : null;
  return {
    id: Number(row.id),
    dedupKey: row.dedup_key,
    family: row.family,
    assertionType: row.assertion_type,
    title: row.title,
    summary,
    observedAt: row.observed_at,
    collectedAt: row.collected_at,
    severity: row.severity,
    confidence: row.confidence,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    evidence: row.evidence,
    geoType: row.geo_type,
    lat: row.lat,
    lon: row.lon,
    orgId: row.org_id,
    regional: row.regional === true,
    regionalMotif: row.regional_motif ?? null,
    dateSource: row.date_source,
    dateConfidence: row.date_confidence,
    tlp: row.tlp,
    tlpSource: row.tlp_source,
    langue: row.langue ?? null,
    pertinenceScore: row.pertinence_score ?? null,
    pertinenceRule: row.pertinence_rule ?? null,
    // Les deux axes que le fil ne disait pas : quand, et à quel point on le
    // sait. Calculés ici, une fois, pour que l'écran n'ait rien à déduire.
    fraicheur: fraicheurDe({
      observedAt: dateObservee(row),
      dateSource: typeof row.date_source === "string" ? row.date_source : null,
    }),
    confiance: confianceDe({
      sourceConfidence: typeof row.confidence === "string" ? row.confidence : null,
      assertionType: typeof row.assertion_type === "string" ? row.assertion_type : null,
      orgId: typeof row.org_id === "number" ? row.org_id : null,
      sourcesDistinctes: Number(row.sources_distinctes ?? 0),
    }),
  };
}

export default async function (app: FastifyInstance) {
  app.get("/events", async (req, reply) => {
    // Route publique : la décision d'accès appartient à la matrice RBAC, pas
    // à un second resolveUser dans le handler (E6/M11).
    const q = req.query as Record<string, string | undefined>;
    let limit = Number(q.limit ?? 100);
    if (!Number.isFinite(limit)) limit = 100;
    limit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const params: unknown[] = [];
    // Périmètre TLP:CLEAR central : aucun fait AMBER/GREEN/RED ne sort ici.
    const where: string[] = [evenementPublicSql("e")];
    // Colonnes qualifiées : la requête porte désormais une sous-requête
    // corrélée sur `event`, et un `id` nu serait ambigu.
    if (q.family) { params.push(q.family); where.push(`e.family=$${params.length}`); }
    if (q.orgId) { params.push(Number(q.orgId)); where.push(`e.org_id=$${params.length}`); }
    if (q.from) { params.push(q.from); where.push(`e.observed_at >= $${params.length}`); }
    if (q.sinceId) { params.push(Number(q.sinceId)); where.push(`e.id > $${params.length}`); }
    if (q.before) { params.push(Number(q.before)); where.push(`e.id < $${params.length}`); }
    // Portée : `region` par défaut — le fil parle de la Nouvelle-Aquitaine ou
    // ne dit rien. `vulnerabilites` isole la veille CVE, `toutes` montre tout.
    const portee = q.portee === "toutes" ? "toutes" : q.portee === "vulnerabilites" ? "vulnerabilites" : "region";
    if (portee === "region") where.push("e.regional = true");
    if (portee === "vulnerabilites") where.push("e.family = 'vuln'");
    // `order=regional` (défaut) remonte d'abord ce qui touche la région ;
    // `order=recent` rétablit l'ordre purement chronologique. Toute valeur
    // inconnue retombe sur le défaut.
    const order = q.order === "recent" ? "recent" : "regional";
    const sort = q.sort === "collected" ? "collected" : "observed";
    const orderCol =
      sort === "collected" ? "e.collected_at" : "COALESCE(e.observed_at, e.collected_at)";
    const orderBy =
      order === "regional"
        ? `e.regional DESC, e.severity DESC NULLS LAST, COALESCE(e.observed_at, e.collected_at) DESC, e.id DESC`
        : `${orderCol} DESC, e.id DESC`;
    params.push(limit);
    const limitIdx = params.length;
    // Corroboration calculée en une sous-requête, pas par ligne : combien de
    // sources distinctes parlent de la même organisation sur 30 jours. Sans
    // elle, le fil ne peut pas distinguer une revendication isolée d'un
    // incident dont trois rédactions font état.
    const sql = `SELECT e.id, e.dedup_key, e.family, e.assertion_type, e.title, e.summary, e.observed_at, e.collected_at, e.severity, e.confidence, e.source_id, e.source_url, e.evidence, e.geo_type, e.lat, e.lon, e.org_id, e.date_source, e.date_confidence, e.tlp, e.tlp_source, e.regional, e.regional_motif, e.langue, e.pertinence_score, e.pertinence_rule,
             COALESCE((SELECT COUNT(DISTINCT e2.source_id) FROM event e2
                        WHERE e2.org_id = e.org_id
                          AND e.org_id IS NOT NULL
                          AND ${evenementPublicSql("e2")}
                          AND COALESCE(e2.observed_at, e2.collected_at) >= now() - interval '30 days'), 0)::int AS sources_distinctes
        FROM event e ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${orderBy} LIMIT $${limitIdx}`;
    const r = await query<any>(sql, params);
    return r.rows.map((row) => redactEvent(row));
  });
}