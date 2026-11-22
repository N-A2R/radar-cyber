import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { performance } from "node:perf_hooks";

/** Couleur d'un indicateur de fraîcheur : < 24 h, 1–7 j, > 7 j. */
export type TonFraicheur = "green" | "orange" | "red";

/** Une ligne du tableau paginé de `GET /api/health/sources`. */
export type LigneSourceSante = {
  id: string;
  name: string;
  family: string;
  url: string;
  enabled: boolean;
  /** Même définition que `sourceStatus` côté web : erreur > succès > jamais. */
  status: "ok" | "error" | "pending";
  lastOkAt: string | null;
  lastErrorAt: string | null;
  /** Message tronqué à 300 caractères : la page reste légère. */
  lastError: string | null;
  lastItems: number | null;
};

/** Filtres et pagination acceptés par `GET /api/health/sources`. */
export type FiltresSourcesSante = {
  family: string | null;
  status: "ok" | "error" | "pending" | null;
  q: string | null;
  page: number;
  pageSize: number;
  sort: "status" | "name" | "family" | "lastOkAt" | "lastError" | "lastItems";
  dir: "asc" | "desc";
};

/**
 * Résumé calculé en SQL + une seule page de sources. Le navigateur ne reçoit
 * jamais la flotte entière : `matching` compte les lignes filtrées, `items`
 * n'en porte que `pageSize`.
 */
