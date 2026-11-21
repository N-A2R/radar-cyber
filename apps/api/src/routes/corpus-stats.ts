/**
 * GET /api/corpus/stats — état du corpus en une seule lecture, pour l'écran
 * « Corpus ». Toutes les valeurs sont calculées ici, jamais inventées par le
 * front ; chaque champ porte sa définition dans la réponse.
 *
 * Définitions (à lire avant de citer un chiffre) :
 *  - `sources` : lignes de la table `source`, actives ou non.
 *  - `byDepartment` : `source` n'a pas de colonne département. On reprend
 *    l'inférence documentée de `routes/stats.ts` (identifiant, nom, URL,
 *    description ; ambiguïté => aucune attribution). Les sources non localisées
 *    sont regroupées dans un bucket explicite, pas jetées : un total qui ne
 *    ferme pas est un total qui ment.
 *  - `incidents` : événements dont l'assertion est `confirmed_incident` ou
 *    `third_party_claim`. Les indicateurs techniques et signaux ambiants ne
 *    sont pas des incidents.
 *  - `domainCoverage` : part des organisations du référentiel qui portent un
 *    domaine non vide. Le référentiel est bien plus grand que le corpus
 *    d'incidents : les deux compteurs ne sont pas comparables.
 *  - `sinceLastReport` : croissance des événements ingérés sur les dernières
 *    24 h (`event.collected_at`), comparée aux 24 h précédentes. C'est une
 *    mesure d'entrée dans le corpus, pas une mesure de la date de l'incident.
 *  - `recentIncidents` : 20 derniers incidents par date observée (repli sur
 *    la date de collecte), avec un lien cliquable : l'URL de la preuve quand
 *    elle existe, sinon l'URL déclarée de la source.
 */
import type { FastifyInstance } from "fastify";
import { DEPT_LABELS } from "../collectors/relevance.js";
import { query } from "../db.js";
import { departementDeLaSource } from "./stats.js";

export const INCIDENT_ASSERTIONS = ["confirmed_incident", "third_party_claim"] as const;
export const GROWTH_WINDOW_HOURS = 24;
/** Récupéré du même endroit que l'inférence de `/api/stats/departements`. */
export const UNLOCALISED = "";

type SourceRow = {
  id: string;
  name: string;
  url: string;
  description: string | null;
  family: string;
  enabled: boolean;
};

type IncidentRow = {
  id: string;
  title: string;
  organisation: string | null;
  department: string | null;
  date: string | null;
  type: string;
  source_name: string;
  source_url: string | null;
  source_home: string;
  family: string;
};

type AggRow = { n: number };
type DomainRow = { organisations: number; with_domain: number };
type GrowthRow = { new_events: number; previous_events: number };

/** `DEPT_LABELS` est normalisé pour la recherche ; l'écran affiche un libellé lisible. */
const ACCENTS_DEPT: Readonly<Record<string, string>> = {
  correze: "Corrèze",
  pyrenees: "Pyrénées",
  deux: "Deux",
  sevres: "Sèvres",
};
/** « Lot-et-Garonne » garde son « et » minuscule. */
const PARTICULES_DEPT: Readonly<Record<string, true>> = { et: true };

function libelleDepartment(code: string): string {
  return (DEPT_LABELS[code] ?? code)
    .split("-")
    .map((mot) => ACCENTS_DEPT[mot] ?? (PARTICULES_DEPT[mot] === true ? mot : mot.charAt(0).toUpperCase() + mot.slice(1)))
    .join("-");
}

/**
 * Pourcentage mesuré : sans dénominateur, `null` ; avec une très petite part,
 * on garde assez de décimales pour ne jamais afficher 0 % alors que 88
 * organisations sur 1,6 M portent un domaine.
 */
function percent(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Number(((part / total) * 100).toPrecision(3));
}

