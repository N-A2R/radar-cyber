import { badRequest, notFound } from "../errors.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { consignerAvec } from "../journal/index.js";
import { requireRole } from "../middleware/auth.js";
import { regrouper } from "../analyse/corroboration.js";
import { parseBody, invalidBody } from "./body-validation.js";
import { evaluerValeur } from "../analyse/valeur-source.js";

/** Une source ne meurt que sur décision explicite, avec un motif. */
export const MorteBody = z.object({
  raison: z.string().trim().min(1).max(1000),
}).strict();

/** La réactivation n'attend aucun corps. */
const EmptyBody = z.strictObject({});

type SourceRow = {
  id: string;
  name: string;
  family: string;
  url: string;
  kind: string;
  format: string;
  enabled: boolean;
  interval_sec: number;
  last_ok_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  /** bigint : le pilote pg le rend en chaîne, converti à la sortie. */
  items_total: string | null;
  /** bigint : le pilote pg le rend en chaîne, converti à la sortie. */
  last_items: string | null;
  disabled_at: string | null;
  disabled_reason: string | null;
  /** Statut déclaré : active | morte (migration 042). */
  statut: string;
  /** Motif du passage à morte (migration 042). */
  derniere_erreur: string | null;
  /** Entrées lues sur 30 jours, tous runs confondus. */
  entrees: number | null;
  /** Entrées rejetées sur 30 jours (compteur du collecteur, pas une estimation). */
  rejets: number | null;
  /** Événements attribués à la source, sur 30 jours. */
  evenements_30j: number;
  /** Événements attribués à la source, tout l'historique. */
  evenements_total: number;
  /** Dernier fait produit par la source, toutes familles confondues. */
  last_event_at: string | null;
  dernier_run: string | null;
  dernier_run_statut: string | null;
  /** Motifs de rejet agrégés du dernier run mesuré. */
  motifs: Record<string, number> | null;
};

