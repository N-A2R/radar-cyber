/**
 * Importe un catalogue de flux (CSV threat-intelligence-feeds) dans `source`.
 * Usage : DATABASE_URL=... pnpm tsx db/import-feeds.ts [fichier.csv]
 *
 * Catégories → kind :
 *   IP, BLOCKLIST, DNS, URL, MD5, SHA1, SHA256, JA3, SSL, IOC → indicator (détection par ligne)
 *   RSS, CVEID, MISP, RANSOMWARELEAK, OSINT                     → narrative (événements)
 *   REPO, FRAMEWORK, SANDBOX, GEOIP, RESTRICTED                 → ignorés (pas un flux exploitable)
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
const file = process.argv[2] ?? "/tmp/osint-repos/kraloveckey_threat-intelligence-feeds/threat-intelligence-feeds.csv";

const INDICATOR_CATEGORIES: Record<string, true> = Object.fromEntries(
  ["IP", "BLOCKLIST", "DNS", "URL", "MD5", "SHA1", "SHA256", "JA3", "SSL", "IOC"].map((c) => [c, true]),
);
const NARRATIVE_CATEGORIES: Record<string, true> = Object.fromEntries(
  ["RSS", "CVEID", "MISP", "RANSOMWARELEAK", "OSINT"].map((c) => [c, true]),
);
const FAMILY_BY_CATEGORY: Record<string, string> = {
  IP: "reputation", BLOCKLIST: "reputation", DNS: "phishing", URL: "phishing",
  MD5: "malware", SHA1: "malware", SHA256: "malware", JA3: "malware", SSL: "malware",
  IOC: "cti", RSS: "cti", CVEID: "vuln", MISP: "cti", RANSOMWARELEAK: "ransomware", OSINT: "cti",
};
const FORMAT_BY_CATEGORY: Record<string, string> = {
  IP: "txt", BLOCKLIST: "txt", DNS: "txt", URL: "txt", MD5: "txt", SHA1: "txt", SHA256: "txt",
  JA3: "txt", SSL: "txt", IOC: "txt", RSS: "rss", CVEID: "json", MISP: "json", RANSOMWARELEAK: "html", OSINT: "rss",
};

function detectIndicatorType(line: string): string | null {
  const value = line.trim();
  if (!value || value.startsWith("#")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return "ip";
  if (/^[0-9a-fA-F]{32}$/.test(value) || /^[0-9a-fA-F]{40}$/.test(value) || /^[0-9a-fA-F]{64}$/.test(value)) return "hash";
  if (/^https?:\/\//.test(value)) return "url";
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) return "domain";
  return null;
}

export { detectIndicatorType };

async function main() {
  const raw = readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines.shift() ?? "";
  const sep = header.includes(";") ? ";" : ",";
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  let inserted = 0;
  let skipped = 0;
  let offline = 0;
  const errors: string[] = [];

  for (const line of lines) {
    const cols = line.split(sep);
    const [vendor, description, category, url, status] = cols.map((c) => c.trim());
    if (!url || !category) { skipped++; continue; }
    if (!INDICATOR_CATEGORIES[category] && !NARRATIVE_CATEGORIES[category]) { skipped++; continue; }
    if (status && /offline/i.test(status)) { offline++; continue; }

    const kind = INDICATOR_CATEGORIES[category] ? "indicator" : "narrative";
    const id = `feed:${vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${category.toLowerCase()}:${Buffer.from(url).toString("base64url").slice(0, 8)}`;
    const family = FAMILY_BY_CATEGORY[category] ?? "cti";
    const format = FORMAT_BY_CATEGORY[category] ?? "txt";
    const parser = kind === "indicator"
      ? { detect: "auto", skipComments: true }
      : format === "rss"
        ? { itemsPath: "rss.channel.item", titleField: "title", linkField: "link", dateField: "pubDate" }
        : { itemsPath: "", titleField: "name", linkField: "url", dateField: "date" };

    try {
      await pool.query(
        `INSERT INTO source (id, name, family, url, license, retain_raw, enabled, kind, format, parser, interval_sec, description)
         VALUES ($1,$2,$3,$4,$5,false,true,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, family=EXCLUDED.family, url=EXCLUDED.url,
           kind=EXCLUDED.kind, format=EXCLUDED.format, parser=EXCLUDED.parser, enabled=EXCLUDED.enabled`,
        [
          id,
          `${vendor} — ${description}`.slice(0, 200),
          family,
          url,
          "Voir conditions de la source d'origine",
          kind,
          format,
          JSON.stringify(parser),
          kind === "indicator" ? 86400 : 3600,
          description.slice(0, 300),
        ]
      );
      inserted++;
    } catch (e) {
      errors.push(`${id}: ${(e as Error).message}`);
    }
  }

  const total = await pool.query("SELECT count(*)::int AS n FROM source");
  const byKind = await pool.query("SELECT kind, count(*)::int AS n FROM source GROUP BY kind");
  console.log(JSON.stringify({ inserted, skipped, offline, errors: errors.slice(0, 5), total: total.rows[0].n, byKind: byKind.rows }, null, 1));
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
