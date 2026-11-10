#!/usr/bin/env -S node --experimental-strip-types
/**
 * Normalisation d'un briefing Hermes en JSON structuré — SANS LLM.
 *
 * Le bot de veille (profil Hermes) produit un texte de briefing souvent
 * verbeux/instable. Ce script le parse en un JSON normalisé stable, afin que
 * la remontée vers le Radar soit déterministe et rejouable.
 *
 * Usage :
 *   node --experimental-strip-types scripts/hermes-briefing.mts <briefing.txt> [--profile <nom>] [--out <fichier>]
 *   node --experimental-strip-types scripts/hermes-briefing.mts --stdin [--profile radar-vuln]
 *
 * Format d'entrée attendu (simple, toléré) :
 *   - un item par titre Markdown (## Titre) OU par puce (- / * / 1.) ;
 *   - métadonnées inline facultatives : url:, famille:, sévérité:, résumé: ;
 *   - JSON déjà structuré ({items:[…]} ou {events:[…]}) : normalisation idempotente.
 *
 * Schéma de sortie (contrat radar) :
 *   { "profile": string, "generated_at": ISO, "items": [ { title, url, summary, severity, family } ] }
 *
 * Familles acceptées (alignées sur packages/shared) :
 *   ransomware | vuln | phishing | malware | cert | cert_fr | typosquat |
 *   reputation | cti | presse
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const FAMILIES = [
  "ransomware",
  "vuln",
  "phishing",
  "malware",
  "cert",
  "cert_fr",
  "typosquat",
  "reputation",
  "cti",
  "presse",
] as const;
type Family = (typeof FAMILIES)[number];

type Item = {
  title: string;
  url: string | null;
  summary: string;
  severity: number;
  family: Family;
};

type Briefing = {
  profile: string;
  generated_at: string;
  items: Item[];
};

const FAMILY_HINTS: Array<[RegExp, Family]> = [
  [/\b(cve|vuln|faille|correctif|patch|exploit|zero.?day|0day)\b/i, "vuln"],
  [/(ransom|ran[çc]on|ran[çc]ongiciel|lockbit|blackcat|algvis|clop)/i, "ransomware"],
  [/(phishing|hame[çc]onnage)/i, "phishing"],
  [/(malware|trojan|virus|backdoor|cheval de troie|ver informatique)/i, "malware"],
  [/(certificat|certificate|ct\s?log|cert[.\-]?fr)/i, "cert"],
  [/(typosquat|homographe|domaine similaire|usurpation de domaine)/i, "typosquat"],
  [/(presse|communiqu[ée]|media|journal|article)/i, "presse"],
  [/(r[ée]putation|d[ée]figuration|deface|seo toxique)/i, "reputation"],
];

const META_URL = /^(?:url|source|lien|link)\s*:\s*(.+)$/i;
const META_FAMILY = /^(?:famille|family|cat[ée]gorie)\s*:\s*(.+)$/i;
const META_SEVERITY = /^(?:s[ée]v[ée]rit[ée]|severity|priorit[ée])\s*:\s*(.+)$/i;
const META_SUMMARY = /^(?:r[ée]sum[ée]|summary|description|d[ée]tail)\s*:\s*(.+)$/i;
const HEADING = /^#{1,6}\s+(.+)$/;
const BULLET = /^\s*(?:[-*+•]|\d+[.)])\s+(.+)$/;
const URL_RE = /https?:\/\/[^\s)\]}>"]+/;

function usage(): never {
  console.error(
    "usage : node --experimental-strip-types scripts/hermes-briefing.mts <briefing.txt|--stdin> [--profile <nom>] [--out <fichier>]",
  );
  process.exit(1);
}

function clampSeverity(n: number): number {
  return Math.min(Math.max(Math.trunc(Number.isFinite(n) ? n : 3), 1), 5);
}

function detectFamily(text: string): Family {
  for (const [re, family] of FAMILY_HINTS) if (re.test(text)) return family;
  return "cti";
}

function parseSeverity(raw: string): number | null {
  const m = raw.match(/\b([1-5])\b/);
  if (m) return Number(m[1]);
  const t = raw.toLowerCase();
  if (/(critique|critical|urgence|0day|zero.?day)/.test(t)) return 5;
  if (/(haute?|high|[ée]lev[ée]|important|majeur)/.test(t)) return 4;
  if (/(moyenne?|medium|mod[ée]r[ée])/.test(t)) return 3;
  if (/(basse?|low|faible|mineur)/.test(t)) return 2;
  return null;
}

function normalizeFamily(raw: string): Family {
  const v = raw.trim().toLowerCase().replace(/[\s\-]+/g, "_");
  const alias: Record<string, Family> = {
    ransomware: "ransomware",
    ransom: "ransomware",
    vuln: "vuln",
    vulnérabilité: "vuln",
    vulnerabilite: "vuln",
    phishing: "phishing",
    malware: "malware",
    cert: "cert",
    cert_fr: "cert_fr",
    certfr: "cert_fr",
    typosquat: "typosquat",
    reputation: "reputation",
    cti: "cti",
    presse: "presse",
  };
  return alias[v] ?? detectFamily(raw);
}

function cleanTitle(line: string): string {
  return line
    .replace(HEADING, "$1")
    .replace(BULLET, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .trim()
    .slice(0, 400);
}

function makeItem(title: string, body: string[]): Item | null {
  const t = cleanTitle(title);
  if (!t) return null;
  let url: string | null = null;
  let family: Family | null = null;
  let severity: number | null = null;
  const summaryParts: string[] = [];

  for (const rawLine of body) {
    const line = rawLine.replace(BULLET, "$1").trim();
    if (!line) continue;
    const u = line.match(META_URL);
    if (u) {
      const found = u[1].match(URL_RE);
      if (found) url = found[0];
      continue;
    }
    const f = line.match(META_FAMILY);
    if (f) {
      family = normalizeFamily(f[1]);
      continue;
    }
    const s = line.match(META_SEVERITY);
    if (s) {
      severity = parseSeverity(s[1]);
      continue;
    }
    const d = line.match(META_SUMMARY);
    if (d) {
      summaryParts.push(d[1].trim());
      continue;
    }
    summaryParts.push(line.replace(BULLET, "$1").trim());
  }

  if (!url) {
    const found = `${t} ${summaryParts.join(" ")}`.match(URL_RE);
    url = found ? found[0] : null;
  }
  const summary = summaryParts.join(" ").replace(/\s+/g, " ").trim().slice(0, 4000);
  return {
    title: t,
    url,
    summary,
    severity: severity ?? parseSeverity(`${t} ${summary}`) ?? 3,
    family: family ?? detectFamily(`${t} ${summary}`),
  };
}

/** Découpe le texte en blocs (titre + corps). */
function splitBlocks(text: string): Array<{ title: string; body: string[] }> {
  const lines = text.split(/\r?\n/);
  const blocks: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;

  const flush = () => {
    if (current && current.title.trim()) blocks.push(current);
    current = null;
  };

  // Stratégie 1 : titres Markdown. Un H1 en tête de document est le titre du
  // briefing (pas un item) : on l'ignore, ainsi que le préambule qui suit.
  if (lines.some((l) => HEADING.test(l.trim()))) {
    let skippingPreamble = false;
    for (const line of lines) {
      const h = line.trim().match(/^(#{1,6})\s+(.+)$/);
      if (h) {
        flush();
        if (blocks.length === 0 && h[1].length === 1) {
          skippingPreamble = true;
          continue;
        }
        skippingPreamble = false;
        current = { title: h[2], body: [] };
      } else if (current && !skippingPreamble) {
        current.body.push(line);
      }
    }
    flush();
    return blocks;
  }

  // Stratégie 2 : puces — chaque puce démarre un item.
  if (lines.some((l) => BULLET.test(l))) {
    for (const line of lines) {
      const b = line.match(BULLET);
      if (b) {
        flush();
        current = { title: b[1], body: [] };
      } else if (current) {
        current.body.push(line);
      } else if (line.trim()) {
        current = { title: line, body: [] };
      }
    }
    flush();
    return blocks;
  }

  // Stratégie 3 : paragraphes séparés par des lignes vides.
  for (const line of lines) {
    if (!line.trim()) {
      flush();
    } else if (!current) {
      current = { title: line, body: [] };
    } else {
      current.body.push(line);
    }
  }
  flush();
  return blocks;
}

function normalizeJson(raw: unknown, profile: string): Briefing | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const arr = Array.isArray(obj.items) ? obj.items : Array.isArray(obj.events) ? obj.events : null;
  if (!arr) return null;
  const items: Item[] = [];
  for (const entry of arr) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const title = String(e.title ?? "").trim();
    if (!title) continue;
    const evidence = e.evidence && typeof e.evidence === "object" ? (e.evidence as Record<string, unknown>) : {};
    const summary = String(e.summary ?? evidence.summary ?? "").trim();
    const urlRaw = e.url ? String(e.url) : e.source_url ? String(e.source_url) : null;
    const sev = Number(e.severity);
    items.push({
      title: title.slice(0, 400),
      url: urlRaw && URL_RE.test(urlRaw) ? urlRaw : null,
      summary: summary.slice(0, 4000),
      severity: Number.isFinite(sev) ? clampSeverity(sev) : parseSeverity(`${title} ${summary}`) ?? 3,
      family: normalizeFamily(String(e.family ?? "")),
    });
  }
  return {
    profile: String(obj.profile ?? profile),
    generated_at: String(obj.generated_at ?? new Date().toISOString()),
    items,
  };
}

