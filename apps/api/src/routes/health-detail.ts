import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { performance } from "node:perf_hooks";

/** Couleur d'un indicateur de fraîcheur : < 24 h, 1–7 j, > 7 j. */
export type TonFraicheur = "green" | "orange" | "red";

/**
 * État lisible d'une source : `ok` (fait sur 7 j), `rouge` (plus de 7 j sans
 * fait, ou jamais de fait), `morte` (statut déclaré dans `source.statut`).
 * Une source morte garde sa couleur rouge : le statut explicite prévaut.
 */
export type StatutSource = "ok" | "rouge" | "morte";

export type DetailSource = {
  id: string;
  name: string;
  family: string;
  enabled: boolean;
  /** Dernière fin de collecte enregistrée (collector_run), à défaut last_ok_at. */
  lastCollectedAt: string | null;
  /** Fait le plus récent attribué à la source, toutes familles confondues. */
  lastEventAt: string | null;
  /** Date du dernier fait produit : horodatage du fait, pas de la collecte. */
  lastProducedAt: string | null;
  /** Âge en heures du fait le plus récent ; null = la source n'a jamais produit. */
  ageHours: number | null;
  tone: TonFraicheur;
  status: StatutSource;
};

export type DetailFamille = {
  family: string;
  lastEventAt: string | null;
  ageHours: number | null;
  ageDays: number | null;
  tone: TonFraicheur;
};

/** Mesures prises dans la base elle-même, pas déduites des compteurs métier. */
export type DetailBase = {
  /** Aller-retour d'un `SELECT 1`, en millisecondes. */
  latencyMs: number;
  /** Taille de la base courante, en octets (`pg_database_size`). */
  sizeBytes: number;
  orgs: number;
  aliases: number;
  events: number;
};

/** État du système en une seule requête HTTP (GET /api/health/detail). */
export type HealthDetail = {
  ok: boolean;
  generatedAt: string;
  windowDays: 7;
  db: DetailBase;
  sources: {
    declared: number;
    enabled: number;
    /** Sources actives : habilitées ET ayant produit au moins un fait sur 7 j. */
    actives7j: number;
    /** Sources muettes : habilitées ET sans fait sur 7 j. */
    muettes7j: number;
    bySource: DetailSource[];
  };
  events24h: number;
  orgs7j: number;
  queues: { pending: number; reviewed: number; promoted: number };
  families: DetailFamille[];
};

/**
 * Même échelle que la consigne produit : vert sous 24 h, orange de 1 à 7 j,
 * rouge au-delà. Une source qui n'a jamais produit est rouge, mais son
 * `ageHours` reste `null` : « jamais » n'est pas un âge mesuré.
 */
export function tonDeFraicheur(ageHours: number | null): TonFraicheur {
  if (ageHours === null) return "red";
  if (ageHours < 24) return "green";
  if (ageHours <= 7 * 24) return "orange";
  return "red";
}

/**
 * `source.statut = 'morte'` est une décision explicite (migration 042) : elle
 * prévaut sur la fraîcheur. Sinon, rouge suit exactement la définition de
 * `/health/causes` : plus de 7 j sans fait, ou aucun fait. Orange (1 à 7 j)
 * entre dans `ok` — il n'existe que trois états publiés.
 */
export function statutSource(statutDeclared: string, ageHours: number | null): StatutSource {
  if (statutDeclared === "morte") return "morte";
  return tonDeFraicheur(ageHours) === "red" ? "rouge" : "ok";
}

