/**
 * Natural-language search over the Nouvelle-Aquitaine corpus.
 *
 * The question is parsed into bounded filters, then two read-only sources are
 * queried in parallel: live events in PostgreSQL and the versioned incident
 * corpus. Every result is a source-backed organisation-level fact; no victim
 * personal data is selected or returned.
 */
import { query } from "../db.js";
import { NA_DEPARTMENTS } from "../geo/commune-index.js";
import { searchFrozenIncidents } from "./frozen-incidents.js";
import { parseQuestion, type ParsedQuestion } from "./parse-question.js";
import { evenementPublicSql } from "../security/tlp.js";

export interface SearchHit {
  id: string;
  source: "live-event" | "frozen-corpus";
  date: string | null;
  title: string;
  organisation: string;
  department: string;
  family: string;
  publisher: string;
  url: string | null;
}

export interface SearchAnswer {
  question: string;
  filters: Pick<ParsedQuestion, "departments" | "years" | "intent" | "sector" | "regionOnly">;
  answer: string;
  hits: SearchHit[];
  counts: { total: number; liveEvents: number; frozenIncidents: number };
  timingMs: number;
}

const EVENT_SQL = `
  SELECT e.id::text AS id, e.observed_at::date::text AS date, e.title, e.family,
         o.name AS organisation, o.dept AS department, e.source_url AS url
  FROM event e
  JOIN org o ON o.id = e.org_id
  WHERE e.observed_at >= $1 AND e.observed_at < $2
    AND o.dept = ANY($3)
    AND e.family = ANY($4)
    AND ${evenementPublicSql("e")}
    AND (
      (o.sector = ANY($5) AND o.name_norm ~ $6)
      OR e.title_search LIKE ANY($7)
      OR e.summary_search LIKE ANY($8)
    )
  ORDER BY e.observed_at DESC
  LIMIT $9`;

const ATTACK_FAMILIES = ["ransomware", "leaks", "cti", "presse_cyber", "paste", "cert", "cert_fr"];
const HEALTH_SECTORS = ["sante", "sante-social", "pharmacie"];
const HEALTH_TERMS = ["hopital", "hopitaux", "clinique", "sante", "medical", "patient", "ehpad", "vaccination", "biologie", "laboratoire"];
const HOSPITAL_NAME = "(^| )(hopital|hopitaux|chu|clinique|centre hospitalier|ehpad|sante|medical)( |$)";
const RESULT_LIMIT = 50;

interface LiveEventRow {
  id: string;
  date: string | null;
  title: string;
  family: string;
  organisation: string;
  department: string;
  url: string | null;
}

function timeRange(years: number[]): [Date, Date] {
  if (years.length === 0) {
    return [new Date(Date.now() - 5 * 365 * 24 * 3600 * 1000), new Date()];
  }
  return [new Date(Date.UTC(Math.min(...years), 0, 1)), new Date(Date.UTC(Math.max(...years) + 1, 0, 1))];
}

async function searchLiveEvents(question: ParsedQuestion): Promise<SearchHit[]> {
  const [from, to] = timeRange(question.years);
  const departments = question.departments.length > 0 ? question.departments : [...NA_DEPARTMENTS];
  const families = question.intent === "vulnerabilities"
    ? ["vuln"]
    : question.intent === "attacks" ? ATTACK_FAMILIES : [...ATTACK_FAMILIES, "vuln"];
  const sectors = question.sector === "health" ? HEALTH_SECTORS : [];
  const terms = question.sector === "health" ? HEALTH_TERMS : [];
  const result = await query<LiveEventRow>(EVENT_SQL, [
    from.toISOString(), to.toISOString(), departments, families,
    sectors, HOSPITAL_NAME, terms, terms, RESULT_LIMIT,
  ]);
  return result.rows.map((row) => ({
    id: `event:${row.id}`,
    source: "live-event",
    date: row.date,
    title: row.title,
    organisation: row.organisation,
    department: row.department,
    family: row.family,
    publisher: "live event",
    url: row.url,
  }));
}

function sentence(question: ParsedQuestion, live: number, frozen: number, total: number): string {
  const subject = question.sector === "health" ? "healthcare cyberattacks" : "cyberattacks";
  const period = question.years.length > 0 ? ` in ${question.years.join(", ")}` : "";
  if (total === 0) {
    return `No ${subject} matching this question were found in the Nouvelle-Aquitaine corpus${period}.`;
  }
  return `${total} ${subject}${period} found in the Nouvelle-Aquitaine corpus (${frozen} from the versioned incident corpus, ${live} from live events).`;
}

/** Answers one question, returning both the structured filters and the sources. */
export async function answerQuestion(text: string): Promise<SearchAnswer> {
  const started = performance.now();
  const question = parseQuestion(text);
  const [events, incidents] = await Promise.all([
    searchLiveEvents(question),
    Promise.resolve(searchFrozenIncidents(question)),
  ]);
  const frozen: SearchHit[] = incidents.map((incident) => ({
    id: `corpus:${incident.id}`,
    source: "frozen-corpus",
    date: incident.date,
    title: incident.title,
    organisation: incident.organisation,
    department: incident.departmentCode,
    family: incident.type,
    publisher: incident.source,
    url: incident.url,
  }));


  const hits = [...events, ...frozen]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.id.localeCompare(b.id))
    .slice(0, RESULT_LIMIT);
  return {
    question: question.text,
    filters: {
      departments: question.departments,
      years: question.years,
      intent: question.intent,
      sector: question.sector,
      regionOnly: question.regionOnly,
    },
    answer: sentence(question, events.length, frozen.length, hits.length),
    hits,
    counts: { total: hits.length, liveEvents: events.length, frozenIncidents: frozen.length },
    timingMs: Number((performance.now() - started).toFixed(2)),
  };
}