export default async function (app: FastifyInstance) {
  app.get("/sources", async () => {
    // Le rendement vient du collecteur (`collector_run`), pas d'une
    // déduction sur `last_ok_at` : une source peut répondre 200 pendant des
    // mois sans produire un seul événement. C'est ce trou qui a fait passer
    // 303 sources pour saines alors qu'elles ne rendaient rien.
    const r = await query<SourceRow>(`
      WITH runs AS (
        SELECT source_id,
               sum(items_in)::int    AS entrees,
               sum(items_skipped)::int AS rejets,
               max(started_at)       AS dernier_run,
               (array_agg(status ORDER BY started_at DESC))[1] AS dernier_run_statut,
               (array_agg(items_rejected ORDER BY started_at DESC))[1] AS motifs
          FROM collector_run
         WHERE started_at >= now() - interval '30 days'
         GROUP BY source_id
      ),
      ev AS (
        SELECT source_id,
               count(*) FILTER (WHERE COALESCE(observed_at, collected_at) >= now() - interval '30 days')::int AS evenements_30j,
               count(*)::int AS evenements_total,
               max(COALESCE(observed_at, collected_at))::text AS last_event_at
          FROM event
         GROUP BY source_id
      )
      SELECT s.id, s.name, s.family, s.url, s.kind, s.format, s.enabled, s.interval_sec,
             s.last_ok_at, s.last_error_at, s.last_error, s.items_total, s.last_items,
             s.disabled_at, s.disabled_reason, s.statut, s.derniere_erreur,
             r.entrees, r.rejets, r.dernier_run, r.dernier_run_statut, r.motifs,
             COALESCE(e.evenements_30j, 0) AS evenements_30j,
             COALESCE(e.evenements_total, 0) AS evenements_total,
             e.last_event_at
        FROM source s
        LEFT JOIN runs r ON r.source_id = s.id
        LEFT JOIN ev   e ON e.source_id = s.id
       ORDER BY s.kind, s.family, s.name
    `);
    // Unicité : ce que la source apporte que personne d'autre n'apporte. On
    // regroupe les événements de 180 jours qui touchent une organisation, puis
    // on regarde, fait par fait, qui était seul à en parler. C'est la seule
    // mesure qui distingue un agrégateur d'une source originale — le volume et
    // le rendement ne le font pas.
    const valeur = new Map<string, ReturnType<typeof evaluerValeur>[number]>();
    try {
      const evts = await query<{
        id: string; family: string; severity: number | null; assertion_type: string;
        source_id: string; date: string; org_id: number | null; title: string;
      }>(`
        SELECT e.id::text AS id, e.family, e.severity, e.assertion_type,
               e.source_id, COALESCE(e.observed_at, e.collected_at)::text AS date,
               e.org_id, e.title
          FROM event e
         WHERE e.org_id IS NOT NULL
           AND COALESCE(e.observed_at, e.collected_at) >= now() - interval '180 days'
         ORDER BY COALESCE(e.observed_at, e.collected_at) DESC
         LIMIT 5000
      `);
      for (const v of evaluerValeur(
        regrouper(
          evts.rows.map((e) => ({
            id: e.id,
            family: e.family,
            // Une sévérité inconnue ne vaut pas zéro : elle vaut « non renseignée ».
            severity: e.severity ?? null,
            assertionType: e.assertion_type,
            sourceId: e.source_id,
            date: e.date,
            orgId: e.org_id,
            title: e.title,
          })),
        ),
      )) {
        valeur.set(v.sourceId, v);
      }
    } catch {
      // Une base sans événements ne doit pas faire tomber l'écran Sources : la
      // valeur reste inconnue, ce qui est exact, plutôt que l'écran vide.
    }

    return r.rows.map((s) => {
      const evenements30j = Number(s.evenements_30j);
      const entrees = s.entrees === null ? null : Number(s.entrees);
      // Rendement : part des entrées lues qui deviennent un événement utile.
      // `null` quand rien n'a été lu — ce n'est pas 0 %, c'est inconnu.
      const rendement = entrees !== null && entrees > 0 ? evenements30j / entrees : null;
      return {
        id: s.id,
        name: s.name,
        family: s.family,
        url: s.url,
        kind: s.kind,
        format: s.format,
        enabled: s.enabled,
        intervalSec: s.interval_sec,
        lastOkAt: s.last_ok_at,
        lastEventAt: s.last_event_at,
        lastErrorAt: s.last_error_at,
        lastError: s.last_error,
        itemsTotal: s.items_total === null ? null : Number(s.items_total),
        lastItems: s.last_items === null ? null : Number(s.last_items),
        disabledAt: s.disabled_at,
        disabledReason: s.disabled_reason,
        statut: s.statut,
        derniereErreur: s.derniere_erreur,
        ok: s.last_error_at === null && s.last_ok_at !== null,
        entrees,
        rejets: s.rejets === null ? null : Number(s.rejets),
        evenements30j,
        evenementsTotal: Number(s.evenements_total),
        dernierRun: s.dernier_run,
        dernierRunStatut: s.dernier_run_statut,
        motifs: s.motifs && typeof s.motifs === "object" ? s.motifs : null,
        // Le motif dominant est celui qui coûte le plus d'entrées : c'est lui
        // qui explique le silence, pas la liste complète.
        motifDominant:
          s.motifs && typeof s.motifs === "object"
            ? (Object.entries(s.motifs).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? null)
            : null,
        rendement: rendement === null ? null : Math.round(rendement * 1000) / 1000,
        ...(valeur.get(s.id) ?? {}),
      };
    });
  });

  // `indicator` compte des millions de lignes : le count exact reste abordable
  // (quelques centaines de ms) et on sert un court cache pour absorber les
  // chargements concurrents de l'UI.
  let statsCache: { at: number; body: unknown } | null = null
  const STATS_TTL_MS = 20_000

  app.get("/stats", async () => {
    if (statsCache && Date.now() - statsCache.at < STATS_TTL_MS) return statsCache.body

    const orgs = await query<{ n: number }>("SELECT count(*)::int AS n FROM org")
    const events = await query<{ n: number }>("SELECT count(*)::int AS n FROM event")
    const indicators = await query<{ n: number }>("SELECT count(*)::int AS n FROM indicator")
    const sources = await query<{ total: number; active: number; ok: number; err: number }>(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE enabled)::int AS active,
             count(*) FILTER (WHERE enabled AND last_error_at IS NULL AND last_ok_at IS NOT NULL)::int AS ok,
             count(*) FILTER (WHERE enabled AND last_error_at IS NOT NULL)::int AS err
      FROM source
    `)
    const byFamily = await query<{ family: string; n: number }>(
      "SELECT family, count(*)::int AS n FROM event GROUP BY family ORDER BY n DESC"
    )
    const byAssertion = await query<{ assertion_type: string; n: number }>(
      "SELECT assertion_type, count(*)::int AS n FROM event GROUP BY assertion_type ORDER BY n DESC"
    )
    const body = {
      orgs: orgs.rows[0]?.n ?? 0,
      events: events.rows[0]?.n ?? 0,
      indicators: indicators.rows[0]?.n ?? 0,
      sources: sources.rows[0] ?? { total: 0, active: 0, ok: 0, err: 0 },
      byFamily: byFamily.rows,
      byAssertion: byAssertion.rows,
    }
    statsCache = { at: Date.now(), body }
    return body
  })

  /**
   * Passage au statut « morte » : décision réservée aux admins. Le motif est
   * obligatoire, écrit dans la source ET dans le journal dans la même
   * transaction — un marquage sans trace, ou une trace sans marquage, ne
   * doivent pas pouvoir arriver. Aucune ligne n'est supprimée : l'historique
   * de la source reste intact, on la désactive seulement pour arrêter la
   * collecte (même convention que scripts/disable-muettes-vague3.mts).
   */
  app.post<{ Params: { id: string } }>(
    "/sources/:id/morte",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const parsed = parseBody(MorteBody, req.body);
      if (!parsed.success) return invalidBody(reply, parsed.error);

      const raison = parsed.data.raison;
      const id = req.params.id;
      const acteur = `humain:${req.user?.email ?? "admin"}`;

      const updated = await withTransaction(async (client) => {
        const r = await client.query<{
          id: string;
          statut: string;
          derniere_erreur: string | null;
          enabled: boolean;
        }>(
          `UPDATE source
              SET statut = 'morte',
                  derniere_erreur = $1,
                  enabled = false,
                  disabled_at = COALESCE(disabled_at, now()),
                  disabled_reason = $1
            WHERE id = $2
            RETURNING id, statut, derniere_erreur, enabled`,
          [raison, id],
        );
        const row = r.rows[0];
        if (!row) return null;

        const trace = await consignerAvec(
          (sql, params) => client.query(sql, params as unknown[]),
          {
            kind: "source.changed",
            subject: id,
            summary: `source ${id} marquée morte — ${raison}`,
            actor: acteur,
            payload: { transition: "morte", raison, statut: "morte" },
          },
        );
        // Le journal est la condition de succès : s'il refuse, la transaction
        // entière est annulée, la source n'est pas marquée à moitié.
        if (!trace.ok) throw new Error(`journal indisponible : ${trace.error}`);
        return row;
      });

      if (!updated) throw notFound("source introuvable");
      return {
        id: updated.id,
        statut: updated.statut,
        derniereErreur: updated.derniere_erreur,
        enabled: updated.enabled,
        journalise: true,
      };
    },
  );

  /**
   * Réactivation d'une source morte : décision réservée aux admins. Le statut,
   * le compteur d'échecs et les champs de désactivation sont remis à zéro ;
   * l'historique (source, événements, journal) reste intact, la trace de la
   * réactivation est ajoutée au journal dans la même transaction.
   */
  app.post<{ Params: { id: string } }>(
    "/sources/:id/reactiver",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const parsed = parseBody(EmptyBody, req.body);
      if (!parsed.success) return invalidBody(reply, parsed.error);
      const id = req.params.id;
      const acteur = `humain:${req.user?.email ?? "admin"}`;

      const updated = await withTransaction(async (client) => {
        const r = await client.query<{
          id: string; statut: string; enabled: boolean; echecs_consecutifs: number;
        }>(
          `UPDATE source
              SET statut = 'active',
                  enabled = true,
                  echecs_consecutifs = 0,
                  derniere_erreur = NULL,
                  disabled_at = NULL,
                  disabled_reason = NULL
            WHERE id = $1 AND statut = 'morte'
            RETURNING id, statut, enabled, echecs_consecutifs`,
          [id],
        );
        const row = r.rows[0];
        if (!row) return null;

        const trace = await consignerAvec(
          (sql, params) => client.query(sql, params as unknown[]),
          {
            kind: "source.changed",
            subject: id,
            summary: `source ${id} réactivée`,
            actor: acteur,
            payload: { transition: "reactivation", statut: "active" },
          },
        );
        if (!trace.ok) throw new Error(`journal indisponible : ${trace.error}`);
        return row;
      });

      if (!updated) throw notFound("source introuvable ou déjà active");
      return {
        id: updated.id,
        statut: updated.statut,
        enabled: updated.enabled,
        echecsConsecutifs: updated.echecs_consecutifs,
        journalise: true,
      };
    },
  );
}
