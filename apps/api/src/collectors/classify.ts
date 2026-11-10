// Classification cyber vs presse généraliste.
//
// Constat mesuré (2026-11-10) : la famille `cti` contient 2 129 événements,
// dont 188 seulement (8,8 %) mentionnent un terme cyber dans leur titre.
// Les 91 % restants sont de la presse régionale (mesinfos, ICI, actu.fr,
// Sud Ouest, 20 Minutes…) agrégée sous l'étiquette `cti` parce que la source
// a été déclarée cyber, pas parce que le contenu l'est. Un article sur un bar
// à Bordeaux n'est pas du renseignement. Ce module porte la porte de sortie :
// le texte décide, sauf pour les sources explicitement cyber dont le nom
// suffit (NVD, CISA, UNIT 42, RansomLook…), qui gardent leur famille.
import { FAMILIES } from "@radar/shared";

export type Family = (typeof FAMILIES)[number];

const FAMILY_SET: ReadonlySet<string> = new Set(FAMILIES);

export function isFamily(value: string): value is Family {
  return FAMILY_SET.has(value);
}

/**
 * Termes cyber, français et anglais. Ils sont comparés sur un texte normalisé
 * (minuscules, sans accents) et délimités par des frontières de mot : « attaque »
 * ne doit pas matcher « attaquent », « apt » ne doit pas matcher « adapte ».
 */
export const CYBER_TERMS: readonly string[] = [
  // français
  "cyber",
  "cyberattaque",
  "cyber-attaque",
  "cyberattaques",
  "cyber-attaques",
  "cybercriminalite",
  "cybersecurite",
  "cyberguerre",
  "cyberdefense",
  "menace",
  "menaces",
  "attaques",
  "attaque informatique",
  "piratage",
  "piratages",
  "rancongiciel",
  "rancongiciels",
  "rancon",
  "rancons",
  "fuite de donnees",
  "fuites de donnees",
  "violation de donnees",
  "vulnerabilite",
  "vulnerabilites",
  "faille",
  "failles",
  "cve-",
  "phishing",
  "hameconnage",
  "maliciel",
  "maliciels",
  "intrusion",
  "intrusions",
  "compromission",
  "compromissions",
  "compromis",
  "exfiltration",
  "ddos",
  "botnet",
  "botnets",
  "adware",
  "spyware",
  "cryptolocker",
  "defiguration",
  "securite informatique",
  "identifiants voles",
  "cheval de troie",
  "zero-day",
  "0-day",
  "backdoor",
  "infostealer",
  "rootkit",
  "keylogger",
  "ransomware",
  "ransomwares",
  // anglais
  "cyberattack",
  "cyber attack",
  "attack",
  "attacks",
  "attacker",
  "attackers",
  "threat actor",
  "threat actors",
  "threat intelligence",
  "threat vector",
  "vulnerability",
  "vulnerabilities",
  "breach",
  "data breach",
  "leak",
  "leaks",
  "leaked",
  "leakage",
  "malware",
  "malwares",
  "spearphishing",
  "compromised",
  "compromise",
  "exploit",
  "exploits",
  "exploited",
  "exploitation",
  "zeroday",
  "hacker",
  "hackers",
  "hacking",
  "hacked",
  "rce",
  "apt",
  "lateral movement",
  "credentials",
  "patch tuesday",
  "security advisory",
  "cybersecurity",
  "infosec",
  "virus",
  "rgpd",
  "donnees personnelles",
  "personal data",
];

/**
 * Sources dont le nom suffit à garantir le contenu : elles ne publient que du
 * cyber. Comparaison en sous-chaîne sur le nom normalisé (`Palo Alto — Unit42
 * Threat Intel RSS` contient « unit42 »).
 */
export const SOURCE_ALLOWLIST: readonly string[] = [
  "nist",
  "nvd",
  "cisa",
  "cert-fr",
  "cert fr",
  "cert-ua",
  "cert ua",
  "cert-eu",
  "certfr",
  "unit 42",
  "unit42",
  "ransomlook",
  "exploit-db",
  "darkreading",
  "infosecurity",
  "ubuntu security",
  "sans internet storm",
  "checkpoint",
  "talos",
  "palo alto",
  "microsoft",
  "google threat",
  "securelist",
  "kaspersky",
  "welivesecurity",
  "eset",
  "the dfir report",
  "security affairs",
  "hackread",
  "it security guru",
  "bleepingcomputer",
  "the hacker news",
  "thehackernews",
  "krebs on security",
  "securityweek",
  "misp project",
];

/** Minuscules sans accents, ponctuation conservée : `cve-` et `zero-day` en dépendent. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Un terme est délimité à gauche, et à droite aussi sauf s'il finit par `-`
 * (`cve-` doit matcher `cve-2024-1234`). Un `s` final optionnel couvre le
 * pluriel anglais/français (« cyberattaques », « breaches »). Les frontières
 * utilisent les classes Unicode lettres/chiffres : un tiret ou une apostrophe
 * coupe le mot.
 */
function termPattern(term: string): string {
  const left = String.raw`(?<![\p{L}\p{N}])`;
  const body = escapeRegExp(term);
  const right = term.endsWith("-") ? "" : String.raw`s?(?![\p{L}\p{N}])`;
  return `${left}${body}${right}`;
}

const TERM_RE = new RegExp(CYBER_TERMS.map(termPattern).join("|"), "u");
const SOURCE_NORMS: readonly string[] = SOURCE_ALLOWLIST.map(normalizeText);

/** Vrai si le texte contient au moins un terme cyber, casse et accents ignorés. */
export function isCyberText(title: string, summary: string | null): boolean {
  const haystack = normalizeText(summary ? `${title} ${summary}` : title);
  return TERM_RE.test(haystack);
}

/** Vrai si le nom de source est une source cyber de référence. */
export function isCyberSource(sourceName: string | null | undefined): boolean {
  if (!sourceName) return false;
  const name = normalizeText(sourceName);
  return SOURCE_NORMS.some((needle) => name.includes(needle));
}

export interface ClassifyInput {
  title: string;
  summary: string | null;
  /** Famille déclarée par la source (celle de la ligne `event`). */
  sourceFamily: Family;
  /** Nom de la source, pour l'allowlist. Absent → le texte décide seul. */
  sourceName?: string | null;
}

/**
 * Garde la famille de la source si le contenu est cyber (ou si la source est
 * explicitement cyber), sinon rétrograde en `presse`. `ransomware` et `cert_fr`
 * sont rendues telles quelles : ces familles ne sont pas concernées par la porte.
 */
export function classifyFamily(input: ClassifyInput): Family {
  if (input.sourceFamily === "ransomware" || input.sourceFamily === "cert_fr") return input.sourceFamily;
  if (isCyberSource(input.sourceName)) return input.sourceFamily;
  if (isCyberText(input.title, input.summary)) return input.sourceFamily;
  return "presse";
}
