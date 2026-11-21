/**
 * Pourquoi les sources rouges sont-elles rouges ?
 *
 * La couleur vient de l'âge du dernier fait (`health-detail.ts`), pas d'une
 * cause enregistrée : la base ne contient aucun champ structuré de cause.
 * Les seules traces réelles sont `collector_run.error` (texte libre),
 * `collector_run.status` et `collector_run.items_in`. Cette route déduit les
 * six causes demandées de ces champs, en publiant la règle utilisée et le
 * nombre de sources rouges sans aucune trace — pour ne jamais présenter une
 * déduction comme une cause mesurée.
 */
import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { tonDeFraicheur } from "./health-detail.js";

export const CAUSES = [
  { code: "404", libelle: "Page introuvable (404)" },
  { code: "403", libelle: "Accès refusé (403)" },
  { code: "5xx", libelle: "Erreur serveur (5xx)" },
  { code: "timeout", libelle: "Délai dépassé" },
  { code: "parse", libelle: "Réponse illisible (parse)" },
  { code: "vide", libelle: "Collecte vide (0 entrée)" },
] as const;

export type CauseCode = (typeof CAUSES)[number]["code"];

export type ExempleCause = {
  /** Nom réel de la source, tel qu'enregistré. */
  source: string;
  /** Message d'erreur stocké ou mesure du run, tronqué pour l'affichage. */
  detail: string;
};

export type RepartitionCause = {
  code: CauseCode;
  libelle: string;
  /** Sources rouges distinctes, sur les 30 derniers jours de runs. */
  sources: number;
  /** Jusqu'à trois exemples réels, jamais inventés. */
  exemples: ExempleCause[];
  origine: "message_erreur" | "compteur_run";
  regle: string;
};

export type HealthCauses = {
  ok: true;
  generatedAt: string;
  /** Total des sources rouges, même définition que /health/detail. */
  rouges: number;
  /** Sources rouges sans run en erreur ni run vide sur la fenêtre. */
  sansTrace: number;
  stockage: {
    causeStockee: boolean;
    explication: string;
    champPropose: { table: string; colonne: string; definition: string };
  };
  causes: RepartitionCause[];
};

type SourceRow = { id: string; name: string; last_event_at: string | null };
type RunRow = {
  source_id: string;
  status: string;
  error: string | null;
  items_in: number;
  started_at: string | null;
};

/** Même échelle et même seuil que `tonDeFraicheur`, appliqués côté serveur. */
function ageHeures(lastEventAt: string | null): number | null {
  if (lastEventAt === null) return null;
  const t = Date.parse(lastEventAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 3_600_000));
}

const REGLES: {
  code: CauseCode;
  origine: RepartitionCause["origine"];
  regle: string;
  motif?: RegExp;
}[] = [
  { code: "404", origine: "message_erreur", regle: "message d'erreur contenant 404", motif: /\b404\b/ },
  { code: "403", origine: "message_erreur", regle: "message d'erreur contenant 403", motif: /\b403\b/ },
  { code: "5xx", origine: "message_erreur", regle: "message d'erreur contenant un code 5xx", motif: /\b5\d\d\b/ },
  {
    code: "timeout",
    origine: "message_erreur",
    regle: "message d'erreur : délai dépassé, timeout ou requête abandonnée",
    motif: /(délai dépassé|timed?\s*out|timeout|etimedout|aborted)/i,
  },
  {
    code: "parse",
    origine: "message_erreur",
    regle: "message d'erreur : réponse non-JSON ou parse impossible",
    motif: /(non-json|non json|parse|xml invalide|invalid xml|syntaxerror)/i,
  },
  {
    code: "vide",
    origine: "compteur_run",
    regle: "run réussi avec 0 entrée lue (collector_run.items_in = 0)",
  },
];

function causesDuRun(run: RunRow): CauseCode[] {
  const texte = run.error ?? "";
  const trouvees = REGLES.flatMap((r) => (r.motif?.test(texte) ? [r.code] : []));
  if (run.status === "ok" && Number(run.items_in) === 0) trouvees.push("vide");
  return trouvees;
}

