import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { resolveUser } from "../middleware/auth.js";
import { desaccords, regrouper, resume } from "../analyse/corroboration.js";
import { construireHistorique } from "../analyse/historique.js";

type OrgListRow = {
  id: number;
  name: string;
  slug: string;
  kind: string;
  sector: string | null;
  city: string | null;
  dept: string | null;
  website: string | null;
  domain: string | null;
  lat: number | null;
  lon: number | null;
  event_count: number;
};

type OrgRow = Omit<OrgListRow, "event_count"> & { created_at: string };

type CountRow = { n: number };
type KindRow = { kind: string; n: number };
type FamilyRow = { family: string; n: number };

type AssetRecentRow = {
  id: number;
  kind: string;
  value: string;
  first_seen: string;
  source: string | null;
};

type EventRecentRow = {
  id: string;
  title: string;
  family: string;
  severity: number;
  observed_at: string | null;
};

type ClaimRecentRow = {
  id: string;
  source: string;
  groupe: string | null;
  tlp: string;
  claimed_at: string | null;
};

type ExposureRow = { month: string; n: number };

function mapOrg(row: OrgListRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    sector: row.sector,
    city: row.city,
    dept: row.dept,
    website: row.website,
    domain: row.domain,
    lat: row.lat,
    lon: row.lon,
    eventCount: row.event_count,
  };
}

