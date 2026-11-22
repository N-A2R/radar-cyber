/**
 * Read-only access to the versioned incident corpus (bench/corpus/incidents-*.jsonl).
 *
 * The live event table mostly contains technical indicators; the frozen corpus
 * carries the sourced regional incidents that a question about local attacks
 * must also see. Only whitelisted fields leave this module: excerpts, resumes
 * and confidence notes can contain victim personal data and are never returned.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { naDepartmentCode } from "../geo/na-departments.js";
import { normalizeSearchText } from "./tokens.js";
import type { ParsedQuestion } from "./parse-question.js";

export interface FrozenIncident {
  id: string;
  date: string;
  organisation: string;
  department: string;
  departmentCode: string;
  type: string;
  source: string;
  title: string;
  url: string | null;
}

const CORPUS_DIR = fileURLToPath(new URL("../../../../bench/corpus/", import.meta.url));

const HEALTH_WORDS = /\b(hopitaux?|hospital|cliniques?|sante|health|healthcare|medical(es|e|aux)?|patients?|ehpad|mesvaccins|vaccins?|vaccination|vaccinal|biologie|laboratoires?|pharmacie|ars|donnees de sante|etablissement de sante)\b/;
const EDUCATION_WORDS = /\b(ecoles?|universites?|colleges?|lycees?|schools?|enseignement|etudiants?)\b/;
const PUBLIC_WORDS = /\b(mairies?|prefectures?|communes?|collectivites?|municipal|police municipale)\b/;
const ATTACK_TYPES: Record<string, true> = {
  fuite: true, ransomware: true, compromission: true, "deni-de-service": true,
  intrusion: true, phishing: true, malware: true, attaque: true,
  cyberattaque: true, vol: true, exposition: true, sabotage: true,
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asIncident(raw: Record<string, unknown>): FrozenIncident | null {
  const departmentCode = naDepartmentCode(text(raw.departement));
  const date = text(raw.date_incident) || text(raw.date_publication);
  const organisation = text(raw.organisation);
  const title = text(raw.titre);
  if (!departmentCode || !date || !organisation || !title) return null;
  return {
    id: text(raw.id),
    date,
    organisation,
    department: text(raw.departement),
    departmentCode,
    type: text(raw.type).toLowerCase(),
    source: text(raw.source),
    title,
    url: text(raw.url) || null,
  };
}

let cached: FrozenIncident[] | null = null;

/** Loads every versioned incident file once; a missing corpus yields no hits. */
export function loadFrozenIncidents(): FrozenIncident[] {
  if (cached) return cached;
  const incidents: FrozenIncident[] = [];
  if (existsSync(CORPUS_DIR)) {
    for (const file of readdirSync(CORPUS_DIR).filter((name) => /^incidents-.*\.jsonl$/.test(name)).sort()) {
      const content = readFileSync(`${CORPUS_DIR}${file}`, "utf8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const incident = asIncident(JSON.parse(line) as Record<string, unknown>);
          if (incident) incidents.push(incident);
        } catch {
          // A malformed corpus line is skipped; it never breaks a search.
        }
      }
    }
  }
  cached = incidents;
  return cached;
}

/** Applies the parsed facets; personal-data fields were dropped at load time. */
export function searchFrozenIncidents(
  question: ParsedQuestion,
  incidents: readonly FrozenIncident[] = loadFrozenIncidents(),
): FrozenIncident[] {
  const years = new Set(question.years);
  const departments = new Set(question.departments);
  return incidents
    .filter((incident) => {
      if (ATTACK_TYPES[incident.type] !== true) return false;
      if (question.intent === "vulnerabilities") return false;
      if (departments.size > 0 && !departments.has(incident.departmentCode)) return false;
      if (years.size > 0 && !years.has(Number(incident.date.slice(0, 4)))) return false;
      const searchable = normalizeSearchText(`${incident.organisation} ${incident.title} ${incident.type}`);
      if (question.sector === "health") return HEALTH_WORDS.test(searchable);
      if (question.sector === "education") return EDUCATION_WORDS.test(searchable);
      if (question.sector === "public") return PUBLIC_WORDS.test(searchable);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .slice(0, 50);
}