export type HealthSources = {
  ok: true;
  generatedAt: string;
  /** Sources déclarées, tous filtres confondus. */
  total: number;
  counts: { ok: number; error: number; pending: number };
  families: { family: string; sources: number }[];
  /** Lignes correspondant aux filtres de la requête. */
  matching: number;
  page: number;
  pageSize: number;
  pages: number;
  items: LigneSourceSante[];
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
    // Les huit lectures sont indépendantes : elles partent ensemble, la durée
    // de la réponse est celle de la plus lente, pas leur somme.
    const [base, total, enabled, actives, events24h, orgs7j, files, parFamille] =
      await Promise.all([
        // Volumes et taille de la base courante. `pg_database_size` est un
        // bigint : pg le restitue en texte, on le convertit une seule fois ici.
        // Rejouable :
        // SELECT pg_database_size(current_database())::text AS taille,
        //        (SELECT count(*)::int FROM org) AS orgs,
        //        (SELECT count(*)::int FROM org_alias) AS aliases,
        //        (SELECT count(*)::int FROM event) AS events;
        query<{ taille: string; orgs: number; aliases: number; events: number }>(`
          SELECT pg_database_size(current_database())::text AS taille,
                 (SELECT count(*)::int FROM org) AS orgs,
                 (SELECT count(*)::int FROM org_alias) AS aliases,
                 (SELECT count(*)::int FROM event) AS events
        `),

        // Rejouable : SELECT count(*)::int AS n FROM source;
        query<{ n: number }>("SELECT count(*)::int AS n FROM source"),

        // Rejouable : SELECT count(*)::int AS n FROM source WHERE enabled;
        query<{ n: number }>("SELECT count(*)::int AS n FROM source WHERE enabled"),

        // Une source active a produit au moins un fait sur la fenêtre. On
        // compte les sources, pas les événements : 6 000 CVE d'un seul flux ne
        // font pas 6 000 sources en vie.
        // Rejouable :
        // SELECT count(DISTINCT e.source_id)::int AS n FROM event e
        //   JOIN source s ON s.id = e.source_id
        //  WHERE s.enabled AND COALESCE(e.observed_at, e.collected_at) >= now() - interval '7 days';
        query<{ n: number }>(
          `SELECT count(DISTINCT e.source_id)::int AS n
             FROM event e
             JOIN source s ON s.id = e.source_id
            WHERE s.enabled
              AND COALESCE(e.observed_at, e.collected_at) >= now() - interval '7 days'`,
        ),

        // Date de l'événement, pas date de collecte : c'est la date du fait
        // que l'observatoire affiche partout ailleurs (voir routes/events.ts).
        // Rejouable :
        // SELECT count(*)::int AS n FROM event
        //  WHERE COALESCE(observed_at, collected_at) >= now() - interval '24 hours';
        query<{ n: number }>(
          `SELECT count(*)::int AS n FROM event
            WHERE COALESCE(observed_at, collected_at) >= now() - interval '24 hours'`,
        ),

        // Une organisation est « reliée » quand au moins un fait porte son id :
        // count(DISTINCT org_id) ignore les faits non rattachés au référentiel.
        // Rejouable :
        // SELECT count(DISTINCT org_id)::int AS n FROM event
        //  WHERE org_id IS NOT NULL
        //    AND COALESCE(observed_at, collected_at) >= now() - interval '7 days';
        query<{ n: number }>(
          `SELECT count(DISTINCT org_id)::int AS n FROM event
            WHERE org_id IS NOT NULL
              AND COALESCE(observed_at, collected_at) >= now() - interval '7 days'`,
        ),

        // Les trois seaux de la file de revue sont mutuellement exclusifs
        // (statut de quarantine_raw). Volontairement trois colonnes, pas un
        // group-by : les clés absentes doivent valoir 0, pas disparaître.
        // Rejouable :
        // SELECT count(*) FILTER (WHERE status='pending')::int AS pending,
        //        count(*) FILTER (WHERE status='reviewed')::int AS reviewed,
        //        count(*) FILTER (WHERE status='promoted')::int AS promoted
        //   FROM quarantine_raw;
        query<{ pending: number; reviewed: number; promoted: number }>(
          `SELECT count(*) FILTER (WHERE status='pending')::int AS pending,
                  count(*) FILTER (WHERE status='reviewed')::int AS reviewed,
                  count(*) FILTER (WHERE status='promoted')::int AS promoted
             FROM quarantine_raw`,
        ),

        // Âge du fait le plus récent par famille, en heures et en jours entiers.
        // `ageDays` est dérivé de `ageHours` côté serveur pour que les deux
        // colonnes ne puissent pas diverger d'un écran à l'autre.
        // Rejouable :
        // SELECT family, max(COALESCE(observed_at, collected_at)) AS last_event_at,
        //        GREATEST(0, floor(extract(epoch FROM
        //          (now() - max(COALESCE(observed_at, collected_at)))) / 3600))::int AS age_hours
        //   FROM event
        //  GROUP BY family
        //  ORDER BY age_hours NULLS LAST, family;
        query<{ family: string; last_event_at: string | null; age_hours: number | null }>(`
          SELECT family,
                 max(COALESCE(observed_at, collected_at)) AS last_event_at,
                 GREATEST(0, floor(extract(epoch FROM
                   (now() - max(COALESCE(observed_at, collected_at)))) / 3600))::int AS age_hours
            FROM event
           GROUP BY family
           ORDER BY age_hours NULLS LAST, family
        `),
      ]);

    const declared = Number(total.rows[0]?.n ?? 0);
    const habilitees = Number(enabled.rows[0]?.n ?? 0);
    const actives7j = Math.min(Number(actives.rows[0]?.n ?? 0), habilitees);
    const file = files.rows[0];
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

  /**
   * Tableau paginé des sources pour l'écran Santé.
   *
   * Le résumé (compteurs par état, familles) est calculé en SQL sans filtre :
   * les menus doivent afficher la flotte entière même quand une famille est
   * sélectionnée. La page courante, elle, est bornée par `LIMIT`/`OFFSET` et
   * son total filtré vient de `count(*) OVER()`, donc une seule requête borne
   * la page et compte les correspondances.
   */
  app.get("/health/sources", async (req) => {
    const f = lireFiltresSources((req.query ?? {}) as Record<string, unknown>);

    // Une seule requête d'agrégat : totaux par état + effectif par famille.
    const resume = await query<{
      total: number;
      ok: number;
      error: number;
      pending: number;
      families: { family: string; sources: number }[];
    }>(`
      WITH base AS (
        SELECT s.family,
               CASE WHEN s.last_error_at IS NOT NULL THEN 'error'
                    WHEN s.last_ok_at IS NOT NULL THEN 'ok'
                    ELSE 'pending' END AS status
          FROM source s
      ), fam AS (
        SELECT family, count(*)::int AS sources FROM base GROUP BY family
      )
      SELECT (SELECT count(*)::int FROM base) AS total,
             (SELECT count(*) FILTER (WHERE status='ok')::int FROM base) AS ok,
             (SELECT count(*) FILTER (WHERE status='error')::int FROM base) AS error,
             (SELECT count(*) FILTER (WHERE status='pending')::int FROM base) AS pending,
             (SELECT coalesce(json_agg(json_build_object('family', family, 'sources', sources)
                                       ORDER BY family), '[]'::json)
                FROM fam) AS families
    `);

    const page = await query<{
      id: string;
      name: string;
      family: string;
      url: string;
      enabled: boolean;
      status: "ok" | "error" | "pending";
      last_ok_at: string | null;
      last_error_at: string | null;
      last_error: string | null;
      last_items: string | null;
      matching: number;
    }>(`
      WITH base AS (
        SELECT s.id, s.name, s.family, s.url, s.enabled,
               s.last_ok_at, s.last_error_at,
               left(s.last_error, 300) AS last_error,
               s.last_items,
               CASE WHEN s.last_error_at IS NOT NULL THEN 'error'
                    WHEN s.last_ok_at IS NOT NULL THEN 'ok'
                    ELSE 'pending' END AS status
          FROM source s
      )
      SELECT *, count(*) OVER()::int AS matching
        FROM base
       WHERE ($1::text IS NULL OR family = $1)
         AND ($2::text IS NULL OR status = $2)
         AND ($3::text IS NULL OR name ILIKE '%' || $3 || '%' OR url ILIKE '%' || $3 || '%')
       ORDER BY ${ordreSql(f)}
       LIMIT $4 OFFSET $5
    `, [f.family, f.status, f.q, f.pageSize, (f.page - 1) * f.pageSize]);

    const r = resume.rows[0];
    const matching = Number(page.rows[0]?.matching ?? 0);
    const items: LigneSourceSante[] = page.rows.map((s) => ({
      id: s.id,
      name: s.name,
      family: s.family,
      url: s.url,
      enabled: s.enabled === true,
      status: s.status,
      lastOkAt: s.last_ok_at,
      lastErrorAt: s.last_error_at,
      lastError: s.last_error,
      lastItems: s.last_items === null ? null : Number(s.last_items),
    }));

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      total: Number(r?.total ?? 0),
      counts: {
        ok: Number(r?.ok ?? 0),
        error: Number(r?.error ?? 0),
        pending: Number(r?.pending ?? 0),
      },
      families: Array.isArray(r?.families) ? r.families : [],
      matching,
      page: f.page,
      pageSize: f.pageSize,
      pages: Math.max(1, Math.ceil(matching / f.pageSize)),
      items,
    } satisfies HealthSources;
  });
}

