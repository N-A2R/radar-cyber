/**
 * Deterministic, offline parser for natural-language search questions.
 *
 * It recognises four facets (territory, time, intent, sector) and never calls a
 * paid service or a remote model. Only Nouvelle-Aquitaine departments are
 * accepted; a question about another region simply has no territory filter.
 */
import { naDepartmentCode } from "../geo/na-departments.js";
import { normalizeSearchText, searchTokens } from "./tokens.js";

export type QuestionIntent = "attacks" | "vulnerabilities" | "all";
export type QuestionSector = "health" | "education" | "public" | null;

export interface ParsedQuestion {
  text: string;
  departments: string[];
  years: number[];
  intent: QuestionIntent;
  sector: QuestionSector;
  terms: string[];
  regionOnly: true;
}

const DEPARTMENT_NAMES = [
  "Charente", "Charente-Maritime", "Corrèze", "Creuse", "Dordogne", "Gironde",
  "Landes", "Lot-et-Garonne", "Pyrénées-Atlantiques", "Deux-Sèvres", "Vienne", "Haute-Vienne",
] as const;

const ATTACK_WORDS = /\b(attaques?|cyberattaques?|incidents?|fuites?|piratage|violation|ranc.on|ransomware|breach|attacks?|compromission|intrusion)\b/;
const VULNERABILITY_WORDS = /\b(cves?|vulnerabilites?|failles?|vulnerabilities?|vulnerability)\b/;

const SECTOR_PATTERNS: ReadonlyArray<[QuestionSector, RegExp]> = [
  ["health", /\b(hopitaux?|hospital|hospitals|chu|cliniques?|sante|health|healthcare|medical|medicale|medecins?|patients?|ehpad|etablissements? de sante|laboratoires?|pharmacies?)\b/],
  ["education", /\b(ecoles?|universites?|colleges?|lycees?|schools?|universities?|enseignement)\b/],
  ["public", /\b(mairies?|municipalites?|prefectures?|communes?|collectivites?|administration|public)\b/],
];

/** A bare two-digit number is only a department when it is a known NA code. */
function findDepartments(normalized: string): string[] {
  const found = new Set<string>();
  for (const name of DEPARTMENT_NAMES) {
    const token = normalizeSearchText(name).replace(/\s+/g, "");
    const spaced = normalizeSearchText(name);
    if (new RegExp(`\\b${token}\\b|\\b${spaced}\\b`).test(normalized)) {
      const code = naDepartmentCode(name);
      if (code) found.add(code);
    }
  }
  for (const match of normalized.matchAll(/\b(\d{2})\b/g)) {
    const code = naDepartmentCode(match[1]);
    if (code) found.add(code);
  }
  return [...found].sort();
}

function findYears(normalized: string): number[] {
  const years = new Set<number>();
  for (const match of normalized.matchAll(/\b(20[1-3]\d)\b/g)) {
    const year = Number(match[1]);
    if (year >= 2015 && year <= 2035) years.add(year);
  }
  return [...years].sort();
}

/** Parses a question into bounded filters; unknown wording keeps every facet open. */
export function parseQuestion(text: string): ParsedQuestion {
  const normalized = normalizeSearchText(text);
  const intent: QuestionIntent = ATTACK_WORDS.test(normalized)
    ? "attacks"
    : VULNERABILITY_WORDS.test(normalized)
      ? "vulnerabilities"
      : "all";
  const sector = SECTOR_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
  return {
    text: text.trim(),
    departments: findDepartments(normalized),
    years: findYears(normalized),
    intent,
    sector,
    terms: searchTokens(text),
    regionOnly: true,
  };
}
