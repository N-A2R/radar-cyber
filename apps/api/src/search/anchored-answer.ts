/**
 * Réponses en français dont chaque affirmation est ancrée dans une ligne de
 * `event`. Aucune phrase n'est produite sans identifiant d'événement, URL de
 * source et run de collecte résolu dans `collector_run`.
 *
 * Le corpus figé (`bench/corpus/incidents-*.jsonl`) n'intervient pas ici : un
 * identifiant cité doit exister dans la table `event`, condition du rejeu.
 */
import { query } from "../db.js";
import { NA_DEPARTMENTS } from "../geo/commune-index.js";
import { parseQuestion, type ParsedQuestion } from "./parse-question.js";
import { evenementPublicSql } from "../security/tlp.js";

export interface AnchoredSource {
  eventId: number;
  sourceId: string;
  sourceName: string;
  url: string;
  runId: string;
  runKind: string | null;
}

export interface AnchoredAssertion {
  /** Identifiant exact cité dans la phrase, au format `event:<id>`. */
  id: string;
  phrase: string;
  date: string | null;
  organisation: string;
  department: string;
  family: string;
  title: string;
  source: AnchoredSource;
}

export interface AnchoredAnswer {
  question: string;
  filters: Pick<ParsedQuestion, "departments" | "years" | "intent" | "sector" | "regionOnly">;
  /** Concaténation des seules phrases sourcées ; vide si aucune ligne ne correspond. */
  answer: string;
  status: "source-backed" | "no-event";
  assertions: AnchoredAssertion[];
  citedEventIds: number[];
  count: number;
  proof: { table: "event"; rows: number; filters: AnchoredAnswer["filters"] };
}

interface EventRow {
  id: string;
  date: string | null;
  title: string;
  family: string;
  organisation: string;
  department: string;
  source_id: string;
  source_name: string;
  source_url: string;
  run_id: string;
  run_kind: string | null;
  term_matches: number;
}

const ATTACK_FAMILIES = ["ransomware", "leaks", "cti", "presse_cyber", "paste", "cert", "cert_fr", "presse", "official_statement"];
const VULNERABILITY_FAMILIES = ["vuln"];
const ALL_FAMILIES = [...ATTACK_FAMILIES, ...VULNERABILITY_FAMILIES];
const RESULT_LIMIT = 20;

const SECTOR_SQL: Record<Exclude<ParsedQuestion["sector"], null>, { sectors: string[]; kinds: string[]; pattern: string }> = {
  health: {
    sectors: ["sante", "sante-social", "pharmacie"],
    kinds: ["sante"],
    pattern: "(^| )(hopital|hopitaux|chu|clinique|centre hospitalier|ehpad|sante|medical)( |$)",
  },
  education: {
    sectors: ["enseignement"],
    kinds: ["enseignement"],
    pattern: "(^| )(ecole|ecoles|universite|universites|college|lycee)( |$)",
  },
  public: {
    sectors: ["administration", "collectivite"],
    kinds: ["collectivite"],
    pattern: "(^| )(mairie|prefecture|commune|collectivite)( |$)",
  },
};

/** Mots de question qui ne discriminent aucun événement et bruitent le rejeu. */
const QUESTION_WORDS: Record<string, true> = {
  quels: true, quelles: true, quel: true, quelle: true, qui: true, que: true, quoi: true,
  quand: true, comment: true, evenements: true, evenement: true, incidents: true,
  incident: true, attaques: true, attaque: true, cyberattaques: true, cyberattaque: true,
  concernent: true, concerne: true, touche: true, touchent: true, sait: true, savez: true,
  passe: true, sest: true, sestil: true, dans: true, departement: true, annee: true,
  selon: true, source: true, sources: true, donnees: true, donnee: true,
  preuve: true, preuves: true, corpus: true, registre: true, recentes: true,
  recente: true, liste: true,
};

function familiesFor(question: ParsedQuestion): string[] {
  if (question.intent === "vulnerabilities") return VULNERABILITY_FAMILIES;
  if (question.intent === "attacks") return ATTACK_FAMILIES;
  return ALL_FAMILIES;
}