const PAGE_SIZE_DEFAUT = 50;
const PAGE_SIZE_MAX = 200;

const STATUTS_SANTE: Record<string, true> = { ok: true, error: true, pending: true };
const TRIS_SANTE: Record<string, true> = {
  status: true, name: true, family: true, lastOkAt: true, lastError: true, lastItems: true,
};

function texteOuNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function entier(v: unknown, defaut: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return defaut;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * Lit les filtres de `GET /health/sources`. Tout ce qui n'est pas reconnu est
 * ignoré plutôt que rejeté : un lien partagé avec un tri obsolète doit encore
 * afficher la page, pas une erreur 400.
 */
export function lireFiltresSources(raw: Record<string, unknown>): FiltresSourcesSante {
  const status = texteOuNull(raw.status);
  const sort = texteOuNull(raw.sort);
  const dir = texteOuNull(raw.dir);
  return {
    family: texteOuNull(raw.family),
    status: status !== null && STATUTS_SANTE[status] === true
      ? (status as FiltresSourcesSante["status"])
      : null,
    q: texteOuNull(raw.q),
    page: entier(raw.page, 1, 1, 100_000),
    pageSize: entier(raw.pageSize, PAGE_SIZE_DEFAUT, 1, PAGE_SIZE_MAX),
    sort: sort !== null && TRIS_SANTE[sort] === true
      ? (sort as FiltresSourcesSante["sort"])
      : "status",
    dir: dir === "desc" ? "desc" : "asc",
  };
}

/**
 * Clause `ORDER BY` construite uniquement à partir de la liste blanche
 * ci-dessus : aucune valeur venue de la requête n'entre dans le SQL.
 * `status` suit l'ordre de gravité de l'écran : erreur, jamais collecté, ok.
 */
function ordreSql(f: FiltresSourcesSante): string {
  const colonne = {
    status: "CASE status WHEN 'error' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END",
    name: "name",
    family: "family",
    lastOkAt: "last_ok_at",
    lastError: "last_error",
    lastItems: "last_items",
  }[f.sort];
  const sens = f.dir === "desc" ? "DESC" : "ASC";
  return `${colonne} ${sens} NULLS LAST, name ASC`;
}