/** Détail d'exemple : le message réellement stocké, ou la mesure du run. */
function detailDuRun(run: RunRow, code: CauseCode): string {
  if (code !== "vide") return (run.error ?? "").slice(0, 200);
  const date = run.started_at ? run.started_at.slice(0, 10) : "date inconnue";
  return `run du ${date} : 0 entrée lue`;
}

export default async function (app: FastifyInstance) {
  app.get("/health/causes", async () => {
    // Une source est rouge quand son dernier fait a plus de 7 jours, ou
    // qu'elle n'a jamais produit — exactement comme /health/detail.
    const sources = await query<SourceRow>(`
      SELECT s.id, s.name,
             max(COALESCE(e.observed_at, e.collected_at))::text AS last_event_at
        FROM source s
        LEFT JOIN event e ON e.source_id = s.id
       GROUP BY s.id, s.name
       ORDER BY s.name
    `);
    const rouges = sources.rows.filter((s) => tonDeFraicheur(ageHeures(s.last_event_at)) === "red");
    const ids = rouges.map((s) => s.id);
    const noms = new Map(rouges.map((s) => [s.id, s.name]));

    // On ne regarde que les runs récents : une erreur d'il y a six mois
    // n'explique pas le rouge d'aujourd'hui. Fenêtre alignée sur /sources.
    const runs = ids.length > 0
      ? await query<RunRow>(
          `SELECT source_id, status, error, items_in, started_at::text AS started_at
             FROM collector_run
            WHERE source_id = ANY($1::text[])
              AND started_at >= now() - interval '30 days'
            ORDER BY started_at DESC`,
          [ids],
        )
      : { rows: [] as RunRow[] };

    const comptes = new Map<CauseCode, Set<string>>(CAUSES.map((c) => [c.code, new Set<string>()]));
    const exemples = new Map<CauseCode, Map<string, ExempleCause>>(
      CAUSES.map((c) => [c.code, new Map()]),
    );
    const avecTrace = new Set<string>();
    for (const run of runs.rows) {
      const nom = noms.get(run.source_id);
      if (!nom) continue;
      for (const code of causesDuRun(run)) {
        avecTrace.add(run.source_id);
        comptes.get(code)!.add(run.source_id);
        const liste = exemples.get(code)!;
        if (!liste.has(run.source_id) && liste.size < 3) {
          liste.set(run.source_id, { source: nom, detail: detailDuRun(run, code) });
        }
      }
    }

    // Vérification du schéma, pas supposition : le champ proposé ci-dessous
    // n'est pas présent. S'il apparaît un jour, la route le dit.
    const colonnes = await query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name
        FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name IN ('source', 'collector_run')
         AND column_name IN ('failure_cause', 'cause_code')
    `);
    const causeStockee = colonnes.rows.length > 0;
    const trouvees = colonnes.rows.map((c) => `${c.table_name}.${c.column_name}`).join(", ");

    return {
      ok: true as const,
      generatedAt: new Date().toISOString(),
      rouges: rouges.length,
      sansTrace: rouges.length - avecTrace.size,
      stockage: {
        causeStockee,
        explication: causeStockee
          ? `Colonne(s) de cause détectée(s) : ${trouvees}. Les chiffres ci-dessous restent déduits des messages et compteurs stockés, ils ne lisent pas encore cette colonne.`
          : "Aucune colonne ne stocke la cause d'un échec. Les chiffres ci-dessous sont déduits des messages d'erreur et des compteurs de collecte réellement stockés ; ils ne couvrent que les sources rouges ayant laissé une trace.",
        champPropose: {
          table: "collector_run",
          colonne: "failure_cause",
          definition:
            "text CHECK (failure_cause IN ('404','403','5xx','timeout','parse','vide','autre')), NULL tant que la cause n'est pas connue ; à écrire par le collecteur au moment de l'échec.",
        },
      },
      causes: REGLES.map((r) => {
        const liste = exemples.get(r.code)!;
        return {
          code: r.code,
          libelle: CAUSES.find((c) => c.code === r.code)!.libelle,
          sources: comptes.get(r.code)!.size,
          exemples: [...liste.values()].slice(0, 3),
          origine: r.origine,
          regle: r.regle,
        };
      }),
    } satisfies HealthCauses;
  });
}
