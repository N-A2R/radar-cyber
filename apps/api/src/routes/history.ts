/**
 * GET /api/history?from=&to=&org= — mémoire longue des événements.
 *
 * Le brut n'est gardé que 90 jours (`runRetention`), l'archive (`event_archive`,
 * migration 028) garde l'essentiel des faits purgés. Cette route lit la vue
 * `v_event_all` pour que douze mois de questions aient douze mois de réponses,
 * sans que l'appelant sache où la ligne est stockée.
 *
 * Les deux tables se recouvrent brièvement pendant une purge, et un événement
 * peut réapparaître sous la même clé de déduplication : un seul fait par
 * `dedup_key`, brut prioritaire, sinon l'archive le compterait deux fois.
 */
import type { FastifyInstance } from "fastify";
import { badRequest, notFound } from "../errors.js";
import { query } from "../db.js";

/** Garde une requête bornée : un intervalle démesuré n'apporte rien à la mesure. */
const MAX_MOIS = 120;

type MoisRow = {
  mois: string;
  brut: number | string;
  archive: number | string;
  total: number | string;
};

type OrgRow = { id: number; name: string; slug: string };
type MoisCompte = { mois: string; brut: number; archive: number; total: number };

function premier(brut: string | string[] | undefined): string | undefined {
  return Array.isArray(brut) ? brut[0] : brut;
}

/** Accepte `YYYY-MM`, `YYYY-MM-DD` ou un horodatage ISO ; défaut UTC. */
function lireDate(brut: string, nom: string): Date {
  const texte = /^\d{4}-\d{2}$/.test(brut)
    ? `${brut}-01T00:00:00Z`
    : /^\d{4}-\d{2}-\d{2}$/.test(brut)
      ? `${brut}T00:00:00Z`
      : brut;
  const date = new Date(texte);
  if (!Number.isFinite(date.getTime())) throw badRequest(`${nom} doit être une date ISO`);
  return date;
}

function debutMois(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function moisSuivant(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

export default async function (app: FastifyInstance) {
  app.get("/history", async (req, reply) => {
    const q = req.query as Record<string, string | string[] | undefined>;
    const maintenant = new Date();
    /** Par défaut : douze mois glissants, mois courant inclus. */
    const depuisDefaut = debutMois(
      new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 11, 1)),
    );
    const fromBrut = premier(q.from);
    const toBrut = premier(q.to);
    const from = fromBrut ? lireDate(fromBrut, "from") : depuisDefaut;
    const to = toBrut ? lireDate(toBrut, "to") : maintenant;
    if (from.getTime() > to.getTime()) {
      throw badRequest("from doit précéder to");
    }
    const debut = debutMois(from);
    const finMois = debutMois(to);
    const nbMois = (finMois.getUTCFullYear() - debut.getUTCFullYear()) * 12
      + (finMois.getUTCMonth() - debut.getUTCMonth()) + 1;
    if (nbMois > MAX_MOIS) {
      throw badRequest(`période limitée à ${MAX_MOIS} mois`);
    }

    const orgBrut = premier(q.org);
    let org: OrgRow | null = null;
    if (orgBrut) {
      const parId = /^\d+$/.test(orgBrut);
      if (parId && !Number.isSafeInteger(Number(orgBrut))) {
        throw badRequest("org invalide");
      }
      const r = await query<OrgRow>(
        `SELECT id, name, slug FROM org WHERE ${parId ? "id = $1" : "slug = $1"}`,
        [parId ? Number(orgBrut) : orgBrut],
      );
      const trouve = r.rows[0];
      if (!trouve) throw notFound("organisation inconnue");
      org = { id: Number(trouve.id), name: trouve.name, slug: trouve.slug };
    }

    // `to` est exclusif : une date `2026-11-21` inclut novembre entier, comme
    // le mois affiché par l'histogramme de la fiche organisation.
    const r = await query<MoisRow>(
      `WITH unifies AS (
         SELECT DISTINCT ON (dedup_key) dedup_key, origine,
                COALESCE(observed_at, collected_at) AS instant
           FROM v_event_all
          WHERE COALESCE(observed_at, collected_at) >= $1
            AND COALESCE(observed_at, collected_at) < $2
            AND ($3::int IS NULL OR org_id = $3)
          ORDER BY dedup_key, CASE origine WHEN 'brut' THEN 0 ELSE 1 END
       )
       SELECT to_char(instant AT TIME ZONE 'UTC', 'YYYY-MM') AS mois,
              count(*) FILTER (WHERE origine = 'brut')::int AS brut,
              count(*) FILTER (WHERE origine = 'archive')::int AS archive,
              count(*)::int AS total
         FROM unifies
        GROUP BY 1
        ORDER BY 1`,
      [from.toISOString(), moisSuivant(finMois).toISOString(), org?.id ?? null],
    );

    const comptes = new Map(r.rows.map((ligne) => [ligne.mois, ligne]));
    const parMois: MoisCompte[] = [];
    for (let i = 0, mois = debut; i < nbMois; i++, mois = moisSuivant(mois)) {
      const cle = mois.toISOString().slice(0, 7);
      const ligne = comptes.get(cle);
      parMois.push({
        mois: cle,
        brut: Number(ligne?.brut ?? 0),
        archive: Number(ligne?.archive ?? 0),
        total: Number(ligne?.total ?? 0),
      });
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      org,
      total: parMois.reduce((n, m) => n + m.total, 0),
      brut: parMois.reduce((n, m) => n + m.brut, 0),
      archive: parMois.reduce((n, m) => n + m.archive, 0),
      parMois,
    };
  });
}