export default async function (app: FastifyInstance) {
  app.get("/health/detail", async () => {
    // Latence réelle : chronomètre autour d'un aller-retour SELECT 1 sur le
    // pool HTTP, pas une estimation ni la durée des autres requêtes.
    const avantPing = performance.now();
    await query("SELECT 1");
    const latencyMs = Math.round((performance.now() - avantPing) * 100) / 100;

    // Volumes et taille de la base courante. `pg_database_size` est un bigint :
    // pg le restitue en texte, on le convertit une seule fois ici.
    // Rejouable :
    // SELECT pg_database_size(current_database())::text AS taille,
    //        (SELECT count(*)::int FROM org) AS orgs,
    //        (SELECT count(*)::int FROM org_alias) AS aliases,
    //        (SELECT count(*)::int FROM event) AS events;
    const base = await query<{
      taille: string;
      orgs: number;
      aliases: number;
      events: number;
    }>(`
      SELECT pg_database_size(current_database())::text AS taille,
             (SELECT count(*)::int FROM org) AS orgs,
             (SELECT count(*)::int FROM org_alias) AS aliases,
             (SELECT count(*)::int FROM event) AS events
    `);

    // Rejouable : SELECT count(*)::int AS n FROM source;
    const total = await query<{ n: number }>("SELECT count(*)::int AS n FROM source");

    // Rejouable : SELECT count(*)::int AS n FROM source WHERE enabled;
    const enabled = await query<{ n: number }>(
      "SELECT count(*)::int AS n FROM source WHERE enabled",
    );

    // Une source active a produit au moins un fait sur la fenêtre. On compte
    // les sources, pas les événements : 6 000 CVE d'un seul flux ne font pas
    // 6 000 sources en vie.
    // Rejouable :
    // SELECT count(DISTINCT e.source_id)::int AS n FROM event e
    //   JOIN source s ON s.id = e.source_id
    //  WHERE s.enabled AND COALESCE(e.observed_at, e.collected_at) >= now() - interval '7 days';
    const actives = await query<{ n: number }>(
      `SELECT count(DISTINCT e.source_id)::int AS n
         FROM event e
         JOIN source s ON s.id = e.source_id
        WHERE s.enabled
          AND COALESCE(e.observed_at, e.collected_at) >= now() - interval '7 days'`,
    );

    // Date de l'événement, pas date de collecte : c'est la date du fait que
    // l'observatoire affiche partout ailleurs (voir routes/events.ts).
    // Rejouable :
    // SELECT count(*)::int AS n FROM event
    //  WHERE COALESCE(observed_at, collected_at) >= now() - interval '24 hours';
    const events24h = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM event
        WHERE COALESCE(observed_at, collected_at) >= now() - interval '24 hours'`,
    );

    // Une organisation est « reliée » quand au moins un fait porte son id :
    // count(DISTINCT org_id) ignore les faits non rattachés au référentiel.
    // Rejouable :
    // SELECT count(DISTINCT org_id)::int AS n FROM event
    //  WHERE org_id IS NOT NULL
    //    AND COALESCE(observed_at, collected_at) >= now() - interval '7 days';
    const orgs7j = await query<{ n: number }>(
      `SELECT count(DISTINCT org_id)::int AS n FROM event
        WHERE org_id IS NOT NULL
          AND COALESCE(observed_at, collected_at) >= now() - interval '7 days'`,
    );

    // Les trois seaux de la file de revue sont mutuellement exclusifs
    // (statut de quarantine_raw). Volontairement trois colonnes, pas un
    // group-by : les clés absentes doivent valoir 0, pas disparaître.
    // Rejouable :
    // SELECT count(*) FILTER (WHERE status='pending')::int AS pending,
    //        count(*) FILTER (WHERE status='reviewed')::int AS reviewed,
    //        count(*) FILTER (WHERE status='promoted')::int AS promoted
    //   FROM quarantine_raw;
    const files = await query<{ pending: number; reviewed: number; promoted: number }>(
      `SELECT count(*) FILTER (WHERE status='pending')::int AS pending,
              count(*) FILTER (WHERE status='reviewed')::int AS reviewed,
              count(*) FILTER (WHERE status='promoted')::int AS promoted
         FROM quarantine_raw`,
    );

    // Dernière collecte = fin du dernier run (et non `last_ok_at`, qui ne
    // compte pas les runs récents en erreur). Le fait le plus récent vient
    // d'une agrégation séparée : un flux peut collecter sans rien produire.
    // `GREATEST(0, NULL)` vaut 0 en PostgreSQL : sans le CASE, une source qui
    // n'a jamais produit serait affichée « verte » avec un âge de 0 h.
    // Rejouable :
    // SELECT s.id, s.name, s.family, s.enabled, s.statut,
    //        COALESCE(max(r.finished_at), s.last_ok_at) AS last_collected_at,
    //        max(COALESCE(e.observed_at, e.collected_at)) AS last_event_at,
    //        CASE WHEN max(COALESCE(e.observed_at, e.collected_at)) IS NULL THEN NULL
    //             ELSE GREATEST(0, floor(extract(epoch FROM
    //               (now() - max(COALESCE(e.observed_at, e.collected_at)))) / 3600))::int
    //        END AS age_hours
    //   FROM source s
    //   LEFT JOIN collector_run r ON r.source_id = s.id
    //   LEFT JOIN event e ON e.source_id = s.id
    //  GROUP BY s.id, s.name, s.family, s.enabled, s.statut, s.last_ok_at
    //  ORDER BY age_hours NULLS LAST, s.name;
    const parSource = await query<{
      id: string;
      name: string;
      family: string;
      enabled: boolean;
      statut: string;
      last_collected_at: string | null;
      last_event_at: string | null;
      age_hours: number | null;
    }>(`
      SELECT s.id, s.name, s.family, s.enabled, s.statut,
             COALESCE(max(r.finished_at), s.last_ok_at) AS last_collected_at,
             max(COALESCE(e.observed_at, e.collected_at)) AS last_event_at,
             CASE WHEN max(COALESCE(e.observed_at, e.collected_at)) IS NULL THEN NULL
                  ELSE GREATEST(0, floor(extract(epoch FROM
                    (now() - max(COALESCE(e.observed_at, e.collected_at)))) / 3600))::int
             END AS age_hours
        FROM source s
        LEFT JOIN collector_run r ON r.source_id = s.id
        LEFT JOIN event e ON e.source_id = s.id
       GROUP BY s.id, s.name, s.family, s.enabled, s.statut, s.last_ok_at
       ORDER BY age_hours NULLS LAST, s.name
    `);

    // Âge du fait le plus récent par famille, en heures et en jours entiers.
    // `ageDays` est dérivé de `ageHours` côté serveur pour que les deux
    // colonnes ne puissent pas diverger d'une écran à l'autre.
    // Rejouable :
    // SELECT family, max(COALESCE(observed_at, collected_at)) AS last_event_at,
    //        GREATEST(0, floor(extract(epoch FROM
    //          (now() - max(COALESCE(observed_at, collected_at)))) / 3600))::int AS age_hours
    //   FROM event
    //  GROUP BY family
    //  ORDER BY age_hours NULLS LAST, family;
    const parFamille = await query<{
      family: string;
      last_event_at: string | null;
      age_hours: number | null;
    }>(`
      SELECT family,
             max(COALESCE(observed_at, collected_at)) AS last_event_at,
             GREATEST(0, floor(extract(epoch FROM
               (now() - max(COALESCE(observed_at, collected_at)))) / 3600))::int AS age_hours
        FROM event
       GROUP BY family
       ORDER BY age_hours NULLS LAST, family
    `);

    const declared = Number(total.rows[0]?.n ?? 0);
    const habilitees = Number(enabled.rows[0]?.n ?? 0);
    const actives7j = Math.min(Number(actives.rows[0]?.n ?? 0), habilitees);
    const file = files.rows[0];
    const bySource: DetailSource[] = parSource.rows.map((s) => {
      const ageHours = s.age_hours === null ? null : Number(s.age_hours);
      const tone = tonDeFraicheur(ageHours);
      return {
        id: s.id,
        name: s.name,
        family: s.family,
        enabled: s.enabled === true,
        lastCollectedAt: s.last_collected_at,
        lastEventAt: s.last_event_at,
        lastProducedAt: s.last_event_at,
        ageHours,
        tone,
        status: statutSource(s.statut, ageHours),
      };
    });
    const families: DetailFamille[] = parFamille.rows.map((f) => {
      const ageHours = f.age_hours === null ? null : Number(f.age_hours);
      return {
        family: f.family,
        lastEventAt: f.last_event_at,
        ageHours,
        ageDays: ageHours === null ? null : Math.floor(ageHours / 24),
        tone: tonDeFraicheur(ageHours),
      };
    });

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      windowDays: 7,
      db: {
        latencyMs,
        sizeBytes: Number(base.rows[0]?.taille ?? 0),
        orgs: Number(base.rows[0]?.orgs ?? 0),
        aliases: Number(base.rows[0]?.aliases ?? 0),
        events: Number(base.rows[0]?.events ?? 0),
      },
      sources: {
        declared,
        enabled: habilitees,
        actives7j,
        muettes7j: Math.max(0, habilitees - actives7j),
        bySource,
      },
      events24h: Number(events24h.rows[0]?.n ?? 0),
      orgs7j: Number(orgs7j.rows[0]?.n ?? 0),
      queues: {
        pending: Number(file?.pending ?? 0),
        reviewed: Number(file?.reviewed ?? 0),
        promoted: Number(file?.promoted ?? 0),
      },
      families,
    } satisfies HealthDetail;
  });
}