export default async function (app: FastifyInstance) {
  app.get("/corpus/stats", async () => {
    const [sourceRows, orgRows, incidentRows, growthRows, recentRows] = await Promise.all([
      query<SourceRow>(
        `SELECT id, name, url, description, family, enabled FROM source ORDER BY name, id`,
      ),
      query<DomainRow>(
        `SELECT count(*)::int AS organisations,
                count(*) FILTER (WHERE domain IS NOT NULL AND btrim(domain) <> '')::int AS with_domain
           FROM org`,
      ),
      query<AggRow>(
        `SELECT count(*)::int AS n FROM event WHERE assertion_type = ANY($1::text[])`,
        [[...INCIDENT_ASSERTIONS]],
      ),
      query<GrowthRow>(
        `SELECT count(*) FILTER (WHERE collected_at >= now() - interval '24 hours')::int AS new_events,
                count(*) FILTER (WHERE collected_at >= now() - interval '48 hours'
                                   AND collected_at < now() - interval '24 hours')::int AS previous_events
           FROM event`,
      ),
      query<IncidentRow>(
        `SELECT e.id::text AS id, e.title,
                o.name AS organisation, o.dept AS department,
                to_char(COALESCE(e.observed_at, e.collected_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
                e.assertion_type AS type, s.name AS source_name,
                e.source_url AS source_url, s.url AS source_home, s.family
           FROM event e
           JOIN source s ON s.id = e.source_id
           LEFT JOIN org o ON o.id = e.org_id
          WHERE e.assertion_type = ANY($1::text[])
          ORDER BY COALESCE(e.observed_at, e.collected_at) DESC, e.id DESC
          LIMIT 20`,
        [[...INCIDENT_ASSERTIONS]],
      ),
    ]);

    // Barres empilées : une ligne par département, une clé par famille. La
    // somme des segments est toujours égale au total de sources affiché.
    const departments = new Map<string, Record<string, number>>();
    const families = new Set<string>();
    for (const source of sourceRows.rows) {
      const code = departementDeLaSource(source) ?? UNLOCALISED;
      const counts = departments.get(code) ?? {};
      counts[source.family] = (counts[source.family] ?? 0) + 1;
      families.add(source.family);
      departments.set(code, counts);
    }
    const byDepartment = [...departments.entries()]
      .map(([department, counts]) => ({
        department,
        label: department === UNLOCALISED
          ? "Not localised"
          : libelleDepartment(department),
        total: Object.values(counts).reduce((sum, n) => sum + Number(n), 0),
        families: counts,
      }))
      .sort((a, b) =>
        b.total - a.total || a.label.localeCompare(b.label, "en"));

    const organisations = Number(orgRows.rows[0]?.organisations ?? 0);
    const withDomain = Number(orgRows.rows[0]?.with_domain ?? 0);
    const newEvents = Number(growthRows.rows[0]?.new_events ?? 0);
    const previousEvents = Number(growthRows.rows[0]?.previous_events ?? 0);

    return {
      generatedAt: new Date().toISOString(),
      windowHours: GROWTH_WINDOW_HOURS,
      totals: {
        sources: sourceRows.rows.length,
        sourcesLocalised: sourceRows.rows.length - (departments.get(UNLOCALISED)
          ? Object.values(departments.get(UNLOCALISED)!).reduce((sum, n) => sum + Number(n), 0)
          : 0),
        organisations,
        incidents: Number(incidentRows.rows[0]?.n ?? 0),
      },
      families: [...families].sort((a, b) => a.localeCompare(b, "en")),
      byDepartment,
      domainCoverage: {
        withDomain,
        organisations,
        percent: percent(withDomain, organisations),
      },
      sinceLastReport: {
        windowHours: GROWTH_WINDOW_HOURS,
        newEvents,
        previousEvents,
        change: newEvents - previousEvents,
        percentChange: previousEvents > 0
          ? Math.round(((newEvents - previousEvents) / previousEvents) * 1000) / 10
          : null,
        comparedTo: "previous 24 hours",
      },
      recentIncidents: recentRows.rows.map((row) => ({
        id: row.id,
        title: row.title,
        organisation: row.organisation,
        department: row.department,
        date: row.date,
        type: row.type,
        family: row.family,
        sourceName: row.source_name,
        sourceUrl: row.source_url ?? row.source_home ?? null,
      })),
    };
  });
}