function frenchDate(date: string | null): string {
  if (!date) return "date non précisée";
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${day}/${month}/${year}`;
}

function phraseFor(row: EventRow, id: number): string {
  const sourceName = row.source_name || row.source_id;
  return `Le ${frenchDate(row.date)}, l'organisation ${row.organisation} (département ${row.department}) est associée à l'événement de famille ${row.family} : « ${row.title} ». Preuve : [event:${id}] — source ${sourceName} (${row.source_url}), run de collecte ${row.run_id}.`;
}

/**
 * Interroge exclusivement les événements publics rattachés à une organisation
 * de Nouvelle-Aquitaine et dont la chaîne de preuve est complète. Chaque ligne
 * rendue est donc vérifiable par rejeu SQL, sans appel réseau ni modèle payant.
 */
export async function answerAnchored(text: string): Promise<AnchoredAnswer> {
  const question = parseQuestion(text);
  const terms = question.terms.filter((token) => QUESTION_WORDS[token] !== true);
  const params: unknown[] = [
    question.departments.length > 0 ? question.departments : [...NA_DEPARTMENTS],
  ];

  const clauses = [
    evenementPublicSql("e"),
    "o.dept = ANY($1::text[])",
    "e.source_url IS NOT NULL AND btrim(e.source_url) <> ''",
    "e.evidence->>'run_id' IS NOT NULL",
    "coalesce(e.evidence->>'synthetic', 'false') <> 'true'",
    "e.source_id NOT LIKE 'injection-%'",
  ];

  if (question.years.length > 0) {
    params.push(question.years);
    clauses.push(`EXTRACT(YEAR FROM e.observed_at) = ANY($${params.length}::int[])`);
  }

  params.push(familiesFor(question));
  clauses.push(`e.family = ANY($${params.length}::text[])`);

  if (question.sector) {
    const sector = SECTOR_SQL[question.sector];
    params.push(sector.sectors);
    const sectorsAt = params.length;
    params.push(sector.kinds);
    const kindsAt = params.length;
    params.push(sector.pattern);
    const patternAt = params.length;
    clauses.push(
      `(o.sector = ANY($${sectorsAt}::text[]) OR o.kind = ANY($${kindsAt}::text[]) OR o.name_norm ~ $${patternAt})`,
    );
  }

  params.push(terms);
  const termsAt = params.length;
  const tokenMatch = `EXISTS (
      SELECT 1 FROM unnest($${termsAt}::text[]) AS t
      WHERE e.title_search LIKE '%' || t || '%'
         OR coalesce(e.summary_search, '') LIKE '%' || t || '%'
         OR o.name_norm LIKE '%' || t || '%'
         OR lower(s.name) LIKE '%' || t || '%'
    )`;
  clauses.push(`(cardinality($${termsAt}::text[]) = 0 OR ${tokenMatch})`);

  params.push(RESULT_LIMIT);
  const limitAt = params.length;

  const result = await query<EventRow>(
    `SELECT e.id::text AS id,
            e.observed_at::date::text AS date,
            e.title,
            e.family,
            o.name AS organisation,
            o.dept AS department,
            e.source_id,
            coalesce(s.name, e.source_id) AS source_name,
            e.source_url,
            e.evidence->>'run_id' AS run_id,
            cr.kind AS run_kind,
            (SELECT count(*)::int FROM unnest($${termsAt}::text[]) AS t
              WHERE e.title_search LIKE '%' || t || '%'
                 OR coalesce(e.summary_search, '') LIKE '%' || t || '%'
                 OR o.name_norm LIKE '%' || t || '%'
                 OR lower(s.name) LIKE '%' || t || '%') AS term_matches
     FROM event e
     JOIN org o ON o.id = e.org_id
     LEFT JOIN source s ON s.id = e.source_id
     JOIN collector_run cr ON cr.id = (e.evidence->>'run_id')::bigint
     WHERE ${clauses.join("\n       AND ")}
     ORDER BY term_matches DESC, e.observed_at DESC NULLS LAST, e.id DESC
     LIMIT $${limitAt}`,
    params,
  );

  const assertions = result.rows.map((row): AnchoredAssertion => {
    const id = Number(row.id);
    return {
      id: `event:${id}`,
      phrase: phraseFor(row, id),
      date: row.date,
      organisation: row.organisation,
      department: row.department,
      family: row.family,
      title: row.title,
      source: {
        eventId: id,
        sourceId: row.source_id,
        sourceName: row.source_name || row.source_id,
        url: row.source_url,
        runId: row.run_id,
        runKind: row.run_kind,
      },
    };
  });

  const filters = {
    departments: question.departments,
    years: question.years,
    intent: question.intent,
    sector: question.sector,
    regionOnly: question.regionOnly,
  };

  return {
    question: question.text,
    filters,
    answer: assertions.map((assertion) => assertion.phrase).join("\n"),
    status: assertions.length > 0 ? "source-backed" : "no-event",
    assertions,
    citedEventIds: assertions.map((assertion) => assertion.source.eventId),
    count: assertions.length,
    proof: { table: "event", rows: assertions.length, filters },
  };
}