function parseText(text: string, profile: string): Briefing {
  const blocks = splitBlocks(text);
  const items: Item[] = [];
  for (const b of blocks) {
    const item = makeItem(b.title, b.body);
    if (item) items.push(item);
  }
  // Dédup par titre+url (le bot répète souvent la même alerte).
  const seen = new Set<string>();
  const deduped = items.filter((it) => {
    const key = `${it.title}|${it.url ?? ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { profile, generated_at: new Date().toISOString(), items: deduped };
}

function dirnameOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i > 0 ? p.slice(0, i) : ".";
}

function main(): void {
  const args = process.argv.slice(2);
  let input: string | null = null;
  let profile = "radar-cyber";
  let out: string | null = null;
  let useStdin = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--profile") profile = args[++i] ?? profile;
    else if (a === "--out") out = args[++i] ?? null;
    else if (a === "--stdin") useStdin = true;
    else if (a === "--help" || a === "-h") usage();
    else if (!a.startsWith("--")) input = a;
    else usage();
  }

  let text: string;
  if (useStdin) {
    text = readFileSync(0, "utf8");
  } else if (input) {
    text = readFileSync(input, "utf8");
  } else {
    usage();
  }

  let briefing: Briefing | null = null;
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      briefing = normalizeJson(JSON.parse(trimmed), profile);
    } catch {
      briefing = null;
    }
  }
  if (!briefing) briefing = parseText(text, profile);

  const json = JSON.stringify(briefing, null, 2) + "\n";
  if (out) {
    mkdirSync(dirnameOf(out), { recursive: true });
    writeFileSync(out, json, "utf8");
    console.error(`[hermes-briefing] ${briefing.items.length} item(s) → ${out}`);
  } else {
    process.stdout.write(json);
    console.error(`[hermes-briefing] ${briefing.items.length} item(s) → stdout`);
  }
}

main();