export default async function (app: FastifyInstance) {
  app.get("/orgs", async () => {
    const r = await query<OrgListRow>(`
      SELECT o.id, o.name, o.slug, o.kind, o.sector, o.city, o.dept, o.website, o.domain, o.lat, o.lon, COUNT(e.id)::int AS event_count
      FROM org o LEFT JOIN event e ON e.org_id=o.id
      GROUP BY o.id ORDER BY o.name
    `);
    return r.rows.map(mapOrg);
  });

  /**
   * Fiche complète d'une organisation : état, actifs, événements,
   * revendications en quarantaine et courbe d'exposition sur 12 mois.
   * Chaque bloc est renseigné par une requête bornée dédiée (pas de
   * chargement de table en mémoire).
   */
  app.get("/orgs/:id", async (req, reply) => {
    const user = await resolveUser(req);
    if (!user) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    const rawId = (req.params as { id: string }).id;
    if (!/^\d+$/.test(rawId)) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    const orgId = Number(rawId);

    const orgRes = await query<OrgRow>(
      `SELECT id, name, slug, kind, sector, city, dept, website, domain, lat, lon, created_at
       FROM org WHERE id=$1`,
      [orgId]
    );
    const org = orgRes.rows[0];
    if (!org) {
      reply.code(404).send({ error: "not found" });
      return;
    }

    // Les revendications ne portent qu'un libellé libre : on le confronte au
    // nom, au slug et au domaine (avec et sans préfixe www.).
    const hints = [org.name, org.slug, org.domain, org.domain ? `www.${org.domain}` : null]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .map((v) => v.toLowerCase());

    const [
      assetsTotal,
      assetsByKind,
      assetsRecent,
      eventsTotal,
      eventsByFamily,
      eventsRecent,
      claimsTotal,
      claimsRecent,
      exposure,
    ] = await Promise.all([
      query<CountRow>("SELECT COUNT(*)::int AS n FROM asset WHERE org_id=$1", [orgId]),
      query<KindRow>(
        "SELECT kind, COUNT(*)::int AS n FROM asset WHERE org_id=$1 GROUP BY kind ORDER BY n DESC, kind",
        [orgId]
      ),
      query<AssetRecentRow>(
        `SELECT a.id, a.kind, a.value, a.created_at AS first_seen,
                (SELECT e.source_id FROM event e
                  WHERE e.asset_id=a.id
                  ORDER BY e.observed_at DESC NULLS LAST, e.id DESC
                  LIMIT 1) AS source
         FROM asset a
         WHERE a.org_id=$1
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT 10`,
        [orgId]
      ),
      query<CountRow>("SELECT COUNT(*)::int AS n FROM event WHERE org_id=$1", [orgId]),
      query<FamilyRow>(
        "SELECT family, COUNT(*)::int AS n FROM event WHERE org_id=$1 GROUP BY family ORDER BY n DESC, family",
        [orgId]
      ),
      query<EventRecentRow>(
        `SELECT id, title, family, severity, observed_at
         FROM event WHERE org_id=$1
         ORDER BY observed_at DESC NULLS LAST, id DESC
         LIMIT 10`,
        [orgId]
      ),
      query<CountRow>(
        "SELECT COUNT(*)::int AS n FROM quarantine_raw WHERE lower(org_hint) = ANY($1::text[])",
        [hints]
      ),
      query<ClaimRecentRow>(
        `SELECT id, source, groupe, tlp, claimed_at
         FROM quarantine_raw WHERE lower(org_hint) = ANY($1::text[])
         ORDER BY claimed_at DESC NULLS LAST, id DESC
         LIMIT 10`,
        [hints]
      ),
      query<ExposureRow>(
        `SELECT to_char(m, 'YYYY-MM') AS month, COUNT(e.id)::int AS n
         FROM generate_series(
                date_trunc('month', now()) - interval '11 months',
                date_trunc('month', now()),
                interval '1 month'
              ) AS m
         LEFT JOIN event e
           ON e.org_id=$1 AND e.observed_at >= m AND e.observed_at < m + interval '1 month'
         GROUP BY m
         ORDER BY m`,
        [orgId]
      ),
    ]);

    // Ce que l'organisation a vécu, regroupé par fait plutôt que par ligne.
    // Deux sources qui décrivent le même incident ne sont pas deux incidents ;
    // deux sources qui se contredisent ne sont pas du bruit.
    const faits = await query<{
      id: string;
      family: string;
      severity: number;
      assertion_type: string;
      source_id: string;
      date: string;
      org_id: number | null;
      title: string;
    }>(
      // 500 lignes suffisent pour le regroupement et bornent la latence : sur
      // une organisation à 5 000 événements, charger tout le stock pour n'en
      // montrer que 20 serait payer 250 fois le prix de l'information.
      `SELECT e.id::text AS id, e.family, e.severity, e.assertion_type, e.source_id,
              COALESCE(e.observed_at, e.collected_at)::text AS date, e.org_id, e.title
         FROM event e
        WHERE e.org_id = $1
          AND COALESCE(e.observed_at, e.collected_at) >= now() - interval '180 days'
        ORDER BY COALESCE(e.observed_at, e.collected_at) DESC
        LIMIT 500`,
      [orgId],
    );
    const groupes = regrouper(
      faits.rows.map((row) => ({
        id: row.id,
        family: row.family,
        severity: Number(row.severity),
        assertionType: row.assertion_type,
        sourceId: row.source_id,
        date: row.date,
        orgId: row.org_id,
        title: row.title,
      })),
    );
    const conflits = desaccords(groupes);

    return {
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        kind: org.kind,
        sector: org.sector,
        city: org.city,
        dept: org.dept,
        website: org.website,
        domain: org.domain,
        lat: org.lat,
        lon: org.lon,
        created_at: org.created_at,
      },
      assets: {
        total: assetsTotal.rows[0]?.n ?? 0,
        byKind: assetsByKind.rows.map((r) => ({ kind: r.kind, n: r.n })),
        recent: assetsRecent.rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          value: r.value,
          firstSeen: r.first_seen,
          source: r.source,
        })),
      },
      events: {
        total: eventsTotal.rows[0]?.n ?? 0,
        byFamily: eventsByFamily.rows.map((r) => ({ family: r.family, n: r.n })),
        recent: eventsRecent.rows.map((r) => ({
          id: r.id,
          title: r.title,
          family: r.family,
          severity: r.severity,
          observedAt: r.observed_at,
        })),
      },
      claims: {
        total: claimsTotal.rows[0]?.n ?? 0,
        recent: claimsRecent.rows.map((r) => ({
          id: r.id,
          source: r.source,
          groupe: r.groupe,
          tlp: r.tlp,
          claimedAt: r.claimed_at,
        })),
      },
      exposure: exposure.rows.map((r) => ({ month: r.month, count: r.n })),
      // 180 jours : assez pour voir une campagne, assez court pour que le
      // regroupement reste lisible. Les groupes sont une lecture, pas une
      // fusion : rien n'est réécrit en base.
      corroboration: {
        resume: resume(groupes, conflits),
        groupes: groupes.slice(0, 20),
        desaccords: conflits.slice(0, 20),
      },
      // Même base de faits, autre question : est-ce que c'est nouveau, ou est-ce
      // qu'on la voit tout le temps ? 12 mois de recul, tendance sur 90 jours
      // contre les 90 précédents.
      historique: construireHistorique(groupes),
    };
  });
}
